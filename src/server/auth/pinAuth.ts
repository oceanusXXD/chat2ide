import crypto from 'crypto';

import { PinSource } from '../config';
import { AuthSession, SessionManager } from './sessionManager';

export interface PinAuthSettings {
  maxFailedAttempts: number;
  lockoutMs: number;
  attemptWindowMs: number;
  pinSource: PinSource;
}

export class PinAuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'PinAuthError';
  }
}

interface AttemptState {
  count: number;
  lastFailedAt: number;
  lockedUntil?: number;
}

export class PinAuthService {
  private readonly attempts = new Map<string, AttemptState>();

  constructor(
    private readonly settings: PinAuthSettings,
    private readonly sessions: SessionManager,
  ) {}

  login(pin: string, clientKey: string, now = new Date()): AuthSession {
    this.pruneStaleAttempts(now);
    const normalizedPin = pin.trim();
    if (!normalizedPin) {
      this.recordFailure(clientKey, now);
      throw new PinAuthError('PIN 不正确或暂时不可用', 401);
    }

    const retryAfterSeconds = this.getRetryAfterSeconds(clientKey, now);
    if (retryAfterSeconds > 0) {
      throw new PinAuthError('PIN 不正确或暂时不可用', 429, retryAfterSeconds);
    }

    const matched = verifyPin(normalizedPin, this.settings.pinSource);
    if (!matched) {
      this.recordFailure(clientKey, now);
      throw new PinAuthError('PIN 不正确或暂时不可用', 401);
    }

    // 成功登录后清理失败记录，避免同一来源被之前的失败窗口继续影响。
    this.attempts.delete(clientKey);
    return this.sessions.createSession(now);
  }

  logout(sessionId: string | undefined): void {
    this.sessions.destroySession(sessionId);
  }

  getSession(sessionId: string | undefined): AuthSession | undefined {
    return this.sessions.getSession(sessionId);
  }

  pruneStaleAttempts(now = new Date()): void {
    const nowMs = now.getTime();
    for (const [clientKey, state] of this.attempts.entries()) {
      const lockStillActive = state.lockedUntil && state.lockedUntil > nowMs;
      const failureStillRelevant =
        nowMs - state.lastFailedAt <= this.settings.attemptWindowMs;
      if (!lockStillActive && !failureStillRelevant) {
        this.attempts.delete(clientKey);
      }
    }
  }

  private getRetryAfterSeconds(clientKey: string, now: Date): number {
    const state = this.attempts.get(clientKey);
    if (!state?.lockedUntil) {
      return 0;
    }
    if (state.lockedUntil <= now.getTime()) {
      this.attempts.delete(clientKey);
      return 0;
    }
    return Math.ceil((state.lockedUntil - now.getTime()) / 1000);
  }

  private recordFailure(clientKey: string, now: Date): void {
    const current = this.attempts.get(clientKey);
    if (current?.lockedUntil && current.lockedUntil > now.getTime()) {
      return;
    }

    const withinAttemptWindow =
      current && now.getTime() - current.lastFailedAt <= this.settings.attemptWindowMs;
    const nextCount = (withinAttemptWindow ? current.count : 0) + 1;
    const nextState: AttemptState = {
      count: nextCount,
      lastFailedAt: now.getTime(),
    };

    if (nextCount >= this.settings.maxFailedAttempts) {
      nextState.lockedUntil = now.getTime() + this.settings.lockoutMs;
      nextState.count = 0;
    }

    this.attempts.set(clientKey, nextState);
  }
}

export function verifyPin(pin: string, source: PinSource): boolean {
  if (source.plainPin) {
    return timingSafeCompare(pin, source.plainPin);
  }
  if (source.pinHash) {
    return verifyScryptHash(pin, source.pinHash);
  }
  return false;
}

export function hashPin(pin: string, salt = crypto.randomBytes(16)): string {
  const hash = crypto.scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyScryptHash(pin: string, serialized: string): boolean {
  // 兼容旧的 ":" 形式读取，但统一输出和文档都收敛到 "$" 形式。
  const [scheme, saltHex, hashHex] = serialized.includes('$')
    ? serialized.split('$')
    : serialized.split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) {
    throw new Error('APP_PIN_HASH 格式无效，应为 scrypt$<saltHex>$<hashHex>');
  }

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pin, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function timingSafeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
