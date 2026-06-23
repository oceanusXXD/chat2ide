import crypto from 'crypto';
import http from 'http';
import { Duplex } from 'stream';

import { WebSocket, WebSocketServer } from 'ws';

import {
  BridgeHelloMessage,
  ServerBridgeMessage,
  parseBridgeClientMessage,
} from '../../shared/protocol';
import { BridgeClientConfig } from '../config';
import { ClientBridgeSessionManager } from '../bridge/clientBridgeSessionManager';

interface RegisteredBridgeSocket {
  clientId: string;
  connectionId: string;
}

export interface ClientBridgeSocketHubOptions {
  clients?: BridgeClientConfig[];
  heartbeatIntervalMs?: number;
  maxBufferedBytes: number;
  maxPayloadBytes: number;
  publicOrigin?: string;
  token?: string;
}

interface BridgeAuthorization {
  client?: BridgeClientConfig;
  global: boolean;
}

export class ClientBridgeSocketHub {
  private readonly wsServer: WebSocketServer;
  private readonly path = '/bridge';

  constructor(
    private readonly bridgeSessions: ClientBridgeSessionManager,
    private readonly options: ClientBridgeSocketHubOptions,
  ) {
    this.wsServer = new WebSocketServer({
      maxPayload: this.options.maxPayloadBytes,
      noServer: true,
    });
    this.wsServer.on('connection', (socket, request) => {
      this.handleConnection(socket, request);
    });
  }

  handleUpgrade(
    request: http.IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): boolean {
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== this.path) {
      return false;
    }
    this.wsServer.handleUpgrade(request, socket, head, (webSocket) => {
      this.wsServer.emit('connection', webSocket, request);
    });
    return true;
  }

  dispose(): void {
    this.wsServer.close();
  }

  private handleConnection(socket: WebSocket, request: http.IncomingMessage): void {
    if (!this.isOriginAllowed(request.headers.origin)) {
      socket.close(1008, 'origin mismatch');
      return;
    }
    const authorization = this.authorize(request);
    if (!authorization) {
      socket.close(1008, 'unauthorized');
      return;
    }

    let registration: RegisteredBridgeSocket | null = null;
    let alive = true;
    const heartbeatInterval = setInterval(() => {
      if (!alive) {
        socket.close(1001, 'heartbeat timeout');
        return;
      }
      alive = false;
      if (socket.readyState === WebSocket.OPEN) {
        socket.ping();
      }
    }, this.options.heartbeatIntervalMs ?? 20_000);

    socket.on('close', () => {
      clearInterval(heartbeatInterval);
      if (registration) {
        this.bridgeSessions.unregisterClient(
          registration.clientId,
          registration.connectionId,
        );
      }
    });
    socket.on('pong', () => {
      alive = true;
    });

    socket.on('message', (raw) => {
      alive = true;
      const message = parseBridgeClientMessage(raw.toString());
      if (!message) {
        this.send(socket, {
          type: 'error',
          message: 'Invalid bridge message',
        });
        return;
      }

      if (message.type === 'ping') {
        this.send(socket, { type: 'pong' });
        return;
      }

      if (!registration) {
        if (message.type !== 'hello') {
          this.send(socket, {
            type: 'error',
            message: 'First bridge message must be hello',
          });
          socket.close(1008, 'hello required');
          return;
        }

        try {
          const hello = this.resolveHelloIdentity(message, authorization);
          registration = this.bridgeSessions.registerClient({
            clientId: hello.clientId,
            description: hello.description,
            name: hello.name,
            send: (serverMessage) => this.send(socket, serverMessage),
          });
          this.send(socket, {
            type: 'ready',
            clientId: registration.clientId,
          });
        } catch (error) {
          this.send(socket, {
            type: 'error',
            message:
              error instanceof Error ? error.message : 'Client registration failed',
          });
          socket.close(1011, 'registration failed');
        }
        return;
      }

      if (message.type === 'hello') {
        this.send(socket, {
          type: 'error',
          message: 'Bridge client is already registered',
        });
        return;
      }

      try {
        switch (message.type) {
          case 'session_upsert':
            this.bridgeSessions.upsertSession({
              clientId: registration.clientId,
              commandDisplay: message.commandDisplay,
              cwd: message.cwd,
              description: message.description,
              externalId: message.externalId,
              name: message.name,
              status: message.status,
              cols: message.cols,
              rows: message.rows,
            });
            break;
          case 'session_output':
            this.bridgeSessions.appendOutput(
              registration.clientId,
              message.externalId,
              message.data,
            );
            break;
          case 'session_status':
            this.bridgeSessions.updateStatus(
              registration.clientId,
              message.externalId,
              message.status,
              {
                lastError: message.lastError,
                lastExitCode: message.lastExitCode,
                lastExitSignal: message.lastExitSignal,
              },
            );
            break;
          case 'session_closed':
            this.bridgeSessions.closeExternalSession(
              registration.clientId,
              message.externalId,
            );
            break;
        }
      } catch (error) {
        this.send(socket, {
          type: 'error',
          externalId: 'externalId' in message ? message.externalId : undefined,
          message:
            error instanceof Error ? error.message : 'Client bridge message failed',
        });
      }
    });
  }

  private send(socket: WebSocket, message: ServerBridgeMessage): boolean {
    if (socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    if (socket.bufferedAmount > this.options.maxBufferedBytes) {
      socket.close(1013, 'send buffer exceeded');
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }

  private authorize(request: http.IncomingMessage): BridgeAuthorization | null {
    const token = readBearerToken(request.headers.authorization);
    if (!token) {
      return null;
    }
    if (this.options.token && tokenMatches(this.options.token, token)) {
      return { global: true };
    }
    const client = this.options.clients?.find((candidate) =>
      tokenMatches(candidate.token, token),
    );
    return client ? { client, global: false } : null;
  }

  private isOriginAllowed(origin: string | undefined): boolean {
    if (!origin || !this.options.publicOrigin) {
      return true;
    }
    return origin === this.options.publicOrigin;
  }

  private resolveHelloIdentity(
    message: BridgeHelloMessage,
    authorization: BridgeAuthorization,
  ): BridgeHelloMessage {
    if (!authorization.client) {
      return message;
    }

    const requestedId = message.clientId?.trim().toLowerCase();
    if (requestedId && requestedId !== authorization.client.id) {
      throw new Error(
        `Bridge token is scoped to client ${authorization.client.id}`,
      );
    }

    return {
      ...message,
      clientId: authorization.client.id,
      description: authorization.client.description ?? message.description,
      name: authorization.client.name ?? message.name,
    };
  }
}

function readBearerToken(value: string | string[] | undefined): string | undefined {
  const header = Array.isArray(value) ? value[0] : value;
  if (!header) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

function tokenMatches(expected: string, actual: string | undefined): boolean {
  if (!actual) {
    return false;
  }
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}
