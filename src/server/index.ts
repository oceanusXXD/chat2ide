import fs from 'fs';
import http from 'http';
import path from 'path';

import * as cookie from 'cookie';
import express, { NextFunction, Request, Response } from 'express';

import {
  ApiErrorResponse,
  AuthStatusResponse,
  CreateTerminalRequest,
  UpdateTerminalRequest,
} from '../shared/protocol';
import { loadConfig } from './config';
import { PinAuthError, PinAuthService } from './auth/pinAuth';
import { SessionManager } from './auth/sessionManager';
import { ClientBridgeSessionManager } from './bridge/clientBridgeSessionManager';
import { TerminalSessionRouter } from './terminal/terminalSessionRouter';
import { TerminalSessionManager } from './terminal/terminalSessionManager';
import { ClientBridgeSocketHub } from './ws/clientBridgeSocketHub';
import { TerminalSocketHub } from './ws/terminalSocketHub';

const config = loadConfig();
const sessions = new SessionManager(config.auth.sessionTtlMs);
const auth = new PinAuthService(
  {
    attemptWindowMs: config.auth.attemptWindowMs,
    maxFailedAttempts: config.auth.maxFailedAttempts,
    lockoutMs: config.auth.lockoutMs,
    pinSource: config.auth.pinSource,
  },
  sessions,
);
const terminals = new TerminalSessionManager(config.terminal);
const bridgeSessions = new ClientBridgeSessionManager({
  bufferBytes: config.terminal.bufferBytes,
  defaultCols: config.terminal.defaultCols,
  defaultRows: config.terminal.defaultRows,
  maxSessions: config.bridge.maxSessions,
  maxInputBytes: config.terminal.maxInputBytes,
  stoppedSessionTtlMs: config.bridge.stoppedSessionTtlMs,
});
const terminalRouter = new TerminalSessionRouter(terminals, bridgeSessions);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy ? 1 : false);
app.use(express.json({ limit: '64kb' }));
app.use('/api', (_request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    terminals: terminalRouter.count(),
    ptyTerminals: terminals.count(),
    bridgeEnabled: config.bridge.enabled,
    bridgeSessions: bridgeSessions.count(),
    publicOrigin: config.publicOrigin ?? null,
  });
});

app.get('/api/auth/me', (request, response) => {
  const session = getAuthenticatedSession(request);
  const payload: AuthStatusResponse = session
    ? {
        authenticated: true,
        expiresAt: session.expiresAt,
      }
    : {
        authenticated: false,
      };
  response.json(payload);
});

app.post('/api/auth/pin', (request, response, next) => {
  try {
    const pin = typeof request.body?.pin === 'string' ? request.body.pin : '';
    const session = auth.login(pin, getClientKey(request));
    response.setHeader(
      'Set-Cookie',
      cookie.serialize(config.auth.cookieName, session.id, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: Math.floor(config.auth.sessionTtlMs / 1000),
        secure: shouldUseSecureCookies(request),
      }),
    );
    response.json({
      authenticated: true,
      expiresAt: session.expiresAt,
    } satisfies AuthStatusResponse);
  } catch (error) {
    if (error instanceof PinAuthError) {
      if (error.retryAfterSeconds) {
        response.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      response.status(error.statusCode).json({
        error: error.message,
      } satisfies ApiErrorResponse);
      return;
    }
    next(error);
  }
});

app.post('/api/auth/logout', (request, response) => {
  auth.logout(readSessionCookie(request));
  response.setHeader(
    'Set-Cookie',
    cookie.serialize(config.auth.cookieName, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      secure: shouldUseSecureCookies(request),
    }),
  );
  response.status(204).end();
});

app.get('/api/terminals', requireAuth, (_request, response) => {
  response.json({
    items: terminalRouter.listSessions(),
  });
});

app.get('/api/profiles', requireAuth, (_request, response) => {
  response.json({
    items: terminals.listProfiles(),
  });
});

app.post('/api/terminals', requireAuth, (request, response) => {
  try {
    const body = request.body as CreateTerminalRequest | undefined;
    const created = terminals.createSession(body);
    response.status(201).json({
      item: created,
    });
  } catch (error) {
    sendApiError(response, 400, error);
  }
});

app.patch('/api/terminals/:id', requireAuth, (request, response) => {
  try {
    const body = request.body as UpdateTerminalRequest | undefined;
    const nextName = body?.name?.trim();
    if (!nextName) {
      response.status(400).json({
        error: '终端名称不能为空',
      } satisfies ApiErrorResponse);
      return;
    }

    response.json({
      item: terminalRouter.rename(getRouteParam(request.params.id), nextName),
    });
  } catch (error) {
    sendApiError(
      response,
      error instanceof Error && error.message.includes('Client bridge') ? 400 : 404,
      error,
    );
  }
});

app.post('/api/terminals/:id/stop', requireAuth, (request, response) => {
  try {
    terminalRouter.stop(getRouteParam(request.params.id));
    response.json({
      ok: true,
    });
  } catch (error) {
    sendApiError(response, 404, error);
  }
});

app.post('/api/terminals/:id/restart', requireAuth, (request, response) => {
  try {
    terminalRouter.restart(getRouteParam(request.params.id));
    response.json({
      ok: true,
    });
  } catch (error) {
    sendApiError(response, 404, error);
  }
});

app.delete('/api/terminals/:id', requireAuth, (request, response) => {
  try {
    terminalRouter.close(getRouteParam(request.params.id));
    response.status(204).end();
  } catch (error) {
    sendApiError(response, 404, error);
  }
});

const staticRoot = path.resolve(__dirname, '../web');
if (fs.existsSync(staticRoot)) {
  app.use(express.static(staticRoot, { index: false }));
}

