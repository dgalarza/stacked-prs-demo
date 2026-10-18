import { Router } from "express";
import type { NotesStore } from "./store.js";

/**
 * Builds the `/api/notes` router.
 *
 * GET  /api/notes  -> list all notes
 * POST /api/notes  -> create a note from a JSON body `{ title, body? }`
 */
export function notesRouter(store: NotesStore): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ notes: store.list() });
  });

  router.post("/", (req, res) => {
    const { title, body } = req.body ?? {};

    if (typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    if (body !== undefined && typeof body !== "string") {
      res.status(400).json({ error: "body must be a string" });
      return;
    }

    const note = store.create({ title: title.trim(), body });
    res.status(201).json({ note });
  });

  return router;
}
