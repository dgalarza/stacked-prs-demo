import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import express, { Router, type Request } from "express";

/**
 * Serves the frontend from `public/`. Real files get cache headers (none for
 * HTML, so a deploy is picked up on the next load). Any other GET that wants
 * HTML and is not under `/api` falls back to `index.html` so client-side routes
 * load the app; requests that look like files get a plain 404 instead.
 */

export interface StaticOptions {
  root?: string;
  assetMaxAgeSeconds?: number;
}

/** Resolves `public/` relative to this module, from both `src/` and `dist/`. */
export function defaultPublicDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "public");
}

export function looksLikeFile(pathname: string): boolean {
  return (pathname.split("/").pop() ?? "").includes(".");
}

export function wantsHtml(req: Request): boolean {
  const accept = req.headers.accept ?? "";
  return accept === "" || accept === "*/*" || accept.includes("text/html");
}

export function staticRouter(options: StaticOptions = {}): Router {
  const root = options.root ?? defaultPublicDir();
  const assetMaxAge = options.assetMaxAgeSeconds ?? 60 * 60;
  if (!existsSync(root)) throw new Error(`static root does not exist: ${root}`);

  const router = Router();
  router.use(
    express.static(root, {
      dotfiles: "ignore",
      setHeaders(res, filePath) {
        res.setHeader("Cache-Control", filePath.endsWith(".html") ? "no-cache" : `public, max-age=${assetMaxAge}`);
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );

  router.get("*", (req, res, next) => {
    if (req.path === "/api" || req.path.startsWith("/api/")) return next();
    if (looksLikeFile(req.path) || !wantsHtml(req)) return res.status(404).type("text/plain").send("not found");
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(root, "index.html"), (err) => err && next(err));
  });

  return router;
}
