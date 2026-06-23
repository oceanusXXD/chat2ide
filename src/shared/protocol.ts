export type AppConnectionState =
  | 'logged_out'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'auth_error';

export type TerminalStatus = 'starting' | 'running' | 'stopped' | 'error';
export type TerminalBackend = 'pty' | 'client_bridge';
export const BRIDGE_PROTOCOL_VERSION = 1;

export interface TerminalProfileSummary {
  id: string;
  name: string;
  description: string | null;
  commandDisplay: string;
  cwd: string;
  isDefault: boolean;
}

export interface TerminalSummary {
  id: string;
  backend: TerminalBackend;
  name: string;
  profileId: string;
  profileName: string;
  commandDisplay: string;
  bridgeClientId: string | null;
  status: TerminalStatus;
  createdAt: string;
  updatedAt: string;
  cwd: string;
  pid: number | null;
  cols: number;
  rows: number;
  lastError: string | null;
  lastExitCode: number | null;
  lastExitSignal: number | null;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  expiresAt?: string;
}

export interface CreateTerminalRequest {
  name?: string;
  profileId?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}

export interface UpdateTerminalRequest {
  name?: string;
}

export interface LoginRequestBody {
  pin: string;
}

export interface ApiErrorResponse {
  error: string;
}

export interface TerminalProfileListResponse {
  items: TerminalProfileSummary[];
}

export interface WsReadyMessage {
  type: 'ready';
}

export interface WsTerminalListMessage {
  type: 'terminal_list';
  items: TerminalSummary[];
}

export interface WsTerminalCreatedMessage {
  type: 'terminal_created';
  item: TerminalSummary;
}

export interface WsTerminalUpdatedMessage {
  type: 'terminal_updated';
  item: TerminalSummary;
}

export interface WsTerminalClosedMessage {
  type: 'terminal_closed';
  terminalId: string;
}

export interface WsTerminalResetMessage {
  type: 'terminal_reset';
  terminalId: string;
}

export interface WsTerminalOutputMessage {
  type: 'terminal_output';
  terminalId: string;
  data: string;
  replay?: boolean;
}

export interface WsTerminalExitMessage {
  type: 'terminal_exit';
  terminalId: string;
  code: number | null;
  signal?: number | null;
}

export interface WsTerminalErrorMessage {
  type: 'terminal_error';
  terminalId: string;
  message: string;
}

export interface WsPongMessage {
  type: 'pong';
}

export type ServerWsMessage =
  | WsReadyMessage
  | WsTerminalListMessage
  | WsTerminalCreatedMessage
  | WsTerminalUpdatedMessage
  | WsTerminalClosedMessage
  | WsTerminalResetMessage
  | WsTerminalOutputMessage
  | WsTerminalExitMessage
  | WsTerminalErrorMessage
  | WsPongMessage;

export interface WsAttachMessage {
  type: 'attach';
  terminalId: string;
}

export interface WsInputMessage {
  type: 'input';
  terminalId: string;
  data: string;
}

export interface WsResizeMessage {
  type: 'resize';
  terminalId: string;
  cols: number;
  rows: number;
}

export interface WsPingMessage {
  type: 'ping';
}

export type ClientWsMessage =
  | WsAttachMessage
  | WsInputMessage
  | WsResizeMessage
  | WsPingMessage;

export interface BridgeHelloMessage {
  type: 'hello';
  clientId?: string;
  name: string;
  description?: string;
  protocolVersion?: number;
  capabilities?: BridgeCapability[];
}

export interface BridgeSessionUpsertMessage {
  type: 'session_upsert';
  externalId: string;
  name: string;
  status?: TerminalStatus;
  cwd?: string;
  commandDisplay?: string;
  cols?: number;
  rows?: number;
  description?: string;
  capabilities?: string[];
}

export interface BridgeSessionOutputMessage {
  type: 'session_output';
  externalId: string;
  data: string;
}

export interface BridgeSessionStatusMessage {
  type: 'session_status';
  externalId: string;
  status: TerminalStatus;
  lastError?: string | null;
  lastExitCode?: number | null;
  lastExitSignal?: number | null;
}

export interface BridgeSessionClosedMessage {
  type: 'session_closed';
  externalId: string;
}

export interface BridgePingMessage {
  type: 'ping';
}

export type BridgeCapability = 'input' | 'resize' | 'control' | 'heartbeat' | 'replay';

export type BridgeClientMessage =
  | BridgeHelloMessage
  | BridgeSessionUpsertMessage
  | BridgeSessionOutputMessage
  | BridgeSessionStatusMessage
  | BridgeSessionClosedMessage
  | BridgePingMessage;

export type BridgeControlAction = 'stop' | 'restart' | 'close';

export interface BridgeReadyMessage {
  type: 'ready';
  clientId: string;
}

export interface BridgeInputMessage {
  type: 'input';
  externalId: string;
  data: string;
}

