import { EventEmitter } from 'events';

import {
  BridgeErrorCode,
  BridgeState,
  CliRunTelemetry,
  ErrorTelemetry,
  PromptTelemetry,
  StateSnapshotLike,
} from '../types/protocol';

export type PromptRecord = PromptTelemetry;
export type ErrorRecord = ErrorTelemetry;

export interface AppSnapshot extends StateSnapshotLike {
  lastPrompt?: PromptRecord;
  lastError?: ErrorRecord;
  lastCliRun?: CliRunTelemetry;
  recentCliRuns?: CliRunTelemetry[];
}

export interface StatusPatch {
  authenticated?: boolean;
  sessionExpiresAt?: string | null;
  authExpiresAt?: string | null;
}

type AppStateListener = (snapshot: AppSnapshot) => void;

/**
 * 维护扩展运行状态、最近一次 prompt 与错误信息。
 */
export class AppState {
  private static readonly MAX_CLI_RUN_HISTORY = 12;
  private readonly emitter = new EventEmitter();

  private snapshot: AppSnapshot = {
    status: 'stopped',
    updatedAt: new Date(0).toISOString(),
    detail: '服务尚未启动',
    authenticated: false,
  };

  getSnapshot(): AppSnapshot {
    return {
      ...this.snapshot,
      lastPrompt: this.snapshot.lastPrompt ? { ...this.snapshot.lastPrompt } : undefined,
      lastError: this.snapshot.lastError ? { ...this.snapshot.lastError } : undefined,
      lastCliRun: this.snapshot.lastCliRun ? cloneCliRunTelemetry(this.snapshot.lastCliRun) : undefined,
      recentCliRuns: this.snapshot.recentCliRuns?.map((item) => cloneCliRunTelemetry(item)),
    };
  }

  setStatus(status: BridgeState, detail: string, patch: StatusPatch = {}): AppSnapshot {
    this.snapshot = {
      ...this.snapshot,
      status,
      detail,
      updatedAt: new Date().toISOString(),
      authenticated: patch.authenticated ?? this.snapshot.authenticated,
      sessionExpiresAt:
        patch.sessionExpiresAt === null
          ? undefined
          : patch.sessionExpiresAt ?? this.snapshot.sessionExpiresAt,
      authExpiresAt:
        patch.authExpiresAt === null ? undefined : patch.authExpiresAt ?? this.snapshot.authExpiresAt,
    };
    this.emit();
    return this.getSnapshot();
  }

  recordPrompt(prompt: Omit<PromptRecord, 'receivedAt'> & { receivedAt?: string }): AppSnapshot {
    this.snapshot = {
      ...this.snapshot,
      lastPrompt: {
        requestId: prompt.requestId,
        text: prompt.text,
        deviceName: prompt.deviceName,
        receivedAt: prompt.receivedAt ?? new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
    this.emit();
    return this.getSnapshot();
  }

  setError(
    code: BridgeErrorCode,
    message: string,
    recoverable: boolean,
    requestId?: string,
  ): AppSnapshot {
    this.snapshot = {
      ...this.snapshot,
      status: 'error',
      detail: message,
      updatedAt: new Date().toISOString(),
      lastError: {
        code,
        message,
        recoverable,
        requestId,
      },
    };
    this.emit();
    return this.getSnapshot();
  }

  recordError(
    code: BridgeErrorCode,
    message: string,
    recoverable: boolean,
    requestId?: string,
  ): AppSnapshot {
    this.snapshot = {
      ...this.snapshot,
      detail: message,
      updatedAt: new Date().toISOString(),
      lastError: {
        code,
        message,
        recoverable,
        requestId,
      },
    };
    this.emit();
    return this.getSnapshot();
  }

  recordCliRun(run: CliRunTelemetry): AppSnapshot {
    const nextRun = cloneCliRunTelemetry(run);
    const currentRuns = this.snapshot.recentCliRuns ?? [];
    const filteredRuns = currentRuns.filter((item) => item.requestId !== run.requestId);
    const recentCliRuns = [nextRun, ...filteredRuns]
      .slice(0, AppState.MAX_CLI_RUN_HISTORY)
      .map((item) => cloneCliRunTelemetry(item));
    this.snapshot = {
      ...this.snapshot,
      lastCliRun: cloneCliRunTelemetry(run),
      recentCliRuns,
      updatedAt: new Date().toISOString(),
    };
    this.emit();
    return this.getSnapshot();
  }

  onDidChange(listener: AppStateListener): () => void {
    this.emitter.on('change', listener);
    return () => {
      this.emitter.off('change', listener);
    };
  }

  private emit(): void {
    this.emitter.emit('change', this.getSnapshot());
  }
}

function cloneCliRunTelemetry(value: CliRunTelemetry): CliRunTelemetry {
  return {
    ...value,
    configuredArgs: [...value.configuredArgs],
    resolvedArgs: value.resolvedArgs ? [...value.resolvedArgs] : undefined,
    changedFiles: value.changedFiles ? [...value.changedFiles] : undefined,
    gitChangedFiles: value.gitChangedFiles ? [...value.gitChangedFiles] : undefined,
  };
}
