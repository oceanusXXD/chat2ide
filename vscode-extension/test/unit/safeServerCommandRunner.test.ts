import { EventEmitter } from 'events';

import { describe, expect, it } from 'vitest';

import {
  SafeServerCommandRunner,
  ServerCommandExecutionError,
} from '../../src/cli/safeServerCommandRunner';

class FakeCommandChildProcess extends EventEmitter {
  exitCode: number | null = null;
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();

  kill(): boolean {
    this.exitCode = 1;
    this.emit('close', this.exitCode);
    return true;
  }
}

describe('SafeServerCommandRunner', () => {
  it('应执行白名单内的命令', async () => {
    const child = new FakeCommandChildProcess();
    let executable = '';
    let args: string[] = [];
    const runner = new SafeServerCommandRunner({
      spawnProcess: (nextExecutable, nextArgs) => {
        executable = nextExecutable;
        args = nextArgs;
        queueMicrotask(() => {
          child.stdout.emit('data', Buffer.from('GPU 0'));
          child.emit('close', 0);
        });
        return child as never;
      },
      setTimer: () => ({} as NodeJS.Timeout),
      clearTimer: () => undefined,
    });

    const result = await runner.runCommand('cmd-1', 'nvidia-smi');
    expect(executable).toBe('nvidia-smi');
    expect(args).toEqual([]);
    expect(result.status).toBe('succeeded');
    expect(result.stdout).toContain('GPU 0');
  });

  it('应拒绝白名单外的命令', async () => {
    const runner = new SafeServerCommandRunner({
      spawnProcess: () => {
        throw new Error('不应启动子进程');
      },
      setTimer: () => ({} as NodeJS.Timeout),
      clearTimer: () => undefined,
    });

    await expect(runner.runCommand('cmd-2', 'rm -rf /')).rejects.toMatchObject({
      code: 'COMMAND_NOT_ALLOWED',
    } satisfies Partial<ServerCommandExecutionError>);
  });
});