export interface BridgeResizeMessage {
  type: 'resize';
  externalId: string;
  cols: number;
  rows: number;
}

export interface BridgeControlMessage {
  type: 'control';
  externalId: string;
  action: BridgeControlAction;
}

export interface BridgeErrorMessage {
  type: 'error';
  message: string;
  externalId?: string;
}

export interface BridgePongMessage {
  type: 'pong';
}

export type ServerBridgeMessage =
  | BridgeReadyMessage
  | BridgeInputMessage
  | BridgeResizeMessage
  | BridgeControlMessage
  | BridgeErrorMessage
  | BridgePongMessage;

export function parseClientWsMessage(raw: string): ClientWsMessage | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<ClientWsMessage>;
    if (parsed.type === 'ping') {
      return { type: 'ping' };
    }
    if (
      parsed.type === 'attach' &&
      typeof parsed.terminalId === 'string' &&
      parsed.terminalId.trim()
    ) {
      return {
        type: 'attach',
        terminalId: parsed.terminalId,
      };
    }
    if (
      parsed.type === 'input' &&
      typeof parsed.terminalId === 'string' &&
      typeof parsed.data === 'string'
    ) {
      return {
        type: 'input',
        terminalId: parsed.terminalId,
        data: parsed.data,
      };
    }
    if (
      parsed.type === 'resize' &&
      typeof parsed.terminalId === 'string' &&
      Number.isFinite(parsed.cols) &&
      Number.isFinite(parsed.rows)
    ) {
      return {
        type: 'resize',
        terminalId: parsed.terminalId,
        cols: Number(parsed.cols),
        rows: Number(parsed.rows),
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function parseBridgeClientMessage(raw: string): BridgeClientMessage | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<BridgeClientMessage>;
    if (parsed.type === 'ping') {
      return { type: 'ping' };
    }
    if (parsed.type === 'hello' && isNonEmptyString(parsed.name)) {
      const message: BridgeHelloMessage = {
        type: 'hello',
        clientId: normalizeOptionalString(parsed.clientId),
        name: parsed.name.trim(),
        description: normalizeOptionalString(parsed.description),
      };
      const protocolVersion =
        Number.isFinite(parsed.protocolVersion) && parsed.protocolVersion
          ? Number(parsed.protocolVersion)
          : undefined;
      const capabilities = normalizeStringArray(parsed.capabilities);
      if (protocolVersion) {
        message.protocolVersion = protocolVersion;
      }
      if (capabilities?.length) {
        message.capabilities = capabilities as BridgeCapability[];
      }
      return message;
    }
    if (
      parsed.type === 'session_upsert' &&
      isNonEmptyString(parsed.externalId) &&
      isNonEmptyString(parsed.name)
    ) {
      return {
        type: 'session_upsert',
        externalId: parsed.externalId.trim(),
        name: parsed.name.trim(),
        status: isTerminalStatus(parsed.status) ? parsed.status : undefined,
        cwd: normalizeOptionalString(parsed.cwd),
        commandDisplay: normalizeOptionalString(parsed.commandDisplay),
        cols: Number.isFinite(parsed.cols) ? Number(parsed.cols) : undefined,
        rows: Number.isFinite(parsed.rows) ? Number(parsed.rows) : undefined,
        description: normalizeOptionalString(parsed.description),
        capabilities: normalizeStringArray(parsed.capabilities),
      };
    }
    if (
      parsed.type === 'session_output' &&
      isNonEmptyString(parsed.externalId) &&
      typeof parsed.data === 'string'
    ) {
      return {
        type: 'session_output',
        externalId: parsed.externalId.trim(),
        data: parsed.data,
      };
    }
    if (
      parsed.type === 'session_status' &&
      isNonEmptyString(parsed.externalId) &&
      isTerminalStatus(parsed.status)
    ) {
      return {
        type: 'session_status',
        externalId: parsed.externalId.trim(),
        status: parsed.status,
        lastError:
          parsed.lastError === null
            ? null
            : normalizeOptionalString(parsed.lastError),
        lastExitCode: Number.isFinite(parsed.lastExitCode)
          ? Number(parsed.lastExitCode)
          : parsed.lastExitCode === null
          ? null
          : undefined,
        lastExitSignal: Number.isFinite(parsed.lastExitSignal)
          ? Number(parsed.lastExitSignal)
          : parsed.lastExitSignal === null
          ? null
          : undefined,
      };
    }
    if (parsed.type === 'session_closed' && isNonEmptyString(parsed.externalId)) {
      return {
        type: 'session_closed',
        externalId: parsed.externalId.trim(),
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function normalizeOptionalString(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value.trim() : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    return undefined;
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function isTerminalStatus(value: unknown): value is TerminalStatus {
  return (
    value === 'starting' ||
    value === 'running' ||
    value === 'stopped' ||
    value === 'error'
  );
}
