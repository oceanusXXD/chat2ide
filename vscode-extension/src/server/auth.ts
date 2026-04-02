import crypto from 'crypto';

import { Logger, maskSecret } from '../utils/logger';
import { BridgeErrorCode } from '../types/protocol';
import { AccessSession, Clock, SessionStore } from './sessionStore';

export interface AuthSettings {
  sessionTtlMs: number;
  loginTtlMs: number;
  pinLength: number;
  maxFailedAttempts: number;
  lockoutMs: number;
}

export interface LoginSuccess {
  sessionId: string;
  authToken: string;
  authExpiresAt: string;
  sessionExpiresAt: string;
}

export interface AuthValidationResult {
  authenticated: boolean;
  sessionExpiresAt?: string;
  authExpiresAt?: string;
}

export interface AccessInfoSnapshot {
  sessionId: string;
  pin: string;
  maskedPin: string;
  sessionExpiresAt: string;
}

export class AuthError extends Error {
  constructor(
    readonly code: BridgeErrorCode,
    message: string,
    readonly recoverable: boolean,
    readonly attemptsRemaining?: number,
    readonly lockedUntil?: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * 负责 session/PIN/authToken 的安全校验、过期与锁定逻辑。
 */
export class AuthService {
  constructor(
    private readonly store: SessionStore,
    private readonly settings: AuthSettings,
    private readonly logger: Logger,
    private readonly clock: Clock = () => new Date(),
    private readonly authTokenGenerator: () => string = () => crypto.randomBytes(18).toString('hex'),
  ) { }

  issueNewSession(): AccessSession {
    const session = this.store.createSession({
      sessionTtlMs: this.settings.sessionTtlMs,
      pinLength: this.settings.pinLength,
    });
    this.logger.info(
      `已创建新的访问 session：${session.sessionId}，PIN=${maskSecret(session.pin)}，过期时间=${session.sessionExpiresAt}`,
    );
    return session;
  }

  getCurrentSession(): AccessSession | undefined {
    return this.store.getSession();
  }

  getAccessInfoSnapshot(): AccessInfoSnapshot {
    const session = this.requireValidSession(this.store.getSession()?.sessionId ?? '');
    return {
      sessionId: session.sessionId,
      pin: session.pin,
      maskedPin: maskSecret(session.pin),
      sessionExpiresAt: session.sessionExpiresAt,
    };
  }

  isSessionPageAvailable(sessionId: string): boolean {
    try {
      this.requireValidSession(sessionId);
      return true;
    } catch {
      return false;
    }
  }

  login(sessionId: string, pin: string, deviceName?: string): LoginSuccess {
    const session = this.normalizeLockState(this.requireValidSession(sessionId));
    const now = this.clock();
    if (new Date(session.pinExpiresAt).getTime() <= now.getTime()) {
      throw new AuthError('PIN_EXPIRED', 'PIN 已过期，请在桌面端重新生成访问口令', true);
    }
    if (session.lockUntil && new Date(session.lockUntil).getTime() > now.getTime()) {
      throw new AuthError('LOCKED_OUT', '输入错误次数过多，请稍后再试', true, 0, session.lockUntil);
    }
    if (session.pin !== pin.trim()) {
      const failedAttempts = session.failedLoginAttempts + 1;
      const attemptsRemaining = Math.max(this.settings.maxFailedAttempts - failedAttempts, 0);
      const lockUntil =
        failedAttempts >= this.settings.maxFailedAttempts
          ? new Date(now.getTime() + this.settings.lockoutMs).toISOString()
          : undefined;
      this.store.update((current) => ({
        ...current,
        failedLoginAttempts: failedAttempts,
        lockUntil,
      }));
      this.logger.warn(
        `手机登录失败：session=${sessionId}，剩余次数=${attemptsRemaining}${lockUntil ? `，锁定至=${lockUntil}` : ''
        }`,
      );
      throw new AuthError(
        lockUntil ? 'LOCKED_OUT' : 'INVALID_PIN',
        lockUntil ? '输入错误次数过多，请稍后再试' : 'PIN 不正确',
        true,
        attemptsRemaining,
        lockUntil,
      );
    }

    const authExpiresAt = new Date(
      Math.min(
        new Date(session.sessionExpiresAt).getTime(),
        now.getTime() + this.settings.loginTtlMs,
      ),
    ).toISOString();
    const authToken = this.authTokenGenerator();
    const nowIso = now.toISOString();
    this.store.update((current) => ({
      ...current,
      authToken,
      authExpiresAt,
      // PIN 在首次登录成功后立即失效，降低“链接+PIN”被二次利用的风险。
      pinExpiresAt: nowIso,
      failedLoginAttempts: 0,
      lockUntil: undefined,
      deviceName,
    }));
    this.logger.info(
      `手机登录成功：session=${sessionId}，device=${deviceName ?? 'unknown'}，token=${maskSecret(
        authToken,
      )}`,
    );
    return {
      sessionId,
      authToken,
      authExpiresAt,
      sessionExpiresAt: session.sessionExpiresAt,
    };
  }

  assertAuthenticated(sessionId: string, authToken: string): AccessSession {
    const session = this.requireValidSession(sessionId);
    const now = this.clock().getTime();
    if (!session.authToken || session.authToken !== authToken) {
      throw new AuthError('UNAUTHORIZED', '未登录或登录态已失效，请重新登录', true);
    }
    if (!session.authExpiresAt || new Date(session.authExpiresAt).getTime() <= now) {
      throw new AuthError('UNAUTHORIZED', '登录态已过期，请重新登录', true);
    }
    return session;
  }

  getValidationResult(sessionId: string, authToken?: string): AuthValidationResult {
    try {
      const session = this.requireValidSession(sessionId);
      if (!authToken) {
        return {
          authenticated: false,
          sessionExpiresAt: session.sessionExpiresAt,
        };
      }
      const validated = this.assertAuthenticated(sessionId, authToken);
      return {
        authenticated: true,
        sessionExpiresAt: validated.sessionExpiresAt,
        authExpiresAt: validated.authExpiresAt,
      };
    } catch {
      return {
        authenticated: false,
      };
    }
  }

  private requireValidSession(sessionId: string): AccessSession {
    const session = this.store.getSession();
    if (!session || session.sessionId !== sessionId) {
      throw new AuthError('SESSION_NOT_FOUND', '访问链接不存在或已被轮换', true);
    }
    if (new Date(session.sessionExpiresAt).getTime() <= this.clock().getTime()) {
      throw new AuthError('SESSION_EXPIRED', '访问链接已过期，请在桌面端重新生成', true);
    }
    return session;
  }

  private normalizeLockState(session: AccessSession): AccessSession {
    if (!session.lockUntil) {
      return session;
    }
    if (new Date(session.lockUntil).getTime() > this.clock().getTime()) {
      return session;
    }
    return this.store.update((current) => ({
      ...current,
      failedLoginAttempts: 0,
      lockUntil: undefined,
    }));
  }
}
