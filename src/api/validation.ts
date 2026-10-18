import { ValidationError } from "../auth/index.js";

/**
 * Request-body helpers. Each reads one field from a parsed JSON object and
 * either returns the cleaned value or throws a `ValidationError` whose
 * `details` map names the offending field.
 */

export type JsonObject = Record<string, unknown>;

export function requireObjectBody(body: unknown): JsonObject {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("request body must be a JSON object");
  }
  return body as JsonObject;
}

export interface StringFieldOptions {
  required?: boolean;
  /** Trim before length checks. Default true. */
  trim?: boolean;
  /** Reject empty strings after trimming. Default: same as `required`. */
  nonEmpty?: boolean;
  maxLength?: number;
}

/** Reads a string field. Returns `undefined` only when the field is optional and absent. */
export function readString(obj: JsonObject, key: string, options: StringFieldOptions = {}): string | undefined {
  const required = options.required ?? true;
  const nonEmpty = options.nonEmpty ?? required;
  const raw = obj[key];

  if (raw === undefined || raw === null) {
    if (required) throw new ValidationError(`${key} is required`, { [key]: "is required" });
    return undefined;
  }
  if (typeof raw !== "string") throw new ValidationError(`${key} must be a string`, { [key]: "must be a string" });

  const value = (options.trim ?? true) ? raw.trim() : raw;
  if (nonEmpty && value.length === 0) throw new ValidationError(`${key} must not be empty`, { [key]: "must not be empty" });
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw new ValidationError(`${key} is too long`, { [key]: `must be at most ${options.maxLength} characters` });
  }
  return value;
}

export function readRequiredString(obj: JsonObject, key: string, options: Omit<StringFieldOptions, "required"> = {}): string {
  return readString(obj, key, { ...options, required: true }) as string;
}

/** Rejects bodies with fields outside an allow-list, so typos like `tittle` fail loudly. */
export function rejectUnknownFields(obj: JsonObject, allowed: readonly string[]): void {
  const unknown = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (unknown.length === 0) return;
  const details = Object.fromEntries(unknown.map((k) => [k, "is not a recognised field"]));
  throw new ValidationError(`unknown field${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`, details);
}

export function readIdParam(value: string | undefined, name = "id"): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new ValidationError(`${name} is invalid`, { [name]: "must be a short alphanumeric id" });
  }
  return value;
}
