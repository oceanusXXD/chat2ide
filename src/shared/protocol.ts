export type AppConnectionState =
  | 'logged_out'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'auth_error';

export type TerminalStatus = 'starting' | 'running' | 'stopped' | 'error';

export interface TerminalSummary {
  id: string;
  name: string;
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
