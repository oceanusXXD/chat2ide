import http from 'http';

import { RawData, WebSocket, WebSocketServer } from 'ws';

import {
  BridgeErrorCode,
  RelayAgentToServerMessage,
  RelayForwardPromptMessage,
  RelayForwardResultMessage,
  RelayServerToAgentMessage,
  parseRelayAgentMessage,
} from '../types/protocol';
import { Logger } from '../utils/logger';

export interface RelayAgentServerOptions {
  logger: Logger;
  getAgentToken(): string;
  responseTimeoutMs: number;
}

export interface RelayAgentConnectionSnapshot {
  connected: boolean;
  agentName?: string;
  connectedAt?: string;
}

export interface RelayForwardRequest {
  requestId: string;
  sessionId: string;
  text: string;
  receivedAt: string;
  deviceName?: string;
}

export interface RelayForwardFailure {
  code: BridgeErrorCode;
  detail: string;
}

interface PendingRequest {
  resolve(result: RelayForwardResultMessage): void;
  reject(error: RelayForwardFailure): void;
  timer: NodeJS.Timeout;
}

interface RelayAgentMetadata {
  agentName: string;
  connectedAt: string;
}

/**
 * 在远端服务进程里维护“本地执行器”长连接，并把 prompt 请求可靠地下发给它。
 */
export class RelayAgentServer {
  private wsServer?: WebSocketServer;
  private boundServer?: http.Server;
  private upgradeHandler?: (
    request: http.IncomingMessage,
    socket: import('net').Socket,
    head: Buffer,
  ) => void;
  private agentSocket?: WebSocket;
  private agentMetadata?: RelayAgentMetadata;
  private readonly pendingRequests = new Map<string, PendingRequest>();

  constructor(private readonly options: RelayAgentServerOptions) {}

  attach(server: http.Server): void {
    this.boundServer = server;
    this.wsServer = new WebSocketServer({
      noServer: true,
    });
    this.upgradeHandler = (request, socket, head) => {
      const url = new URL(
        request.url ?? '/relay/agent',
        `http://${request.headers.host ?? '127.0.0.1'}`,
      );
      if (url.pathname !== '/relay/agent') {
        return;
      }
      this.wsServer?.handleUpgrade(request, socket, head, (websocket) => {
        this.wsServer?.emit('connection', websocket, request);
      });
    };
    server.on('upgrade', this.upgradeHandler);

    this.wsServer.on('connection', (socket, request) => {
      const url = new URL(
        request.url ?? '/relay/agent',
        `http://${request.headers.host ?? '127.0.0.1'}`,
      );
      const agentToken = url.searchParams.get('agentToken');
      const agentName = url.searchParams.get('agentName')?.trim() || 'local-agent';
      if (agentToken !== this.options.getAgentToken()) {
        this.options.logger.warn('拒绝未授权的 Relay Agent 连接');
        socket.close(1008, 'unauthorized');
        return;
      }

      if (this.agentSocket && this.agentSocket.readyState === WebSocket.OPEN) {
        this.options.logger.warn('检测到新的 Relay Agent 连接，替换旧连接');
        this.agentSocket.close(1012, 'replaced');
      }

      const connectedAt = new Date().toISOString();
      this.agentSocket = socket;
      this.agentMetadata = { agentName, connectedAt };
      this.options.logger.info(`Relay Agent 已连接：${agentName}`);
      this.send(socket, {
        type: 'agent_hello',
        detail: 'Relay Server 已接入本地执行器',
        connectedAt,
      });

      socket.on('message', (payload) => {
        this.handleMessage(payload);
      });
      socket.on('close', (_code, reason) => {
        const isCurrent = this.agentSocket === socket;
        if (!isCurrent) {
          return;
        }
        const reasonText = reason.toString() || 'socket closed';
        this.options.logger.warn(`Relay Agent 已断开：${reasonText}`);
        this.agentSocket = undefined;
        this.agentMetadata = undefined;
        this.rejectAllPending({
          code: 'RELAY_CONNECTION_FAILED',
          detail: 'Relay Agent 连接已断开，请重新连接本地执行器',
        });
      });
      socket.on('error', (error) => {
        this.options.logger.error('Relay Agent WebSocket 出错', error);
      });
    });
  }

