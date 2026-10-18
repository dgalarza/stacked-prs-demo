import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createApp } from "../src/server.js";
import { NotesStore } from "../src/notes/store.js";

let server: Server;
let baseUrl: string;

before(async () => {
  const app = createApp({ store: new NotesStore() });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected a TCP address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test("GET /health responds ok", async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("GET /api/notes starts empty", async () => {
  const res = await fetch(`${baseUrl}/api/notes`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { notes: [] });
});

test("POST /api/notes creates a note and lists it", async () => {
  const created = await fetch(`${baseUrl}/api/notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "First", body: "hello" }),
  });
  assert.equal(created.status, 201);
  const { note } = (await created.json()) as { note: { id: string; title: string; body: string } };
  assert.equal(note.title, "First");
  assert.equal(note.body, "hello");

  const listed = await fetch(`${baseUrl}/api/notes`);
  const { notes } = (await listed.json()) as { notes: unknown[] };
  assert.equal(notes.length, 1);
});

test("POST /api/notes rejects a missing title", async () => {
  const res = await fetch(`${baseUrl}/api/notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "no title" }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "title is required" });
});
