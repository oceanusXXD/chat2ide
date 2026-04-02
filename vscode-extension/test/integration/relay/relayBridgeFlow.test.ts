import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { RelayBridgeController } from '../../../src/relay/relayBridgeController';
import { AuthService } from '../../../src/server/auth';
import { SessionStore } from '../../../src/server/sessionStore';
import { AppState } from '../../../src/state/appState';
import { MemoryLogger } from '../../../src/utils/logger';
import { requestJson } from '../../testUtils';

describe('RelayBridge integration', () => {
  const controllers: RelayBridgeController[] = [];
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    sockets.forEach((socket) => socket.close());
    await Promise.all(controllers.map((controller) => controller.stopServer()));
    sockets.length = 0;
    controllers.length = 0;
  });

  function createController() {
    const logger = new MemoryLogger();
    const controller = new RelayBridgeController(
      new AppState(),
      new AuthService(
        new SessionStore(() => new Date('2026-03-31T00:00:00.000Z'), () => 'session-1', () => '123456'),
        {
          sessionTtlMs: 15 * 60_000,
          loginTtlMs: 10 * 60_000,
          pinLength: 6,
          maxFailedAttempts: 3,
          lockoutMs: 120_000,
        },
        logger,
        () => new Date('2026-03-31T00:00:00.000Z'),
        () => 'auth-1',
      ),
      {
        getServerHost: () => '127.0.0.1',
        getServerPort: () => 0,
        getPublicBaseUrl: () => undefined,
        getAgentResponseTimeoutMs: () => 1000,
      },
      logger,
      'relay-token',
    );
    controllers.push(controller);
    return controller;
  }

  it('登录后提交 prompt 应转发给 Relay Agent', async () => {
    const controller = createController();
    const serverInfo = await controller.startServer();
    const accessInfo = controller.getAccessInfo();
    if (!accessInfo) {
      throw new Error('缺少访问信息');
    }

    const agentSocket = new WebSocket(
      `ws://${serverInfo.host}:${serverInfo.port}/relay/agent?agentToken=relay-token&agentName=local-vscode`,
    );
    sockets.push(agentSocket);
    await new Promise<void>((resolve, reject) => {
      agentSocket.once('open', () => resolve());
      agentSocket.once('error', reject);
    });
    agentSocket.on('message', (payload) => {
      const message = JSON.parse(rawDataToText(payload)) as { type: string; requestId?: string };
      if (message.type !== 'forward_prompt') {
        return;
      }
      agentSocket.send(
        JSON.stringify({
          type: 'forward_result',
          requestId: message.requestId,
          ok: true,
          detail: '本地 Codex 已收到并发送',
        }),
      );
    });

    const login = await requestJson<{ type: string; authToken?: string }>(
      {
        hostname: serverInfo.host,
        port: serverInfo.port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'login',
        requestId: 'login-1',
        sessionId: accessInfo.sessionId,
        pin: accessInfo.pin,
      },
    );

    const submit = await requestJson<{ type: string; state?: string }>(
      {
        hostname: serverInfo.host,
        port: serverInfo.port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'submit_prompt',
        requestId: 'submit-1',
        sessionId: accessInfo.sessionId,
        authToken: login.body.authToken,
        text: '帮我分析这个超时问题',
      },
    );

    expect(submit.body.type).toBe('submit_ok');
    expect(submit.body.state).toBe('authenticated');
  });

  it('本地 Agent 未连接时应拒绝转发', async () => {
    const controller = createController();
    const serverInfo = await controller.startServer();
    const accessInfo = controller.getAccessInfo();
    if (!accessInfo) {
      throw new Error('缺少访问信息');
    }

    const login = await requestJson<{ authToken: string }>(
      {
        hostname: serverInfo.host,
        port: serverInfo.port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'login',
        requestId: 'login-2',
        sessionId: accessInfo.sessionId,
        pin: accessInfo.pin,
      },
    );

    const submit = await requestJson<{ type: string; code?: string }>(
      {
        hostname: serverInfo.host,
        port: serverInfo.port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'submit_prompt',
        requestId: 'submit-2',
        sessionId: accessInfo.sessionId,
        authToken: login.body.authToken,
        text: 'hello',
      },
    );

    expect(submit.body.type).toBe('submit_failed');
    expect(submit.body.code).toBe('RELAY_AGENT_UNAVAILABLE');
  });

  it('本地 Agent 回传失败时应返回 submit_failed', async () => {
    const controller = createController();
    const serverInfo = await controller.startServer();
    const accessInfo = controller.getAccessInfo();
    if (!accessInfo) {
      throw new Error('缺少访问信息');
    }

    const agentSocket = new WebSocket(
      `ws://${serverInfo.host}:${serverInfo.port}/relay/agent?agentToken=relay-token&agentName=local-vscode`,
    );
    sockets.push(agentSocket);
    await new Promise<void>((resolve, reject) => {
      agentSocket.once('open', () => resolve());
      agentSocket.once('error', reject);
    });
    agentSocket.on('message', (payload) => {
      const message = JSON.parse(rawDataToText(payload)) as { type: string; requestId?: string };
      if (message.type !== 'forward_prompt') {
        return;
      }
      agentSocket.send(
        JSON.stringify({
          type: 'forward_result',
          requestId: message.requestId,
          ok: false,
          code: 'CODEX_COMMAND_FAILED',
          detail: '本机未找到 Codex 打开命令',
        }),
      );
    });

    const login = await requestJson<{ authToken: string }>(
      {
        hostname: serverInfo.host,
        port: serverInfo.port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'login',
        requestId: 'login-3',
        sessionId: accessInfo.sessionId,
        pin: accessInfo.pin,
      },
    );

    const submit = await requestJson<{ type: string; code?: string }>(
      {
        hostname: serverInfo.host,
        port: serverInfo.port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'submit_prompt',
        requestId: 'submit-3',
        sessionId: accessInfo.sessionId,
        authToken: login.body.authToken,
        text: 'hello',
      },
    );

    expect(submit.body.type).toBe('submit_failed');
    expect(submit.body.code).toBe('CODEX_COMMAND_FAILED');
  });
});

function rawDataToText(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }
  if (Buffer.isBuffer(payload)) {
    return payload.toString('utf8');
  }
  if (Array.isArray(payload)) {
    return Buffer.concat(payload).toString('utf8');
  }
  return Buffer.from(payload as ArrayBuffer).toString('utf8');
}
