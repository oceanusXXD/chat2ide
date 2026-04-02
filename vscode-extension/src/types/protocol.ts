export type BridgeState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'awaiting_login'
  | 'authenticated'
  | 'forwarding'
  | 'helper_busy'
  | 'relay_connecting'
  | 'relay_connected'
  | 'relay_disconnected'
  | 'error';

export type HelperState =
  | 'idle'
  | 'focusing_window'
  | 'preparing_input'
  | 'sending'
  | 'success'
  | 'failure';

export type BridgeErrorCode =
  | 'BAD_REQUEST'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_EXPIRED'
  | 'PIN_EXPIRED'
  | 'INVALID_PIN'
  | 'LOCKED_OUT'
  | 'UNAUTHORIZED'
  | 'PORT_IN_USE'
  | 'HELPER_NOT_CONFIGURED'
  | 'HELPER_UNAVAILABLE'
  | 'HELPER_REQUEST_FAILED'
  | 'CODEX_COMMAND_FAILED'
  | 'AUTOMATION_FAILED'
  | 'CLI_NOT_CONFIGURED'
  | 'CLI_EXECUTION_FAILED'
  | 'CLI_INTERRUPTED'
  | 'CLI_TIMEOUT'
  | 'COMMAND_NOT_ALLOWED'
  | 'COMMAND_EXECUTION_FAILED'
  | 'COMMAND_TIMEOUT'
  | 'RELAY_AGENT_UNAVAILABLE'
  | 'RELAY_AGENT_UNAUTHORIZED'
  | 'RELAY_CONNECTION_FAILED'
  | 'RELAY_REQUEST_TIMEOUT'
  | 'MOBILE_CONNECTION_FAILED'
  | 'UNKNOWN';

export type CliRunState = 'running' | 'succeeded' | 'failed' | 'interrupted';

export interface CliRunTelemetry {
  requestId: string;
  status: CliRunState;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  promptText?: string;
  promptPreview?: string;
  commandLine: string;
  executable: string;
  configuredArgs: string[];
  resolvedArgs?: string[];
  workingDirectory?: string;
  promptMode: 'stdin' | 'arg';
  timeoutMs: number;
  exitCode?: number;
  failureCode?: BridgeErrorCode;
  failureMessage?: string;
  model?: string;
  provider?: string;
  approval?: string;
  sandbox?: string;
  reasoningEffort?: string;
  reasoningSummaries?: string;
  codexSessionId?: string;
  resumeSessionId?: string;
  outputWorkdir?: string;
  changedFiles?: string[];
  gitChangedFiles?: string[];
  combinedOutput?: string;
  stdout?: string;
  stderr?: string;
}

export interface PromptTelemetry {
  requestId: string;
  text: string;
  deviceName?: string;
  receivedAt: string;
}

export interface ErrorTelemetry {
  code: BridgeErrorCode;
  message: string;
  recoverable: boolean;
  requestId?: string;
}

export interface LoginRequest {
  type: 'login';
  requestId: string;
  sessionId: string;
  pin: string;
  deviceName?: string;
}

export interface SubmitPromptRequest {
  type: 'submit_prompt';
  requestId: string;
  sessionId: string;
  authToken: string;
  text: string;
  deviceName?: string;
  resumeSessionId?: string;
}

export interface InterruptRunRequest {
  type: 'interrupt_run';
  requestId: string;
  sessionId: string;
  authToken: string;
  targetRequestId: string;
}

export interface RunServerCommandRequest {
  type: 'run_server_command';
  requestId: string;
  sessionId: string;
  authToken: string;
  command: string;
}

export interface PingRequest {
  type: 'ping';
  requestId: string;
  sessionId: string;
  authToken?: string;
}

export type MobileToPluginMessage =
  | LoginRequest
  | SubmitPromptRequest
  | InterruptRunRequest
  | RunServerCommandRequest
  | PingRequest;

export interface LoginOkMessage {
  type: 'login_ok';
  requestId: string;
  sessionId: string;
  authToken: string;
  expiresAt: string;
  state: BridgeState;
  lastPromptPreview?: string;
}

