import { EventEmitter } from 'events';

import { describe, expect, it } from 'vitest';

import { HelperProcessManager } from '../../src/helper/helperProcessManager';
import { MemoryLogger } from '../../src/utils/logger';

class FakeChildProcess extends EventEmitter {
  killed = false;
  exitCode: number | null = null;
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();

  kill(signal?: string): boolean {
    this.killed = true;
    this.exitCode = signal === 'SIGKILL' ? 137 : 0;
    this.emit('exit', this.exitCode, signal ?? 'SIGTERM');
    this.emit('close', this.exitCode, signal ?? 'SIGTERM');
    return true;
  }
}

describe('HelperProcessManager', () => {
  it('应在 spawn error 时返回 false', async () => {
    const child = new FakeChildProcess();
    const manager = new HelperProcessManager(
      {
        getExecutablePath: () => '/tmp/prompt-bridge-helper',
        getWorkspaceRoots: () => [],
        getHelperHost: () => '127.0.0.1',
        getHelperPort: () => 8766,
      },
      new MemoryLogger(),
      {
        existsSync: () => true,
        findExecutableOnPath: () => undefined,
        spawnProcess: () => {
          queueMicrotask(() => child.emit('error', new Error('spawn fail')));
          return child as never;
        },
        wait: async () => undefined,
      },
    );

    await expect(manager.start()).resolves.toBe(false);
  });

  it('应在成功拉起后可正常停止', async () => {
    const child = new FakeChildProcess();
    const manager = new HelperProcessManager(
      {
        getExecutablePath: () => '/tmp/prompt-bridge-helper',
        getWorkspaceRoots: () => [],
        getHelperHost: () => '127.0.0.1',
        getHelperPort: () => 8766,
      },
      new MemoryLogger(),
      {
        existsSync: () => true,
        findExecutableOnPath: () => undefined,
        spawnProcess: () => {
          queueMicrotask(() => child.emit('spawn'));
          return child as never;
        },
        wait: async () => undefined,
      },
    );

    await expect(manager.start()).resolves.toBe(true);
    await manager.stop();
    expect(child.killed).toBe(true);
  });

  it('应自动探测工作区下的默认 Helper 路径', () => {
    const manager = new HelperProcessManager(
      {
        getExecutablePath: () => undefined,
        getWorkspaceRoots: () => ['/workspace/demo/vscode-extension'],
        getHelperHost: () => '127.0.0.1',
        getHelperPort: () => 8766,
      },
      new MemoryLogger(),
      {
        existsSync: (targetPath) =>
          targetPath === '/workspace/demo/.venv/bin/prompt-bridge-helper',
        findExecutableOnPath: () => undefined,
        spawnProcess: () => {
          throw new Error('不应触发 spawn');
        },
        wait: async () => undefined,
      },
    );

    expect(manager.resolveExecutablePath()).toBe('/workspace/demo/.venv/bin/prompt-bridge-helper');
  });

  it('应支持将 PATH 中的命令名作为 Helper 配置值', () => {
    const manager = new HelperProcessManager(
      {
        getExecutablePath: () => 'prompt-bridge-helper',
        getWorkspaceRoots: () => [],
        getHelperHost: () => '127.0.0.1',
        getHelperPort: () => 8766,
      },
      new MemoryLogger(),
      {
        existsSync: () => false,
        findExecutableOnPath: (command) =>
          command === 'prompt-bridge-helper' ? '/usr/local/bin/prompt-bridge-helper' : undefined,
        spawnProcess: () => {
          throw new Error('不应触发 spawn');
        },
        wait: async () => undefined,
      },
    );

    expect(manager.resolveExecutablePath()).toBe('/usr/local/bin/prompt-bridge-helper');
  });
});
