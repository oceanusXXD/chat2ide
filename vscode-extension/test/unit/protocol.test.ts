import { describe, expect, it } from 'vitest';

import {
  buildStateUpdate,
  parseMobileMessage,
  parseRelayAgentMessage,
  parseRelayServerMessage,
  previewText,
} from '../../src/types/protocol';

describe('protocol', () => {
  it('应解析 login 请求', () => {
    const request = parseMobileMessage(
      JSON.stringify({
        type: 'login',
        requestId: 'req-1',
        sessionId: 'session-1',
        pin: '123456',
      }),
    );
    expect(request.type).toBe('login');
    if (request.type !== 'login') {
      throw new Error('类型收窄失败');
    }
    expect(request.pin).toBe('123456');
  });

  it('应解析 submit_prompt 请求', () => {
    const request = parseMobileMessage(
      JSON.stringify({
        type: 'submit_prompt',
        requestId: 'req-2',
        sessionId: 'session-1',
        authToken: 'auth-1',
        text: 'hello',
        resumeSessionId: 'codex-session-1',
      }),
    );
    expect(request.type).toBe('submit_prompt');
    if (request.type !== 'submit_prompt') {
      throw new Error('类型收窄失败');
    }
    expect(request.text).toBe('hello');
    expect(request.resumeSessionId).toBe('codex-session-1');
  });

  it('应解析 interrupt_run 请求', () => {
    const request = parseMobileMessage(
      JSON.stringify({
        type: 'interrupt_run',
        requestId: 'req-3',
        sessionId: 'session-1',
        authToken: 'auth-1',
        targetRequestId: 'submit-1',
      }),
    );
    expect(request.type).toBe('interrupt_run');
    if (request.type !== 'interrupt_run') {
      throw new Error('类型收窄失败');
    }
    expect(request.targetRequestId).toBe('submit-1');
  });

  it('应解析 run_server_command 请求', () => {
    const request = parseMobileMessage(
      JSON.stringify({
        type: 'run_server_command',
        requestId: 'req-4',
        sessionId: 'session-1',
        authToken: 'auth-1',
        command: 'nvidia-smi',
      }),
    );
    expect(request.type).toBe('run_server_command');
    if (request.type !== 'run_server_command') {
      throw new Error('类型收窄失败');
    }
    expect(request.command).toBe('nvidia-smi');
  });

  it('应拒绝非法请求', () => {
    expect(() =>
      parseMobileMessage(JSON.stringify({ foo: 'bar' })),
    ).toThrowError();
  });

  it('应将状态快照转换为手机状态消息', () => {
    const message = buildStateUpdate({
      status: 'authenticated',
      updatedAt: '2026-03-31T00:00:00.000Z',
      detail: '手机已登录',
      authenticated: true,
      sessionExpiresAt: '2026-03-31T00:15:00.000Z',
      authExpiresAt: '2026-03-31T00:10:00.000Z',
      lastPrompt: {
        requestId: 'req-prompt-1',
        text: '请解释超时原因',
        receivedAt: '2026-03-31T00:00:00.000Z',
        deviceName: 'iPhone',
      },
      lastPromptText: '请解释超时原因',
      lastError: {
        code: 'CLI_TIMEOUT',
        message: '上一次执行超时',
        recoverable: true,
        requestId: 'req-error-1',
      },
      lastCliRun: {
        requestId: 'req-cli-1',
        status: 'succeeded',
        startedAt: '2026-03-31T00:00:01.000Z',
        finishedAt: '2026-03-31T00:00:03.000Z',
        durationMs: 2000,
        commandLine: 'codex exec __PROMPT__',
        executable: 'codex',
        configuredArgs: ['exec', '__PROMPT__'],
        resolvedArgs: ['exec', 'hello'],
        promptMode: 'arg',
        timeoutMs: 120000,
        exitCode: 0,
        stdout: 'ok',
      },
      recentCliRuns: [
        {
          requestId: 'req-cli-1',
          status: 'succeeded',
          startedAt: '2026-03-31T00:00:01.000Z',
          finishedAt: '2026-03-31T00:00:03.000Z',
          durationMs: 2000,
          promptText: '请解释超时原因',
          promptPreview: '请解释超时原因',
          commandLine: 'codex exec __PROMPT__',
          executable: 'codex',
          configuredArgs: ['exec', '__PROMPT__'],
          resolvedArgs: ['exec', 'hello'],
          promptMode: 'arg',
          timeoutMs: 120000,
          exitCode: 0,
          stdout: 'ok',
        },
      ],
    });
    expect(message.type).toBe('state_update');
    expect(message.authenticated).toBe(true);
    expect(message.lastPromptPreview).toBe('请解释超时原因');
    expect(message.lastPrompt?.requestId).toBe('req-prompt-1');
    expect(message.lastPrompt?.deviceName).toBe('iPhone');
    expect(message.lastError?.code).toBe('CLI_TIMEOUT');
    expect(message.lastCliRun?.commandLine).toBe('codex exec __PROMPT__');
    expect(message.recentCliRuns?.[0]?.promptPreview).toBe('请解释超时原因');
  });

  it('应裁剪过长文本预览', () => {
    expect(previewText('1234567890', 5)).toBe('1234…');
  });

  it('应解析 Relay Server 发给 Agent 的 forward_prompt', () => {
    const message = parseRelayServerMessage(
      JSON.stringify({
        type: 'forward_prompt',
        requestId: 'relay-1',
        sessionId: 'session-1',
        text: '请解释这里为什么超时',
        receivedAt: '2026-03-31T00:00:00.000Z',
      }),
    );
    expect(message.type).toBe('forward_prompt');
    if (message.type !== 'forward_prompt') {
      throw new Error('类型收窄失败');
    }
    expect(message.text).toContain('超时');
  });

  it('应解析 Relay Agent 回给服务端的 forward_result', () => {
    const message = parseRelayAgentMessage(
      JSON.stringify({
        type: 'forward_result',
        requestId: 'relay-2',
        ok: false,
        code: 'CODEX_COMMAND_FAILED',
        detail: '未找到 Codex 打开命令',
      }),
    );
    expect(message.type).toBe('forward_result');
    if (message.type !== 'forward_result') {
      throw new Error('类型收窄失败');
    }
    expect(message.code).toBe('CODEX_COMMAND_FAILED');
  });
});
