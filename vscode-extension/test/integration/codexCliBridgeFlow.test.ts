import { afterEach, describe, expect, it } from 'vitest';

import { CodexCliBridgeController } from '../../src/cli/codexCliBridgeController';
import { CodexCliExecutionError } from '../../src/cli/codexCliRunner';
import { ServerCommandExecutionError } from '../../src/cli/safeServerCommandRunner';
import { AuthService } from '../../src/server/auth';
import { SessionStore } from '../../src/server/sessionStore';
import { AppState } from '../../src/state/appState';
import { MemoryLogger } from '../../src/utils/logger';
import { requestJson, waitForCondition } from '../testUtils';

describe('CodexCliBridge integration', () => {
  const controllers: CodexCliBridgeController[] = [];

  afterEach(async () => {
    await Promise.all(controllers.map((controller) => controller.stopServer()));
    controllers.length = 0;
  });

  function createController(options?: {
    fail?: boolean;
    runPrompt?: (
      text: string,
      runOptions?: {
        requestId?: string;
        resumeSessionId?: string;
      },
    ) => Promise<{
      detail: string;
      exitCode: number;
      combinedOutput: string;
      stdout: string;
      stderr: string;
      metadata?: Record<string, unknown>;
    }>;
    interruptRun?: (requestId: string) => boolean;
    runCommand?: (
      requestId: string,
      command: string,
    ) => Promise<{
      requestId: string;
      command: string;
      executable: string;
      args: string[];
      startedAt: string;
      finishedAt?: string;
      durationMs?: number;
      status: 'succeeded' | 'failed';
      exitCode?: number;
      stdout?: string;
      stderr?: string;
    }>;
  }) {
    const logger = new MemoryLogger();
    const controller = new CodexCliBridgeController(
      new AppState(),
      new AuthService(
        new SessionStore(
          () => new Date('2026-03-31T00:00:00.000Z'),
          () => 'session-cli',
          () => '123456',
        ),
        {
          sessionTtlMs: 15 * 60_000,
          loginTtlMs: 10 * 60_000,
          pinLength: 6,
          maxFailedAttempts: 3,
          lockoutMs: 120_000,
        },
        logger,
        () => new Date('2026-03-31T00:00:00.000Z'),
        () => 'auth-cli',
      ),
      {
        getServerHost: () => '127.0.0.1',
        getServerPort: () => 0,
        getPublicBaseUrl: () => undefined,
      },
      logger,
      {
        describeInvocation: (
          _text: string,
          runOptions?: { resumeSessionId?: string },
        ) => ({
          executable: 'codex',
          configuredArgs: ['exec', '__PROMPT__'],
          resolvedArgs: ['exec', 'mock-prompt'],
          workingDirectory: '/srv/repo',
          promptMode: 'arg' as const,
          timeoutMs: 120000,
          resumeSessionId: runOptions?.resumeSessionId,
        }),
        runPrompt: async (
          text: string,
          runOptions?: {
            requestId?: string;
            resumeSessionId?: string;
          },
        ) => {
          if (options?.runPrompt) {
            return options.runPrompt(text, runOptions);
          }
          if (options?.fail) {
            throw new CodexCliExecutionError(
              'CLI_EXECUTION_FAILED',
              'Codex CLI 退出码=1',
            );
          }
          return {
            detail: `Codex CLI 已完成：${text}`,
            exitCode: 0,
            combinedOutput: `ok:${text}`,
            stdout: `ok:${text}`,
            stderr: '',
          };
        },
        interruptRun: (requestId: string) =>
          options?.interruptRun?.(requestId) ?? false,
      } as never,
      'codex [prompt:stdin]',
      '/srv/repo',
      {
        runCommand: async (requestId: string, command: string) => {
          if (options?.runCommand) {
            return options.runCommand(requestId, command);
          }
          return {
            requestId,
            command,
            executable: 'pwd',
            args: [],
            startedAt: '2026-03-31T00:00:00.000Z',
            finishedAt: '2026-03-31T00:00:01.000Z',
            durationMs: 1000,
            status: 'succeeded' as const,
            exitCode: 0,
            stdout: '/srv/repo',
            stderr: '',
          };
        },
      },
    );
    controllers.push(controller);
    return controller;
  }

  it('登录成功后提交 prompt 应立即创建一个 running 线程，并在后台完成', async () => {
    const controller = createController();
    const serverInfo = await controller.startServer();
    const accessInfo = controller.getAccessInfo();
    if (!accessInfo) {
      throw new Error('缺少访问信息');
    }

    const login = await requestJson<{ authToken: string; type: string }>(
      {
        hostname: serverInfo.host,
        port: serverInfo.port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'login',
        requestId: 'login-cli-1',
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
        requestId: 'submit-cli-1',
        sessionId: accessInfo.sessionId,
        authToken: login.body.authToken,
        text: '请解释为什么超时',
      },
    );

    expect(submit.body.type).toBe('submit_ok');
    expect(submit.body.state).toBe('forwarding');
    expect(
      (submit.body as { cliRun?: { status?: string } }).cliRun?.status,
    ).toBe('running');

    await waitForCondition(() => {
      const state = controller.getState(
        accessInfo.sessionId,
        login.body.authToken,
      );
      return (
        state.type === 'state_update' &&
        Array.isArray(state.recentCliRuns) &&
        state.recentCliRuns[0]?.status === 'succeeded'
      );
    });
  });

  it('应为手机页面提供 Codex CLI 运行上下文', async () => {
    const controller = createController();
    await controller.startServer();
    const accessInfo = controller.getAccessInfo();
    if (!accessInfo) {
      throw new Error('缺少访问信息');
    }

    const pageModel = controller.getSessionPageModel(accessInfo.sessionId);

    expect(pageModel?.title).toBe('Codex CLI Server');
    expect(pageModel?.infoFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'CLI 命令',
          value: 'codex [prompt:stdin]',
        }),
        expect.objectContaining({
          label: '工作目录',
          value: '/srv/repo',
        }),
      ]),
    );
    expect(pageModel?.accessFields[0]?.label).toBe('推荐访问链接');
  });

  it('Codex CLI 失败时应在后台把线程标记为 failed', async () => {
    const controller = createController({ fail: true });
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
        requestId: 'login-cli-2',
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
        requestId: 'submit-cli-2',
        sessionId: accessInfo.sessionId,
        authToken: login.body.authToken,
        text: '请解释为什么超时',
      },
    );

    expect(submit.body.type).toBe('submit_ok');
    expect(
      (submit.body as { cliRun?: { status?: string } }).cliRun?.status,
    ).toBe('running');

    await waitForCondition(() => {
      const state = controller.getState(
        accessInfo.sessionId,
        login.body.authToken,
      );
      return (
        state.type === 'state_update' &&
        Array.isArray(state.recentCliRuns) &&
        state.recentCliRuns[0]?.status === 'failed'
      );
    });
  });

  it('同一前端登录态下应保留多个 Codex 线程供 tab 切换', async () => {
    const pendingRuns: Array<{
      text: string;
      resolve: () => void;
    }> = [];
    const controller = createController({
      runPrompt: (text) =>
        new Promise((resolve) => {
          pendingRuns.push({
            text,
            resolve: () =>
              resolve({
                detail: `Codex CLI 已完成：${text}`,
                exitCode: 0,
                combinedOutput: `ok:${text}`,
                stdout: `ok:${text}`,
                stderr: '',
                metadata: {
                  codexSessionId: `sid-${text}`,
                },
              }),
          });
        }),
    });
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
        requestId: 'login-cli-threads',
        sessionId: accessInfo.sessionId,
        pin: accessInfo.pin,
      },
    );

    const submitA = await requestJson<{
      type: string;
      cliRun?: { status?: string };
    }>(
      {
        hostname: serverInfo.host,
        port: serverInfo.port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'submit_prompt',
        requestId: 'submit-cli-a',
        sessionId: accessInfo.sessionId,
        authToken: login.body.authToken,
        text: 'thread-a',
      },
    );
    const submitB = await requestJson<{
      type: string;
      cliRun?: { status?: string };
    }>(
      {
        hostname: serverInfo.host,
        port: serverInfo.port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'submit_prompt',
        requestId: 'submit-cli-b',
        sessionId: accessInfo.sessionId,
        authToken: login.body.authToken,
        text: 'thread-b',
      },
    );

    expect(submitA.body.type).toBe('submit_ok');
    expect(submitB.body.type).toBe('submit_ok');
    expect(submitA.body.cliRun?.status).toBe('running');
    expect(submitB.body.cliRun?.status).toBe('running');

    await waitForCondition(() => {
      const state = controller.getState(
        accessInfo.sessionId,
        login.body.authToken,
      );
      return (
        state.type === 'state_update' &&
        Array.isArray(state.recentCliRuns) &&
        state.recentCliRuns.length >= 2 &&
        state.recentCliRuns.every((item) => item.status === 'running')
      );
    });

    pendingRuns.forEach((item) => item.resolve());

    await waitForCondition(() => {
      const state = controller.getState(
        accessInfo.sessionId,
        login.body.authToken,
      );
      return (
        state.type === 'state_update' &&
        Array.isArray(state.recentCliRuns) &&
        state.recentCliRuns.length >= 2 &&
        state.recentCliRuns.some(
          (item) =>
            item.promptText === 'thread-a' &&
            item.codexSessionId === 'sid-thread-a',
        ) &&
        state.recentCliRuns.some(
          (item) =>
            item.promptText === 'thread-b' &&
            item.codexSessionId === 'sid-thread-b',
        ) &&
        state.recentCliRuns.every((item) => item.status === 'succeeded')
      );
    });
  });

  it('继续线程时应把 resumeSessionId 传给 runner', async () => {
    let capturedResumeSessionId: string | undefined;
    const controller = createController({
      runPrompt: async (text, runOptions) => {
        capturedResumeSessionId = runOptions?.resumeSessionId;
        return {
          detail: `Codex CLI 已完成：${text}`,
          exitCode: 0,
          combinedOutput: 'ok',
          stdout: 'ok',
          stderr: '',
          metadata: {
            codexSessionId: runOptions?.resumeSessionId ?? 'sid-new',
          },
        };
      },
    });
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
        requestId: 'login-cli-resume',
        sessionId: accessInfo.sessionId,
        pin: accessInfo.pin,
      },
    );

    const submit = await requestJson<{
      type: string;
      cliRun?: { resumeSessionId?: string; status?: string };
    }>(
      {
        hostname: serverInfo.host,
        port: serverInfo.port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'submit_prompt',
        requestId: 'submit-cli-resume',
        sessionId: accessInfo.sessionId,
        authToken: login.body.authToken,
        text: 'continue thread',
        resumeSessionId: 'sid-existing',
      },
    );

    expect(submit.body.type).toBe('submit_ok');
    expect(submit.body.cliRun?.status).toBe('running');
    expect(submit.body.cliRun?.resumeSessionId).toBe('sid-existing');

    await waitForCondition(() => capturedResumeSessionId === 'sid-existing');
  });

  it('应允许中断运行中的 Codex 线程', async () => {
    let rejectPendingRun: ((error: unknown) => void) | undefined;
    let interruptedRequestId = '';
    const controller = createController({
      runPrompt: (_text, runOptions) =>
        new Promise((_resolve, reject) => {
          rejectPendingRun = reject;
          interruptedRequestId = runOptions?.requestId ?? '';
        }),
      interruptRun: (requestId) => {
        if (requestId !== interruptedRequestId || !rejectPendingRun) {
          return false;
        }
        rejectPendingRun(
          new CodexCliExecutionError('CLI_INTERRUPTED', 'Codex CLI 已被中断'),
        );
        return true;
      },
    });
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
        requestId: 'login-cli-interrupt',
        sessionId: accessInfo.sessionId,
        pin: accessInfo.pin,
      },
    );

    const submitRequestId = 'submit-cli-interrupt';
    const submit = await requestJson<{
      type: string;
      cliRun?: { status?: string };
    }>(
      {
        hostname: serverInfo.host,
        port: serverInfo.port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'submit_prompt',
        requestId: submitRequestId,
        sessionId: accessInfo.sessionId,
        authToken: login.body.authToken,
        text: 'interrupt me',
      },
    );

    expect(submit.body.type).toBe('submit_ok');
    expect(submit.body.cliRun?.status).toBe('running');

    const interrupt = await requestJson<{
      type: string;
      targetRequestId?: string;
    }>(
      {
        hostname: serverInfo.host,
        port: serverInfo.port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'interrupt_run',
        requestId: 'interrupt-cli-1',
        sessionId: accessInfo.sessionId,
        authToken: login.body.authToken,
        targetRequestId: submitRequestId,
      },
    );

    expect(interrupt.body.type).toBe('interrupt_ok');
    expect(interrupt.body.targetRequestId).toBe(submitRequestId);

    await waitForCondition(() => {
      const state = controller.getState(
        accessInfo.sessionId,
        login.body.authToken,
      );
      return (
        state.type === 'state_update' &&
        Array.isArray(state.recentCliRuns) &&
        state.recentCliRuns[0]?.requestId === submitRequestId &&
        state.recentCliRuns[0]?.status === 'interrupted'
      );
    });
  });

  it('应返回服务器诊断命令输出', async () => {
    const controller = createController({
      runCommand: async (requestId, command) => ({
        requestId,
        command,
        executable: 'nvidia-smi',
        args: [],
        startedAt: '2026-03-31T00:00:00.000Z',
        finishedAt: '2026-03-31T00:00:01.000Z',
        durationMs: 1000,
        status: 'succeeded',
        exitCode: 0,
        stdout: 'GPU 0: RTX',
        stderr: '',
      }),
    });
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
        requestId: 'login-cli-command',
        sessionId: accessInfo.sessionId,
        pin: accessInfo.pin,
      },
    );

    const command = await requestJson<{
      type: string;
      commandRun?: { stdout?: string; command?: string };
    }>(
      {
        hostname: serverInfo.host,
        port: serverInfo.port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'run_server_command',
        requestId: 'command-cli-1',
        sessionId: accessInfo.sessionId,
        authToken: login.body.authToken,
        command: 'nvidia-smi',
      },
    );

    expect(command.body.type).toBe('command_ok');
    expect(command.body.commandRun?.command).toBe('nvidia-smi');
    expect(command.body.commandRun?.stdout).toContain('RTX');
  });

  it('应拒绝白名单外的服务器命令', async () => {
    const controller = createController({
      runCommand: async () => {
        throw new ServerCommandExecutionError(
          'COMMAND_NOT_ALLOWED',
          '当前只允许只读诊断命令：nvidia-smi / pwd',
        );
      },
    });
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
        requestId: 'login-cli-command-denied',
        sessionId: accessInfo.sessionId,
        pin: accessInfo.pin,
      },
    );

    const command = await requestJson<{ type: string; code?: string }>(
      {
        hostname: serverInfo.host,
        port: serverInfo.port,
        path: '/api/mobile',
        method: 'POST',
      },
      {
        type: 'run_server_command',
        requestId: 'command-cli-2',
        sessionId: accessInfo.sessionId,
        authToken: login.body.authToken,
        command: 'rm -rf /',
      },
    );

    expect(command.body.type).toBe('command_failed');
    expect(command.body.code).toBe('COMMAND_NOT_ALLOWED');
  });
});
