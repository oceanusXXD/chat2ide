import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  TerminalSessionManager,
} = require('../dist/server/terminal/terminalSessionManager.js');

function createManager(overrides = {}) {
  return new TerminalSessionManager({
    bufferBytes: 1024,
    codexArgs: ['-e', 'process.exit(0)'],
    codexCommand: process.execPath,
    defaultCols: 80,
    defaultCwd: process.cwd(),
    defaultRows: 24,
    maxInputBytes: 4,
    maxSessions: 1,
    ...overrides,
  });
}

test('TerminalSessionManager enforces the configured session limit', () => {
  const manager = createManager();
  manager.createSession({ name: 'first' });

  assert.throws(() => manager.createSession({ name: 'second' }), /终端数量上限/);

  manager.dispose();
});

test('TerminalSessionManager rejects oversized input before PTY write', () => {
  const manager = createManager();
  const terminal = manager.createSession({ name: 'first' });

  assert.throws(() => manager.sendInput(terminal.id, '12345'), /输入过大/);

  manager.dispose();
});

test('TerminalSessionManager can stop a terminal before first attach', () => {
  const manager = createManager();
  const terminal = manager.createSession({ name: 'first' });

  manager.stop(terminal.id);

  assert.equal(manager.listSessions()[0].status, 'stopped');

  manager.dispose();
});

