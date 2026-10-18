import express from "express";
import { NotesStore } from "./notes/store.js";
import { notesRouter } from "./notes/routes.js";

export interface AppOptions {
  store?: NotesStore;
}

/**
 * Application factory. Tests call this directly so they can mount the app on
 * an ephemeral port; `main()` below uses it for the real server.
 */
export function createApp(options: AppOptions = {}) {
  const store = options.store ?? new NotesStore();
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/notes", notesRouter(store));

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
