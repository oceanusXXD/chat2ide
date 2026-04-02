import { describe, expect, it } from 'vitest';

import { SessionStore } from '../../src/server/sessionStore';
import { createFakeClock } from '../testUtils';

describe('SessionStore', () => {
  it('应生成带有效期的 session 与 PIN', () => {
    const clock = createFakeClock();
    let tokenIndex = 0;
    const store = new SessionStore(
      clock.now,
      () => `session-${tokenIndex++}`,
      () => '123456',
    );

    const session = store.createSession({
      sessionTtlMs: 15 * 60_000,
      pinLength: 6,
    });

    expect(session.sessionId).toBe('session-0');
    expect(session.pin).toBe('123456');
    expect(session.sessionExpiresAt).toBe('2026-03-31T00:15:00.000Z');
    expect(store.getSession()).toEqual(session);
  });

  it('应支持更新与替换当前 session', () => {
    const clock = createFakeClock();
    const store = new SessionStore(clock.now, () => 'session-1', () => '654321');
    store.createSession({
      sessionTtlMs: 60_000,
      pinLength: 6,
    });

    store.update((session) => ({
      ...session,
      failedLoginAttempts: 2,
    }));
    expect(store.getSession()?.failedLoginAttempts).toBe(2);

    store.replaceSession({
      sessionId: 'session-2',
      pin: '999999',
      createdAt: '2026-03-31T00:00:00.000Z',
      sessionExpiresAt: '2026-03-31T00:10:00.000Z',
      pinExpiresAt: '2026-03-31T00:10:00.000Z',
      failedLoginAttempts: 0,
    });
    expect(store.getSession()?.sessionId).toBe('session-2');
  });
});
