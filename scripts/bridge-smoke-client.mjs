#!/usr/bin/env node
import process from 'process';
import { WebSocket } from 'ws';

const expectedClose = process.argv.includes('--expect-close');
const url =
  process.env.CHAT2IDE_BRIDGE_URL ||
  process.argv.find((arg) => arg.startsWith('ws://') || arg.startsWith('wss://')) ||
  'ws://127.0.0.1:3000/bridge';
const token =
  process.env.APP_BRIDGE_TOKEN ||
  process.env.CHAT2IDE_BRIDGE_TOKEN ||
  process.env.BRIDGE_TOKEN;
const clientId = process.env.CHAT2IDE_BRIDGE_CLIENT_ID || 'smoke-client';
const clientName = process.env.CHAT2IDE_BRIDGE_CLIENT_NAME || 'Smoke Client';
const externalId = process.env.CHAT2IDE_BRIDGE_SESSION_ID || 'main';
const once = process.argv.includes('--once') || process.env.CHAT2IDE_BRIDGE_ONCE === '1';
let registered = false;
let closedCleanly = false;

if (!token) {
  console.error('Set APP_BRIDGE_TOKEN before running the bridge smoke client.');
  process.exit(1);
}

const socket = new WebSocket(url, {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

socket.on('open', () => {
  send({
    type: 'hello',
    clientId,
    name: clientName,
    description: 'Sample direct client bridge used for chat2ide smoke tests',
  });
});

socket.on('message', (raw) => {
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    return;
  }

  if (message.type === 'ready') {
    registered = true;
    send({
      type: 'session_upsert',
      externalId,
      name: 'Direct client smoke session',
      status: 'running',
      cwd: 'client://smoke',
      commandDisplay: 'bridge-smoke-client',
      cols: 100,
      rows: 30,
      description: 'Synthetic session exposed by a non-CLI client',
    });
    send({
      type: 'session_output',
      externalId,
      data: 'bridge smoke client ready\r\n',
    });
    if (once) {
      setTimeout(() => socket.close(1000, 'smoke complete'), 250);
    }
    return;
  }

  if (message.type === 'input') {
    send({
      type: 'session_output',
      externalId,
      data: `echo:${message.data}`,
    });
    return;
  }

  if (message.type === 'resize') {
    send({
      type: 'session_upsert',
      externalId,
      name: 'Direct client smoke session',
      status: 'running',
      cwd: 'client://smoke',
      commandDisplay: 'bridge-smoke-client',
      cols: message.cols,
      rows: message.rows,
    });
    return;
  }

  if (message.type === 'control') {
    if (message.action === 'close') {
      send({
        type: 'session_closed',
        externalId,
      });
      socket.close(1000, 'closed by hub');
      return;
    }
    if (message.action === 'restart') {
      send({
        type: 'session_status',
        externalId,
        status: 'running',
        lastError: null,
        lastExitCode: null,
        lastExitSignal: null,
      });
      send({
        type: 'session_output',
        externalId,
        data: 'bridge smoke client restarted\r\n',
      });
      return;
    }
    if (message.action === 'stop') {
      send({
        type: 'session_status',
        externalId,
        status: 'stopped',
        lastExitCode: 0,
        lastExitSignal: null,
      });
    }
  }
});

socket.on('close', (code, reason) => {
  closedCleanly = expectedClose || (registered && (code === 1000 || code === 1005));
  if (!closedCleanly) {
    process.exitCode = 1;
  }
  console.log(`bridge smoke client closed: ${code} ${reason.toString()}`);
});

socket.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

function send(message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

setTimeout(() => {
  if (!registered) {
    console.error('Bridge smoke client did not receive ready before timeout.');
    process.exit(1);
  }
}, 5000).unref();
