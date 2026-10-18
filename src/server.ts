import express from "express";
import { NotesStore } from "./notes/store.js";
import { SessionStore, UserStore, attachSession, createSessionCookieWriter } from "./auth/index.js";
import { apiRouter } from "./api/index.js";

export interface AppOptions {
  notes?: NotesStore;
  users?: UserStore;
  sessions?: SessionStore;
  /** Set `Secure` on the session cookie. Default `false` for local HTTP. */
  secureCookies?: boolean;
  logError?: (err: unknown) => void;
}

/**
 * Application factory. Tests call this directly so they can mount the app on
 * an ephemeral port with fresh stores; `main()` below uses it for the real server.
 */
export function createApp(options: AppOptions = {}) {
  const notes = options.notes ?? new NotesStore();
  const users = options.users ?? new UserStore();
  const sessions = options.sessions ?? new SessionStore();
  const sessionConfig = { users, sessions, secure: options.secureCookies ?? false };
  const cookies = createSessionCookieWriter(sessionConfig);

  const app = express();
  app.disable("x-powered-by");
  app.use(attachSession(sessionConfig));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api", apiRouter({ users, sessions, notes, cookies, logError: options.logError }));

  return app;
}

function main(): void {
  const port = Number(process.env.PORT ?? 3000);
  const app = createApp();
  app.listen(port, () => {
    console.log(`notes app listening on http://localhost:${port}`);
  });
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectRun) {
  main();
}
