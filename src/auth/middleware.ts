import type { Request, RequestHandler, Response } from "express";
import { expireCookie, parseCookies, serializeCookie, type CookieOptions } from "./cookies.js";
import { UnauthorizedError } from "./errors.js";
import type { Session, SessionStore } from "./session.js";
import type { User, UserStore } from "./users.js";

/**
 * Express glue. `attachSession` runs on every request and never rejects: it
 * resolves the cookie to a user and session when valid. `requireUser` turns
 * "no user" into a 401 on protected routes.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      session?: Session;
    }
  }
}

export const DEFAULT_SESSION_COOKIE = "sid";

export interface SessionMiddlewareOptions {
  sessions: SessionStore;
  users: UserStore;
  cookieName?: string;
  /** Set `Secure` on the cookie. Default `false` so local HTTP works. */
  secure?: boolean;
  path?: string;
}

export interface SessionCookieWriter {
  readonly cookieName: string;
  set(res: Response, session: Session): void;
  clear(res: Response): void;
}

/** Helpers for writing the session cookie, used by login and logout handlers. */
export function createSessionCookieWriter(options: SessionMiddlewareOptions): SessionCookieWriter {
  const cookieName = options.cookieName ?? DEFAULT_SESSION_COOKIE;
  const base: CookieOptions = { httpOnly: true, sameSite: "Lax", secure: options.secure ?? false, path: options.path ?? "/" };
  return {
    cookieName,
    set(res, session) {
      const maxAge = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
      res.append("Set-Cookie", serializeCookie(cookieName, session.id, { ...base, maxAge }));
    },
    clear(res) {
      res.append("Set-Cookie", expireCookie(cookieName, { path: base.path }));
    },
  };
}

export function readSessionId(req: Request, cookieName = DEFAULT_SESSION_COOKIE): string | undefined {
  const id = parseCookies(req.headers.cookie)[cookieName];
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

export function attachSession(options: SessionMiddlewareOptions): RequestHandler {
  const cookieName = options.cookieName ?? DEFAULT_SESSION_COOKIE;
  const writer = createSessionCookieWriter(options);

  return (req, res, next) => {
    const sessionId = readSessionId(req, cookieName);
    if (sessionId === undefined) return next();

    const session = options.sessions.touch(sessionId);
    if (session === undefined) {
      writer.clear(res); // stale cookie: tell the browser to drop it
      return next();
    }
    const user = options.users.findById(session.userId);
    if (user === undefined) {
      options.sessions.revoke(session.id);
      writer.clear(res);
      return next();
    }
    req.user = user;
    req.session = session;
    next();
  };
}

/** Rejects unauthenticated requests. Must run after `attachSession`. */
export const requireUser: RequestHandler = (req, _res, next) => {
  next(req.user === undefined || req.session === undefined ? new UnauthorizedError() : undefined);
};

/** Narrowing helper for handlers mounted behind `requireUser`. */
export function currentUser(req: Request): { user: User; session: Session } {
  if (req.user === undefined || req.session === undefined) throw new UnauthorizedError();
  return { user: req.user, session: req.session };
}
