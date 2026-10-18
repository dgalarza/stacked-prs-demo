import { Router } from "express";
import { currentUser, requireUser, toPublicUser, type SessionCookieWriter, type SessionStore, type UserStore } from "../auth/index.js";
import { readRequiredString, rejectUnknownFields, requireObjectBody } from "./validation.js";

/**
 * Account endpoints.
 *
 *   POST /api/register   { email, password } -> 201 { user }   (sets the session cookie)
 *   POST /api/login      { email, password } -> 200 { user }   (sets the session cookie)
 *   POST /api/logout                         -> 204            (clears it)
 *   GET  /api/me                             -> 200 { user, session }
 */

export interface AuthRoutesDeps {
  users: UserStore;
  sessions: SessionStore;
  cookies: SessionCookieWriter;
}

function readCredentials(body: unknown): { email: string; password: string } {
  const obj = requireObjectBody(body);
  rejectUnknownFields(obj, ["email", "password"]);
  return {
    email: readRequiredString(obj, "email", { maxLength: 254 }),
    password: readRequiredString(obj, "password", { trim: false, nonEmpty: false }),
  };
}

export function authRouter({ users, sessions, cookies }: AuthRoutesDeps): Router {
  const router = Router();

  router.post("/register", async (req, res, next) => {
    try {
      const user = await users.register(readCredentials(req.body));
      cookies.set(res, sessions.create(user.id));
      res.status(201).json({ user: toPublicUser(user) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const { email, password } = readCredentials(req.body);
      const user = await users.authenticate(email, password);
      // Replace an existing session rather than stacking another one.
      if (req.session !== undefined) sessions.revoke(req.session.id);
      cookies.set(res, sessions.create(user.id));
      res.json({ user: toPublicUser(user) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/logout", (req, res) => {
    if (req.session !== undefined) sessions.revoke(req.session.id);
    cookies.clear(res);
    res.status(204).end();
  });

  router.get("/me", requireUser, (req, res) => {
    const { user, session } = currentUser(req);
    res.json({
      user: toPublicUser(user),
      session: { createdAt: new Date(session.createdAt).toISOString(), expiresAt: new Date(session.expiresAt).toISOString() },
    });
  });

  return router;
}
