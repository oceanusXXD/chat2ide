import http from 'http';

import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { RelayAgentServer } from '../../../src/relay/relayAgentServer';
import { MemoryLogger } from '../../../src/utils/logger';

describe('RelayAgentServer', () => {
  let httpServer: http.Server | undefined;
  let relayAgentServer: RelayAgentServer | undefined;
  let client: WebSocket | undefined;

  afterEach(async () => {
    client?.close();
    await relayAgentServer?.dispose();
    await new Promise<void>((resolve) => httpServer?.close(() => resolve()) ?? resolve());
    client = undefined;
    relayAgentServer = undefined;
    httpServer = undefined;
  });

  it('应把 prompt 转发给已连接的 Agent，并等待回执', async () => {
    relayAgentServer = new RelayAgentServer({
      logger: new MemoryLogger(),
      getAgentToken: () => 'relay-token',
      responseTimeoutMs: 1000,
    });
    httpServer = http.createServer();
    relayAgentServer.attach(httpServer);
    await new Promise<void>((resolve) => httpServer?.listen(0, '127.0.0.1', () => resolve()));
    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('缺少监听端口');
    }

    client = new WebSocket(
      `ws://127.0.0.1:${address.port}/relay/agent?agentToken=relay-token&agentName=test-agent`,
    );
    await new Promise<void>((resolve, reject) => {
      client?.once('open', () => resolve());
      client?.once('error', reject);
    });

    client.on('message', (payload) => {
      const message = JSON.parse(rawDataToText(payload)) as { type: string; requestId?: string };
      if (message.type !== 'forward_prompt') {
        return;
      }
      client?.send(
        JSON.stringify({
          type: 'forward_result',
          requestId: message.requestId,
          ok: true,
          detail: '本地 VS Code 已发送完成',
        }),
      );
    });

    const result = await relayAgentServer.forwardPrompt({
      requestId: 'relay-1',
      sessionId: 'session-1',
      text: '请解释超时原因',
      receivedAt: '2026-03-31T00:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(result.detail).toContain('发送完成');
  });

  it('未连接 Agent 时应拒绝转发', async () => {
    relayAgentServer = new RelayAgentServer({
      logger: new MemoryLogger(),
      getAgentToken: () => 'relay-token',
      responseTimeoutMs: 1000,
    });

    await expect(
      relayAgentServer.forwardPrompt({
        requestId: 'relay-2',
        sessionId: 'session-1',
        text: 'hello',
        receivedAt: '2026-03-31T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      code: 'RELAY_AGENT_UNAVAILABLE',
    });
  });
});

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
