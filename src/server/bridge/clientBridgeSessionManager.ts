import crypto from 'crypto';

import {
  BridgeControlAction,
  ServerBridgeMessage,
  TerminalSummary,
} from '../../shared/protocol';
import { RingBuffer } from '../terminal/ringBuffer';
import { TerminalManagerEvent } from '../terminal/terminalSessionManager';

interface BridgeClientConnection {
  clientId: string;
  connectionId: string;
  description?: string;
  name: string;
  send(message: ServerBridgeMessage): boolean;
}

interface BridgeSessionRecord {
  buffer: RingBuffer;
  clientId: string;
  externalId: string;
  summary: TerminalSummary;
}

export interface ClientBridgeSessionManagerOptions {
  bufferBytes: number;
  defaultCols: number;
  defaultRows: number;
  maxSessions: number;
  maxInputBytes: number;
  stoppedSessionTtlMs: number;
}

export interface RegisterBridgeClientRequest {
  clientId?: string;
  description?: string;
  name: string;
  send(message: ServerBridgeMessage): boolean;
}

export interface RegisteredBridgeClient {
  clientId: string;
  connectionId: string;
}

export interface UpsertBridgeSessionRequest {
  clientId: string;
  commandDisplay?: string;
  cwd?: string;
  description?: string;
  externalId: string;
  name: string;
  status?: TerminalSummary['status'];
  cols?: number;
  rows?: number;
}

export class ClientBridgeSessionManager {
  private readonly clients = new Map<string, BridgeClientConnection>();
  private readonly listeners = new Set<(event: TerminalManagerEvent) => void>();
  private readonly sessions = new Map<string, BridgeSessionRecord>();

  constructor(private readonly options: ClientBridgeSessionManagerOptions) {}

