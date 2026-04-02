import { afterEach, describe, expect, it } from 'vitest';
import { RawData, WebSocket } from 'ws';

import { PromptBridgeController } from '../../src/bridge/promptBridgeController';
import { AuthService } from '../../src/server/auth';
import { SessionStore } from '../../src/server/sessionStore';
import { AppState } from '../../src/state/appState';
import { MemoryLogger } from '../../src/utils/logger';
import { requestJson, createFakeClock } from '../testUtils';

describe('PromptBridge integration', () => {
  const controllers: PromptBridgeController[] = [];

  afterEach(async () => {
    await Promise.all(controllers.map((controller) => controller.stopServer()));
    controllers.length = 0;
  });

  function createController(options?: {
    helperSendFails?: boolean;
    clock?: ReturnType<typeof createFakeClock>;
    publicBaseUrl?: string;
  }) {
    const clock = options?.clock ?? createFakeClock();
    let sessionCounter = 0;
    let authCounter = 0;
    const logger = new MemoryLogger();
    const controller = new PromptBridgeController(
      new AppState(),
      new AuthService(
        new SessionStore(clock.now, () => `session-${sessionCounter++}`, () => '123456'),
        {
          sessionTtlMs: 15 * 60_000,
          loginTtlMs: 10 * 60_000,
          pinLength: 6,
          maxFailedAttempts: 3,
          lockoutMs: 120_000,
        },
        logger,
        clock.now,
        () => `auth-${authCounter++}`,
      ),
      {
        getServerHost: () => '127.0.0.1',
        getServerPort: () => 0,
        getPublicBaseUrl: () => options?.publicBaseUrl,
        getHelperAutoStart: () => false,
        getHelperStartupTimeoutMs: () => 1000,
        getCreateNewSessionBeforeSend: () => false,
      },
      logger,
      {
        openSidebar: async () => undefined,
        openNewSession: async () => undefined,
      },
      {
        healthCheck: async () => ({ status: 'health_status' }),
        ping: async () => ({ status: 'ok' }),
        sendPrompt: async () => {
          if (options?.helperSendFails) {
            throw new Error('Helper 执行失败');
          }
          return { status: 'ok' };
        },
        calibrate: async () => ({ x: 10, y: 20, detail: 'ok' }),
      },
      {
        start: async () => false,
        stop: async () => undefined,
      },
    );
    controllers.push(controller);
    return { controller, clock };
  }

  it('登录成功后提交 prompt 应转发给 Helper', async () => {
    const { controller } = createController();
    const serverInfo = await controller.startServer();
    const accessInfo = controller.getAccessInfo();
    if (!accessInfo) {
      throw new Error('缺少访问信息');
    }

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
    expect(login.body.type).toBe('login_ok');

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
        text: '请解释这里为什么超时',
      },
    );

    expect(submit.statusCode).toBe(200);
    expect(submit.body.type).toBe('submit_ok');
    expect(submit.body.state).toBe('authenticated');
  });

  it('Helper 返回失败时应提示 submit_failed', async () => {
    const { controller } = createController({ helperSendFails: true });
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
        text: '再次测试',
      },
    );

    expect(submit.body.type).toBe('submit_failed');
    expect(submit.body.code).toBe('HELPER_REQUEST_FAILED');
  });

  it('未登录状态下提交应被拒绝', async () => {
    const { controller } = createController();
    const serverInfo = await controller.startServer();
    const accessInfo = controller.getAccessInfo();
    if (!accessInfo) {
      throw new Error('缺少访问信息');
    }
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
        authToken: 'bad-token',
        text: '未登录直接提交',
      },
    );

    expect(submit.body.type).toBe('submit_failed');
    expect(submit.body.code).toBe('UNAUTHORIZED');
  });

  it('过期 session 应被拒绝', async () => {
    const clock = createFakeClock();
    const { controller } = createController({ clock });
    const serverInfo = await controller.startServer();
    const accessInfo = controller.getAccessInfo();
    if (!accessInfo) {
      throw new Error('缺少访问信息');
    }
    clock.advanceMs(16 * 60_000);
    const login = await requestJson<{ type: string; code?: string }>(
      {
        hostname: serverInfo.host,
        port: serverInfo.port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'login',
        requestId: 'login-expired',
        sessionId: accessInfo.sessionId,
        pin: accessInfo.pin,
      },
    );

    expect(login.body.type).toBe('login_failed');
    expect(login.body.code).toBe('SESSION_EXPIRED');
  });

  it('错误 PIN 会被拒绝，并在超限后锁定', async () => {
    const { controller } = createController();
    const serverInfo = await controller.startServer();
    const accessInfo = controller.getAccessInfo();
    if (!accessInfo) {
      throw new Error('缺少访问信息');
    }

    for (const [index, expectedCode] of ['INVALID_PIN', 'INVALID_PIN', 'LOCKED_OUT'].entries()) {
      const response = await requestJson<{ type: string; code?: string }>(
        {
          hostname: serverInfo.host,
          port: serverInfo.port,
          path: '/api/mobile',
          method: 'POST',
        },
        {
          type: 'login',
          requestId: `login-wrong-${index}`,
          sessionId: accessInfo.sessionId,
          pin: '000000',
        },
      );
      expect(response.body.type).toBe('login_failed');
      expect(response.body.code).toBe(expectedCode);
    }
  });

  it('自动拉起 Helper 后应等待就绪再继续转发', async () => {
    const clock = createFakeClock();
    let healthChecks = 0;
    let helperStarted = false;
    const logger = new MemoryLogger();
    const controller = new PromptBridgeController(
      new AppState(),
      new AuthService(
        new SessionStore(clock.now, () => 'session-autostart', () => '123456'),
        {
          sessionTtlMs: 15 * 60_000,
          loginTtlMs: 10 * 60_000,
          pinLength: 6,
          maxFailedAttempts: 3,
          lockoutMs: 120_000,
        },
        logger,
        clock.now,
        () => 'auth-autostart',
      ),
      {
        getServerHost: () => '127.0.0.1',
        getServerPort: () => 0,
        getPublicBaseUrl: () => undefined,
        getHelperAutoStart: () => true,
        getHelperStartupTimeoutMs: () => 1500,
        getCreateNewSessionBeforeSend: () => false,
      },
      logger,
      {
        openSidebar: async () => undefined,
        openNewSession: async () => undefined,
      },
      {
        healthCheck: async () => {
          healthChecks += 1;
          if (!helperStarted) {
            throw new Error('Helper 尚未启动');
          }
          return { status: 'health_status', healthy: true, detail: 'ok' };
        },
        ping: async () => ({ status: 'ok' }),
        sendPrompt: async () => ({ status: 'ok' }),
        calibrate: async () => ({ x: 10, y: 20, detail: 'ok' }),
      },
      {
        start: async () => {
          helperStarted = true;
          return true;
        },
        stop: async () => undefined,
      },
    );
    controllers.push(controller);

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
        requestId: 'login-autostart',
        sessionId: accessInfo.sessionId,
        pin: accessInfo.pin,
      },
    );
    const submit = await requestJson<{ type: string }>(
      {
        hostname: serverInfo.host,
        port: serverInfo.port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'submit_prompt',
        requestId: 'submit-autostart',
        sessionId: accessInfo.sessionId,
        authToken: login.body.authToken,
        text: '等待 Helper 就绪后发送',
      },
    );

    expect(submit.body.type).toBe('submit_ok');
    expect(healthChecks).toBeGreaterThanOrEqual(2);
  });

  it('WebSocket 状态推送应保留已认证状态', async () => {
    const { controller } = createController();
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
        requestId: 'login-ws',
        sessionId: accessInfo.sessionId,
        pin: accessInfo.pin,
      },
    );

    const socket = new WebSocket(
      `ws://${serverInfo.host}:${serverInfo.port}/ws?sessionId=${accessInfo.sessionId}&authToken=${login.body.authToken}`,
    );
    const initial = await waitForWsMessage(socket);
    expect(initial.type).toBe('state_update');
    expect(initial.authenticated).toBe(true);

    const pushedStatePromise = waitForWsMessage(socket);
    await controller.openCodexSidebar();
    const pushedState = await pushedStatePromise;

    expect(pushedState.type).toBe('state_update');
    expect(pushedState.authenticated).toBe(true);
    expect(pushedState.state).toBe('authenticated');

    socket.close();
  });

  it('WebSocket 应支持首帧鉴权，避免在 URL 中携带 authToken', async () => {
    const { controller } = createController();
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
        requestId: 'login-ws-inline-auth',
        sessionId: accessInfo.sessionId,
        pin: accessInfo.pin,
      },
    );

    const socket = new WebSocket(`ws://${serverInfo.host}:${serverInfo.port}/ws`);
    await waitForWsOpen(socket);
    socket.send(
      JSON.stringify({
        type: 'authorize',
        sessionId: accessInfo.sessionId,
        authToken: login.body.authToken,
      }),
    );
    const initial = await waitForWsMessage(socket);

    expect(initial.type).toBe('state_update');
    expect(initial.authenticated).toBe(true);

    socket.close();
  });

  it('配置 publicBaseUrl 后应默认优先返回公网访问链接', async () => {
    const { controller } = createController({
      publicBaseUrl: 'https://bridge.example.com/',
    });
    await controller.startServer();
    const accessInfo = controller.getAccessInfo();

    expect(accessInfo?.publicUrl).toBe('https://bridge.example.com/session/session-0');
    expect(accessInfo?.preferredUrl).toBe('https://bridge.example.com/session/session-0');
    expect(accessInfo?.phoneReachable).toBe(true);
  });
});

function waitForWsMessage(
  socket: WebSocket,
): Promise<{ type: string; authenticated?: boolean; state?: string }> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: RawData) => {
      cleanup();
      resolve(
        JSON.parse(rawDataToText(data)) as {
          type: string;
          authenticated?: boolean;
          state?: string;
        },
      );
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off('message', onMessage);
      socket.off('error', onError);
    };

    socket.once('message', onMessage);
    socket.once('error', onError);
  });
}

function waitForWsOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off('open', onOpen);
      socket.off('error', onError);
    };

    socket.once('open', onOpen);
    socket.once('error', onError);
  });
}

function rawDataToText(data: RawData): string {
  if (typeof data === 'string') {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }
  return Buffer.from(data).toString('utf8');
}
