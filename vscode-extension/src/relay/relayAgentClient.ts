import { RawData, WebSocket } from 'ws';

import { AppState } from '../state/appState';
import { BridgeErrorCode, RelayAgentToServerMessage, parseRelayServerMessage } from '../types/protocol';
import { Logger } from '../utils/logger';

export interface RelayAgentSettings {
  getServerUrl(): string | undefined;
  getAgentName(): string;
  getConnectionTimeoutMs(): number;
  getReconnectDelayMs(): number;
  shouldAutoReconnect(): boolean;
  getAgentToken(): Promise<string | undefined>;
}

export interface RelayPromptExecutor {
  forwardPromptFromRelay(payload: {
    requestId: string;
    sessionId: string;
    text: string;
    deviceName?: string;
  }): Promise<void>;
}

export interface RelayAgentStatus {
  state: 'idle' | 'connecting' | 'connected' | 'disconnected';
  serverUrl?: string;
  agentName?: string;
  connectedAt?: string;
  lastError?: string;
}

export interface RelayAgentClientDependencies {
  createWebSocket(url: string): WebSocket;
  setTimer(handler: () => void, ms: number): NodeJS.Timeout;
  clearTimer(timer: NodeJS.Timeout): void;
}

/**
 * 本地 VS Code 扩展里的 Relay Agent。它连接远端服务器并执行真正的 GUI 自动化发送。
 */
export class RelayAgentClient {
  private socket?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private connectPromise?: Promise<void>;
  private connectingSocket?: WebSocket;
  private connectingTimeout?: NodeJS.Timeout;
  private rejectConnecting?: (error: Error) => void;
  private manualStop = false;
  private status: RelayAgentStatus = { state: 'idle' };

  constructor(
    private readonly appState: AppState,
    private readonly settings: RelayAgentSettings,
    private readonly logger: Logger,
    private readonly executor: RelayPromptExecutor,
    private readonly dependencies: RelayAgentClientDependencies = {
      createWebSocket: (url) => new WebSocket(url),
      setTimer: (handler, ms) => setTimeout(handler, ms),
      clearTimer: (timer) => clearTimeout(timer),
    },
  ) {}

  getStatus(): RelayAgentStatus {
    return { ...this.status };
  }

  async start(): Promise<void> {
    if (this.connectPromise) {
      return this.connectPromise;
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    const serverUrl = this.settings.getServerUrl();
    const agentToken = await this.settings.getAgentToken();
    if (!serverUrl || !agentToken) {
      throw new Error('请先配置 Relay Server 地址和 Agent Token');
    }

    this.manualStop = false;
    this.clearReconnectTimer();
    this.status = {
      state: 'connecting',
      serverUrl,
      agentName: this.settings.getAgentName(),
    };
    this.setRelayState('relay_connecting', `正在连接 Relay Server：${serverUrl}`);

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const wsUrl = buildRelayAgentWebSocketUrl(
        serverUrl,
        agentToken,
        this.settings.getAgentName(),
      );
      const socket = this.dependencies.createWebSocket(wsUrl);
      this.connectingSocket = socket;
      this.rejectConnecting = reject;
      let settled = false;
      const timeout = this.dependencies.setTimer(() => {
        socket.close();
        if (!settled) {
          settled = true;
          this.clearConnectingAttempt();
          const message = '连接 Relay Server 超时';
          this.status = {
            state: 'disconnected',
            serverUrl,
            agentName: this.settings.getAgentName(),
            lastError: message,
          };
          this.setRelayState('relay_disconnected', message);
          this.scheduleReconnect();
          reject(new Error(message));
        }
      }, this.settings.getConnectionTimeoutMs());
      this.connectingTimeout = timeout;

      socket.once('open', () => {
        this.clearConnectingAttempt();
        this.socket = socket;
        this.status = {
          state: 'connected',
          serverUrl,
          agentName: this.settings.getAgentName(),
          connectedAt: new Date().toISOString(),
        };
        this.setRelayState('relay_connected', `已连接 Relay Server：${serverUrl}`);
        this.logger.info(`Relay Agent 已连接：${serverUrl}`);
        if (!settled) {
          settled = true;
          resolve();
        }
      });

      socket.once('error', (error) => {
        this.logger.error('Relay Agent 连接失败', error);
        if (settled) {
          return;
        }
        settled = true;
        this.clearConnectingAttempt();
        this.status = {
          state: 'disconnected',
          serverUrl,
          agentName: this.settings.getAgentName(),
          lastError: error instanceof Error ? error.message : '连接失败',
        };
        this.setRelayState(
          'relay_disconnected',
          `连接 Relay Server 失败：${this.status.lastError ?? 'unknown'}`,
        );
        this.scheduleReconnect();
        reject(error);
      });

      socket.on('message', (payload) => {
        void this.handleMessage(payload).catch((error) => {
          this.logger.error('处理 Relay Server 消息失败', error);
        });
      });
      socket.on('close', (_code, reason) => {
        this.clearConnectingAttempt();
        if (this.socket === socket) {
          this.socket = undefined;
        }
        const reasonText = reason.toString();
        if (reasonText === 'unauthorized') {
          const lastError = 'Relay Agent Token 无效，请重新配置';
          this.status = {
            state: 'disconnected',
            serverUrl,
            agentName: this.settings.getAgentName(),
            lastError,
          };
          this.setRelayState('relay_disconnected', lastError);
          this.logger.warn(lastError);
          return;
        }
        if (this.manualStop) {
          this.status = {
            state: 'disconnected',
            serverUrl,
            agentName: this.settings.getAgentName(),
          };
          this.setRelayState('relay_disconnected', 'Relay Agent 已断开');
          return;
        }
        this.status = {
          state: 'disconnected',
          serverUrl,
          agentName: this.settings.getAgentName(),
          lastError: reasonText || '连接已断开',
        };
        this.setRelayState(
          'relay_disconnected',
          `Relay Agent 已断开：${this.status.lastError}`,
        );
        this.scheduleReconnect();
      });
    });

