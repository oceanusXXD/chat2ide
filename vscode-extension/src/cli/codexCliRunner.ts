import { ChildProcess, execFileSync, spawn } from 'child_process';

import { BridgeErrorCode, previewText } from '../types/protocol';

export type CodexPromptMode = 'stdin' | 'arg';

export interface CodexCliRunnerSettings {
  getExecutable(): string;
  getArgs(): string[];
  getWorkingDirectory(): string | undefined;
  getPromptMode(): CodexPromptMode;
  getPromptPlaceholder(): string;
  getTimeoutMs(): number;
}

export interface CodexCliRunInvocation {
  executable: string;
  configuredArgs: string[];
  resolvedArgs: string[];
  workingDirectory?: string;
  promptMode: CodexPromptMode;
  timeoutMs: number;
  resumeSessionId?: string;
}

export interface CodexCliRunMetadata extends CodexCliRunInvocation {
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  model?: string;
  provider?: string;
  approval?: string;
  sandbox?: string;
  reasoningEffort?: string;
  reasoningSummaries?: string;
  codexSessionId?: string;
  outputWorkdir?: string;
  changedFiles?: string[];
  gitChangedFiles?: string[];
}

export interface CodexCliRunResult {
  detail: string;
  exitCode: number;
  combinedOutput: string;
  stdout: string;
  stderr: string;
  metadata?: CodexCliRunMetadata;
}

export interface CodexCliRunProgress {
  combinedOutput: string;
  stdout: string;
  stderr: string;
  metadata: CodexCliRunMetadata;
}

export interface CodexCliRunnerDependencies {
  spawnProcess(
    executable: string,
    args: string[],
    options: {
      cwd?: string;
      env: NodeJS.ProcessEnv;
      stdio: ['pipe', 'pipe', 'pipe'];
    },
  ): ChildProcess;
  setTimer(handler: () => void, ms: number): NodeJS.Timeout;
  clearTimer(timer: NodeJS.Timeout): void;
}

export interface CodexCliRunOptions {
  resumeSessionId?: string;
  requestId?: string;
  onProgress?: (progress: CodexCliRunProgress) => void;
}

interface ActiveCodexRun {
  child: ChildProcess;
  interrupt(): void;
}

export class CodexCliExecutionError extends Error {
  constructor(
    readonly code: BridgeErrorCode,
    message: string,
    readonly combinedOutput = '',
    readonly stdout = '',
    readonly stderr = '',
    readonly metadata?: CodexCliRunMetadata,
  ) {
    super(message);
    this.name = 'CodexCliExecutionError';
  }
}

/**
 * 在服务器侧启动 Codex CLI。它不依赖 VS Code GUI，适合 SSH / 远端场景。
 */
export class CodexCliRunner {
  private readonly activeRuns = new Map<string, ActiveCodexRun>();

  constructor(
    private readonly settings: CodexCliRunnerSettings,
    private readonly dependencies: CodexCliRunnerDependencies = {
      spawnProcess: (executable, args, options) =>
        spawn(executable, args, options),
      setTimer: (handler, ms) => setTimeout(handler, ms),
      clearTimer: (timer) => clearTimeout(timer),
    },
  ) {}

  describeInvocation(
    text: string,
    options: CodexCliRunOptions = {},
  ): CodexCliRunInvocation {
    const configuredArgs = [...this.settings.getArgs()];
    return {
      executable: this.settings.getExecutable().trim(),
      configuredArgs,
      resolvedArgs: this.resolveArgs(
        configuredArgs,
        text,
        options.resumeSessionId,
      ),
      workingDirectory: this.settings.getWorkingDirectory(),
      promptMode: this.settings.getPromptMode(),
      timeoutMs: this.settings.getTimeoutMs(),
      resumeSessionId: options.resumeSessionId,
    };
  }

  interruptRun(requestId: string): boolean {
    const normalizedRequestId = requestId.trim();
    if (!normalizedRequestId) {
      return false;
    }
    const activeRun = this.activeRuns.get(normalizedRequestId);
    if (!activeRun || activeRun.child.exitCode !== null) {
      return false;
    }
    activeRun.interrupt();
    return true;
  }

