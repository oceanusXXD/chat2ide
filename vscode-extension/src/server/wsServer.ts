import http from 'http';

import { WebSocket, WebSocketServer } from 'ws';

import { PluginToMobileMessage } from '../types/protocol';
import { Logger } from '../utils/logger';

export interface MobileWsHandlers {
  authorize(sessionId: string, authToken: string): boolean;
  getInitialMessage(sessionId: string, authToken: string): PluginToMobileMessage;
}

interface ClientMetadata {
  sessionId: string;
  authToken: string;
}

interface WsAuthorizeMessage {
  type: 'authorize';
  sessionId: string;
  authToken: string;
}

export type BroadcastMessageResolver =
  | PluginToMobileMessage
  | ((metadata: ClientMetadata) => PluginToMobileMessage);

/**
 * 将扩展状态实时推送给已登录的手机页面。
 */
export class MobileWsServer {
  private static readonly AUTH_TIMEOUT_MS = 3000;
  private wsServer?: WebSocketServer;
  private boundServer?: http.Server;
  private upgradeHandler?: (
    request: http.IncomingMessage,
    socket: import('net').Socket,
    head: Buffer,
  ) => void;
  private readonly clients = new Map<WebSocket, ClientMetadata>();

  constructor(
    private readonly logger: Logger,
    private readonly handlers: MobileWsHandlers,
  ) {}

  attach(server: http.Server): void {
    this.boundServer = server;
    this.wsServer = new WebSocketServer({
      noServer: true,
    });
    this.upgradeHandler = (request, socket, head) => {
      const url = new URL(request.url ?? '/ws', `http://${request.headers.host ?? '127.0.0.1'}`);
      if (url.pathname !== '/ws') {
        return;
      }
      this.wsServer?.handleUpgrade(request, socket, head, (websocket) => {
        this.wsServer?.emit('connection', websocket, request);
      });
    };
    server.on('upgrade', this.upgradeHandler);

    this.wsServer.on('connection', (socket, request) => {
      const url = new URL(request.url ?? '/ws', `http://${request.headers.host ?? '127.0.0.1'}`);
      const querySessionId = url.searchParams.get('sessionId') ?? undefined;
      const queryAuthToken = url.searchParams.get('authToken') ?? undefined;
      let registeredSessionId: string | undefined;
      let authTimeout: NodeJS.Timeout | undefined;

      const clearAuthTimeout = () => {
        if (!authTimeout) {
          return;
        }
        clearTimeout(authTimeout);
        authTimeout = undefined;
      };

      socket.on('close', () => {
        clearAuthTimeout();
        this.clients.delete(socket);
        if (registeredSessionId) {
          this.logger.info(`手机 WebSocket 已断开：session=${registeredSessionId}`);
        }
      });

      const registerAuthorizedSocket = (sessionId: string, authToken: string): void => {
        if (!this.handlers.authorize(sessionId, authToken)) {
          this.logger.warn('拒绝未认证的手机 WebSocket 连接');
          socket.close(1008, 'unauthorized');
          return;
        }
        clearAuthTimeout();
        registeredSessionId = sessionId;
        this.logger.info(`手机 WebSocket 已连接：session=${sessionId}`);
        this.clients.set(socket, { sessionId, authToken });
        socket.send(JSON.stringify(this.handlers.getInitialMessage(sessionId, authToken)));
      };

      if (querySessionId && queryAuthToken) {
        registerAuthorizedSocket(querySessionId, queryAuthToken);
        return;
      }

      authTimeout = setTimeout(() => {
        this.logger.warn('手机 WebSocket 鉴权超时');
        socket.close(1008, 'unauthorized');
      }, MobileWsServer.AUTH_TIMEOUT_MS);

      socket.once('message', (data) => {
        const authMessage = parseAuthorizeMessage(data);
        if (!authMessage) {
          this.logger.warn('拒绝格式无效的手机 WebSocket 鉴权消息');
          socket.close(1008, 'unauthorized');
          return;
        }
        registerAuthorizedSocket(authMessage.sessionId, authMessage.authToken);
      });
    });
  }

  broadcast(message: BroadcastMessageResolver, sessionId?: string): void {
    if (!this.wsServer) {
      return;
    }
    for (const client of this.wsServer.clients) {
      const metadata = this.clients.get(client);
      if (!metadata) {
        continue;
      }
      if (sessionId && metadata.sessionId !== sessionId) {
        continue;
      }
      if (!this.handlers.authorize(metadata.sessionId, metadata.authToken)) {
        client.close(1008, 'expired');
        this.clients.delete(client);
        continue;
      }
      if (client.readyState === WebSocket.OPEN) {
        const payload = typeof message === 'function' ? message(metadata) : message;
        client.send(JSON.stringify(payload));
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.boundServer && this.upgradeHandler) {
      this.boundServer.off('upgrade', this.upgradeHandler);
    }
    this.boundServer = undefined;
    this.upgradeHandler = undefined;
    if (!this.wsServer) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.wsServer?.close(() => resolve());
    });
    this.clients.clear();
    this.wsServer = undefined;
  }
}

function parseAuthorizeMessage(data: Buffer | ArrayBuffer | Buffer[]): WsAuthorizeMessage | undefined {
  const text = rawDataToText(data);
  try {
    const payload = JSON.parse(text) as Partial<WsAuthorizeMessage>;
    if (
      payload.type === 'authorize' &&
      typeof payload.sessionId === 'string' &&
      typeof payload.authToken === 'string'
    ) {
      return {
        type: 'authorize',
        sessionId: payload.sessionId,
        authToken: payload.authToken,
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function rawDataToText(data: Buffer | ArrayBuffer | Buffer[]): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  return data.toString('utf8');
}
