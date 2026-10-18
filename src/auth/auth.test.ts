import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import { expireCookie, parseCookies, serializeCookie } from "./cookies.js";
import { ConflictError, UnauthorizedError, ValidationError, isAuthError } from "./errors.js";
import { attachSession, createSessionCookieWriter, currentUser, requireUser } from "./middleware.js";
import { DEFAULT_SCRYPT_PARAMS, MIN_KEY_LENGTH, checkPasswordPolicy, hashPassword, parseHash, verifyPassword } from "./password.js";
import { SessionStore } from "./session.js";
import { UserStore, toPublicUser, validateEmail } from "./users.js";

const FAST = { ...DEFAULT_SCRYPT_PARAMS, N: 1024 }; // keep the suite quick
const HOUR = 60 * 60 * 1000;

describe("password", () => {
  test("hashes with a fresh salt and verifies the right password only", async () => {
    const a = await hashPassword("correct horse", FAST);
    const b = await hashPassword("correct horse", FAST);
    assert.notEqual(a, b);
    assert.match(a, /^scrypt\$1024\$8\$1\$/);
    assert.equal(await verifyPassword("correct horse", a), true);
    assert.equal(await verifyPassword("Correct horse", a), false);
  });

  test("returns false for malformed or truncated hashes instead of throwing", async () => {
    const hash = await hashPassword("truncate me", FAST);
    const parts = hash.split("$");
    parts[5] = Buffer.from(parts[5], "base64").subarray(0, MIN_KEY_LENGTH - 1).toString("base64");
    assert.equal(await verifyPassword("truncate me", parts.join("$")), false);
    assert.equal(await verifyPassword("x", "not a hash"), false);
    assert.equal(parseHash("scrypt$1000$8$1$c2FsdA==$a2V5"), null);
  });

  test("rejects bad parameters and enforces the policy", async () => {
    await assert.rejects(() => hashPassword("x".repeat(8), { ...FAST, N: 1000 }), RangeError);
    assert.equal(checkPasswordPolicy("eight chars"), null);
    assert.match(checkPasswordPolicy("short") ?? "", /at least 8/);
    assert.match(checkPasswordPolicy("x".repeat(129)) ?? "", /at most 128/);
    assert.match(checkPasswordPolicy("        ") ?? "", /blank/);
  });
});

describe("sessions", () => {
  function fixture() {
    let t = 1_700_000_000_000;
    const store = new SessionStore({ now: () => t, idleTtlMs: HOUR, absoluteTtlMs: 24 * HOUR });
    return { store, advance: (ms: number) => (t += ms) };
  }

  test("expires after the idle window unless touched", () => {
    const { store, advance } = fixture();
    const { id } = store.create("u1");
    advance(HOUR - 1);
    assert.ok(store.touch(id));
    advance(HOUR - 1);
    assert.ok(store.peek(id), "touch extended the idle window");
    advance(HOUR);
    assert.equal(store.peek(id), undefined);
    assert.equal(store.size, 0, "expired session is removed on lookup");
  });

  test("absolute lifetime wins even with constant activity", () => {
    const { store, advance } = fixture();
    const { id } = store.create("u1");
    for (let i = 0; i < 49; i++) {
      advance(HOUR / 2);
      store.touch(id);
    }
    assert.equal(store.peek(id), undefined);
  });

  test("revoke, revokeAllForUser and sweep remove the right sessions", () => {
    const { store, advance } = fixture();
    const a = store.create("u1");
    store.create("u1");
    const c = store.create("u2");
    assert.equal(store.revoke(a.id), true);
    assert.equal(store.revokeAllForUser("u1"), 1);
    advance(HOUR);
    const live = store.create("u3");
    assert.equal(store.sweep(), 1);
    assert.equal(store.peek(c.id), undefined);
    assert.ok(store.peek(live.id));
  });

  test("ids are unique and collisions are retried", () => {
    const seq = ["dup", "dup", "fresh"];
    const store = new SessionStore({ generateId: () => seq.shift() ?? "fallback" });
    assert.equal(store.create("u").id, "dup");
    assert.equal(store.create("u").id, "fresh");
    assert.throws(() => store.create(""), TypeError);
  });
});