  async runPrompt(
    text: string,
    options: CodexCliRunOptions = {},
  ): Promise<CodexCliRunResult> {
    const invocation = this.describeInvocation(text, options);
    if (!invocation.executable) {
      throw new CodexCliExecutionError(
        'CLI_NOT_CONFIGURED',
        '未配置 Codex CLI 可执行命令',
      );
    }

    const beforeGitSnapshot = captureGitStatusSnapshot(
      invocation.workingDirectory,
    );
    const startedAtMs = Date.now();
    const startedAtIso = new Date(startedAtMs).toISOString();
    const requestId = options.requestId?.trim();

    return new Promise<CodexCliRunResult>((resolve, reject) => {
      const child = this.dependencies.spawnProcess(
        invocation.executable,
        invocation.resolvedArgs,
        {
          cwd: invocation.workingDirectory,
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';
      let combinedOutput = '';
      let settled = false;
      let timedOut = false;
      let interrupted = false;
      let forceKillTimer: NodeJS.Timeout | undefined;
      const buildMetadata = (finishedAtMs?: number): CodexCliRunMetadata => {
        const insights = extractCodexInsights(stdout, stderr);
        const metadata: CodexCliRunMetadata = {
          ...invocation,
          startedAt: startedAtIso,
          ...insights,
        };
        if (finishedAtMs === undefined) {
          return metadata;
        }
        const afterGitSnapshot = captureGitStatusSnapshot(
          invocation.workingDirectory,
        );
        const gitChangedFiles = diffGitSnapshots(
          beforeGitSnapshot,
          afterGitSnapshot,
        );
        return {
          ...metadata,
          finishedAt: new Date(finishedAtMs).toISOString(),
          durationMs: finishedAtMs - startedAtMs,
          gitChangedFiles:
            gitChangedFiles && gitChangedFiles.length > 0
              ? gitChangedFiles
              : undefined,
        };
      };
      const emitProgress = () => {
        if (typeof options.onProgress !== 'function') {
          return;
        }
        options.onProgress({
          combinedOutput,
          stdout,
          stderr,
          metadata: buildMetadata(),
        });
      };
      const cleanupActiveRun = () => {
        if (requestId) {
          const current = this.activeRuns.get(requestId);
          if (current?.child === child) {
            this.activeRuns.delete(requestId);
          }
        }
        if (forceKillTimer) {
          this.dependencies.clearTimer(forceKillTimer);
          forceKillTimer = undefined;
        }
      };
      const terminateChild = (markInterrupted: boolean) => {
        if (markInterrupted) {
          interrupted = true;
        }
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
        terminateChild(false);
      }, this.settings.getTimeoutMs());

      const finalizeError = (error: CodexCliExecutionError) => {
        if (settled) {
          return;
        }
        settled = true;
        this.dependencies.clearTimer(timeout);
        cleanupActiveRun();
        reject(error);
      };

      if (requestId) {
        this.activeRuns.set(requestId, {
          child,
          interrupt: () => terminateChild(true),
        });
      }

      child.once('error', (error) => {
        const nodeError = error as NodeJS.ErrnoException;
        finalizeError(
          new CodexCliExecutionError(
            interrupted
              ? 'CLI_INTERRUPTED'
              : nodeError.code === 'ENOENT'
              ? 'CLI_NOT_CONFIGURED'
              : 'CLI_EXECUTION_FAILED',
            interrupted
              ? 'Codex CLI 已被中断'
              : error instanceof Error
              ? error.message
              : '启动 Codex CLI 失败',
            combinedOutput,
            stdout,
            stderr,
            buildMetadata(),
          ),
        );
      });

      child.stdout?.on('data', (chunk: Buffer | string) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
        stdout += text;
        combinedOutput += text;
        emitProgress();
      });
      child.stderr?.on('data', (chunk: Buffer | string) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
        stderr += text;
        combinedOutput += text;
        emitProgress();
      });

      if (this.settings.getPromptMode() === 'stdin') {
        child.stdin?.write(text);
        child.stdin?.end();
      } else {
        child.stdin?.end();
      }

      child.once('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        this.dependencies.clearTimer(timeout);
        cleanupActiveRun();
        const metadata = buildMetadata(Date.now());
        if (interrupted) {
          reject(
            new CodexCliExecutionError(
              'CLI_INTERRUPTED',
              'Codex CLI 已被中断',
              combinedOutput,
              stdout,
              stderr,
              metadata,
            ),
          );
          return;
        }
        if (timedOut) {
          reject(
            new CodexCliExecutionError(
              'CLI_TIMEOUT',
              `Codex CLI 执行超时，超过 ${this.settings.getTimeoutMs()}ms`,
              combinedOutput,
              stdout,
              stderr,
              metadata,
            ),
          );
          return;
        }
        if (code !== 0) {
          reject(
            new CodexCliExecutionError(
              'CLI_EXECUTION_FAILED',
              buildCliFailureMessage(code ?? -1, stdout, stderr),
              combinedOutput,
              stdout,
              stderr,
              metadata,
            ),
          );
          return;
        }
        resolve({
          detail: buildCliSuccessMessage(stdout, stderr),
          exitCode: code ?? 0,
          combinedOutput,
          stdout,
          stderr,
          metadata,
        });
      });
    });
  }

  private resolveArgs(
    baseArgs: string[],
    text: string,
    resumeSessionId?: string,
  ): string[] {
    if (resumeSessionId) {
      return this.resolveResumeArgs(baseArgs, text, resumeSessionId);
    }
    if (this.settings.getPromptMode() === 'stdin') {
      return baseArgs;
    }
    const placeholder = this.settings.getPromptPlaceholder();
    let replaced = false;
    const resolvedArgs = baseArgs.map((item) => {
      if (item.includes(placeholder)) {
        replaced = true;
        return item.split(placeholder).join(text);
      }
      return item;
    });
    if (!replaced) {
      resolvedArgs.push(text);
    }
    return resolvedArgs;
  }

  private resolveResumeArgs(
    baseArgs: string[],
    text: string,
    resumeSessionId: string,
  ): string[] {
    if (baseArgs[0] !== 'exec') {
      throw new CodexCliExecutionError(
        'BAD_REQUEST',
        '当前 CLI 命令不是 codex exec，无法继续已有线程',
      );
    }

    const execArgs = baseArgs.slice(1);
    if (this.settings.getPromptMode() === 'stdin') {
      return ['exec', 'resume', ...execArgs, resumeSessionId, '-'];
    }

    const placeholder = this.settings.getPromptPlaceholder();
    const optionArgs: string[] = [];
    let promptArg: string | undefined;
    let replaced = false;

    for (const item of execArgs) {
      if (item.includes(placeholder)) {
        replaced = true;
        const resolved = item.split(placeholder).join(text);
        if (item.startsWith('-')) {
          optionArgs.push(resolved);
        } else {
          promptArg = resolved;
        }
        continue;
      }
      optionArgs.push(item);
    }

    if (!replaced) {
      promptArg = text;
    }

    return promptArg
      ? ['exec', 'resume', ...optionArgs, resumeSessionId, promptArg]
      : ['exec', 'resume', ...optionArgs, resumeSessionId];
  }
}

