import { TerminalBackend, TerminalSummary } from '../../shared/protocol';
import {
  TerminalManagerEvent,
  TerminalSessionManager,
} from './terminalSessionManager';

type TerminalReplay = { summary: TerminalSummary; chunks: string[] };

interface TerminalBackendManager {
  close(id: string): void;
  count(): number;
  getReplay(id: string): TerminalReplay;
  hasSession(id: string): boolean;
  listSessions(): TerminalSummary[];
  rename?(id: string, nextName: string): TerminalSummary;
  resize(id: string, cols: number, rows: number): void;
  restart(id: string): void;
  sendInput(id: string, data: string): void;
  startIfPending(id: string): void;
  stop(id: string): void;
  subscribe(listener: (event: TerminalManagerEvent) => void): () => void;
}

interface TerminalBackendEntry {
  backend: TerminalBackend;
  manager: TerminalBackendManager;
  renameOwnedByClient?: boolean;
}

export class TerminalSessionRouter {
  private readonly backends: TerminalBackendEntry[];

  constructor(
    ptySessions: TerminalSessionManager,
    bridgeSessions: TerminalBackendManager,
  ) {
    this.backends = [
      {
        backend: 'pty',
        manager: ptySessions,
      },
      {
        backend: 'client_bridge',
        manager: bridgeSessions,
        renameOwnedByClient: true,
      },
    ];
  }

  subscribe(listener: (event: TerminalManagerEvent) => void): () => void {
    const unsubscribers = this.backends.map((entry) =>
      entry.manager.subscribe(listener),
    );
    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }

  listSessions(): TerminalSummary[] {
    return this.backends
      .flatMap((entry) => entry.manager.listSessions())
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  count(): number {
    return this.backends.reduce((total, entry) => total + entry.manager.count(), 0);
  }

  hasSession(id: string): boolean {
    return this.backends.some((entry) => entry.manager.hasSession(id));
  }

  rename(id: string, nextName: string): TerminalSummary {
    const entry = this.entryFor(id);
    if (entry.renameOwnedByClient) {
      throw new Error('Client bridge sessions are owned by the connected client');
    }
    if (!entry.manager.rename) {
      throw new Error(`Terminal backend ${entry.backend} does not support rename`);
    }
    return entry.manager.rename(id, nextName);
  }

  getReplay(id: string): TerminalReplay {
    return this.managerFor(id).getReplay(id);
  }

  startIfPending(id: string): void {
    this.managerFor(id).startIfPending(id);
  }

  sendInput(id: string, data: string): void {
    this.managerFor(id).sendInput(id, data);
  }

  resize(id: string, cols: number, rows: number): void {
    this.managerFor(id).resize(id, cols, rows);
  }

  stop(id: string): void {
    this.managerFor(id).stop(id);
  }

  restart(id: string): void {
    this.managerFor(id).restart(id);
  }

  close(id: string): void {
    this.managerFor(id).close(id);
  }

  private entryFor(id: string): TerminalBackendEntry {
    const entry = this.backends.find((candidate) =>
      candidate.manager.hasSession(id),
    );
    if (!entry) {
      throw new Error(`Terminal ${id} 不存在`);
    }
    return entry;
  }

  private managerFor(id: string): TerminalBackendManager {
    return this.entryFor(id).manager;
  }
}