    return this.connectPromise;
  }

  async stop(): Promise<void> {
    this.manualStop = true;
    this.clearReconnectTimer();
    if (this.connectingSocket && this.connectingSocket.readyState < WebSocket.CLOSING) {
      const connectingSocket = this.connectingSocket;
      const rejectConnecting = this.rejectConnecting;
      this.clearConnectingAttempt();
      connectingSocket.close(1000, 'manual_stop');
      rejectConnecting?.(new Error('Relay Agent 已手动停止'));
    }
    const socket = this.socket;
    if (socket && socket.readyState === WebSocket.OPEN) {
      await new Promise<void>((resolve) => {
        socket.once('close', () => resolve());
        socket.close(1000, 'manual_stop');
      });
    }
    this.socket = undefined;
    this.status = {
      state: 'disconnected',
      serverUrl: this.status.serverUrl,
      agentName: this.status.agentName,
    };
    this.setRelayState('relay_disconnected', 'Relay Agent 已手动停止');
  }

  async autoStartIfConfigured(): Promise<void> {
    if (!this.settings.shouldAutoReconnect()) {
      return;
    }
    if (!this.settings.getServerUrl() || !(await this.settings.getAgentToken())) {
      return;
    }
    try {
      await this.start();
    } catch (error) {
      this.logger.error('自动连接 Relay Server 失败', error);
    }
  }

  private async handleMessage(payload: RawData): Promise<void> {
    const message = parseRelayServerMessage(rawDataToText(payload));
    if (message.type === 'agent_hello') {
      this.logger.info(`收到 Relay Server 握手：${message.detail}`);
      return;
    }
    if (message.type === 'agent_ping') {
      this.send({
        type: 'agent_pong',
        requestId: message.requestId,
        detail: 'local-agent-alive',
      });
      return;
    }

    try {
      await this.executor.forwardPromptFromRelay({
        requestId: message.requestId,
        sessionId: message.sessionId,
        text: message.text,
        deviceName: message.deviceName,
      });
      this.send({
        type: 'forward_result',
        requestId: message.requestId,
        ok: true,
        detail: 'prompt 已成功发送到本地 VS Code Codex',
      });
    } catch (error) {
      const normalized = normalizeRelayExecutionError(error);
      this.send({
        type: 'forward_result',
        requestId: message.requestId,
        ok: false,
        code: normalized.code,
        detail: normalized.detail,
      });
    }
  }

  private send(message: RelayAgentToServerMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Relay Agent 当前未连接');
    }
    this.socket.send(JSON.stringify(message));
  }

  private scheduleReconnect(): void {
    if (!this.settings.shouldAutoReconnect() || this.reconnectTimer || this.manualStop) {
      return;
    }
    const delayMs = this.settings.getReconnectDelayMs();
    this.logger.info(`将在 ${delayMs}ms 后尝试重连 Relay Server`);
    this.reconnectTimer = this.dependencies.setTimer(() => {
      this.reconnectTimer = undefined;
      void this.start().catch((error) => {
        this.logger.error('Relay Agent 重连失败', error);
      });
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }
    this.dependencies.clearTimer(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private clearConnectingAttempt(): void {
    if (this.connectingTimeout) {
      this.dependencies.clearTimer(this.connectingTimeout);
      this.connectingTimeout = undefined;
    }
    this.connectingSocket = undefined;
    this.rejectConnecting = undefined;
    this.connectPromise = undefined;
  }

  private setRelayState(
    status: 'relay_connecting' | 'relay_connected' | 'relay_disconnected',
    detail: string,
  ): void {
    const snapshot = this.appState.getSnapshot();
    this.appState.setStatus(status, detail, {
      authenticated: snapshot.authenticated,
      sessionExpiresAt: snapshot.sessionExpiresAt ?? null,
      authExpiresAt: snapshot.authExpiresAt ?? null,
    });
  }
}

function rawDataToText(payload: RawData): string {
  if (typeof payload === 'string') {
    return payload;
  }
  if (Buffer.isBuffer(payload)) {
    return payload.toString('utf8');
  }
  if (Array.isArray(payload)) {
    return Buffer.concat(payload).toString('utf8');
  }
  return Buffer.from(payload).toString('utf8');
}

export function buildRelayAgentWebSocketUrl(
  serverUrl: string,
  agentToken: string,
  agentName: string,
): string {
  const baseUrl = new URL(serverUrl);
  const socketProtocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const normalizedPath = `${baseUrl.pathname.replace(/\/+$/, '')}/relay/agent`.replace(/\/{2,}/g, '/');
  baseUrl.protocol = socketProtocol;
  baseUrl.pathname = normalizedPath;
  baseUrl.search = '';
  baseUrl.searchParams.set('agentToken', agentToken);
  baseUrl.searchParams.set('agentName', agentName);
  return baseUrl.toString();
}

function normalizeRelayExecutionError(error: unknown): {
  code: BridgeErrorCode;
  detail: string;
} {
  if (
    typeof error === 'object' &&
    error &&
    'code' in error &&
    'message' in error &&
    typeof (error as { code?: string }).code === 'string' &&
    typeof (error as { message?: string }).message === 'string'
  ) {
    return {
      code: (error as { code: BridgeErrorCode }).code,
      detail: (error as { message: string }).message,
    };
  }
  if (error instanceof Error) {
    return {
      code: 'UNKNOWN',
      detail: error.message,
    };
  }
  return {
    code: 'UNKNOWN',
    detail: '执行 Relay prompt 时发生未知错误',
  };
}
