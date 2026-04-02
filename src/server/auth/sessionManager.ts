import crypto from 'crypto';

export interface AuthSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
}

export class SessionManager {
  private readonly sessions = new Map<string, AuthSession>();

  constructor(private readonly sessionTtlMs: number) {}

  createSession(now = new Date()): AuthSession {
    const session: AuthSession = {
      id: createSessionId(),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.sessionTtlMs).toISOString(),
      lastSeenAt: now.toISOString(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(sessionId: string | undefined, now = new Date()): AuthSession | undefined {
    if (!sessionId) {
      return undefined;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    if (new Date(session.expiresAt).getTime() <= now.getTime()) {
      this.sessions.delete(session.id);
      return undefined;
    }

    const nextSession = {
      ...session,
      lastSeenAt: now.toISOString(),
    };
    this.sessions.set(nextSession.id, nextSession);
    return nextSession;
  }

  destroySession(sessionId: string | undefined): void {
    if (!sessionId) {
      return;
    }
    this.sessions.delete(sessionId);
  }

  pruneExpired(now = new Date()): void {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (new Date(session.expiresAt).getTime() <= now.getTime()) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

function createSessionId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}
