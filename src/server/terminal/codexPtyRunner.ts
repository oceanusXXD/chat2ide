import { IPty, spawn as spawnPty } from 'node-pty';

export interface CodexPtyRunnerOptions {
  command: string;
  args: string[];
  cwd: string;
  cols: number;
  rows: number;
}

export type CodexPtyRunnerEvent =
  | { type: 'spawn'; pid: number }
  | { type: 'data'; data: string }
  | { type: 'exit'; exitCode: number | null; signal: number | null }
  | { type: 'error'; message: string };

export class CodexPtyRunner {
  private readonly listeners = new Set<(event: CodexPtyRunnerEvent) => void>();
  private process?: IPty;
  private pendingRestart = false;
  private killTimer?: NodeJS.Timeout;
  private cols: number;
  private rows: number;

  constructor(private readonly options: CodexPtyRunnerOptions) {
    this.cols = options.cols;
    this.rows = options.rows;
  }

  subscribe(listener: (event: CodexPtyRunnerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.process) {
      return;
    }

    try {
      // Use a PTY so ANSI output, prompts, and interactive input behave like a terminal.
      const ptyProcess = spawnPty(this.options.command, this.options.args, {
        name: 'xterm-256color',
        cols: this.cols,
        rows: this.rows,
        cwd: this.options.cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      });

      this.process = ptyProcess;
      this.emit({ type: 'spawn', pid: ptyProcess.pid });
      ptyProcess.onData((data) => {
        this.emit({ type: 'data', data });
      });
      ptyProcess.onExit(({ exitCode, signal }) => {
        this.clearKillTimer();
        this.process = undefined;
        this.emit({
          type: 'exit',
          exitCode: exitCode ?? null,
          signal: signal ?? null,
        });
        if (this.pendingRestart) {
          this.pendingRestart = false;
          this.start();
        }
      });
    } catch (error) {
      this.emit({
        type: 'error',
        message: error instanceof Error ? error.message : '启动 Codex CLI 失败',
      });
    }
  }

  write(data: string): void {
    if (!this.process) {
      throw new Error('Terminal is not running');
    }
    this.process.write(data);
  }

  resize(cols: number, rows: number): void {
    this.cols = sanitizeCols(cols, 120);
    this.rows = sanitizeRows(rows, 32);
    if (this.process) {
      this.process.resize(this.cols, this.rows);
    }
  }

  stop(): void {
    this.pendingRestart = false;
    this.terminate('SIGTERM');
  }

  restart(): void {
    if (this.process) {
      this.pendingRestart = true;
      this.terminate('SIGTERM');
      return;
    }
    this.start();
  }

  dispose(force = false): void {
    this.pendingRestart = false;
    this.clearKillTimer();
    this.terminate(force ? 'SIGKILL' : 'SIGTERM');
  }

  isRunning(): boolean {
    return Boolean(this.process);
  }

  private emit(event: CodexPtyRunnerEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private terminate(signal: 'SIGTERM' | 'SIGKILL'): void {
    const activeProcess = this.process;
    if (!activeProcess) {
      return;
    }

    try {
      activeProcess.kill(signal);
    } catch (error) {
      this.emit({
        type: 'error',
        message: error instanceof Error ? error.message : '终止 Codex CLI 失败',
      });
      return;
    }

    if (signal === 'SIGKILL') {
      return;
    }

    // Escalate if the CLI ignores SIGTERM.
    this.clearKillTimer();
    this.killTimer = setTimeout(() => {
      if (this.process === activeProcess) {
        this.terminate('SIGKILL');
      }
    }, 1500);
  }

  private clearKillTimer(): void {
    if (this.killTimer) {
      clearTimeout(this.killTimer);
      this.killTimer = undefined;
    }
  }
}

function sanitizeCols(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return clampInt(value, 20, 320);
}

function sanitizeRows(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return clampInt(value, 8, 120);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}
