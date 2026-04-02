import { describe, expect, it } from 'vitest';

import { AuthError, AuthService } from '../../src/server/auth';
import { SessionStore } from '../../src/server/sessionStore';
import { MemoryLogger } from '../../src/utils/logger';
import { createFakeClock } from '../testUtils';

function createAuthHarness() {
  const clock = createFakeClock();
  let idCounter = 0;
  let authCounter = 0;
  const store = new SessionStore(
    clock.now,
    () => `session-${idCounter++}`,
    () => '123456',
  );
  const service = new AuthService(
    store,
    {
      sessionTtlMs: 15 * 60_000,
      loginTtlMs: 10 * 60_000,
      pinLength: 6,
      maxFailedAttempts: 3,
      lockoutMs: 120_000,
    },
    new MemoryLogger(),
    clock.now,
    () => `auth-${authCounter++}`,
  );
  const session = service.issueNewSession();
  return { clock, service, session };
}

describe('AuthService', () => {
  it('应在 PIN 正确时登录成功并签发 authToken', () => {
    const { service, session } = createAuthHarness();
    const result = service.login(session.sessionId, '123456', 'iphone');

    expect(result.authToken).toBe('auth-0');
    expect(result.sessionExpiresAt).toBe(session.sessionExpiresAt);
    expect(service.getValidationResult(session.sessionId, result.authToken)).toEqual({
      authenticated: true,
      sessionExpiresAt: session.sessionExpiresAt,
      authExpiresAt: result.authExpiresAt,
    });
  });

  it('应在连续输错 PIN 后触发锁定', () => {
    const { service, session } = createAuthHarness();
    expect(() => service.login(session.sessionId, '000000')).toThrowError(AuthError);
    expect(() => service.login(session.sessionId, '000000')).toThrowError(AuthError);
    try {
      service.login(session.sessionId, '000000');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      const authError = error as AuthError;
      expect(authError.code).toBe('LOCKED_OUT');
      expect(authError.attemptsRemaining).toBe(0);
      expect(authError.lockedUntil).toBeTruthy();
    }
  });

  it('应在 session 过期后拒绝登录', () => {
    const { clock, service, session } = createAuthHarness();
    clock.advanceMs(16 * 60_000);
    expect(() => service.login(session.sessionId, '123456')).toThrowError(AuthError);
  });

  it('应在 authToken 过期后返回未认证状态', () => {
    const { clock, service, session } = createAuthHarness();
    const login = service.login(session.sessionId, '123456');
    clock.advanceMs(11 * 60_000);
    expect(service.getValidationResult(session.sessionId, login.authToken)).toEqual({
      authenticated: false,
    });
  });
});
