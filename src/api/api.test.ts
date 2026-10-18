import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { SessionStore, UserStore } from "../auth/index.js";
import { NotesStore } from "../notes/store.js";
import { createApp } from "../server.js";
import { MAX_TITLE_LENGTH, type NoteResponse } from "./notes.js";

/** Boots the real app on an ephemeral port and drives it with a cookie-aware `fetch` wrapper. */

interface Res<T = Record<string, unknown>> {
  status: number;
  body: T;
}
type ErrorBody = { error: string; code: string; details?: Record<string, string> };
type NoteBody = { note: NoteResponse };

const users = new UserStore();
const sessions = new SessionStore();
const notes = new NotesStore();
let server: Server;
let baseUrl: string;

before(async () => {
  const app = createApp({ users, sessions, notes, logError: () => {} });
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected a TCP address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  users.clear();
  sessions.clear();
  notes.clear();
});

class Client {
  cookie = "";

  async call<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<Res<T>> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.cookie) headers.cookie = this.cookie;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    for (const raw of res.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(";").map((s) => s.trim());
      this.cookie = attrs.includes("Max-Age=0") || pair.endsWith("=") ? "" : pair;
    }
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
  }

  static async signedUp(email: string, password = "password-123"): Promise<Client> {
    const client = new Client();
    const res = await client.call("POST", "/api/register", { email, password });
    assert.equal(res.status, 201);
    return client;
  }
}

describe("register and login", () => {
  test("register creates the account, sets a cookie, and hides the hash", async () => {
    const client = new Client();
    const res = await client.call<{ user: Record<string, unknown> }>("POST", "/api/register", { email: "Ann@Example.com", password: "password-123" });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, "ann@example.com");
    assert.equal("passwordHash" in res.body.user, false);
    assert.match(client.cookie, /^sid=/);
    assert.equal(sessions.size, 1);
  });

  test("register validates fields and reports them by name", async () => {
    const client = new Client();
    const cases: [unknown, string][] = [
      [{ email: "nope", password: "password-123" }, "email"],
      [{ email: "a@example.com", password: "short" }, "password"],
      [{ email: "a@example.com" }, "password"],
      [{ email: "a@example.com", password: "password-123", admin: true }, "admin"],
    ];
    for (const [body, field] of cases) {
      const res = await client.call<ErrorBody>("POST", "/api/register", body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok(res.body.details?.[field], `expected a detail for ${field}`);
    }
    assert.equal((await client.call<ErrorBody>("POST", "/api/register", "{not json")).body.code, "bad_request");
    assert.equal((await client.call<ErrorBody>("POST", "/api/register", ["a", "b"])).status, 400);
    assert.equal(client.cookie, "");
  });

  test("duplicate emails are a 409 regardless of case", async () => {
    await Client.signedUp("dup@example.com");
    const res = await new Client().call<ErrorBody>("POST", "/api/register", { email: "DUP@example.com", password: "password-123" });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "conflict");
  });

  test("login replaces an existing session and rejects bad credentials with one message", async () => {
    const client = await Client.signedUp("bo@example.com");
    const first = client.cookie;
    const ok = await client.call("POST", "/api/login", { email: "bo@example.com", password: "password-123" });
    assert.equal(ok.status, 200);
    assert.notEqual(client.cookie, first);
    assert.equal(sessions.size, 1, "old session revoked");

    client.cookie = "";
    const wrong = await client.call<ErrorBody>("POST", "/api/login", { email: "bo@example.com", password: "password-124" });
    const unknown = await client.call<ErrorBody>("POST", "/api/login", { email: "nobody@example.com", password: "password-123" });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error, unknown.body.error);
    assert.equal(client.cookie, "");
  });
});