export interface LoginFailedMessage {
  type: 'login_failed';
  requestId: string;
  code: BridgeErrorCode;
  message: string;
  attemptsRemaining?: number;
  lockedUntil?: string;
}

export interface SubmitOkMessage {
  type: 'submit_ok';
  requestId: string;
  acceptedAt: string;
  state: BridgeState;
  lastPromptPreview?: string;
  cliRun?: CliRunTelemetry;
}

export interface SubmitFailedMessage {
  type: 'submit_failed';
  requestId: string;
  code: BridgeErrorCode;
  message: string;
  recoverable: boolean;
  cliRun?: CliRunTelemetry;
}

export interface InterruptOkMessage {
  type: 'interrupt_ok';
  requestId: string;
  targetRequestId: string;
  detail: string;
}

export interface InterruptFailedMessage {
  type: 'interrupt_failed';
  requestId: string;
  targetRequestId: string;
  code: BridgeErrorCode;
  message: string;
  recoverable: boolean;
}

export interface ServerCommandTelemetry {
  requestId: string;
  command: string;
  executable: string;
  args: string[];
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  status: 'succeeded' | 'failed';
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

export interface CommandOkMessage {
  type: 'command_ok';
  requestId: string;
  commandRun: ServerCommandTelemetry;
}

export interface CommandFailedMessage {
  type: 'command_failed';
  requestId: string;
  code: BridgeErrorCode;
  message: string;
  recoverable: boolean;
  commandRun?: ServerCommandTelemetry;
}

export interface StateUpdateMessage {
  type: 'state_update';
  state: BridgeState;
  updatedAt: string;
  detail?: string;
  authenticated: boolean;
  sessionExpiresAt?: string;
  authExpiresAt?: string;
  lastPromptPreview?: string;
  lastPrompt?: PromptTelemetry;
  lastError?: ErrorTelemetry;
  lastCliRun?: CliRunTelemetry;
  recentCliRuns?: CliRunTelemetry[];
}

export interface ErrorMessage {
  type: 'error';
  code: BridgeErrorCode;
  message: string;
  recoverable: boolean;
  requestId?: string;
}

export type PluginToMobileMessage =
  | LoginOkMessage
  | LoginFailedMessage
  | SubmitOkMessage
  | SubmitFailedMessage
  | InterruptOkMessage
  | InterruptFailedMessage
  | CommandOkMessage
  | CommandFailedMessage
  | StateUpdateMessage
  | ErrorMessage;

export interface RelayAgentHelloMessage {
  type: 'agent_hello';
  detail: string;
  connectedAt: string;
}

export interface RelayForwardPromptMessage {
  type: 'forward_prompt';
  requestId: string;
  sessionId: string;
  text: string;
  receivedAt: string;
  deviceName?: string;
}

export interface RelayAgentPingMessage {
  type: 'agent_ping';
  requestId: string;
}

export type RelayServerToAgentMessage =
  | RelayAgentHelloMessage
  | RelayForwardPromptMessage
  | RelayAgentPingMessage;

export interface RelayForwardResultMessage {
  type: 'forward_result';
  requestId: string;
  ok: boolean;
  detail: string;
  code?: BridgeErrorCode;
}

export interface RelayAgentPongMessage {
  type: 'agent_pong';
  requestId: string;
  detail: string;
}

export type RelayAgentToServerMessage =
  | RelayForwardResultMessage
  | RelayAgentPongMessage;

export interface StateSnapshotLike {
  status: BridgeState;
  updatedAt: string;
  detail?: string;
  authenticated: boolean;
  sessionExpiresAt?: string;
  authExpiresAt?: string;
  lastPromptText?: string;
  lastPrompt?: PromptTelemetry;
  lastError?: ErrorTelemetry;
  lastCliRun?: CliRunTelemetry;
  recentCliRuns?: CliRunTelemetry[];
}

export interface HelperSendPromptRequest {
  action: 'send_prompt';
  requestId: string;
  text: string;
}

export interface HelperHealthCheckRequest {
  action: 'health_check';
  requestId: string;
}

export interface HelperPingRequest {
  action: 'ping';
  requestId: string;
}

export interface HelperCalibrateRequest {
  action: 'calibrate';
  requestId: string;
}

export type PluginToHelperMessage =
  | HelperSendPromptRequest
  | HelperHealthCheckRequest
  | HelperPingRequest
  | HelperCalibrateRequest;

export interface HelperOkResponse {
  status: 'ok';
  requestId: string;
  detail: string;
  state?: HelperState;
}

export interface HelperCalibrationResult {
  status: 'calibration_result';
  requestId: string;
  detail: string;
  x: number;
  y: number;
  state?: HelperState;
}

export interface HelperHealthStatusResponse {
  status: 'health_status';
  requestId: string;
  healthy: boolean;
  platform: string;
  version: string;
  detail: string;
  state?: HelperState;
}

export interface HelperErrorResponse {
  status: 'error';
  requestId?: string;
  code: BridgeErrorCode;
  detail: string;
  state?: HelperState;
}

export type HelperToPluginMessage =
  | HelperOkResponse
  | HelperCalibrationResult
  | HelperHealthStatusResponse
  | HelperErrorResponse;

export function previewText(text: string, limit = 80): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, limit - 1)}…`;
}

export function buildStateUpdate(
  snapshot: StateSnapshotLike,
): StateUpdateMessage {
  return {
    type: 'state_update',
    state: snapshot.status,
    updatedAt: snapshot.updatedAt,
    detail: snapshot.detail,
    authenticated: snapshot.authenticated,
    sessionExpiresAt: snapshot.sessionExpiresAt,
    authExpiresAt: snapshot.authExpiresAt,
    lastPromptPreview: snapshot.lastPrompt?.text
      ? previewText(snapshot.lastPrompt.text)
      : snapshot.lastPromptText
      ? previewText(snapshot.lastPromptText)
      : undefined,
    lastPrompt: snapshot.lastPrompt
      ? clonePromptTelemetry(snapshot.lastPrompt)
      : undefined,
    lastError: snapshot.lastError
      ? cloneErrorTelemetry(snapshot.lastError)
      : undefined,
    lastCliRun: snapshot.lastCliRun
      ? cloneCliRunTelemetry(snapshot.lastCliRun)
      : undefined,
    recentCliRuns: snapshot.recentCliRuns?.map((item) =>
      cloneCliRunTelemetry(item),
    ),
  };
}

function cloneCliRunTelemetry(value: CliRunTelemetry): CliRunTelemetry {
  return {
    ...value,
    configuredArgs: [...value.configuredArgs],
    resolvedArgs: value.resolvedArgs ? [...value.resolvedArgs] : undefined,
    changedFiles: value.changedFiles ? [...value.changedFiles] : undefined,
    gitChangedFiles: value.gitChangedFiles
      ? [...value.gitChangedFiles]
      : undefined,
  };
}

function clonePromptTelemetry(value: PromptTelemetry): PromptTelemetry {
  return {
    ...value,
  };
}

function cloneErrorTelemetry(value: ErrorTelemetry): ErrorTelemetry {
  return {
    ...value,
  };
}

/**
 * 解析并校验手机端消息，避免业务层处理脏数据。
 */
export function parseMobileMessage(payload: string): MobileToPluginMessage {
  const value = JSON.parse(payload) as Partial<MobileToPluginMessage>;

  if (
    value.type === 'login' &&
    typeof value.requestId === 'string' &&
    typeof value.sessionId === 'string' &&
    typeof value.pin === 'string'
  ) {
    return {
      type: 'login',
      requestId: value.requestId,
      sessionId: value.sessionId,
      pin: value.pin,
      deviceName:
        typeof value.deviceName === 'string' ? value.deviceName : undefined,
    };
  }

  if (
    value.type === 'submit_prompt' &&
    typeof value.requestId === 'string' &&
    typeof value.sessionId === 'string' &&
    typeof value.authToken === 'string' &&
    typeof value.text === 'string'
  ) {
    return {
      type: 'submit_prompt',
      requestId: value.requestId,
      sessionId: value.sessionId,
      authToken: value.authToken,
      text: value.text,
      deviceName:
        typeof value.deviceName === 'string' ? value.deviceName : undefined,
      resumeSessionId:
        typeof value.resumeSessionId === 'string'
          ? value.resumeSessionId
          : undefined,
    };
  }

  if (
    value.type === 'interrupt_run' &&
    typeof value.requestId === 'string' &&
    typeof value.sessionId === 'string' &&
    typeof value.authToken === 'string' &&
    typeof value.targetRequestId === 'string'
  ) {
    return {
      type: 'interrupt_run',
      requestId: value.requestId,
      sessionId: value.sessionId,
      authToken: value.authToken,
      targetRequestId: value.targetRequestId,
    };
  }

  if (
    value.type === 'run_server_command' &&
    typeof value.requestId === 'string' &&
    typeof value.sessionId === 'string' &&
    typeof value.authToken === 'string' &&
    typeof value.command === 'string'
  ) {
    return {
      type: 'run_server_command',
      requestId: value.requestId,
      sessionId: value.sessionId,
      authToken: value.authToken,
      command: value.command,
    };
  }

  if (
    value.type === 'ping' &&
    typeof value.requestId === 'string' &&
    typeof value.sessionId === 'string'
  ) {
    return {
      type: 'ping',
      requestId: value.requestId,
      sessionId: value.sessionId,
      authToken:
        typeof value.authToken === 'string' ? value.authToken : undefined,
    };
  }

  throw new Error('无效的手机请求格式');
}

/**
 * 解析 Relay Server 发给本地 Agent 的消息。
 */
export function parseRelayServerMessage(
  payload: string,
): RelayServerToAgentMessage {
  const value = JSON.parse(payload) as Partial<RelayServerToAgentMessage>;

  if (
    value.type === 'agent_hello' &&
    typeof value.detail === 'string' &&
    typeof value.connectedAt === 'string'
  ) {
    return {
      type: 'agent_hello',
      detail: value.detail,
      connectedAt: value.connectedAt,
    };
  }

  if (
    value.type === 'forward_prompt' &&
    typeof value.requestId === 'string' &&
    typeof value.sessionId === 'string' &&
    typeof value.text === 'string' &&
    typeof value.receivedAt === 'string'
  ) {
    return {
      type: 'forward_prompt',
      requestId: value.requestId,
      sessionId: value.sessionId,
      text: value.text,
      receivedAt: value.receivedAt,
      deviceName:
        typeof value.deviceName === 'string' ? value.deviceName : undefined,
    };
  }

  if (value.type === 'agent_ping' && typeof value.requestId === 'string') {
    return {
      type: 'agent_ping',
      requestId: value.requestId,
    };
  }

  throw new Error('无效的 Relay Server 消息格式');
}

/**
 * 解析本地 Agent 回给 Relay Server 的消息。
 */
export function parseRelayAgentMessage(
  payload: string,
): RelayAgentToServerMessage {
  const value = JSON.parse(payload) as Partial<RelayAgentToServerMessage>;

  if (
    value.type === 'forward_result' &&
    typeof value.requestId === 'string' &&
    typeof value.ok === 'boolean' &&
    typeof value.detail === 'string'
  ) {
    return {
      type: 'forward_result',
      requestId: value.requestId,
      ok: value.ok,
      detail: value.detail,
      code: typeof value.code === 'string' ? value.code : undefined,
    };
  }

  if (
    value.type === 'agent_pong' &&
    typeof value.requestId === 'string' &&
    typeof value.detail === 'string'
  ) {
    return {
      type: 'agent_pong',
      requestId: value.requestId,
      detail: value.detail,
    };
  }

  throw new Error('无效的 Relay Agent 消息格式');
}

export function isHelperErrorResponse(
  response: HelperToPluginMessage,
): response is HelperErrorResponse {
  return response.status === 'error';
}

export function isHelperHealthResponse(
  response: HelperToPluginMessage,
): response is HelperHealthStatusResponse {
  return response.status === 'health_status';
}
