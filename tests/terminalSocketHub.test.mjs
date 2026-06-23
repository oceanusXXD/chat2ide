import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { WebSocket } from 'ws';

const require = createRequire(import.meta.url);
const {
  ClientBridgeSessionManager,
} = require('../dist/server/bridge/clientBridgeSessionManager.js');
const { SessionManager } = require('../dist/server/auth/sessionManager.js');
const { ClientBridgeSocketHub } = require('../dist/server/ws/clientBridgeSocketHub.js');
const { TerminalSocketHub } = require('../dist/server/ws/terminalSocketHub.js');

class FakeTerminalRouter {
  constructor() {
    this.started = [];
    this.inputs = [];
    this.listeners = new Set();
    this.summary = {
      id: 'terminal-1',
      backend: 'pty',
      name: 'Fake terminal',
      profileId: 'codex',
      profileName: 'Codex CLI',
      commandDisplay: 'codex',
      bridgeClientId: null,
      status: 'starting',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      cwd: process.cwd(),
      pid: null,
      cols: 120,
      rows: 32,
      lastError: null,
      lastExitCode: null,
      lastExitSignal: null,
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  listSessions() {
    return [this.summary];
  }

  getReplay(id) {
    assert.equal(id, this.summary.id);
    return {
      summary: this.summary,
      chunks: ['replay'],
    };
  }

  startIfPending(id) {
    this.started.push(id);
  }

  sendInput(id, data) {
    this.inputs.push({ id, data });
  }

  resize() {}
}

test('TerminalSocketHub handles browser ping, attach, replay, and input', async () => {
  const server = http.createServer();
  const sessions = new SessionManager(60_000);
  const session = sessions.createSession();
  const terminals = new FakeTerminalRouter();
  const hub = new TerminalSocketHub(sessions, terminals, {
    cookieName: 'chat2ide_session',
    maxBufferedBytes: 1024 * 1024,
    maxPayloadBytes: 1024,
  });
  server.on('upgrade', (request, socket, head) => {
    if (hub.handleUpgrade(request, socket, head)) {
      return;
    }
    socket.destroy();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: {
      Cookie: `chat2ide_session=${session.id}`,
    },
  });
  const messages = [];
  socket.on('message', (raw) => {
    messages.push(JSON.parse(raw.toString()));
  });

  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  await waitFor(() => messages.some((message) => message.type === 'ready'));

  socket.send(JSON.stringify({ type: 'ping' }));
  await waitFor(() => messages.some((message) => message.type === 'pong'));

  socket.send(
    JSON.stringify({
      type: 'attach',
      terminalId: 'terminal-1',
    }),
  );
  await waitFor(() => terminals.started.includes('terminal-1'));
  await waitFor(() =>
    messages.some(
      (message) =>
        message.type === 'terminal_output' &&
        message.terminalId === 'terminal-1' &&
        message.data === 'replay' &&
        message.replay === true,
    ),
  );

  socket.send(
    JSON.stringify({
      type: 'input',
      terminalId: 'terminal-1',
      data: 'hello\r',
    }),
  );
  await waitFor(() => terminals.inputs.length === 1);
  assert.deepEqual(terminals.inputs[0], {
    id: 'terminal-1',
    data: 'hello\r',
  });

  socket.close();
  hub.dispose();
  await new Promise((resolve) => server.close(resolve));
});

test('TerminalSocketHub and ClientBridgeSocketHub share one HTTP server safely', async () => {
  const server = http.createServer();
  const sessions = new SessionManager(60_000);
  const session = sessions.createSession();
  const terminals = new FakeTerminalRouter();
  const terminalHub = new TerminalSocketHub(sessions, terminals, {
    cookieName: 'chat2ide_session',
    maxBufferedBytes: 1024 * 1024,
    maxPayloadBytes: 1024,
  });
  const bridgeSessions = new ClientBridgeSessionManager({
    bufferBytes: 1024,
    defaultCols: 80,
    defaultRows: 24,
    maxSessions: 4,
    maxInputBytes: 1024,
    stoppedSessionTtlMs: 60_000,
  });
  const bridgeHub = new ClientBridgeSocketHub(bridgeSessions, {
    maxBufferedBytes: 1024 * 1024,
    maxPayloadBytes: 1024,
    token: 'bridge-token-for-test',
  });
  server.on('upgrade', (request, socket, head) => {
    if (terminalHub.handleUpgrade(request, socket, head)) {
      return;
    }
    if (bridgeHub.handleUpgrade(request, socket, head)) {
      return;
    }
    socket.destroy();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const browserSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: {
      Cookie: `chat2ide_session=${session.id}`,
    },
  });
  const browserMessages = [];
  browserSocket.on('message', (raw) => {
    browserMessages.push(JSON.parse(raw.toString()));
  });
  await new Promise((resolve, reject) => {
    browserSocket.once('open', resolve);
    browserSocket.once('error', reject);
  });
  await waitFor(() => browserMessages.some((message) => message.type === 'ready'));
  browserSocket.send(JSON.stringify({ type: 'ping' }));
  await waitFor(() => browserMessages.some((message) => message.type === 'pong'));

  const bridgeSocket = new WebSocket(`ws://127.0.0.1:${port}/bridge`, {
    headers: {
      Authorization: 'Bearer bridge-token-for-test',
    },
  });
  const bridgeMessages = [];
  bridgeSocket.on('message', (raw) => {
    bridgeMessages.push(JSON.parse(raw.toString()));
  });
  await new Promise((resolve, reject) => {
    bridgeSocket.once('open', resolve);
    bridgeSocket.once('error', reject);
  });
  bridgeSocket.send(
    JSON.stringify({
      type: 'hello',
      clientId: 'test-client',
      name: 'Test Client',
    }),
  );
  await waitFor(() => bridgeMessages.some((message) => message.type === 'ready'));

  browserSocket.send(JSON.stringify({ type: 'ping' }));
  await waitFor(
    () => browserMessages.filter((message) => message.type === 'pong').length === 2,
  );

  browserSocket.close();
  bridgeSocket.close();
  terminalHub.dispose();
  bridgeHub.dispose();
  bridgeSessions.dispose();
  await new Promise((resolve) => server.close(resolve));
});

test('ClientBridgeSocketHub binds scoped tokens to configured client ids', async () => {
  const server = http.createServer();
  const bridgeSessions = new ClientBridgeSessionManager({
    bufferBytes: 1024,
    defaultCols: 80,
    defaultRows: 24,
    maxSessions: 4,
    maxInputBytes: 1024,
    stoppedSessionTtlMs: 60_000,
  });
  const bridgeHub = new ClientBridgeSocketHub(bridgeSessions, {
    clients: [
      {
        id: 'desktop-ide',
        name: 'Desktop IDE',
        token: 'desktop-ide-scoped-token-32-bytes-ok',
      },
    ],
    maxBufferedBytes: 1024 * 1024,
    maxPayloadBytes: 1024,
  });
  server.on('upgrade', (request, socket, head) => {
    if (bridgeHub.handleUpgrade(request, socket, head)) {
      return;
    }
    socket.destroy();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const bridgeSocket = new WebSocket(`ws://127.0.0.1:${port}/bridge`, {
    headers: {
      Authorization: 'Bearer desktop-ide-scoped-token-32-bytes-ok',
    },
  });
  const bridgeMessages = [];
  bridgeSocket.on('message', (raw) => {
    bridgeMessages.push(JSON.parse(raw.toString()));
  });
  await new Promise((resolve, reject) => {
    bridgeSocket.once('open', resolve);
    bridgeSocket.once('error', reject);
  });
  bridgeSocket.send(
    JSON.stringify({
      type: 'hello',
      clientId: 'other-client',
      name: 'Wrong client',
    }),
  );

  await waitFor(() =>
    bridgeMessages.some(
      (message) =>
        message.type === 'error' &&
        message.message.includes('scoped to client desktop-ide'),
    ),
  );
  assert.equal(bridgeSessions.count(), 0);

  bridgeSocket.close();
  bridgeHub.dispose();
  bridgeSessions.dispose();
  await new Promise((resolve) => server.close(resolve));
});

async function waitFor(predicate, timeoutMs = 2000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('condition was not met before timeout');
}