app.use((request, response, next) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    next();
    return;
  }

  const indexPath = path.join(staticRoot, 'index.html');
  if (!fs.existsSync(indexPath)) {
    response
      .status(503)
      .send(
        'Frontend 尚未构建。请先执行 npm run build，然后重新启动服务。',
      );
    return;
  }
  response.sendFile(indexPath);
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error(error);
  response.status(500).json({
    error: error instanceof Error ? error.message : '服务器内部错误',
  } satisfies ApiErrorResponse);
});

const server = http.createServer(app);
const socketHub = new TerminalSocketHub(sessions, terminalRouter, {
  cookieName: config.auth.cookieName,
  maxBufferedBytes: config.ws.maxBufferedBytes,
  maxPayloadBytes: config.ws.maxPayloadBytes,
  publicOrigin: config.publicOrigin,
});
const bridgeSocketHub =
  config.bridge.enabled && (config.bridge.token || config.bridge.clients.length > 0)
    ? new ClientBridgeSocketHub(bridgeSessions, {
        clients: config.bridge.clients,
        heartbeatIntervalMs: 20_000,
        maxBufferedBytes: config.ws.maxBufferedBytes,
        maxPayloadBytes: config.ws.maxPayloadBytes,
        publicOrigin: config.publicOrigin,
        token: config.bridge.token,
      })
    : null;

server.on('upgrade', (request, socket, head) => {
  if (socketHub.handleUpgrade(request, socket, head)) {
    return;
  }
  if (bridgeSocketHub?.handleUpgrade(request, socket, head)) {
    return;
  }
  socket.destroy();
});

const maintenanceTimer = setInterval(() => {
  const now = new Date();
  sessions.pruneExpired(now);
  auth.pruneStaleAttempts(now);
  bridgeSessions.pruneStopped(now);
}, 60_000);
maintenanceTimer.unref();

server.listen(config.port, config.host, () => {
  const external = config.publicOrigin ? `, public=${config.publicOrigin}` : '';
  console.log(
    `chat2ide Terminal Hub listening on http://${config.host}:${config.port}${external}`,
  );
  console.log(
    `Codex command: ${config.terminal.codexCommand} ${config.terminal.codexArgs.join(' ')}`.trim(),
  );
  console.log(
    `Terminal profiles: ${config.terminal.profiles
      .map((profile) => `${profile.isDefault ? '*' : ''}${profile.id}`)
      .join(', ')}`,
  );
  console.log(`Default cwd: ${config.terminal.defaultCwd}`);
  console.log(
    `Client bridge: ${config.bridge.enabled ? 'enabled at /bridge' : 'disabled'}`,
  );
  if (config.bridge.clients.length > 0) {
    console.log(
      `Bridge client scopes: ${config.bridge.clients
        .map((client) => client.id)
        .join(', ')}`,
    );
  }
  console.log(`WS send buffer cap: ${config.ws.maxBufferedBytes} bytes`);
  console.log('Public exposure model: Cloudflare Tunnel -> local HTTP/WS app');
});

const shutdown = () => {
  clearInterval(maintenanceTimer);
  bridgeSocketHub?.dispose();
  socketHub.dispose();
  bridgeSessions.dispose();
  terminals.dispose();
  sessions.pruneExpired();
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function requireAuth(
  request: Request,
  response: Response,
  next: () => void,
): void {
  const session = getAuthenticatedSession(request);
  if (!session) {
    response.status(401).json({
      error: '登录已失效，请重新输入 PIN',
    } satisfies ApiErrorResponse);
    return;
  }
  next();
}

function getAuthenticatedSession(request: Request) {
  return auth.getSession(readSessionCookie(request));
}

function readSessionCookie(request: Request): string | undefined {
  const header = readCookieHeader(request.headers.cookie);
  if (!header) {
    return undefined;
  }
  const parsed = cookie.parse(header);
  return parsed[config.auth.cookieName];
}

function getClientKey(request: Request): string {
  const ip = request.ip?.trim();
  if (ip && !isLoopbackIp(ip)) {
    return ip;
  }

  if (config.trustProxy) {
    const cloudflareIp = readSingleHeaderValue(request.headers['cf-connecting-ip']);
    if (cloudflareIp) {
      return cloudflareIp;
    }

    const forwardedFor = readSingleHeaderValue(request.headers['x-forwarded-for']);
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }
  }

  return ip || request.socket.remoteAddress || 'unknown';
}

function shouldUseSecureCookies(request: Request): boolean {
  if (config.auth.cookieSecure === 'always') {
    return true;
  }
  if (config.auth.cookieSecure === 'never') {
    return false;
  }
  if (request.secure) {
    return true;
  }
  // Only trust forwarded HTTPS when proxy support is explicitly enabled.
  if (config.trustProxy) {
    const forwardedProto = request.headers['x-forwarded-proto'];
    if (typeof forwardedProto === 'string') {
      return forwardedProto.split(',')[0].trim() === 'https';
    }
  }
  return false;
}

function readCookieHeader(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }
  return undefined;
}

function readSingleHeaderValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0]?.trim() || undefined;
  }
  return undefined;
}

function isLoopbackIp(value: string): boolean {
  return (
    value === '127.0.0.1' ||
    value === '::1' ||
    value === '::ffff:127.0.0.1'
  );
}

function getRouteParam(value: string | string[] | undefined): string {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }
  throw new Error('缺少终端 ID');
}

function sendApiError(
  response: Response,
  statusCode: number,
  error: unknown,
): void {
  response.status(statusCode).json({
    error: error instanceof Error ? error.message : '请求失败',
  } satisfies ApiErrorResponse);
}
