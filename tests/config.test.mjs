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

