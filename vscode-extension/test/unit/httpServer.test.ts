import http from 'http';

import { afterEach, describe, expect, it } from 'vitest';

import { MobileHttpServer } from '../../src/server/httpServer';
import { MemoryLogger } from '../../src/utils/logger';
import { requestJson } from '../testUtils';

describe('MobileHttpServer', () => {
  const servers: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const server of servers) {
      server.close();
    }
    servers.length = 0;
  });

  it('应输出带 sessionId 的手机页面', async () => {
    const httpServer = new MobileHttpServer(new MemoryLogger(), {
      onMobileMessage: async () => ({
        type: 'state_update',
        state: 'running',
        updatedAt: '2026-03-31T00:00:00.000Z',
        authenticated: false,
      }),
      onSessionPageViewed: () => undefined,
      getSessionPageModel: () => ({
        sessionId: 'session-1',
        pinLength: 6,
        sessionExpiresAt: '2026-03-31T00:15:00.000Z',
        title: 'Codex CLI Server',
        subtitle: 'ready to accept prompts',
        modeLabel: 'Direct CLI',
        targetLabel: 'Server Codex CLI',
        infoFields: [
          { label: 'CLI 命令', value: 'codex exec __PROMPT__', kind: 'code' },
        ],
        accessFields: [
          {
            label: '推荐访问链接',
            value: 'https://bridge.example.com/session/session-1',
            kind: 'url',
          },
        ],
        note: '公网地址已配置',
        initialState: {
          type: 'state_update',
          state: 'running',
          updatedAt: '2026-03-31T00:00:00.000Z',
          detail: 'ready',
          authenticated: false,
          lastPrompt: {
            requestId: 'req-1',
            text: '请修复登录问题',
            receivedAt: '2026-03-31T00:00:00.000Z',
          },
        },
      }),
      getCurrentSessionId: () => 'session-1',
      getState: () => ({
        type: 'state_update',
        state: 'running',
        updatedAt: '2026-03-31T00:00:00.000Z',
        authenticated: false,
      }),
    });
    const server = httpServer.createServer();
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve()),
    );
    const port = MobileHttpServer.getPort(server);

    const response = await new Promise<{ statusCode: number; body: string }>(
      (resolve, reject) => {
        const request = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/session/session-1',
            method: 'GET',
          },
          (result) => {
            const chunks: Buffer[] = [];
            result.on('data', (chunk: Buffer | string) => {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            result.on('end', () =>
              resolve({
                statusCode: result.statusCode ?? 0,
                body: Buffer.concat(chunks).toString('utf8'),
              }),
            );
          },
        );
        request.on('error', reject);
        request.end();
      },
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('session-1');
    expect(response.body).toContain('autocomplete="one-time-code"');
    expect(response.body).toContain('PIN 完整，准备登录');
    expect(response.body).toContain('Codex CLI Server');
    expect(response.body).toContain('CLI 命令');
    expect(response.body).toContain('最近一次 Prompt');
    expect(response.body).toContain('主控制台');
    expect(response.body).toContain('Codex 对话');
    expect(response.body).toContain('服务器诊断');
    expect(response.body).toContain('id="workspace-shell"');
    expect(response.body).toContain('id="session-sidebar"');
    expect(response.body).toContain('id="workspace-main"');
    expect(response.body).toContain('id="auth-checking-view"');
    expect(response.body).toContain('id="thread-tabs"');
    expect(response.body).toContain('id="thread-transcript"');
    expect(response.body).toContain('id="selected-thread-turns"');
    expect(response.body).toContain('id="interrupt-run-button"');
    expect(response.body).toContain('id="advanced-details"');
    expect(response.body).not.toContain('/ws?sessionId=');
  });

  it('应处理手机登录请求', async () => {
    const httpServer = new MobileHttpServer(new MemoryLogger(), {
      onMobileMessage: async (message) => {
        if (message.type !== 'login') {
          return {
            type: 'error' as const,
            code: 'BAD_REQUEST',
            message: 'unexpected',
            recoverable: true,
          };
        }
        return {
          type: 'login_ok' as const,
          requestId: message.requestId,
          sessionId: 'session-1',
          authToken: 'auth-1',
          expiresAt: '2026-03-31T00:10:00.000Z',
          state: 'authenticated' as const,
        };
      },
      onSessionPageViewed: () => undefined,
      getSessionPageModel: () => undefined,
      getCurrentSessionId: () => 'session-1',
      getState: () => ({
        type: 'state_update',
        state: 'running',
        updatedAt: '2026-03-31T00:00:00.000Z',
        authenticated: false,
      }),
    });
    const server = httpServer.createServer();
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve()),
    );
    const port = MobileHttpServer.getPort(server);

    const response = await requestJson<{ type: string; authToken?: string }>(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'login',
        requestId: 'req-1',
        sessionId: 'session-1',
        pin: '123456',
      },
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.type).toBe('login_ok');
    expect(response.body.authToken).toBe('auth-1');
  });
});
