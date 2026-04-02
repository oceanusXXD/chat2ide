import { ChildProcess, spawn } from 'child_process';

import {
  BridgeErrorCode,
  ServerCommandTelemetry,
  previewText,
} from '../types/protocol';

export const SAFE_SERVER_COMMANDS = [
  'nvidia-smi',
  'nvidia-smi -L',
  'pwd',
  'uptime',
  'hostname',
  'whoami',
  'df -h',
  'free -h',
] as const;

const ALLOWED_COMMANDS = new Set<string>(SAFE_SERVER_COMMANDS);
const DEFAULT_TIMEOUT_MS = 15_000;

export interface SafeServerCommandRunnerDependencies {
  spawnProcess(
    executable: string,
    args: string[],
    options: {
      cwd?: string;
      env: NodeJS.ProcessEnv;
      stdio: ['ignore', 'pipe', 'pipe'];
    },
  ): ChildProcess;
  setTimer(handler: () => void, ms: number): NodeJS.Timeout;
  clearTimer(timer: NodeJS.Timeout): void;
}

export interface SafeServerCommandRunnerLike {
  runCommand(
    requestId: string,
    command: string,
  ): Promise<ServerCommandTelemetry>;
}

export class ServerCommandExecutionError extends Error {
  constructor(
    readonly code: BridgeErrorCode,
    message: string,
    readonly commandRun?: ServerCommandTelemetry,
  ) {
    super(message);
    this.name = 'ServerCommandExecutionError';
  }
}

interface ParsedServerCommand {
  normalized: string;
  executable: string;
  args: string[];
}

export class SafeServerCommandRunner implements SafeServerCommandRunnerLike {
  constructor(
    private readonly dependencies: SafeServerCommandRunnerDependencies = {
      spawnProcess: (executable, args, options) =>
        spawn(executable, args, options),
      setTimer: (handler, ms) => setTimeout(handler, ms),
      clearTimer: (timer) => clearTimeout(timer),
    },
  ) {}

  async runCommand(
    requestId: string,
    command: string,
  ): Promise<ServerCommandTelemetry> {
    const parsed = parseServerCommand(command);
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();

    return new Promise<ServerCommandTelemetry>((resolve, reject) => {
      const child = this.dependencies.spawnProcess(
        parsed.executable,
        parsed.args,
        {
          cwd: process.cwd(),
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';
      let settled = false;
      let timedOut = false;
      let forceKillTimer: NodeJS.Timeout | undefined;

      const buildTelemetry = (
        status: ServerCommandTelemetry['status'],
        exitCode?: number,
      ): ServerCommandTelemetry => {
        const finishedAtMs = Date.now();
        return {
          requestId,
          command: parsed.normalized,
          executable: parsed.executable,
          args: [...parsed.args],
          startedAt,
          finishedAt: new Date(finishedAtMs).toISOString(),
          durationMs: finishedAtMs - startedAtMs,
          status,
          exitCode,
          stdout,
          stderr,
        };
      };

      const cleanup = (timeout: NodeJS.Timeout) => {
        this.dependencies.clearTimer(timeout);
        if (forceKillTimer) {
          this.dependencies.clearTimer(forceKillTimer);
          forceKillTimer = undefined;
        }
      };

      const terminate = () => {
        if (child.exitCode !== null) {
          return;
        }
        forceKillTimer = this.dependencies.setTimer(() => {
          if (child.exitCode === null) {
            child.kill('SIGKILL');
          }
        }, 1000);
        child.kill('SIGTERM');
      };

      const timeout = this.dependencies.setTimer(() => {
        timedOut = true;
        terminate();
      }, DEFAULT_TIMEOUT_MS);

      const finalizeError = (
        code: BridgeErrorCode,
        message: string,
        telemetry?: ServerCommandTelemetry,
      ) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup(timeout);
        reject(new ServerCommandExecutionError(code, message, telemetry));
      };

      child.once('error', (error) => {
        const nodeError = error as NodeJS.ErrnoException;
        const telemetry = buildTelemetry('failed');
        finalizeError(
          'COMMAND_EXECUTION_FAILED',
          nodeError.code === 'ENOENT'
            ? `命令不可用：${parsed.executable}`
            : error instanceof Error
            ? error.message
            : '服务器命令执行失败',
          telemetry,
        );
      });

      child.stdout?.on('data', (chunk: Buffer | string) => {
        stdout += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
      });
      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
      });

      child.once('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup(timeout);

        if (timedOut) {
          reject(
            new ServerCommandExecutionError(
              'COMMAND_TIMEOUT',
              `诊断命令执行超时，超过 ${DEFAULT_TIMEOUT_MS}ms`,
              buildTelemetry('failed', code ?? undefined),
            ),
          );
          return;
        }

        if (code !== 0) {
          reject(
            new ServerCommandExecutionError(
              'COMMAND_EXECUTION_FAILED',
              buildCommandFailureMessage(
                parsed.normalized,
                code ?? -1,
                stdout,
                stderr,
              ),
              buildTelemetry('failed', code ?? undefined),
            ),
          );
          return;
        }

        resolve(buildTelemetry('succeeded', code ?? 0));
      });
    });
  }
}

function parseServerCommand(command: string): ParsedServerCommand {
  const normalized = command.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    throw new ServerCommandExecutionError('BAD_REQUEST', '诊断命令不能为空');
  }
  if (!ALLOWED_COMMANDS.has(normalized)) {
    throw new ServerCommandExecutionError(
      'COMMAND_NOT_ALLOWED',
      `当前只允许只读诊断命令：${SAFE_SERVER_COMMANDS.join(' / ')}`,
    );
  }
  const tokens = normalized.split(' ');
  return {
    normalized,
    executable: tokens[0],
    args: tokens.slice(1),
  };
}

function buildCommandFailureMessage(
  command: string,
  exitCode: number,
  stdout: string,
  stderr: string,
): string {
  const stderrPreview = previewText(stderr, 120);
  const stdoutPreview = previewText(stdout, 120);
  if (stderrPreview) {
    return `诊断命令失败：${command}，退出码=${exitCode}，stderr：${stderrPreview}`;
  }
  if (stdoutPreview) {
    return `诊断命令失败：${command}，退出码=${exitCode}，stdout：${stdoutPreview}`;
  }
  return `诊断命令失败：${command}，退出码=${exitCode}`;
}
