import http from 'http';
import { AddressInfo } from 'net';

import {
  ErrorMessage,
  MobileToPluginMessage,
  PluginToMobileMessage,
  StateUpdateMessage,
  parseMobileMessage,
} from '../types/protocol';
import { Logger } from '../utils/logger';
import { renderMobilePage } from '../web/mobilePage';

export interface SessionPageField {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
  kind?: 'text' | 'code' | 'url';
}

export interface SessionPageModel {
  sessionId: string;
  pinLength: number;
  sessionExpiresAt: string;
  initialState: StateUpdateMessage;
  title: string;
  subtitle: string;
  modeLabel: string;
  targetLabel: string;
  infoFields: SessionPageField[];
  accessFields: SessionPageField[];
  note?: string;
}

export interface MobileHttpHandlers {
  onMobileMessage(message: MobileToPluginMessage): Promise<PluginToMobileMessage>;
  onSessionPageViewed(sessionId: string): void;
  getSessionPageModel(sessionId: string): SessionPageModel | undefined;
  getCurrentSessionId(): string | undefined;
  getState(sessionId: string, authToken?: string): StateUpdateMessage | ErrorMessage;
}

/**
 * 手机侧 HTTP 入口：负责输出页面、状态接口与 JSON 消息入口。
 */
export class MobileHttpServer {
  constructor(
    private readonly logger: Logger,
    private readonly handlers: MobileHttpHandlers,
  ) { }

  createServer(): http.Server {
    return http.createServer((request, response) => {
      void this.route(request, response);
    });
  }

  static getPort(server: http.Server): number {
    const address = server.address() as AddressInfo | null;
    if (!address) {
      throw new Error('HTTP 服务尚未监听端口');
    }
    return address.port;
  }

  private async route(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    this.logger.info(`收到 HTTP 请求：${request.method ?? 'UNKNOWN'} ${url.pathname}`);

    if (request.method === 'GET' && url.pathname === '/') {
      const currentSessionId = this.handlers.getCurrentSessionId();
      if (currentSessionId) {
        response.writeHead(302, { Location: `/session/${currentSessionId}` });
        response.end();
        return;
      }
      this.writeHtml(
        response,
        '<!DOCTYPE html><html lang="zh-CN"><body><h2>Prompt Bridge</h2><p>当前没有可用 session，请在 VS Code 中先启动服务。</p></body></html>',
      );
      return;
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      this.writeJson(response, 200, { ok: true });
      return;
    }

    const sessionMatch = url.pathname.match(/^\/session\/([a-zA-Z0-9-]+)$/);
    if (request.method === 'GET' && sessionMatch) {
      const sessionId = sessionMatch[1];
      const model = this.handlers.getSessionPageModel(sessionId);
      if (!model) {
        this.writeJson(response, 404, {
          type: 'error',
          code: 'SESSION_NOT_FOUND',
          message: '访问链接不存在或已过期',
          recoverable: true,
        });
        return;
      }
      this.handlers.onSessionPageViewed(sessionId);
      this.writeHtml(response, renderMobilePage(model));
      return;
    }

    const stateMatch = url.pathname.match(/^\/api\/session\/([a-zA-Z0-9-]+)\/state$/);
    if (request.method === 'GET' && stateMatch) {
      const sessionId = stateMatch[1];
      // 优先从 Header 读取登录态，避免 token 出现在 URL 和代理日志中；
      // 同时保留 query 参数兼容老客户端。
      const authToken = resolveAuthToken(
        request,
        url.searchParams.get('authToken') ?? undefined,
      );
      const result = this.handlers.getState(sessionId, authToken);
      this.writeJson(response, result.type === 'error' ? 404 : 200, result);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/mobile') {
      await this.handleMobileRequest(request, response);
      return;
    }

    this.writeJson(response, 404, {
      type: 'error',
      code: 'BAD_REQUEST',
      message: `未找到路径：${url.pathname}`,
      recoverable: true,
    });
  }

  private async handleMobileRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    try {
      const raw = await this.readBody(request);
      const message = parseMobileMessage(raw);
      const result = await this.handlers.onMobileMessage(message);
      const statusCode = result.type === 'error' ? 500 : 200;
      this.writeJson(response, statusCode, result);
    } catch (error) {
      this.logger.error('解析手机请求失败', error);
      this.writeJson(response, 400, {
        type: 'error',
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : '无效请求',
        recoverable: true,
      });
    }
  }

  private readBody(request: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      request.on('error', reject);
    });
  }

  private writeHtml(response: http.ServerResponse, html: string): void {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    response.end(html);
  }

  private writeJson(response: http.ServerResponse, statusCode: number, payload: unknown): void {
    response.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    response.end(JSON.stringify(payload));
  }
}

function resolveAuthToken(
  request: http.IncomingMessage,
  queryFallback?: string,
): string | undefined {
  const bearer = extractBearerToken(request.headers.authorization);
  if (bearer) {
    return bearer;
  }
  const customHeader = pickFirstHeaderValue(request.headers['x-prompt-bridge-auth']);
  if (customHeader) {
    return customHeader;
  }
  return queryFallback;
}

function extractBearerToken(value: string | string[] | undefined): string | undefined {
  const header = pickFirstHeaderValue(value);
  if (!header) {
    return undefined;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

function pickFirstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (Array.isArray(value) && value.length > 0) {
    const trimmed = value[0].trim();
    return trimmed || undefined;
  }
  return undefined;
}
