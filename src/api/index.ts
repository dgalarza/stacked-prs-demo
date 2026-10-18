import express, { Router } from "express";
import type { NotesStore } from "../notes/store.js";
import type { SessionCookieWriter, SessionStore, UserStore } from "../auth/index.js";
import { authRouter } from "./auth.js";
import { apiErrorHandler, apiNotFound } from "./errors.js";
import { notesRouter } from "./notes.js";

/** Assembles the whole `/api` surface. The server mounts this once; tests can mount it with fake stores. */

export interface ApiDeps {
  users: UserStore;
  sessions: SessionStore;
  notes: NotesStore;
  cookies: SessionCookieWriter;
  logError?: (err: unknown) => void;
}

export function apiRouter(deps: ApiDeps): Router {
  const router = Router();
  // Body parsing lives inside the API router so parse failures come back as JSON.
  router.use(express.json({ limit: "64kb" }));
  router.use("/", authRouter(deps));
  router.use("/notes", notesRouter(deps.notes));
  router.use(apiNotFound);
  router.use(apiErrorHandler(deps.logError));
  return router;
}

export { authRouter } from "./auth.js";
export { notesRouter, toNoteResponse, MAX_BODY_LENGTH, MAX_TITLE_LENGTH, type NoteResponse } from "./notes.js";
export { apiErrorHandler, apiNotFound } from "./errors.js";
export * from "./validation.js";
