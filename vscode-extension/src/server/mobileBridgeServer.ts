import http from 'http';

import { Logger } from '../utils/logger';
import { MobileHttpHandlers, MobileHttpServer } from './httpServer';
import { BroadcastMessageResolver, MobileWsHandlers, MobileWsServer } from './wsServer';

export interface MobileBridgeServerOptions {
  host: string;
  port: number;
  logger: Logger;
  httpHandlers: MobileHttpHandlers;
  wsHandlers: MobileWsHandlers;
  additionalAttachers?: Array<(server: http.Server) => void>;
}

export interface RunningServerInfo {
  host: string;
  port: number;
}

export interface MobileBridgeServerLike {
  start(): Promise<RunningServerInfo>;
  stop(): Promise<void>;
  broadcast(message: BroadcastMessageResolver, sessionId?: string): void;
  getInfo(): RunningServerInfo | undefined;
}

/**
 * 统一管理手机 HTTP/WS 服务生命周期。
 */
export class MobileBridgeServer implements MobileBridgeServerLike {
  private server?: http.Server;
  private readonly httpServer: MobileHttpServer;
  private readonly wsServer: MobileWsServer;

  constructor(private readonly options: MobileBridgeServerOptions) {
    this.httpServer = new MobileHttpServer(options.logger, options.httpHandlers);
    this.wsServer = new MobileWsServer(options.logger, options.wsHandlers);
  }

  async start(): Promise<RunningServerInfo> {
    if (this.server) {
      return this.getInfoOrThrow();
    }

    const server = this.httpServer.createServer();
    this.wsServer.attach(server);
    for (const attach of this.options.additionalAttachers ?? []) {
      attach(server);
    }
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(this.options.port, this.options.host);
    });
    this.server = server;
    this.options.logger.info(
      `手机 HTTP/WS 服务已启动：${this.options.host}:${MobileHttpServer.getPort(server)}`,
    );
    return this.getInfoOrThrow();
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    const server = this.server;
    this.server = undefined;
    await this.wsServer.dispose();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.options.logger.info('手机 HTTP/WS 服务已停止');
  }

  broadcast(message: BroadcastMessageResolver, sessionId?: string): void {
    this.wsServer.broadcast(message, sessionId);
  }

  getInfo(): RunningServerInfo | undefined {
    if (!this.server) {
      return undefined;
    }
    return {
      host: this.options.host,
      port: MobileHttpServer.getPort(this.server),
    };
  }

  private getInfoOrThrow(): RunningServerInfo {
    const info = this.getInfo();
    if (!info) {
      throw new Error('服务尚未启动');
    }
    return info;
  }
}
