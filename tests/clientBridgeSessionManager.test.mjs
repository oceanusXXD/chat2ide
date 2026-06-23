import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  ClientBridgeSessionManager,
} = require('../dist/server/bridge/clientBridgeSessionManager.js');

function createManager(overrides = {}) {
  return new ClientBridgeSessionManager({
    bufferBytes: 1024,
    defaultCols: 80,
    defaultRows: 24,
    maxSessions: 4,
    maxInputBytes: 4,
    stoppedSessionTtlMs: 60_000,
    ...overrides,
  });
}

function registerClient(manager, sentMessages = []) {
  return manager.registerClient({
    clientId: 'desktop-ide',
    description: 'Local test bridge',
    name: 'Desktop IDE',
    send(message) {
      sentMessages.push(message);
      return true;
    },
  });
}

function upsertMainSession(manager) {
  return manager.upsertSession({
    clientId: 'desktop-ide',
    commandDisplay: 'Cursor Agent',
    cwd: '/workspace',
    externalId: 'main',
    name: 'Cursor workspace',
    status: 'running',
    cols: 100,
    rows: 30,
  });
}

test('ClientBridgeSessionManager registers client-owned sessions', () => {
  const manager = createManager();
  const events = [];
  manager.subscribe((event) => events.push(event));
  const registered = registerClient(manager);

  const summary = upsertMainSession(manager);

  assert.equal(registered.clientId, 'desktop-ide');
  assert.equal(summary.backend, 'client_bridge');
  assert.equal(summary.profileId, 'bridge:desktop-ide');
  assert.equal(summary.profileName, 'Desktop IDE');
  assert.equal(summary.commandDisplay, 'Cursor Agent');
  assert.equal(summary.bridgeClientId, 'desktop-ide');
  assert.equal(summary.cols, 100);
  assert.equal(summary.rows, 30);
  assert.equal(events.at(-1).type, 'terminal_created');
});

test('ClientBridgeSessionManager rejects duplicate active client ids', () => {
  const manager = createManager();
  registerClient(manager);

  assert.throws(() => registerClient(manager), /already connected/);
});

test('ClientBridgeSessionManager replays bridge output and forwards input', () => {
  const manager = createManager();
  const sentMessages = [];
  registerClient(manager, sentMessages);
  const summary = upsertMainSession(manager);

  manager.appendOutput('desktop-ide', 'main', 'hello');
  manager.sendInput(summary.id, 'x');

  assert.deepEqual(manager.getReplay(summary.id).chunks, ['hello']);
  assert.deepEqual(sentMessages.at(-1), {
    type: 'input',
    externalId: 'main',
    data: 'x',
  });
});

test('ClientBridgeSessionManager enforces the input byte limit', () => {
  const manager = createManager();
  registerClient(manager);
  const summary = upsertMainSession(manager);

  assert.throws(() => manager.sendInput(summary.id, '12345'), /输入过大/);
});

test('ClientBridgeSessionManager enforces the bridge session limit', () => {
  const manager = createManager({ maxSessions: 1 });
  registerClient(manager);
  upsertMainSession(manager);

  assert.throws(
    () =>
      manager.upsertSession({
        clientId: 'desktop-ide',
        externalId: 'second',
        name: 'Second session',
      }),
    /桥接会话数量上限/,
  );
});

test('ClientBridgeSessionManager clears replay and sends restart control', () => {
  const manager = createManager();
  const sentMessages = [];
  const events = [];
  manager.subscribe((event) => events.push(event));
  registerClient(manager, sentMessages);
  const summary = upsertMainSession(manager);

  manager.appendOutput('desktop-ide', 'main', 'before');
  manager.restart(summary.id);

  assert.deepEqual(manager.getReplay(summary.id).chunks, []);
  assert.equal(manager.getReplay(summary.id).summary.status, 'starting');
  assert.deepEqual(sentMessages.at(-1), {
    type: 'control',
    externalId: 'main',
    action: 'restart',
  });
  assert.equal(
    events.some((event) => event.type === 'terminal_reset'),
    true,
  );
});

test('ClientBridgeSessionManager marks sessions stopped when the client disconnects', () => {
  const manager = createManager();
  const registered = registerClient(manager);
  const summary = upsertMainSession(manager);

  manager.unregisterClient(registered.clientId, registered.connectionId);

  const stopped = manager.getReplay(summary.id).summary;
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.lastError, 'Client bridge disconnected');
});

test('ClientBridgeSessionManager clears nullable status fields when provided', () => {
  const manager = createManager();
  registerClient(manager);
  const summary = upsertMainSession(manager);

  manager.updateStatus('desktop-ide', 'main', 'error', {
    lastError: 'previous failure',
    lastExitCode: 9,
    lastExitSignal: 15,
  });
  manager.updateStatus('desktop-ide', 'main', 'running', {
    lastError: null,
    lastExitCode: null,
    lastExitSignal: null,
  });

  const updated = manager.getReplay(summary.id).summary;
  assert.equal(updated.status, 'running');
  assert.equal(updated.lastError, null);
  assert.equal(updated.lastExitCode, null);
  assert.equal(updated.lastExitSignal, null);
});

test('ClientBridgeSessionManager removes stale sessions even after disconnect', () => {
  const manager = createManager();
  const registered = registerClient(manager);
  const summary = upsertMainSession(manager);

  manager.unregisterClient(registered.clientId, registered.connectionId);
  manager.close(summary.id);

  assert.equal(manager.hasSession(summary.id), false);
});

test('ClientBridgeSessionManager prunes stopped sessions after ttl', () => {
  const manager = createManager({ stoppedSessionTtlMs: 1000 });
  const registered = registerClient(manager);
  const summary = upsertMainSession(manager);

  manager.unregisterClient(registered.clientId, registered.connectionId);

  assert.equal(
    manager.pruneStopped(new Date(Date.now() + 2000)),
    1,
  );
  assert.equal(manager.hasSession(summary.id), false);
});
