import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import {
  findFirstWorkspaceHelperExecutable,
  resolveCommandOnPath,
} from './helperExecutableDiscovery';
import { Logger } from '../utils/logger';

export interface HelperProcessSettings {
  getExecutablePath(): string | undefined;
  getWorkspaceRoots(): string[];
  getHelperHost(): string;
  getHelperPort(): number;
}

export interface HelperProcessDependencies {
  existsSync(path: string): boolean;
  findExecutableOnPath(command: string): string | undefined;
  spawnProcess(
    executable: string,
    args: string[],
    options: {
      stdio: ['ignore', 'pipe', 'pipe'];
    },
  ): ChildProcess;
  wait(ms: number): Promise<void>;
}

/**
 * 用于在本机找出 Helper 可执行文件并可选地拉起进程。
 */
export class HelperProcessManager {
  private child?: ChildProcess;

  constructor(
    private readonly settings: HelperProcessSettings,
    private readonly logger: Logger,
    private readonly dependencies: HelperProcessDependencies = {
      existsSync: (targetPath) => fs.existsSync(targetPath),
      findExecutableOnPath: (command) => resolveCommandOnPath(command, fs.existsSync),
      spawnProcess: (executable, args, options) => spawn(executable, args, options),
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
  ) {}

  resolveExecutablePath(): string | undefined {
    const configured = this.settings.getExecutablePath()?.trim();
    if (configured) {
      return this.resolveConfiguredPath(configured);
    }

    return findFirstWorkspaceHelperExecutable(
      this.settings.getWorkspaceRoots(),
      (targetPath) => this.dependencies.existsSync(targetPath),
    );
  }

  private resolveConfiguredPath(configured: string): string | undefined {
    if (!configured.includes(path.sep)) {
      return this.dependencies.findExecutableOnPath(configured);
    }
    if (this.dependencies.existsSync(configured)) {
      return configured;
    }
    return undefined;
  }

  async start(): Promise<boolean> {
    if (this.child && !this.child.killed) {
      this.logger.info('Helper 已由扩展拉起，无需重复启动');
      return true;
    }

    const executable = this.resolveExecutablePath();
    if (!executable) {
      this.logger.warn('未找到 Helper 可执行文件，无法自动启动');
      return false;
    }

    this.logger.info(`准备自动启动 Helper：${executable}`);
    return new Promise<boolean>((resolve) => {
      const child = this.dependencies.spawnProcess(
        executable,
        [
          'serve',
          '--host',
          this.settings.getHelperHost(),
          '--port',
          String(this.settings.getHelperPort()),
        ],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let settled = false;
      const finish = (value: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(value);
      };

      child.once('spawn', () => {
        this.child = child;
        finish(true);
      });
      child.once('error', (error) => {
        this.logger.error('自动启动 Helper 失败', error);
        if (this.child === child) {
          this.child = undefined;
        }
        finish(false);
      });

      child.stdout?.on('data', (chunk: Buffer | string) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8').trim() : chunk.trim();
        if (text) {
          this.logger.info(`[helper] ${text}`);
        }
      });
      child.stderr?.on('data', (chunk: Buffer | string) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8').trim() : chunk.trim();
        if (text) {
          this.logger.warn(`[helper] ${text}`);
        }
      });
      child.on('exit', (code, signal) => {
        this.logger.warn(`Helper 进程退出，code=${code ?? 'null'} signal=${signal ?? 'null'}`);
        if (this.child === child) {
          this.child = undefined;
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.child || this.child.killed) {
      return;
    }
    const child = this.child;
    this.child = undefined;
    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.once('close', () => resolve());
    });
    child.kill('SIGTERM');
    await Promise.race([exited, this.dependencies.wait(1500)]);
    if (!child.killed && child.exitCode === null) {
      this.logger.warn('Helper 在宽限期内未退出，准备强制结束');
      child.kill('SIGKILL');
      await Promise.race([exited, this.dependencies.wait(500)]);
    }
  }
}
