import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http, { type Server } from "node:http";
import express from "express";
import { staticRouter } from "./static.js";

let server: Server;
let baseUrl: string;

before(async () => {
  const root = mkdtempSync(path.join(tmpdir(), "static-test-"));
  writeFileSync(path.join(root, "index.html"), "<!doctype html><title>test app</title>");
  writeFileSync(path.join(root, "app.js"), "console.log('hi')");
  writeFileSync(path.join(root, ".secret"), "nope");

  const app = express();
  app.get("/api/ping", (_req, res) => res.json({ pong: true }));
  app.use(staticRouter({ root, assetMaxAgeSeconds: 123 }));
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected tcp address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(() => new Promise<void>((r) => server.close(() => r())));

/** Node's `fetch` applies its own cache semantics to conditional requests, so talk to the server directly. */
function rawGet(pathname: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    http.get(`${baseUrl}${pathname}`, { headers }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
    }).on("error", reject);
  });
}

describe("staticRouter", () => {
  test("serves index.html uncached and assets with max-age, nosniff and ETag", async () => {
    const index = await fetch(`${baseUrl}/`);
    assert.equal(index.status, 200);
    assert.equal(index.headers.get("cache-control"), "no-cache");
    assert.match(await index.text(), /test app/);

    const asset = await rawGet("/app.js");
    assert.equal(asset.headers["cache-control"], "public, max-age=123");
    assert.equal(asset.headers["x-content-type-options"], "nosniff");
    assert.equal((await rawGet("/app.js", { "if-none-match": asset.headers.etag ?? "" })).status, 304);
  });

  test("falls back to index.html for app routes but not for files, dotfiles, JSON clients or /api", async () => {
    const route = await fetch(`${baseUrl}/notes/42`, { headers: { accept: "text/html" } });
    assert.equal(route.status, 200);
    assert.match(await route.text(), /test app/);
    assert.equal((await fetch(`${baseUrl}/missing.png`, { headers: { accept: "text/html" } })).status, 404);
    assert.equal((await fetch(`${baseUrl}/.secret`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/notes/42`, { headers: { accept: "application/json" } })).status, 404);
    assert.deepEqual(await (await fetch(`${baseUrl}/api/ping`)).json(), { pong: true });
  });

  test("throws at construction when the root is missing", () => {
    assert.throws(() => staticRouter({ root: "/nonexistent/public" }), /does not exist/);
  });
});