export function buildCommandLineForDisplay(
  executable: string,
  args: string[],
): string {
  return [
    quoteShellArg(executable),
    ...args.map((item) => quoteShellArg(item)),
  ].join(' ');
}

function buildCliSuccessMessage(stdout: string, stderr: string): string {
  const stdoutPreview = previewText(stdout, 120);
  const stderrPreview = previewText(stderr, 120);
  if (stdoutPreview) {
    return `Codex CLI 已完成：${stdoutPreview}`;
  }
  if (stderrPreview) {
    return `Codex CLI 已完成，stderr：${stderrPreview}`;
  }
  return 'Codex CLI 已完成，未返回额外输出';
}

function buildCliFailureMessage(
  exitCode: number,
  stdout: string,
  stderr: string,
): string {
  const stderrPreview = previewText(stderr, 120);
  const stdoutPreview = previewText(stdout, 120);
  if (stderrPreview) {
    return `Codex CLI 失败，退出码=${exitCode}，stderr：${stderrPreview}`;
  }
  if (stdoutPreview) {
    return `Codex CLI 失败，退出码=${exitCode}，stdout：${stdoutPreview}`;
  }
  return `Codex CLI 失败，退出码=${exitCode}`;
}

interface CodexCliOutputInsights {
  model?: string;
  provider?: string;
  approval?: string;
  sandbox?: string;
  reasoningEffort?: string;
  reasoningSummaries?: string;
  codexSessionId?: string;
  outputWorkdir?: string;
  changedFiles?: string[];
}

