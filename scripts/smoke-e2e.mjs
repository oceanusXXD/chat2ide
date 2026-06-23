#!/usr/bin/env node
import fs from 'fs';
import net from 'net';
import path from 'path';
import process from 'process';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { WebSocket } from 'ws';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = path.join(rootDir, 'dist/server/index.js');

if (!fs.existsSync(serverEntry)) {
  console.error('dist/server/index.js is missing. Run npm run build first.');
  process.exit(1);
}

const appPin = process.env.APP_PIN || '123456';
const bridgeToken =
  process.env.APP_BRIDGE_TOKEN ||
  'bridge-e2e-token-32-bytes-minimum-1234567890';
const codexCommand = process.env.CODEX_COMMAND || '/bin/bash';
const codexArgs = process.env.CODEX_ARGS || '["-i"]';
const codexCwd = process.env.CODEX_CWD || rootDir;
const port = await getFreePort();

const serverEnv = {
  ...process.env,
  APP_HOST: '127.0.0.1',
  APP_PIN: appPin,
  APP_BRIDGE_TOKEN: bridgeToken,
  APP_PORT: String(port),
  CODEX_COMMAND: codexCommand,
  CODEX_ARGS: codexArgs,
  CODEX_CWD: codexCwd,
  APP_PUBLIC_ORIGIN: process.env.APP_PUBLIC_ORIGIN || `http://127.0.0.1:${port}`,
  APP_TRUST_PROXY: '0',
  TERMINAL_MAX_SESSIONS: '4',
  APP_BRIDGE_MAX_SESSIONS: '4',
  APP_BRIDGE_STOPPED_SESSION_TTL_MINUTES: '5',
  APP_WS_MAX_BUFFERED_BYTES: '1048576',
};

const server = spawn(process.execPath, [serverEntry], {
  cwd: rootDir,
  env: serverEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});

const stdout = [];
const stderr = [];
server.stdout.on('data', (chunk) => stdout.push(chunk.toString()));
server.stderr.on('data', (chunk) => stderr.push(chunk.toString()));

