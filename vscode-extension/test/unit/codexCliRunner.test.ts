import { EventEmitter } from 'events';

import { describe, expect, it } from 'vitest';

import {
  CodexCliExecutionError,
  CodexCliRunner,
} from '../../src/cli/codexCliRunner';

class FakeWritable extends EventEmitter {
  data = '';
  ended = false;

  write(chunk: string): boolean {
    this.data += chunk;
    return true;
  }

  end(): void {
    this.ended = true;
  }
}

class FakeChildProcess extends EventEmitter {
  exitCode: number | null = null;
  readonly stdin = new FakeWritable();
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();

  kill(): boolean {
    this.exitCode = 1;
    this.emit('close', this.exitCode);
    return true;
  }
}

describe('CodexCliRunner', () => {
  it('stdin 模式应把 prompt 写入 stdin', async () => {
    const child = new FakeChildProcess();
    let receivedArgs: string[] = [];
    const runner = new CodexCliRunner(
      {
        getExecutable: () => 'codex',
        getArgs: () => ['run'],
        getWorkingDirectory: () => '/srv/repo',
        getPromptMode: () => 'stdin',
        getPromptPlaceholder: () => '__PROMPT__',
        getTimeoutMs: () => 1000,
      },
      {
        spawnProcess: (_executable, args) => {
          receivedArgs = args;
          queueMicrotask(() => {
            child.stdout.emit('data', Buffer.from('ok'));
            child.emit('close', 0);
          });
          return child as never;
        },
        setTimer: () => ({} as NodeJS.Timeout),
        clearTimer: () => undefined,
      },
    );

    const result = await runner.runPrompt('hello codex');
    expect(receivedArgs).toEqual(['run']);
    expect(child.stdin.data).toBe('hello codex');
    expect(result.stdout).toBe('ok');
    expect(result.combinedOutput).toBe('ok');
    expect(result.metadata?.promptMode).toBe('stdin');
    expect(result.metadata?.executable).toBe('codex');
  });

  it('arg 模式应替换占位符', async () => {
    const child = new FakeChildProcess();
    let receivedArgs: string[] = [];
    const runner = new CodexCliRunner(
      {
        getExecutable: () => 'codex',
        getArgs: () => ['exec', '__PROMPT__'],
        getWorkingDirectory: () => undefined,
        getPromptMode: () => 'arg',
        getPromptPlaceholder: () => '__PROMPT__',
        getTimeoutMs: () => 1000,
      },
      {
        spawnProcess: (_executable, args) => {
          receivedArgs = args;
          queueMicrotask(() => child.emit('close', 0));
          return child as never;
        },
        setTimer: () => ({} as NodeJS.Timeout),
        clearTimer: () => undefined,
      },
    );

    await runner.runPrompt('explain timeout');
    expect(receivedArgs).toEqual(['exec', 'explain timeout']);
    expect(child.stdin.data).toBe('');
    expect(child.stdin.ended).toBe(true);
  });

  it('resume + arg 模式应调用 codex exec resume SESSION_ID PROMPT', async () => {
    const child = new FakeChildProcess();
    let receivedArgs: string[] = [];
    const runner = new CodexCliRunner(
      {
        getExecutable: () => 'codex',
        getArgs: () => ['exec', '--json', '__PROMPT__'],
        getWorkingDirectory: () => '/srv/repo',
        getPromptMode: () => 'arg',
        getPromptPlaceholder: () => '__PROMPT__',
        getTimeoutMs: () => 1000,
      },
      {
        spawnProcess: (_executable, args) => {
          receivedArgs = args;
          queueMicrotask(() => child.emit('close', 0));
          return child as never;
        },
        setTimer: () => ({} as NodeJS.Timeout),
        clearTimer: () => undefined,
      },
    );

    await runner.runPrompt('continue this thread', {
      resumeSessionId: 'abc-123',
    });

    expect(receivedArgs).toEqual([
      'exec',
      'resume',
      '--json',
      'abc-123',
      'continue this thread',
    ]);
    expect(child.stdin.data).toBe('');
  });

  it('resume + stdin 模式应将 prompt 写入 stdin 并传入 -', async () => {
    const child = new FakeChildProcess();
    let receivedArgs: string[] = [];
    const runner = new CodexCliRunner(
      {
        getExecutable: () => 'codex',
        getArgs: () => ['exec', '--json'],
        getWorkingDirectory: () => '/srv/repo',
        getPromptMode: () => 'stdin',
        getPromptPlaceholder: () => '__PROMPT__',
        getTimeoutMs: () => 1000,
      },
      {
        spawnProcess: (_executable, args) => {
          receivedArgs = args;
          queueMicrotask(() => child.emit('close', 0));
          return child as never;
        },
        setTimer: () => ({} as NodeJS.Timeout),
        clearTimer: () => undefined,
      },
    );

    await runner.runPrompt('resume over stdin', {
      resumeSessionId: 'session-42',
    });

    expect(receivedArgs).toEqual([
      'exec',
      'resume',
      '--json',
      'session-42',
      '-',
    ]);
    expect(child.stdin.data).toBe('resume over stdin');
    expect(child.stdin.ended).toBe(true);
  });

  it('命令不存在时应返回 CLI_NOT_CONFIGURED', async () => {
    const child = new FakeChildProcess();
    const runner = new CodexCliRunner(
      {
        getExecutable: () => 'codex',
        getArgs: () => [],
        getWorkingDirectory: () => undefined,
        getPromptMode: () => 'stdin',
        getPromptPlaceholder: () => '__PROMPT__',
        getTimeoutMs: () => 1000,
      },
      {
        spawnProcess: () => {
          queueMicrotask(() => {
            const error = new Error('spawn codex ENOENT') as Error & {
              code?: string;
            };
            error.code = 'ENOENT';
            child.emit('error', error);
          });
          return child as never;
        },
        setTimer: () => ({} as NodeJS.Timeout),
        clearTimer: () => undefined,
      },
    );

    await expect(runner.runPrompt('hello')).rejects.toMatchObject({
      code: 'CLI_NOT_CONFIGURED',
    } satisfies Partial<CodexCliExecutionError>);
  });

  it('应从 CLI 输出提取模型与会话信息', async () => {
    const child = new FakeChildProcess();
    const runner = new CodexCliRunner(
      {
        getExecutable: () => 'codex',
        getArgs: () => ['exec', '__PROMPT__'],
        getWorkingDirectory: () => undefined,
        getPromptMode: () => 'arg',
        getPromptPlaceholder: () => '__PROMPT__',
        getTimeoutMs: () => 1000,
      },
      {
        spawnProcess: () => {
          queueMicrotask(() => {
            child.stdout.emit(
              'data',
              Buffer.from(
                [
                  'model: gpt-5.4',
                  'provider: cch',
                  'reasoning effort: high',
                  'session id: abc-123',
                ].join('\n'),
              ),
            );
            child.emit('close', 0);
          });
          return child as never;
        },
        setTimer: () => ({} as NodeJS.Timeout),
        clearTimer: () => undefined,
      },
    );

    const result = await runner.runPrompt('hello');
    expect(result.metadata?.model).toBe('gpt-5.4');
    expect(result.metadata?.provider).toBe('cch');
    expect(result.metadata?.reasoningEffort).toBe('high');
    expect(result.metadata?.codexSessionId).toBe('abc-123');
  });

  it('应按收到的顺序保留完整 CLI 输出并推送进度', async () => {
    const child = new FakeChildProcess();
    const progressSnapshots: string[] = [];
    const runner = new CodexCliRunner(
      {
        getExecutable: () => 'codex',
        getArgs: () => ['exec', '__PROMPT__'],
        getWorkingDirectory: () => '/srv/repo',
        getPromptMode: () => 'arg',
        getPromptPlaceholder: () => '__PROMPT__',
        getTimeoutMs: () => 1000,
      },
      {
        spawnProcess: () => {
          queueMicrotask(() => {
            child.stderr.emit('data', Buffer.from('stderr-line\n'));
            child.stdout.emit('data', Buffer.from('stdout-line\n'));
            child.stderr.emit('data', Buffer.from('thinking...\n'));
            child.emit('close', 0);
          });
          return child as never;
        },
        setTimer: () => ({} as NodeJS.Timeout),
        clearTimer: () => undefined,
      },
    );

    const result = await runner.runPrompt('stream me', {
      onProgress: (progress) => {
        progressSnapshots.push(progress.combinedOutput);
      },
    });

    expect(progressSnapshots).toEqual([
      'stderr-line\n',
      'stderr-line\nstdout-line\n',
      'stderr-line\nstdout-line\nthinking...\n',
    ]);
    expect(result.combinedOutput).toBe(
      'stderr-line\nstdout-line\nthinking...\n',
    );
  });

  it('超时时应返回 CLI_TIMEOUT', async () => {
    const child = new FakeChildProcess();
    let timeoutHandler: (() => void) | undefined;
    const runner = new CodexCliRunner(
      {
        getExecutable: () => 'codex',
        getArgs: () => [],
        getWorkingDirectory: () => undefined,
        getPromptMode: () => 'stdin',
        getPromptPlaceholder: () => '__PROMPT__',
        getTimeoutMs: () => 1000,
      },
      {
        spawnProcess: () => child as never,
        setTimer: (handler) => {
          timeoutHandler = handler;
          return {} as NodeJS.Timeout;
        },
        clearTimer: () => undefined,
      },
    );

    const promise = runner.runPrompt('hello');
    timeoutHandler?.();
    await expect(promise).rejects.toMatchObject({
      code: 'CLI_TIMEOUT',
    } satisfies Partial<CodexCliExecutionError>);
  });

  it('应支持按 requestId 中断运行中的 CLI 任务', async () => {
    const child = new FakeChildProcess();
    const runner = new CodexCliRunner(
      {
        getExecutable: () => 'codex',
        getArgs: () => ['exec', '__PROMPT__'],
        getWorkingDirectory: () => '/srv/repo',
        getPromptMode: () => 'arg',
        getPromptPlaceholder: () => '__PROMPT__',
        getTimeoutMs: () => 1000,
      },
      {
        spawnProcess: () => child as never,
        setTimer: () => ({} as NodeJS.Timeout),
        clearTimer: () => undefined,
      },
    );

    const promise = runner.runPrompt('interrupt me', {
      requestId: 'req-interrupt-1',
    });

    expect(runner.interruptRun('req-interrupt-1')).toBe(true);
    await expect(promise).rejects.toMatchObject({
      code: 'CLI_INTERRUPTED',
    } satisfies Partial<CodexCliExecutionError>);
    expect(runner.interruptRun('req-interrupt-1')).toBe(false);
  });
});
