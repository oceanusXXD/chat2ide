import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  TerminalSessionManager,
} = require('../dist/server/terminal/terminalSessionManager.js');

function createManager(overrides = {}) {
  const defaultProfile = {
    args: ['-e', 'process.exit(0)'],
    command: process.execPath,
    cwd: process.cwd(),
    description: 'Test profile',
    id: 'node',
    isDefault: true,
    name: 'Node',
  };

  return new TerminalSessionManager({
    allowedCwdRoots: [process.cwd()],
    bufferBytes: 1024,
    codexArgs: ['-e', 'process.exit(0)'],
    codexCommand: process.execPath,
    defaultCols: 80,
    defaultCwd: process.cwd(),
    defaultProfileId: defaultProfile.id,
    defaultRows: 24,
    maxInputBytes: 4,
    maxSessions: 1,
    profiles: [defaultProfile],
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

test('TerminalSessionManager records the selected terminal profile', () => {
  const manager = createManager({
    maxSessions: 2,
    profiles: [
      {
        args: ['-e', 'process.exit(0)'],
        command: process.execPath,
        cwd: process.cwd(),
        description: 'Default test profile',
        id: 'node',
        isDefault: true,
        name: 'Node',
      },
      {
        args: ['-e', 'process.exit(0)'],
        command: process.execPath,
        cwd: process.cwd(),
        description: 'Alternate test profile',
        id: 'alt',
        isDefault: false,
        name: 'Alt',
      },
    ],
  });

  const terminal = manager.createSession({ profileId: 'alt' });

  assert.equal(terminal.profileId, 'alt');
  assert.equal(terminal.profileName, 'Alt');
  assert.equal(terminal.commandDisplay, `${process.execPath} -e process.exit(0)`);
  assert.match(terminal.name, /^Alt /);

  manager.dispose();
});

test('TerminalSessionManager rejects unknown terminal profiles', () => {
  const manager = createManager();

  assert.throws(
    () => manager.createSession({ profileId: 'missing' }),
    /终端配置不存在/,
  );

  manager.dispose();
});

test('TerminalSessionManager rejects cwd outside allowed roots', () => {
  const manager = createManager({
    allowedCwdRoots: [process.cwd()],
  });

  assert.throws(
    () => manager.createSession({ cwd: '/tmp' }),
    /允许范围/,
  );

  manager.dispose();
});