  subscribe(listener: (event: TerminalManagerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  registerClient(request: RegisterBridgeClientRequest): RegisteredBridgeClient {
    const clientId = normalizeClientId(request.clientId, request.name);
    if (this.clients.has(clientId)) {
      throw new Error(`Client bridge ${clientId} is already connected`);
    }
    const connection: BridgeClientConnection = {
      clientId,
      connectionId: crypto.randomUUID(),
      description: request.description,
      name: request.name.trim(),
      send: request.send,
    };

    this.clients.set(clientId, connection);
    this.refreshClientSessions(clientId, connection);

    return {
      clientId,
      connectionId: connection.connectionId,
    };
  }

  unregisterClient(clientId: string, connectionId: string): void {
    const connection = this.clients.get(clientId);
    if (!connection || connection.connectionId !== connectionId) {
      return;
    }

    this.clients.delete(clientId);
    for (const session of this.sessions.values()) {
      if (session.clientId !== clientId || session.summary.status === 'stopped') {
        continue;
      }
      session.summary = {
        ...session.summary,
        status: 'stopped',
        pid: null,
        lastError: 'Client bridge disconnected',
        updatedAt: new Date().toISOString(),
      };
      this.emit({ type: 'terminal_updated', item: { ...session.summary } });
    }
  }

  upsertSession(request: UpsertBridgeSessionRequest): TerminalSummary {
    const connection = this.requireClient(request.clientId);
    const sessionId = buildSessionId(request.clientId, request.externalId);
    const nowIso = new Date().toISOString();
    const existing = this.sessions.get(sessionId);
    if (!existing && this.sessions.size >= this.options.maxSessions) {
      throw new Error(`已达到客户端桥接会话数量上限 (${this.options.maxSessions})`);
    }
    const cols = normalizeCols(request.cols, existing?.summary.cols ?? this.options.defaultCols);
    const rows = normalizeRows(request.rows, existing?.summary.rows ?? this.options.defaultRows);
    const summary: TerminalSummary = {
      id: sessionId,
      backend: 'client_bridge',
      name: request.name.trim(),
      profileId: `bridge:${connection.clientId}`,
      profileName: connection.name,
      commandDisplay:
        request.commandDisplay?.trim() ||
        `client-bridge://${connection.name}`,
      bridgeClientId: connection.clientId,
      status: request.status ?? existing?.summary.status ?? 'running',
      createdAt: existing?.summary.createdAt ?? nowIso,
      updatedAt: nowIso,
      cwd: request.cwd?.trim() || `client://${connection.clientId}`,
      pid: null,
      cols,
      rows,
      lastError: null,
      lastExitCode: null,
      lastExitSignal: null,
    };

    if (!existing) {
      this.sessions.set(sessionId, {
        buffer: new RingBuffer(this.options.bufferBytes),
        clientId: connection.clientId,
        externalId: request.externalId,
        summary,
      });
      this.emit({ type: 'terminal_created', item: { ...summary } });
      return { ...summary };
    }

    existing.summary = summary;
    existing.clientId = connection.clientId;
    existing.externalId = request.externalId;
    this.emit({ type: 'terminal_updated', item: { ...summary } });
    return { ...summary };
  }

  appendOutput(clientId: string, externalId: string, data: string): void {
    if (!data) {
      return;
    }
    const session = this.requireSessionByExternalId(clientId, externalId);
    session.buffer.append(data);
    session.summary = {
      ...session.summary,
      updatedAt: new Date().toISOString(),
    };
    this.emit({
      type: 'terminal_output',
      terminalId: session.summary.id,
      data,
    });
  }

  updateStatus(
    clientId: string,
    externalId: string,
    status: TerminalSummary['status'],
    details: {
      lastError?: string | null;
      lastExitCode?: number | null;
      lastExitSignal?: number | null;
    } = {},
  ): void {
    const session = this.requireSessionByExternalId(clientId, externalId);
    session.summary = {
      ...session.summary,
      status,
      pid: null,
      lastError:
        'lastError' in details ? details.lastError ?? null : session.summary.lastError,
      lastExitCode:
        'lastExitCode' in details
          ? details.lastExitCode ?? null
          : session.summary.lastExitCode,
      lastExitSignal:
        'lastExitSignal' in details
          ? details.lastExitSignal ?? null
          : session.summary.lastExitSignal,
      updatedAt: new Date().toISOString(),
    };
    this.emit({ type: 'terminal_updated', item: { ...session.summary } });
  }

  closeExternalSession(clientId: string, externalId: string): void {
    const session = this.requireSessionByExternalId(clientId, externalId);
    this.sessions.delete(session.summary.id);
    this.emit({ type: 'terminal_closed', terminalId: session.summary.id });
  }

  listSessions(): TerminalSummary[] {
    return [...this.sessions.values()]
      .map((session) => ({ ...session.summary }))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  count(): number {
    return this.sessions.size;
  }

  pruneStopped(now = new Date()): number {
    const cutoff = now.getTime() - this.options.stoppedSessionTtlMs;
    let removed = 0;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.summary.status !== 'stopped') {
        continue;
      }
      if (new Date(session.summary.updatedAt).getTime() > cutoff) {
        continue;
      }
      this.sessions.delete(sessionId);
      removed += 1;
      this.emit({ type: 'terminal_closed', terminalId: sessionId });
    }
    return removed;
  }

  hasSession(id: string): boolean {
    return this.sessions.has(id);
  }

  getReplay(id: string): { summary: TerminalSummary; chunks: string[] } {
    const session = this.requireSession(id);
    return {
      summary: { ...session.summary },
      chunks: session.buffer.snapshot(),
    };
  }

  startIfPending(_id: string): void {
    return;
  }

  sendInput(id: string, data: string): void {
    if (Buffer.byteLength(data, 'utf8') > this.options.maxInputBytes) {
      throw new Error(`输入过大，单次最多 ${this.options.maxInputBytes} 字节`);
    }
    const session = this.requireSession(id);
    this.sendToClient(session, {
      type: 'input',
      externalId: session.externalId,
      data,
    });
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.requireSession(id);
    const nextCols = normalizeCols(cols, session.summary.cols);
    const nextRows = normalizeRows(rows, session.summary.rows);
    session.summary = {
      ...session.summary,
      cols: nextCols,
      rows: nextRows,
      updatedAt: new Date().toISOString(),
    };
    this.emit({ type: 'terminal_updated', item: { ...session.summary } });
    this.sendToClient(session, {
      type: 'resize',
      externalId: session.externalId,
      cols: nextCols,
      rows: nextRows,
    });
  }

  stop(id: string): void {
    this.sendControl(id, 'stop');
  }

  restart(id: string): void {
    const session = this.requireSession(id);
    session.buffer.clear();
    session.summary = {
      ...session.summary,
      status: 'starting',
      lastError: null,
      lastExitCode: null,
      lastExitSignal: null,
      updatedAt: new Date().toISOString(),
    };
    this.emit({ type: 'terminal_reset', terminalId: id });
    this.emit({ type: 'terminal_updated', item: { ...session.summary } });
    this.sendControl(id, 'restart');
  }

  close(id: string): void {
    const session = this.requireSession(id);
    try {
      this.sendControl(id, 'close');
    } catch {
      // Best effort: stale bridge sessions can still be removed from the UI.
    }
    this.sessions.delete(id);
    this.emit({ type: 'terminal_closed', terminalId: id });
  }

  dispose(): void {
    this.clients.clear();
    for (const sessionId of this.sessions.keys()) {
      this.emit({ type: 'terminal_closed', terminalId: sessionId });
    }
    this.sessions.clear();
  }

  private sendControl(id: string, action: BridgeControlAction): void {
    const session = this.requireSession(id);
    this.sendToClient(session, {
      type: 'control',
      externalId: session.externalId,
      action,
    });
  }

  private sendToClient(
    session: BridgeSessionRecord,
    message: ServerBridgeMessage,
  ): void {
    const connection = this.clients.get(session.clientId);
    if (!connection) {
      throw new Error('Client bridge is not connected');
    }
    const sent = connection.send(message);
    if (!sent) {
      throw new Error('Client bridge is not writable');
    }
  }

  private requireClient(clientId: string): BridgeClientConnection {
    const connection = this.clients.get(clientId);
    if (!connection) {
      throw new Error(`Client bridge ${clientId} is not connected`);
    }
    return connection;
  }

  private requireSession(id: string): BridgeSessionRecord {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Terminal ${id} 不存在`);
    }
    return session;
  }

  private requireSessionByExternalId(
    clientId: string,
    externalId: string,
  ): BridgeSessionRecord {
    const session = this.sessions.get(buildSessionId(clientId, externalId));
    if (!session) {
      throw new Error(`Client bridge session ${externalId} 不存在`);
    }
    return session;
  }

  private refreshClientSessions(
    clientId: string,
    connection: BridgeClientConnection,
  ): void {
    for (const session of this.sessions.values()) {
      if (session.clientId !== clientId) {
        continue;
      }
      session.summary = {
        ...session.summary,
        profileName: connection.name,
        bridgeClientId: connection.clientId,
        lastError: null,
        updatedAt: new Date().toISOString(),
      };
      this.emit({ type: 'terminal_updated', item: { ...session.summary } });
    }
  }

  private emit(event: TerminalManagerEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function normalizeClientId(value: string | undefined, fallbackName: string): string {
  const candidate = (value || fallbackName).trim().toLowerCase();
  const normalized = candidate.replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.slice(0, 48) || `client-${crypto.randomUUID()}`;
}

function buildSessionId(clientId: string, externalId: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(clientId)
    .update('\0')
    .update(externalId)
    .digest('hex')
    .slice(0, 32);
  return `bridge-${digest}`;
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

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}
