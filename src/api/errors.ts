import type { ErrorRequestHandler, RequestHandler } from "express";
import { isAuthError } from "../auth/index.js";

/** Turns every error reaching the end of the chain into `{ error, code, details? }` JSON. */

interface BodyParserError extends Error {
  type?: string;
  status?: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return err instanceof Error && typeof (err as BodyParserError).type === "string" && typeof (err as BodyParserError).status === "number";
}

export function apiErrorHandler(log: (err: unknown) => void = console.error): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) return next(err);
    if (isAuthError(err)) return res.status(err.status).json(err.toJSON());
    if (isBodyParserError(err)) {
      const message = err.type === "entity.parse.failed" ? "request body is not valid JSON" : "request body could not be read";
      return res.status(err.status ?? 400).json({ error: message, code: "bad_request" });
    }
    log(err);
    res.status(500).json({ error: "internal server error", code: "internal_error" });
  };
}

export const apiNotFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: `no route for ${req.method} ${req.path}`, code: "not_found" });
};
