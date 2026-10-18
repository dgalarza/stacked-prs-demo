/** Errors shared by the auth layer and the HTTP layer above it. Each carries an HTTP status and a stable code. */

export type AuthErrorCode = "validation_error" | "conflict" | "unauthorized" | "not_found";

export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: AuthErrorCode,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = new.target.name;
  }

  /** Wire shape. Never includes the stack. */
  toJSON(): { error: string; code: AuthErrorCode; details?: Record<string, string> } {
    return this.details ? { error: this.message, code: this.code, details: this.details } : { error: this.message, code: this.code };
  }
}

export class ValidationError extends AuthError {
  constructor(message: string, details?: Record<string, string>) {
    super(400, "validation_error", message, details);
  }
}

export class ConflictError extends AuthError {
  constructor(message: string) {
    super(409, "conflict", message);
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message = "authentication required") {
    super(401, "unauthorized", message);
  }
}

export class NotFoundError extends AuthError {
  constructor(message = "not found") {
    super(404, "not_found", message);
  }
}

export function isAuthError(value: unknown): value is AuthError {
  return value instanceof AuthError;
}