describe("cookies", () => {
  test("parses loosely and keeps the first duplicate", () => {
    assert.deepEqual(parseCookies("a=1;  b=2 ;a=3; q=\"x\"; bad name=1; v=a%20b"), { a: "1", b: "2", q: "x", v: "a b" });
    assert.deepEqual(parseCookies(undefined), {});
  });

  test("serialises attributes in a stable order and round-trips", () => {
    const out = serializeCookie("sid", "abc", {
      maxAge: 3600.9,
      expires: new Date(Date.UTC(2030, 0, 1)),
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
    });
    assert.equal(out, "sid=abc; Max-Age=3600; Expires=Tue, 01 Jan 2030 00:00:00 GMT; Path=/; HttpOnly; Secure; SameSite=Strict");
    const value = 'weird "value"; with=equals';
    assert.deepEqual(parseCookies(serializeCookie("x", value)), { x: value });
    assert.match(expireCookie("sid", { path: "/" }), /^sid=; Max-Age=0; Expires=Thu, 01 Jan 1970/);
  });

  test("rejects invalid names and forbidden combinations", () => {
    assert.throws(() => serializeCookie("bad name", "v"), TypeError);
    assert.throws(() => serializeCookie("n", "v", { sameSite: "None" }), /Secure/);
    assert.throws(() => serializeCookie("n", "v", { path: "/a; HttpOnly" }), TypeError);
  });
});

describe("users", () => {
  test("normalises emails and rejects malformed ones with a field detail", () => {
    assert.equal(validateEmail("  Alice@Example.COM "), "alice@example.com");
    assert.throws(() => validateEmail("alice@"), (e: unknown) => e instanceof ValidationError && e.details?.email !== undefined);
  });

  test("registers once per email, including concurrently", async () => {
    const users = new UserStore();
    const user = await users.register({ email: "Bob@Example.com", password: "password-1" });
    assert.equal(users.findByEmail("BOB@example.com"), user);
    assert.equal("passwordHash" in toPublicUser(user), false);
    await assert.rejects(() => users.register({ email: "bob@example.com", password: "password-2" }), ConflictError);
    const results = await Promise.allSettled([
      users.register({ email: "dave@example.com", password: "password-1" }),
      users.register({ email: "dave@example.com", password: "password-2" }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
  });

  test("authenticate gives the same error for a wrong password and an unknown email", async () => {
    const users = new UserStore();
    await users.register({ email: "erin@example.com", password: "correct-password" });
    assert.ok(await users.authenticate("ERIN@example.com", "correct-password"));
    const errors = await Promise.all(
      [
        ["erin@example.com", "wrong-password"],
        ["nobody@example.com", "correct-password"],
      ].map(([e, p]) => users.authenticate(e, p).then(() => null, (err: Error) => err)),
    );
    assert.ok(errors[0] instanceof UnauthorizedError && errors[1] instanceof UnauthorizedError);
    assert.equal(errors[0].message, errors[1].message);
  });
});

describe("middleware", () => {
  const servers: Server[] = [];
  after(() => Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r())))));

  async function boot() {
    const users = new UserStore();
    const sessions = new SessionStore();
    const writer = createSessionCookieWriter({ sessions, users });
    const app = express();
    app.use(attachSession({ sessions, users }));
    app.post("/login-as/:userId", (req, res) => {
      writer.set(res, sessions.create(req.params.userId));
      res.status(204).end();
    });
    app.get("/private", requireUser, (req, res) => res.json({ email: currentUser(req).user.email }));
    app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (isAuthError(err)) res.status(err.status).json(err.toJSON());
      else res.status(500).end();
    });
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    servers.push(server);
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("expected tcp address");
    return { base: `http://127.0.0.1:${address.port}`, users, sessions };
  }

  test("resolves a valid cookie to a user and rejects anonymous requests", async () => {
    const { base, users } = await boot();
    const user = await users.register({ email: "a@example.com", password: "password-1" });
    const anon = await fetch(`${base}/private`);
    assert.equal(anon.status, 401);
    assert.deepEqual(await anon.json(), { error: "authentication required", code: "unauthorized" });

    const login = await fetch(`${base}/login-as/${user.id}`, { method: "POST" });
    const setCookie = login.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /^sid=.*; HttpOnly; SameSite=Lax$/);
    const res = await fetch(`${base}/private`, { headers: { cookie: setCookie.split(";")[0] } });
    assert.deepEqual(await res.json(), { email: "a@example.com" });
  });

  test("clears a stale cookie and revokes a session whose user vanished", async () => {
    const { base, users, sessions } = await boot();
    const stale = await fetch(`${base}/private`, { headers: { cookie: "sid=stale" } });
    assert.equal(stale.status, 401);
    assert.match(stale.headers.get("set-cookie") ?? "", /^sid=; Max-Age=0/);

    const user = await users.register({ email: "gone@example.com", password: "password-1" });
    const login = await fetch(`${base}/login-as/${user.id}`, { method: "POST" });
    users.clear();
    const res = await fetch(`${base}/private`, { headers: { cookie: (login.headers.get("set-cookie") ?? "").split(";")[0] } });
    assert.equal(res.status, 401);
    assert.equal(sessions.size, 0);
  });
});
