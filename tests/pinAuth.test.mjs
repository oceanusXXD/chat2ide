import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PinAuthError, PinAuthService } = require('../dist/server/auth/pinAuth.js');
const { SessionManager } = require('../dist/server/auth/sessionManager.js');

test('login failures expire outside the attempt window', () => {
  const sessions = new SessionManager(60_000);
  const auth = new PinAuthService(
    {
      attemptWindowMs: 1000,
      lockoutMs: 60_000,
      maxFailedAttempts: 2,
      pinSource: {
        plainPin: '2468',
      },
    },
    sessions,
  );

  assert.throws(
    () => auth.login('bad', 'client-a', new Date(0)),
    (error) => error instanceof PinAuthError && error.statusCode === 401,
  );

  assert.throws(
    () => auth.login('bad', 'client-a', new Date(2000)),
    (error) => error instanceof PinAuthError && error.statusCode === 401,
  );

  assert.throws(
    () => auth.login('bad', 'client-a', new Date(2100)),
    (error) => error instanceof PinAuthError && error.statusCode === 401,
  );

  assert.throws(
    () => auth.login('bad', 'client-a', new Date(2200)),
    (error) =>
      error instanceof PinAuthError &&
      error.statusCode === 429 &&
      typeof error.retryAfterSeconds === 'number',
  );
});