  getSnapshot(): RelayAgentConnectionSnapshot {
    return {
      connected: Boolean(this.agentSocket && this.agentSocket.readyState === WebSocket.OPEN),
      agentName: this.agentMetadata?.agentName,
      connectedAt: this.agentMetadata?.connectedAt,
    };
  }

  async forwardPrompt(request: RelayForwardRequest): Promise<RelayForwardResultMessage> {
    const socket = this.agentSocket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw {
        code: 'RELAY_AGENT_UNAVAILABLE',
        detail: '本地 Relay Agent 尚未连接，无法把 prompt 送到 VS Code',
      } satisfies RelayForwardFailure;
    }

    const message: RelayForwardPromptMessage = {
      type: 'forward_prompt',
      requestId: request.requestId,
      sessionId: request.sessionId,
      text: request.text,
      receivedAt: request.receivedAt,
      deviceName: request.deviceName,
    };

    return new Promise<RelayForwardResultMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.requestId);
        reject({
          code: 'RELAY_REQUEST_TIMEOUT',
          detail: '等待本地 Relay Agent 返回结果超时',
        } satisfies RelayForwardFailure);
      }, this.options.responseTimeoutMs);

      this.pendingRequests.set(request.requestId, {
        resolve,
        reject,
        timer,
      });

      try {
        this.send(socket, message);
      } catch (error) {
        clearTimeout(timer);
        this.pendingRequests.delete(request.requestId);
        reject({
          code: 'RELAY_CONNECTION_FAILED',
          detail: error instanceof Error ? error.message : '发送到 Relay Agent 失败',
        } satisfies RelayForwardFailure);
      }
    });
  }

  async dispose(): Promise<void> {
    this.rejectAllPending({
      code: 'RELAY_CONNECTION_FAILED',
      detail: 'Relay Agent Server 已停止',
    });
    if (this.boundServer && this.upgradeHandler) {
      this.boundServer.off('upgrade', this.upgradeHandler);
    }
    this.boundServer = undefined;
    this.upgradeHandler = undefined;
    this.agentSocket?.close(1001, 'server_shutdown');
    this.agentSocket = undefined;
    this.agentMetadata = undefined;
    if (!this.wsServer) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.wsServer?.close(() => resolve());
    });
    this.wsServer = undefined;
  }

  private handleMessage(payload: RawData): void {
    try {
      const message = parseRelayAgentMessage(rawDataToText(payload));
      if (message.type === 'agent_pong') {
        this.options.logger.info(`收到 Relay Agent pong：${message.requestId}`);
        return;
      }
      this.resolvePending(message);
    } catch (error) {
      this.options.logger.error('解析 Relay Agent 消息失败', error);
    }
  }

  private resolvePending(message: RelayAgentToServerMessage): void {
    if (message.type !== 'forward_result') {
      return;
    }
    const pending = this.pendingRequests.get(message.requestId);
    if (!pending) {
      this.options.logger.warn(`收到未知 requestId 的 Relay 回执：${message.requestId}`);
      return;
    }
    clearTimeout(pending.timer);
    this.pendingRequests.delete(message.requestId);
    if (message.ok) {
      pending.resolve(message);
      return;
    }
    pending.reject({
      code: message.code ?? 'UNKNOWN',
      detail: message.detail,
    });
  }

  private rejectAllPending(error: RelayForwardFailure): void {
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingRequests.delete(requestId);
    }
  }

  private send(socket: WebSocket, message: RelayServerToAgentMessage): void {
    socket.send(JSON.stringify(message));
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
