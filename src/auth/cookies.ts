/**
 * Cookie parsing and serialisation per RFC 6265. Express does not parse cookies
 * itself and this app does not need `cookie-parser`, so the few lines live here.
 */

export type SameSite = "Strict" | "Lax" | "None";

export interface CookieOptions {
  maxAge?: number;
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: SameSite;
}

const TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function isValidCookieName(name: string): boolean {
  return typeof name === "string" && TOKEN_RE.test(name);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Parses a `Cookie` header. First value wins on duplicates; malformed pairs are skipped. */
export function parseCookies(header: string | undefined | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof header !== "string" || header.length === 0) return result;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (!isValidCookieName(name) || Object.prototype.hasOwnProperty.call(result, name)) continue;
    let value = part.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    result[name] = safeDecode(value);
  }
  return result;
}

/** Builds a `Set-Cookie` value. Throws on an invalid name or a forbidden option combination. */
export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  if (!isValidCookieName(name)) throw new TypeError(`invalid cookie name: ${JSON.stringify(name)}`);
  if (typeof value !== "string") throw new TypeError("cookie value must be a string");
  if (options.sameSite === "None" && options.secure !== true) throw new TypeError("SameSite=None requires Secure");

  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) {
    if (!Number.isFinite(options.maxAge)) throw new TypeError("maxAge must be a finite number");
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }
  if (options.expires !== undefined) {
    if (Number.isNaN(options.expires.getTime())) throw new TypeError("expires must be a valid Date");
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options.domain !== undefined) {
    if (!/^[A-Za-z0-9.\-]+$/.test(options.domain)) throw new TypeError("invalid cookie domain");
    parts.push(`Domain=${options.domain}`);
  }
  if (options.path !== undefined) {
    if (/[;\s]/.test(options.path)) throw new TypeError("invalid cookie path");
    parts.push(`Path=${options.path}`);
  }
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite !== undefined) parts.push(`SameSite=${options.sameSite}`);
  return parts.join("; ");
}

/** A `Set-Cookie` value that removes a cookie. Path and domain must match the original. */
export function expireCookie(name: string, options: Pick<CookieOptions, "path" | "domain"> = {}): string {
  return serializeCookie(name, "", { ...options, maxAge: 0, expires: new Date(0) });
}
