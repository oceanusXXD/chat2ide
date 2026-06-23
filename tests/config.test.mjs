import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadConfig } = require('../dist/server/config.js');

test('loadConfig exposes resource guardrail defaults', () => {
  const config = loadConfig({
    APP_PIN: 'local-dev-pin',
    CODEX_CWD: process.cwd(),
  });

  assert.equal(config.auth.attemptWindowMs, 600_000);
  assert.equal(config.terminal.maxSessions, 8);
  assert.equal(config.terminal.maxInputBytes, 64 * 1024);
  assert.equal(config.terminal.defaultProfileId, 'codex');
  assert.deepEqual(config.terminal.allowedCwdRoots, [process.cwd()]);
  assert.equal(config.terminal.profiles.length, 1);
  assert.equal(config.terminal.profiles[0].id, 'codex');
  assert.equal(config.terminal.profiles[0].command, 'codex');
  assert.equal(config.bridge.enabled, false);
  assert.equal(config.bridge.maxSessions, 8);
  assert.equal(config.bridge.stoppedSessionTtlMs, 60 * 60 * 1000);
  assert.deepEqual(config.bridge.clients, []);
  assert.equal(config.bridge.token, undefined);
  assert.equal(config.ws.maxBufferedBytes, 1024 * 1024);
  assert.equal(config.ws.maxPayloadBytes, 128 * 1024);
});

test('loadConfig rejects non-positive guardrail values', () => {
  assert.throws(
    () =>
      loadConfig({
        APP_PIN: 'local-dev-pin',
        CODEX_CWD: process.cwd(),
        TERMINAL_MAX_SESSIONS: '0',
      }),
    /TERMINAL_MAX_SESSIONS/,
  );
});

test('loadConfig rejects malformed scrypt pin hashes at startup', () => {
  assert.throws(
    () =>
      loadConfig({
        APP_PIN_HASH: 'scrypt$zz$aa',
        CODEX_CWD: process.cwd(),
      }),
    /APP_PIN_HASH/,
  );
});

test('loadConfig parses additional terminal profiles', () => {
  const config = loadConfig({
    APP_PIN: 'local-dev-pin',
    CODEX_CWD: process.cwd(),
    TERMINAL_PROFILES: JSON.stringify([
      {
        id: 'shell',
        name: 'Shell',
        description: 'Interactive shell',
        command: '/bin/bash',
        args: ['-i'],
        cwd: process.cwd(),
      },
    ]),
  });

  assert.equal(config.terminal.profiles.length, 2);
  assert.deepEqual(config.terminal.profiles[1], {
    id: 'shell',
    name: 'Shell',
    description: 'Interactive shell',
    command: '/bin/bash',
    args: ['-i'],
    cwd: process.cwd(),
    isDefault: false,
  });
});

test('loadConfig rejects duplicate terminal profile ids', () => {
  assert.throws(
    () =>
      loadConfig({
        APP_PIN: 'local-dev-pin',
        CODEX_CWD: process.cwd(),
        TERMINAL_PROFILES: JSON.stringify([
          {
            id: 'codex',
            command: '/bin/bash',
          },
        ]),
      }),
    /重复 profile id/,
  );
});

test('loadConfig enables the direct client bridge when a token is configured', () => {
  const token = 'bridge-secret-for-tests-32-bytes-ok';
  const config = loadConfig({
    APP_PIN: 'local-dev-pin',
    APP_BRIDGE_TOKEN: token,
    APP_BRIDGE_MAX_SESSIONS: '3',
    APP_BRIDGE_STOPPED_SESSION_TTL_MINUTES: '5',
    CODEX_CWD: process.cwd(),
  });

  assert.equal(config.bridge.enabled, true);
  assert.equal(config.bridge.token, token);
  assert.equal(config.bridge.maxSessions, 3);
  assert.equal(config.bridge.stoppedSessionTtlMs, 5 * 60 * 1000);
});

test('loadConfig supports scoped direct client bridge tokens', () => {
  const token = 'client-specific-bridge-token-32-bytes-ok';
  const config = loadConfig({
    APP_PIN: 'local-dev-pin',
    APP_BRIDGE_CLIENTS: JSON.stringify([
      {
        id: 'desktop-ide',
        name: 'Desktop IDE',
        description: 'Trusted local companion',
        token,
      },
    ]),
    CODEX_CWD: process.cwd(),
  });

  assert.equal(config.bridge.enabled, true);
  assert.equal(config.bridge.token, undefined);
  assert.deepEqual(config.bridge.clients, [
    {
      id: 'desktop-ide',
      name: 'Desktop IDE',
      description: 'Trusted local companion',
      token,
    },
  ]);
});

test('loadConfig parses terminal allowed cwd roots', () => {
  const config = loadConfig({
    APP_PIN: 'local-dev-pin',
    CODEX_CWD: process.cwd(),
    TERMINAL_ALLOWED_CWD_ROOTS: process.cwd(),
  });

  assert.deepEqual(config.terminal.allowedCwdRoots, [process.cwd()]);
});

test('loadConfig rejects weak direct client bridge tokens', () => {
  assert.throws(
    () =>
      loadConfig({
        APP_PIN: 'local-dev-pin',
        APP_BRIDGE_TOKEN: 'short-token',
        CODEX_CWD: process.cwd(),
      }),
    /APP_BRIDGE_TOKEN/,
  );
});
