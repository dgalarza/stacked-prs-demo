import { Router, type Request } from "express";
import { NotFoundError, ValidationError, currentUser, requireUser } from "../auth/index.js";
import type { Note, NotesStore } from "../notes/store.js";
import { readIdParam, readRequiredString, readString, rejectUnknownFields, requireObjectBody } from "./validation.js";

/**
 * Per-user notes. Every route requires a session and only touches the caller's notes.
 *
 *   GET    /api/notes      -> 200 { notes }
 *   POST   /api/notes      -> 201 { note }   { title, body? }
 *   GET    /api/notes/:id  -> 200 { note }
 *   PATCH  /api/notes/:id  -> 200 { note }   { title?, body? }
 *   DELETE /api/notes/:id  -> 204
 *
 * Someone else's note is reported as 404, not 403, so ids in use are not revealed.
 */

export const MAX_TITLE_LENGTH = 200;
export const MAX_BODY_LENGTH = 20_000;

/** Wire shape. `ownerId` is implied by the session and omitted. */
export interface NoteResponse {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export function toNoteResponse({ id, title, body, createdAt, updatedAt }: Note): NoteResponse {
  return { id, title, body, createdAt, updatedAt };
}

export function notesRouter(notes: NotesStore): Router {
  const router = Router();
  router.use(requireUser);

  function findOwned(req: Request, id: string): Note {
    const note = notes.get(id);
    if (note === undefined || note.ownerId !== currentUser(req).user.id) throw new NotFoundError("note not found");
    return note;
  }

  router.get("/", (req, res) => {
    res.json({ notes: notes.listByOwner(currentUser(req).user.id).map(toNoteResponse) });
  });

  router.post("/", (req, res, next) => {
    try {
      const body = requireObjectBody(req.body);
      rejectUnknownFields(body, ["title", "body"]);
      const title = readRequiredString(body, "title", { maxLength: MAX_TITLE_LENGTH });
      const text = readString(body, "body", { required: false, trim: false, maxLength: MAX_BODY_LENGTH });
      const note = notes.create({ ownerId: currentUser(req).user.id, title, body: text });
      res.status(201).json({ note: toNoteResponse(note) });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", (req, res, next) => {
    try {
      res.json({ note: toNoteResponse(findOwned(req, readIdParam(req.params.id))) });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", (req, res, next) => {
    try {
      const id = readIdParam(req.params.id);
      findOwned(req, id);
      const body = requireObjectBody(req.body);
      rejectUnknownFields(body, ["title", "body"]);
      const title = readString(body, "title", { required: false, nonEmpty: true, maxLength: MAX_TITLE_LENGTH });
      const text = readString(body, "body", { required: false, trim: false, maxLength: MAX_BODY_LENGTH });
      if (title === undefined && text === undefined) throw new ValidationError("patch must include title or body");
      const updated = notes.update(id, { title, body: text });
      if (updated === undefined) throw new NotFoundError("note not found");
      res.json({ note: toNoteResponse(updated) });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", (req, res, next) => {
    try {
      const id = readIdParam(req.params.id);
      findOwned(req, id);
      notes.delete(id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