function extractCodexInsights(
  stdout: string,
  stderr: string,
): CodexCliOutputInsights {
  const combined = `${stdout}\n${stderr}`;
  const changedFiles = extractChangedFiles(combined);
  return {
    model: extractHeaderValue(combined, 'model'),
    provider: extractHeaderValue(combined, 'provider'),
    approval: extractHeaderValue(combined, 'approval'),
    sandbox: extractHeaderValue(combined, 'sandbox'),
    reasoningEffort: extractHeaderValue(combined, 'reasoning effort'),
    reasoningSummaries: extractHeaderValue(combined, 'reasoning summaries'),
    codexSessionId: extractHeaderValue(combined, 'session id'),
    outputWorkdir: extractHeaderValue(combined, 'workdir'),
    changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
  };
}

function extractHeaderValue(text: string, key: string): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(
    new RegExp(`^\\s*${escapedKey}\\s*:\\s*(.+)\\s*$`, 'im'),
  );
  const value = match?.[1]?.trim();
  return value ? value : undefined;
}

function extractChangedFiles(text: string): string[] {
  const candidates = new Set<string>();
  const patterns = [
    /(?:^|[\s"'`])((?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+)(?=$|[\s"'`:;,)\]])/gm,
    /^\s*(?:M|A|D|R|\+\+\+|---)\s+([^\s]+)\s*$/gm,
    /^\s*[-*]\s+((?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+)\s*$/gm,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = normalizePathCandidate(match[1]);
      if (value) {
        candidates.add(value);
      }
    }
  }

  return Array.from(candidates).sort();
}

type GitStatusSnapshot = Map<string, string>;

function captureGitStatusSnapshot(
  cwd: string | undefined,
): GitStatusSnapshot | undefined {
  try {
    const output = execFileSync('git', ['status', '--porcelain'], {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const snapshot: GitStatusSnapshot = new Map();
    for (const line of output.split('\n')) {
      if (line.length < 4) {
        continue;
      }
      const status = line.slice(0, 2);
      const rawPath = line.slice(3).trim();
      const normalizedPath = normalizePathCandidate(rawPath);
      if (!normalizedPath) {
        continue;
      }
      snapshot.set(normalizedPath, status);
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

function diffGitSnapshots(
  before: GitStatusSnapshot | undefined,
  after: GitStatusSnapshot | undefined,
): string[] | undefined {
  if (!before || !after) {
    return undefined;
  }
  const changed: string[] = [];
  const allPaths = new Set<string>([...before.keys(), ...after.keys()]);
  for (const path of allPaths) {
    if (before.get(path) !== after.get(path)) {
      changed.push(path);
    }
  }
  return changed.sort();
}

function normalizePathCandidate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('://')) {
    return undefined;
  }

  const renamedPath = trimmed.includes(' -> ')
    ? trimmed.split(' -> ').at(-1) ?? trimmed
    : trimmed;
  const unquoted = renamedPath.replace(/^"|"$/g, '');
  const normalized = unquoted
    .replace(/^a\//, '')
    .replace(/^b\//, '')
    .replace(/^\.\//, '')
    .replace(/[,:;]$/, '');

  if (!normalized.includes('/') && !/\.[A-Za-z0-9_-]+$/.test(normalized)) {
    return undefined;
  }
  return normalized;
}

function quoteShellArg(value: string): string {
  if (!value) {
    return '""';
  }
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}
