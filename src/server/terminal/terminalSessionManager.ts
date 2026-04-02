import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { CreateTerminalRequest, TerminalSummary } from '../../shared/protocol';
import { CodexPtyRunner } from './codexPtyRunner';
import { RingBuffer } from './ringBuffer';

interface TerminalSessionRecord {
  summary: TerminalSummary;
  runner: CodexPtyRunner;
  buffer: RingBuffer;
  closed: boolean;
  restartRequested: boolean;
  pendingInitialAttach: boolean;
}

export type TerminalManagerEvent =
  | { type: 'terminal_created'; item: TerminalSummary }
  | { type: 'terminal_updated'; item: TerminalSummary }
  | { type: 'terminal_closed'; terminalId: string }
  | { type: 'terminal_reset'; terminalId: string }
  | { type: 'terminal_output'; terminalId: string; data: string; replay?: boolean }
  | { type: 'terminal_exit'; terminalId: string; code: number | null; signal?: number | null }
  | { type: 'terminal_error'; terminalId: string; message: string };

export interface TerminalManagerOptions {
  defaultCwd: string;
  defaultCols: number;
  defaultRows: number;
  bufferBytes: number;
  codexCommand: string;
  codexArgs: string[];
}

export class TerminalSessionManager {
  private readonly sessions = new Map<string, TerminalSessionRecord>();
  private readonly listeners = new Set<(event: TerminalManagerEvent) => void>();
  private nextOrdinal = 1;

  constructor(private readonly options: TerminalManagerOptions) {}