try {
  await waitForServer(port);
  const cookie = await login(port, appPin);
  const profiles = await requestJson(port, '/api/profiles', cookie);
  const codexProfile = profiles.items.find((item) => item.isDefault) ?? profiles.items[0];
  if (!codexProfile) {
    throw new Error('No launch profiles returned by /api/profiles');
  }

  const browserMessages = [];
  const browserSocket = await openBrowserSocket(port, cookie, browserMessages);
  await waitFor(() => browserMessages.some((message) => message.type === 'ready'));

  const pty = await requestJson(port, '/api/terminals', cookie, {
    method: 'POST',
    body: { profileId: codexProfile.id, name: 'E2E PTY' },
  });
  if (pty.item.backend !== 'pty') {
    throw new Error(`Expected PTY backend, got ${pty.item.backend}`);
  }

  browserSocket.send(JSON.stringify({ type: 'attach', terminalId: pty.item.id }));
  await waitFor(() =>
    browserMessages.some(
      (message) =>
        message.type === 'terminal_updated' &&
        message.item.id === pty.item.id &&
        message.item.status === 'running',
    ),
  );
  browserSocket.send(
    JSON.stringify({
      type: 'input',
      terminalId: pty.item.id,
      data: "printf 'CHAT2IDE_PTY_OK\\n'\r",
    }),
  );
  await waitFor(() =>
    browserMessages.some(
      (message) =>
        message.type === 'terminal_output' &&
        message.terminalId === pty.item.id &&
        message.data.includes('CHAT2IDE_PTY_OK'),
    ),
  );

  const bridgeMessages = [];
  const bridgeSocket = await openBridgeSocket(port, bridgeToken, bridgeMessages);
  bridgeSocket.send(
    JSON.stringify({
      type: 'hello',
      clientId: 'desktop-ide',
      name: 'Desktop IDE',
      description: 'E2E smoke companion',
    }),
  );
  await waitFor(() =>
    bridgeMessages.some(
      (message) => message.type === 'ready' && message.clientId === 'desktop-ide',
    ),
  );
  bridgeSocket.send(
    JSON.stringify({
      type: 'session_upsert',
      externalId: 'main',
      name: 'Bridge smoke session',
      status: 'running',
      cwd: codexCwd,
      commandDisplay: 'bridge-smoke-client',
      cols: 100,
      rows: 30,
      description: 'Direct client companion session',
    }),
  );
  await waitFor(() =>
    browserMessages.some(
      (message) =>
        message.type === 'terminal_created' &&
        message.item.backend === 'client_bridge' &&
        message.item.bridgeClientId === 'desktop-ide',
    ),
  );
  const bridgeId = browserMessages.find(
    (message) =>
      message.type === 'terminal_created' &&
      message.item.backend === 'client_bridge' &&
      message.item.bridgeClientId === 'desktop-ide',
  ).item.id;
  browserSocket.send(JSON.stringify({ type: 'attach', terminalId: bridgeId }));
  await waitFor(() =>
    browserMessages.some(
      (message) =>
        message.type === 'terminal_updated' &&
        message.item.id === bridgeId &&
        message.item.status === 'running',
    ),
  );
  browserSocket.send(
    JSON.stringify({ type: 'input', terminalId: bridgeId, data: 'hello bridge' }),
  );
  await waitFor(() =>
    bridgeMessages.some(
      (message) =>
        message.type === 'input' &&
        message.externalId === 'main' &&
        message.data === 'hello bridge',
    ),
  );
  bridgeSocket.send(
    JSON.stringify({
      type: 'session_output',
      externalId: 'main',
      data: 'echo:hello bridge\r\n',
    }),
  );
  await waitFor(() =>
    browserMessages.some(
      (message) =>
        message.type === 'terminal_output' &&
        message.terminalId === bridgeId &&
        message.data.includes('echo:hello bridge'),
    ),
  );

  browserSocket.send(
    JSON.stringify({
      type: 'resize',
      terminalId: bridgeId,
      cols: 88,
      rows: 24,
    }),
  );
  await waitFor(() =>
    bridgeMessages.some(
      (message) =>
        message.type === 'resize' &&
        message.externalId === 'main' &&
        message.cols === 88 &&
        message.rows === 24,
    ),
  );

  await requestJson(port, `/api/terminals/${encodeURIComponent(bridgeId)}/restart`, cookie, {
    method: 'POST',
  });
  await waitFor(() =>
    bridgeMessages.some(
      (message) =>
        message.type === 'control' &&
        message.externalId === 'main' &&
        message.action === 'restart',
    ),
  );
  bridgeSocket.send(
    JSON.stringify({
      type: 'session_status',
      externalId: 'main',
      status: 'running',
      lastError: null,
      lastExitCode: null,
      lastExitSignal: null,
    }),
  );
  bridgeSocket.send(
    JSON.stringify({
      type: 'session_output',
      externalId: 'main',
      data: 'bridge restarted\r\n',
    }),
  );
  await waitFor(() =>
    browserMessages.some(
      (message) =>
        message.type === 'terminal_output' &&
        message.terminalId === bridgeId &&
        message.data.includes('bridge restarted'),
    ),
  );

  await requestVoid(port, `/api/terminals/${encodeURIComponent(bridgeId)}`, cookie, {
    method: 'DELETE',
  });
  await waitFor(() =>
    bridgeMessages.some(
      (message) =>
        message.type === 'control' &&
        message.externalId === 'main' &&
        message.action === 'close',
    ),
  );

  await requestVoid(port, `/api/terminals/${encodeURIComponent(pty.item.id)}`, cookie, {
    method: 'DELETE',
  });
  browserSocket.close();
  bridgeSocket.close();

  console.log(
    JSON.stringify({
      ok: true,
      port,
      ptyId: pty.item.id,
      bridgeId,
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  console.error(stdout.join(''));
  console.error(stderr.join(''));
  process.exitCode = 1;
} finally {
  server.kill('SIGINT');
  await waitForExit(server);
}

async function login(port, pin) {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/pin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pin }),
  });
  if (!response.ok) {
    throw new Error(`Login failed with HTTP ${response.status}`);
  }
  const cookie = response.headers.get('set-cookie');
  if (!cookie) {
    throw new Error('Login response did not include a session cookie');
  }
  return cookie.split(';', 1)[0];
}

async function requestJson(port, pathname, cookie, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`${pathname} failed with HTTP ${response.status}`);
  }
  return response.json();
}

async function requestVoid(port, pathname, cookie, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: options.method || 'POST',
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${pathname} failed with HTTP ${response.status}`);
  }
}

async function openBrowserSocket(port, cookie, messages) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: {
      Cookie: cookie,
    },
  });
  collectJsonMessages(socket, messages);
  await waitForEvent(socket, 'open');
  return socket;
}

async function openBridgeSocket(port, token, messages) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/bridge`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  collectJsonMessages(socket, messages);
  await waitForEvent(socket, 'open');
  return socket;
}

function collectJsonMessages(socket, messages) {
  socket.on('message', (raw) => {
    messages.push(JSON.parse(raw.toString()));
  });
}

async function waitForServer(port) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await delay(200);
  }
  throw new Error('Server did not become ready in time');
}

async function waitFor(predicate, timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await delay(100);
  }
  throw new Error('Condition not met before timeout');
}

function waitForEvent(socket, event) {
  return new Promise((resolve, reject) => {
    socket.once(event, resolve);
    socket.once('error', reject);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address) {
        const port = address.port;
        server.close(() => resolve(port));
        return;
      }
      reject(new Error('Unable to allocate a free port'));
    });
  });
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
