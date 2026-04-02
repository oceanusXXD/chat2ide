import http from 'http';
import { EventEmitter } from 'events';

import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';

import { RelayAgentClient, buildRelayAgentWebSocketUrl } from '../../../src/relay/relayAgentClient';
import { AppState } from '../../../src/state/appState';
import { MemoryLogger } from '../../../src/utils/logger';

describe('RelayAgentClient', () => {
  let httpServer: http.Server | undefined;
  let wsServer: WebSocketServer | undefined;
  let relayAgentClient: RelayAgentClient | undefined;
  let serverSocket: WebSocket | undefined;

  afterEach(async () => {
    await relayAgentClient?.stop();
    serverSocket?.close();
    await new Promise<void>((resolve) => wsServer?.close(() => resolve()) ?? resolve());
    await new Promise<void>((resolve) => httpServer?.close(() => resolve()) ?? resolve());
    relayAgentClient = undefined;
    serverSocket = undefined;
    wsServer = undefined;
    httpServer = undefined;
  });

  it('应连接 Relay Server 并执行 forward_prompt', async () => {
    httpServer = http.createServer();
    wsServer = new WebSocketServer({
      server: httpServer,
      path: '/relay/agent',
    });
    await new Promise<void>((resolve) => httpServer?.listen(0, '127.0.0.1', () => resolve()));
    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('缺少监听端口');
    }

    let forwardedText = '';
    relayAgentClient = new RelayAgentClient(
      new AppState(),
      {
        getServerUrl: () => `http://127.0.0.1:${address.port}`,
        getAgentName: () => 'local-vscode',
        getConnectionTimeoutMs: () => 1000,
        getReconnectDelayMs: () => 1000,
        shouldAutoReconnect: () => false,
        getAgentToken: async () => 'relay-token',
      },
      new MemoryLogger(),
      {
        forwardPromptFromRelay: async (payload) => {
          forwardedText = payload.text;
        },
      },
    );

    const connected = new Promise<void>((resolve) => {
      wsServer?.once('connection', (socket) => {
        serverSocket = socket as unknown as WebSocket;
        socket.send(
          JSON.stringify({
            type: 'agent_hello',
            detail: 'server ready',
            connectedAt: '2026-03-31T00:00:00.000Z',
          }),
        );
        resolve();
      });
    });

    await relayAgentClient.start();
    await connected;

    const forwardResult = new Promise<{ ok: boolean; detail: string }>((resolve) => {
      serverSocket?.on('message', (payload) => {
        const message = JSON.parse(rawDataToText(payload)) as {
          type: string;
          ok: boolean;
          detail: string;
        };
        if (message.type === 'forward_result') {
          resolve(message);
        }
      });
    });

    serverSocket?.send(
      JSON.stringify({
        type: 'forward_prompt',
        requestId: 'relay-1',
        sessionId: 'session-1',
        text: '请帮我分析超时',
        receivedAt: '2026-03-31T00:00:00.000Z',
      }),
    );

    const result = await forwardResult;
    expect(forwardedText).toContain('超时');
    expect(result.ok).toBe(true);
  });

  it('应生成带 agentToken 的 WebSocket URL', () => {
    const url = buildRelayAgentWebSocketUrl(
      'https://relay.example.com:8765',
      'token-1',
      'my-agent',
    );
    expect(url).toContain('wss://relay.example.com:8765/relay/agent');
    expect(url).toContain('agentToken=token-1');
    expect(url).toContain('agentName=my-agent');
  });

  it('连接进行中手动停止时，应立即中止连接 Promise', async () => {
    const fakeSocket = new FakeWebSocket();
    relayAgentClient = new RelayAgentClient(
      new AppState(),
      {
        getServerUrl: () => 'http://relay.example.com:8765',
        getAgentName: () => 'local-vscode',
        getConnectionTimeoutMs: () => 1000,
        getReconnectDelayMs: () => 1000,
        shouldAutoReconnect: () => false,
        getAgentToken: async () => 'relay-token',
      },
      new MemoryLogger(),
      {
        forwardPromptFromRelay: async () => undefined,
      },
      {
        createWebSocket: () => fakeSocket as unknown as WebSocket,
        setTimer: () => ({}) as NodeJS.Timeout,
        clearTimer: () => undefined,
      },
    );

    const startPromise = relayAgentClient.start();
    await waitForMicrotask();
    await relayAgentClient.stop();

    await expect(startPromise).rejects.toThrow('Relay Agent 已手动停止');
    expect(fakeSocket.closeCalled).toBe(true);
    expect(relayAgentClient.getStatus().state).toBe('disconnected');
  });

  it('自动重连开启时，首次连接失败后应安排下一次重试', async () => {
    const fakeSocket = new FakeWebSocket();
    const timerCalls: number[] = [];
    relayAgentClient = new RelayAgentClient(
      new AppState(),
      {
        getServerUrl: () => 'http://relay.example.com:8765',
        getAgentName: () => 'local-vscode',
        getConnectionTimeoutMs: () => 1000,
        getReconnectDelayMs: () => 3000,
        shouldAutoReconnect: () => true,
        getAgentToken: async () => 'relay-token',
      },
      new MemoryLogger(),
      {
        forwardPromptFromRelay: async () => undefined,
      },
      {
        createWebSocket: () => fakeSocket as unknown as WebSocket,
        setTimer: (_handler, ms) => {
          timerCalls.push(ms);
          return ({}) as NodeJS.Timeout;
        },
        clearTimer: () => undefined,
      },
    );

    const startPromise = relayAgentClient.start();
    await waitForMicrotask();
    fakeSocket.emitError(new Error('dial tcp failed'));

    await expect(startPromise).rejects.toThrow('dial tcp failed');
    expect(timerCalls).toContain(1000);
    expect(timerCalls).toContain(3000);
  });
});

class FakeWebSocket extends EventEmitter {
  readyState: number = WebSocket.CONNECTING;
  closeCalled = false;

  close(_code?: number, reason?: string): void {
    this.closeCalled = true;
    this.readyState = WebSocket.CLOSED;
    this.emit('close', 1000, Buffer.from(reason ?? ''));
  }

  send(): void {}

  emitError(error: Error): void {
    this.emit('error', error);
    this.readyState = WebSocket.CLOSED;
    this.emit('close', 1006, Buffer.from('connect_failed'));
  }
}

function rawDataToText(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }
  if (Buffer.isBuffer(payload)) {
    return payload.toString('utf8');
  }
  if (Array.isArray(payload)) {
    return Buffer.concat(payload).toString('utf8');
  }
  return Buffer.from(payload as ArrayBuffer).toString('utf8');
}

function waitForMicrotask(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
