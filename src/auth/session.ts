import { randomBytes } from "node:crypto";

/**
 * In-memory session store with idle and absolute expiry. A session dies when
 * either its idle window passes without activity or its absolute lifetime ends.
 * Time is injectable so tests can move the clock without sleeping.
 */

export interface Session {
  id: string;
  userId: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

export interface SessionStoreOptions {
  idleTtlMs?: number;
  absoluteTtlMs?: number;
  now?: () => number;
  generateId?: () => string;
}

export const DEFAULT_IDLE_TTL_MS = 60 * 60 * 1000;
export const DEFAULT_ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly idleTtlMs: number;
  private readonly absoluteTtlMs: number;
  private readonly now: () => number;
  private readonly generateId: () => string;

  constructor(options: SessionStoreOptions = {}) {
    this.idleTtlMs = options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
    this.absoluteTtlMs = options.absoluteTtlMs ?? DEFAULT_ABSOLUTE_TTL_MS;
    this.now = options.now ?? Date.now;
    this.generateId = options.generateId ?? (() => randomBytes(32).toString("base64url"));
    if (this.idleTtlMs <= 0 || this.absoluteTtlMs <= 0) throw new RangeError("session ttls must be positive");
  }

  get size(): number {
    return this.sessions.size;
  }

  create(userId: string): Session {
    if (typeof userId !== "string" || userId.length === 0) throw new TypeError("userId is required");
    const now = this.now();
    let id = this.generateId();
    while (this.sessions.has(id)) id = this.generateId();
    const session: Session = { id, userId, createdAt: now, lastSeenAt: now, expiresAt: now + this.absoluteTtlMs };
    this.sessions.set(id, session);
    return session;
  }

  private isExpired(session: Session, now: number): boolean {
    return now >= session.expiresAt || now - session.lastSeenAt >= this.idleTtlMs;
  }

  /** Looks a session up without extending it. Expired sessions are removed and reported missing. */
  peek(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (session === undefined) return undefined;
    if (this.isExpired(session, this.now())) {
      this.sessions.delete(id);
      return undefined;
    }
    return session;
  }

  /** Looks a session up and records activity, extending the idle window. Request middleware calls this. */
  touch(id: string): Session | undefined {
    const session = this.peek(id);
    if (session !== undefined) session.lastSeenAt = this.now();
    return session;
  }

  revoke(id: string): boolean {
    return this.sessions.delete(id);
  }

  revokeAllForUser(userId: string): number {
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (session.userId === userId && this.sessions.delete(id)) removed += 1;
    }
    return removed;
  }

  /** Drops every expired session. Returns how many were dropped. */
  sweep(): number {
    const now = this.now();
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (this.isExpired(session, now) && this.sessions.delete(id)) removed += 1;
    }
    return removed;
  }

  clear(): void {
    this.sessions.clear();
  }
}
