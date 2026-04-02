import crypto from 'crypto';

export interface AccessSession {
  sessionId: string;
  pin: string;
  createdAt: string;
  sessionExpiresAt: string;
  pinExpiresAt: string;
  authToken?: string;
  authExpiresAt?: string;
  failedLoginAttempts: number;
  lockUntil?: string;
  deviceName?: string;
}

export interface SessionGenerationOptions {
  sessionTtlMs: number;
  pinLength: number;
}

export type Clock = () => Date;
export type TokenGenerator = (bytes?: number) => string;
export type PinGenerator = (length: number) => string;

/**
 * 仅负责维护当前活动 session 的原始数据。
 */
export class SessionStore {
  private session?: AccessSession;

  constructor(
    private readonly clock: Clock = () => new Date(),
    private readonly tokenGenerator: TokenGenerator = (bytes = 16) =>
      crypto.randomBytes(bytes).toString('hex'),
    private readonly pinGenerator: PinGenerator = defaultPinGenerator,
  ) {}

  createSession(options: SessionGenerationOptions): AccessSession {
    const now = this.clock();
    const expiresAt = new Date(now.getTime() + options.sessionTtlMs).toISOString();
    this.session = {
      sessionId: this.tokenGenerator(12),
      pin: this.pinGenerator(options.pinLength),
      createdAt: now.toISOString(),
      sessionExpiresAt: expiresAt,
      pinExpiresAt: expiresAt,
      failedLoginAttempts: 0,
    };
    return this.getSessionOrThrow();
  }

  getSession(): AccessSession | undefined {
    return this.session ? cloneAccessSession(this.session) : undefined;
  }

  replaceSession(session: AccessSession): AccessSession {
    this.session = cloneAccessSession(session);
    return this.getSessionOrThrow();
  }

  update(updater: (session: AccessSession) => AccessSession): AccessSession {
    if (!this.session) {
      throw new Error('当前没有可更新的 session');
    }
    this.session = cloneAccessSession(updater(cloneAccessSession(this.session)));
    return this.getSessionOrThrow();
  }

  clear(): void {
    this.session = undefined;
  }

  private getSessionOrThrow(): AccessSession {
    const session = this.getSession();
    if (!session) {
      throw new Error('当前没有活动 session');
    }
    return session;
  }
}

export function cloneAccessSession(session: AccessSession): AccessSession {
  return { ...session };
}

export function defaultPinGenerator(length: number): string {
  let pin = '';
  for (let index = 0; index < length; index += 1) {
    pin += crypto.randomInt(0, 10).toString();
  }
  return pin;
}