describe("logout and me", () => {
  test("me returns the user and session, 401 without a cookie, and clears a stale cookie", async () => {
    const client = await Client.signedUp("fay@example.com");
    const me = await client.call<{ user: { email: string }; session: { createdAt: string; expiresAt: string } }>("GET", "/api/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, "fay@example.com");
    assert.ok(Date.parse(me.body.session.expiresAt) > Date.parse(me.body.session.createdAt));

    assert.equal((await new Client().call("GET", "/api/me")).status, 401);
    sessions.clear();
    assert.equal((await client.call("GET", "/api/me")).status, 401);
    assert.equal(client.cookie, "", "server told the client to drop the cookie");
  });

  test("logout revokes the session and is idempotent", async () => {
    const client = await Client.signedUp("di@example.com");
    assert.equal((await client.call("POST", "/api/logout")).status, 204);
    assert.equal(client.cookie, "");
    assert.equal(sessions.size, 0);
    assert.equal((await client.call("POST", "/api/logout")).status, 204);
  });

  test("unknown API routes are JSON 404s and the framework is not advertised", async () => {
    const res = await fetch(`${baseUrl}/api/nothing-here`);
    assert.equal(res.status, 404);
    assert.equal(((await res.json()) as ErrorBody).code, "not_found");
    assert.equal(res.headers.get("x-powered-by"), null);
  });
});

describe("notes", () => {
  test("every notes route requires a session", async () => {
    const anon = new Client();
    for (const [method, path, body] of [
      ["GET", "/api/notes"],
      ["POST", "/api/notes", { title: "x" }],
      ["GET", "/api/notes/1"],
      ["PATCH", "/api/notes/1", { title: "x" }],
      ["DELETE", "/api/notes/1"],
    ] as const) {
      assert.equal((await anon.call(method, path, body)).status, 401, `${method} ${path}`);
    }
  });

  test("create, list, read, update and delete the caller's own notes", async () => {
    const client = await Client.signedUp("d@example.com");
    assert.deepEqual((await client.call("GET", "/api/notes")).body, { notes: [] });

    const created = await client.call<NoteBody>("POST", "/api/notes", { title: "  Shopping  ", body: "eggs" });
    assert.equal(created.status, 201);
    assert.equal(created.body.note.title, "Shopping", "title is trimmed");
    assert.equal("ownerId" in created.body.note, false);
    const id = created.body.note.id;
    assert.equal(notes.get(id)?.ownerId, users.findByEmail("d@example.com")?.id);

    await new Promise((r) => setTimeout(r, 2));
    const patched = await client.call<NoteBody>("PATCH", `/api/notes/${id}`, { body: "" });
    assert.equal(patched.body.note.title, "Shopping");
    assert.equal(patched.body.note.body, "");
    assert.ok(patched.body.note.updatedAt > created.body.note.updatedAt);

    assert.deepEqual((await client.call<NoteBody>("GET", `/api/notes/${id}`)).body.note, patched.body.note);
    assert.equal((await client.call("DELETE", `/api/notes/${id}`)).status, 204);
    assert.equal((await client.call("DELETE", `/api/notes/${id}`)).status, 404);
    assert.equal(notes.size, 0);
  });

  test("validates note bodies", async () => {
    const client = await Client.signedUp("g@example.com");
    const expect400 = async (method: string, path: string, body: unknown, field: string) => {
      const res = await client.call<ErrorBody>(method, path, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok(res.body.details?.[field] ?? res.body.error.includes(field), `expected ${field} in ${JSON.stringify(res.body)}`);
    };
    await expect400("POST", "/api/notes", { title: "   " }, "title");
    await expect400("POST", "/api/notes", { title: "ok", body: ["nope"] }, "body");
    await expect400("POST", "/api/notes", { title: "t".repeat(MAX_TITLE_LENGTH + 1) }, "title");
    await expect400("POST", "/api/notes", { title: "ok", ownerId: "someone-else" }, "ownerId");
    const created = await client.call<NoteBody>("POST", "/api/notes", { title: "ok" });
    await expect400("PATCH", `/api/notes/${created.body.note.id}`, {}, "title or body");
    await expect400("PATCH", `/api/notes/${created.body.note.id}`, { title: " " }, "title");
    await expect400("GET", `/api/notes/${encodeURIComponent("../etc")}`, undefined, "id");
  });

  test("other users' notes are invisible and untouchable", async () => {
    const alice = await Client.signedUp("alice@example.com");
    const bob = await Client.signedUp("bob@example.com");
    const mine = await alice.call<NoteBody>("POST", "/api/notes", { title: "alice only" });
    await bob.call("POST", "/api/notes", { title: "bob 1" });
    const id = mine.body.note.id;

    assert.deepEqual((await alice.call<{ notes: NoteResponse[] }>("GET", "/api/notes")).body.notes.map((n) => n.title), ["alice only"]);
    assert.equal((await bob.call("GET", `/api/notes/${id}`)).status, 404);
    assert.equal((await bob.call("PATCH", `/api/notes/${id}`, { title: "stolen" })).status, 404);
    assert.equal((await bob.call("DELETE", `/api/notes/${id}`)).status, 404);
    assert.equal(notes.get(id)?.title, "alice only");
    assert.equal(notes.size, 2);
  });

  test("notes survive logout and login", async () => {
    const client = await Client.signedUp("s@example.com");
    await client.call("POST", "/api/notes", { title: "persistent" });
    await client.call("POST", "/api/logout");
    assert.equal((await client.call("GET", "/api/notes")).status, 401);
    await client.call("POST", "/api/login", { email: "s@example.com", password: "password-123" });
    assert.equal((await client.call<{ notes: NoteResponse[] }>("GET", "/api/notes")).body.notes.length, 1);
  });
});
