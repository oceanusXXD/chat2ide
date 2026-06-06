import http from 'http';

import * as cookie from 'cookie';
import { WebSocket, WebSocketServer } from 'ws';

import {
  ServerWsMessage,
  WsTerminalListMessage,
  parseClientWsMessage,
} from '../../shared/protocol';
import { SessionManager } from '../auth/sessionManager';
import { TerminalManagerEvent, TerminalSessionManager } from '../terminal/terminalSessionManager';

interface AuthenticatedSocket {
  socket: WebSocket;
  sessionId: string;
  attachedTerminalIds: Set<string>;
}

export interface TerminalSocketHubOptions {
  cookieName: string;
  maxPayloadBytes: number;
  publicOrigin?: string;
}

export class TerminalSocketHub {
  private readonly wsServer: WebSocketServer;
  private readonly clients = new Set<AuthenticatedSocket>();
  private readonly unsubscribeTerminalEvents: () => void;

  constructor(
    server: http.Server,
    private readonly sessions: SessionManager,
    private readonly terminals: TerminalSessionManager,
    private readonly options: TerminalSocketHubOptions,
  ) {
    this.wsServer = new WebSocketServer({
      maxPayload: this.options.maxPayloadBytes,
      server,
      path: '/ws',
    });
    this.unsubscribeTerminalEvents = this.terminals.subscribe((event) => {
      this.broadcastTerminalEvent(event);
    });
    this.wsServer.on('connection', (socket, request) => {
      this.handleConnection(socket, request);
    });
  }

  dispose(): void {
    this.unsubscribeTerminalEvents();
    for (const client of this.clients) {
      client.socket.close(1001, 'server shutdown');
    }
    this.clients.clear();
    this.wsServer.close();
  }

  private handleConnection(socket: WebSocket, request: http.IncomingMessage): void {
    if (!this.isOriginAllowed(request.headers.origin)) {
      socket.close(1008, 'origin mismatch');
      return;
    }

    const sessionId = extractSessionId(request.headers.cookie, this.options.cookieName);
    const session = this.sessions.getSession(sessionId);
    if (!session) {
      socket.close(1008, 'unauthorized');
      return;
    }

    const client: AuthenticatedSocket = {
      socket,
      sessionId: session.id,
      attachedTerminalIds: new Set(),
    };
    this.clients.add(client);

    socket.on('close', () => {
      this.clients.delete(client);
    });

    socket.on('message', (raw) => {
      if (!this.sessions.getSession(client.sessionId)) {
        socket.close(1008, 'expired');
        return;
      }

      const message = parseClientWsMessage(raw.toString());
      if (!message) {
        return;
      }

      switch (message.type) {
        case 'ping':
          this.send(client.socket, { type: 'pong' });
          break;
        case 'attach': {
          try {
            const replay = this.terminals.getReplay(message.terminalId);
            // A browser subscribes to one live output stream at a time.
            client.attachedTerminalIds.clear();
            client.attachedTerminalIds.add(message.terminalId);
            // Reset, replay buffered chunks, then stream live output.
            this.send(client.socket, {
              type: 'terminal_reset',
              terminalId: message.terminalId,
            });
            this.send(client.socket, {
              type: 'terminal_updated',
              item: replay.summary,
            });
            for (const chunk of replay.chunks) {
              this.send(client.socket, {
                type: 'terminal_output',
                terminalId: message.terminalId,
                data: chunk,
                replay: true,
              });
            }
            this.terminals.startIfPending(message.terminalId);
          } catch {
            this.send(client.socket, {
              type: 'terminal_error',
              terminalId: message.terminalId,
              message: 'Terminal 不存在或已关闭',
            });
          }
          break;
        }
        case 'input':
          try {
            this.terminals.sendInput(message.terminalId, message.data);
          } catch (error) {
            this.send(client.socket, {
              type: 'terminal_error',
              terminalId: message.terminalId,
              message: error instanceof Error ? error.message : '输入失败',
            });
          }
          break;
        case 'resize':
          try {
            this.terminals.resize(message.terminalId, message.cols, message.rows);
          } catch (error) {
            this.send(client.socket, {
              type: 'terminal_error',
              terminalId: message.terminalId,
              message: error instanceof Error ? error.message : '调整终端尺寸失败',
            });
          }
          break;
      }
    });

    this.send(client.socket, { type: 'ready' });
    const listMessage: WsTerminalListMessage = {
      type: 'terminal_list',
      items: this.terminals.listSessions(),
    };
    this.send(client.socket, listMessage);
  }

  private broadcastTerminalEvent(event: TerminalManagerEvent): void {
    switch (event.type) {
      case 'terminal_created':
        this.broadcast({ type: 'terminal_created', item: event.item });
        break;
      case 'terminal_updated':
        this.broadcast({ type: 'terminal_updated', item: event.item });
        break;
      case 'terminal_closed':
        for (const client of this.clients) {
          client.attachedTerminalIds.delete(event.terminalId);
        }
        this.broadcast({ type: 'terminal_closed', terminalId: event.terminalId });
        break;
      case 'terminal_reset':
        this.broadcastAttached(event.terminalId, {
          type: 'terminal_reset',
          terminalId: event.terminalId,
        });
        break;
      case 'terminal_output':
        this.broadcastAttached(event.terminalId, {
          type: 'terminal_output',
          terminalId: event.terminalId,
          data: event.data,
        });
        break;
      case 'terminal_exit':
        this.broadcast({
          type: 'terminal_exit',
          terminalId: event.terminalId,
          code: event.code,
          signal: event.signal,
        });
        break;
      case 'terminal_error':
        this.broadcast({
          type: 'terminal_error',
          terminalId: event.terminalId,
          message: event.message,
        });
        break;
    }
  }

  private broadcast(message: ServerWsMessage): void {
    for (const client of this.clients) {
      if (!this.sessions.getSession(client.sessionId)) {
        client.socket.close(1008, 'expired');
        this.clients.delete(client);
        continue;
      }
      this.send(client.socket, message);
    }
  }

  private broadcastAttached(terminalId: string, message: ServerWsMessage): void {
    for (const client of this.clients) {
      if (!client.attachedTerminalIds.has(terminalId)) {
        continue;
      }
      if (!this.sessions.getSession(client.sessionId)) {
        client.socket.close(1008, 'expired');
        this.clients.delete(client);
        continue;
      }
      this.send(client.socket, message);
    }
  }

  private send(socket: WebSocket, message: ServerWsMessage): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(message));
  }

  private isOriginAllowed(origin: string | undefined): boolean {
    if (!origin || !this.options.publicOrigin) {
      return true;
    }
    return origin === this.options.publicOrigin;
  }
}

function extractSessionId(
  cookieHeader: string | string[] | undefined,
  cookieName: string,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  const normalized = typeof cookieHeader === 'string' ? cookieHeader : cookieHeader[0];
  if (!normalized) {
    return undefined;
  }
  const cookies = cookie.parse(normalized);
  return cookies[cookieName];
}
