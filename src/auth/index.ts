/** Public surface of the auth layer. Everything above this directory imports from here. */

export { AuthError, ConflictError, NotFoundError, UnauthorizedError, ValidationError, isAuthError, type AuthErrorCode } from "./errors.js";
export {
  DEFAULT_SCRYPT_PARAMS,
  MAX_PASSWORD_LENGTH,
  MIN_KEY_LENGTH,
  MIN_PASSWORD_LENGTH,
  checkPasswordPolicy,
  hashPassword,
  parseHash,
  verifyPassword,
  type ScryptParams,
} from "./password.js";
export { DEFAULT_ABSOLUTE_TTL_MS, DEFAULT_IDLE_TTL_MS, SessionStore, type Session, type SessionStoreOptions } from "./session.js";
export { expireCookie, isValidCookieName, parseCookies, serializeCookie, type CookieOptions, type SameSite } from "./cookies.js";
export { MAX_EMAIL_LENGTH, UserStore, normalizeEmail, toPublicUser, validateEmail, validatePassword, type PublicUser, type User } from "./users.js";
export {
  DEFAULT_SESSION_COOKIE,
  attachSession,
  createSessionCookieWriter,
  currentUser,
  readSessionId,
  requireUser,
  type SessionCookieWriter,
  type SessionMiddlewareOptions,
} from "./middleware.js";