  subscribe(listener: (event: TerminalManagerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  listSessions(): TerminalSummary[] {
    return [...this.sessions.values()]
      .map((session) => ({ ...session.summary }))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  count(): number {
    return this.sessions.size;
  }

  createSession(request: CreateTerminalRequest = {}): TerminalSummary {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const cols = normalizeCols(request.cols, this.options.defaultCols);
    const rows = normalizeRows(request.rows, this.options.defaultRows);
    const cwd = normalizeCwd(request.cwd, this.options.defaultCwd);
    const session: TerminalSessionRecord = {
      summary: {
        id,
        name: request.name?.trim() || `Codex ${this.nextOrdinal++}`,
        status: 'starting',
        createdAt: nowIso,
        updatedAt: nowIso,
        cwd,
        pid: null,
        cols,
        rows,
        lastError: null,
        lastExitCode: null,
        lastExitSignal: null,
      },
      runner: new CodexPtyRunner({
        command: this.options.codexCommand,
        args: this.options.codexArgs,
        cwd,
        cols,
        rows,
      }),
      buffer: new RingBuffer(this.options.bufferBytes),
      closed: false,
      restartRequested: false,
      pendingInitialAttach: true,
    };

    session.runner.subscribe((event) => {
      if (session.closed) {
        return;
      }
      // PTY 输出在整条链路里都保持原样。
      // manager 只维护生命周期状态和 ring buffer，不把终端内容重组为消息模型。
      switch (event.type) {
        case 'spawn':
          session.restartRequested = false;
          session.summary = {
            ...session.summary,
            status: 'running',
            pid: event.pid,
            lastError: null,
            lastExitCode: null,
            lastExitSignal: null,
            updatedAt: new Date().toISOString(),
          };
          this.emit({ type: 'terminal_updated', item: { ...session.summary } });
          break;
        case 'data':
          session.summary = {
            ...session.summary,
            updatedAt: new Date().toISOString(),
          };
          session.buffer.append(event.data);
          this.emit({
            type: 'terminal_output',
            terminalId: session.summary.id,
            data: event.data,
          });
          break;
        case 'exit':
          session.summary = {
            ...session.summary,
            status: session.restartRequested ? 'starting' : 'stopped',
            pid: null,
            lastExitCode: event.exitCode,
            lastExitSignal: event.signal ?? null,
            updatedAt: new Date().toISOString(),
          };
          if (!session.restartRequested) {
            this.emit({
              type: 'terminal_exit',
              terminalId: session.summary.id,
              code: event.exitCode,
              signal: event.signal,
            });
          }
          this.emit({ type: 'terminal_updated', item: { ...session.summary } });
          break;
        case 'error':
          session.restartRequested = false;
          session.summary = {
            ...session.summary,
            status: 'error',
            pid: null,
            lastError: event.message,
            lastExitCode: null,
            lastExitSignal: null,
            updatedAt: new Date().toISOString(),
          };
          this.emit({
            type: 'terminal_error',
            terminalId: session.summary.id,
            message: event.message,
          });
          this.emit({ type: 'terminal_updated', item: { ...session.summary } });
          break;
      }
    });

    this.sessions.set(session.summary.id, session);
    this.emit({ type: 'terminal_created', item: { ...session.summary } });
    return { ...session.summary };
  }

  rename(id: string, nextName: string): TerminalSummary {
    const session = this.requireSession(id);
    session.summary = {
      ...session.summary,
      name: nextName.trim() || session.summary.name,
      updatedAt: new Date().toISOString(),
    };
    this.emit({ type: 'terminal_updated', item: { ...session.summary } });
    return { ...session.summary };
  }

  getReplay(id: string): { summary: TerminalSummary; chunks: string[] } {
    const session = this.requireSession(id);
    return {
      summary: { ...session.summary },
      // 重连时先回放最近输出，再继续接实时流，保证前端终端视图能平滑恢复。
      chunks: session.buffer.snapshot(),
    };
  }

  startIfPending(id: string): void {
    const session = this.requireSession(id);
    if (!session.pendingInitialAttach) {
      return;
    }
    // 首次 attach 到浏览器 xterm 后再启动 CLI。
    // 这样启动阶段的终端查询就有机会被真实终端模拟器回答，而不是超时退出。
    session.pendingInitialAttach = false;
    session.runner.start();
  }

  sendInput(id: string, data: string): void {
    const session = this.requireSession(id);
    session.runner.write(data);
    // 原始按键输入已经通过 PTY 流和后续输出体现给前端。
    // 这里如果每个按键都广播 terminal_updated，会把前端拖进高频无效重渲染。
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.requireSession(id);
    const nextCols = normalizeCols(cols, session.summary.cols);
    const nextRows = normalizeRows(rows, session.summary.rows);

    if (nextCols === session.summary.cols && nextRows === session.summary.rows) {
      return;
    }

    session.runner.resize(cols, rows);
    session.summary = {
      ...session.summary,
      cols: nextCols,
      rows: nextRows,
      updatedAt: new Date().toISOString(),
    };
    this.emit({ type: 'terminal_updated', item: { ...session.summary } });
  }

  stop(id: string): void {
    const session = this.requireSession(id);
    session.runner.stop();
  }

  restart(id: string): void {
    const session = this.requireSession(id);
    session.restartRequested = true;
    session.buffer.clear();
    // restart 的语义是“清空当前可见终端并启动新一代 PTY”。
    // 前端收到 terminal_reset 后会先清屏，再接回放和新流。
    session.summary = {
      ...session.summary,
      status: 'starting',
      pid: null,
      lastError: null,
      lastExitCode: null,
      lastExitSignal: null,
      updatedAt: new Date().toISOString(),
    };
    this.emit({ type: 'terminal_reset', terminalId: id });
    this.emit({ type: 'terminal_updated', item: { ...session.summary } });
    session.runner.restart();
  }

  close(id: string): void {
    const session = this.requireSession(id);
    session.closed = true;
    // UI 已经认为标签被移除，底层 PTY 也必须同步强制清理，避免残留 shell。
    session.runner.dispose(true);
    this.sessions.delete(id);
    this.emit({ type: 'terminal_closed', terminalId: id });
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      session.closed = true;
      session.runner.dispose();
    }
    this.sessions.clear();
  }

  private requireSession(id: string): TerminalSessionRecord {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Terminal ${id} 不存在`);
    }
    return session;
  }

  private emit(event: TerminalManagerEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function normalizeCols(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return clampInt(value as number, 20, 320);
}

function normalizeRows(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return clampInt(value as number, 8, 120);
}

function normalizeCwd(value: string | undefined, fallback: string): string {
  const next = value?.trim() || fallback;
  const resolved = path.resolve(next);
  const stats = fs.statSync(resolved, { throwIfNoEntry: false });
  if (!stats || !stats.isDirectory()) {
    throw new Error(`终端工作目录不存在: ${resolved}`);
  }
  return resolved;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}
