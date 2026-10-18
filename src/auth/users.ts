import { randomUUID } from "node:crypto";
import { ConflictError, UnauthorizedError, ValidationError } from "./errors.js";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "./password.js";

/**
 * In-memory user records plus registration and credential checks. Emails are
 * normalised (trimmed, lower-cased) so `Alice@Example.com` and `alice@example.com`
 * are one account.
 */

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

/** The subset of a user that is safe to send to a client. */
export interface PublicUser {
  id: string;
  email: string;
  createdAt: string;
}

export const MAX_EMAIL_LENGTH = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: unknown): string {
  if (typeof email !== "string") throw new ValidationError("email is required", { email: "must be a string" });
  const normalized = normalizeEmail(email);
  if (normalized.length === 0) throw new ValidationError("email is required", { email: "must not be empty" });
  if (normalized.length > MAX_EMAIL_LENGTH) {
    throw new ValidationError("email is too long", { email: `must be at most ${MAX_EMAIL_LENGTH} characters` });
  }
  if (!EMAIL_RE.test(normalized)) throw new ValidationError("email is invalid", { email: "must look like name@example.com" });
  return normalized;
}

export function validatePassword(password: unknown): string {
  const problem = checkPasswordPolicy(password);
  if (problem !== null) throw new ValidationError(problem, { password: problem });
  return password as string;
}

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

// A valid-shaped hash of nothing, used only to equalise timing when the email is unknown.
const DUMMY_HASH = `scrypt$16384$8$1$${"A".repeat(22)}==$${"A".repeat(86)}==`;

export class UserStore {
  private readonly byId = new Map<string, User>();
  private readonly byEmail = new Map<string, string>();

  get size(): number {
    return this.byId.size;
  }

  findById(id: string): User | undefined {
    return this.byId.get(id);
  }

  findByEmail(email: string): User | undefined {
    const id = this.byEmail.get(normalizeEmail(email));
    return id === undefined ? undefined : this.byId.get(id);
  }

  /**
   * Registers a user. Validation runs before the slow hash, and the uniqueness
   * check runs again after it so two concurrent registrations cannot both win.
   */
  async register(input: { email: unknown; password: unknown }): Promise<User> {
    const email = validateEmail(input.email);
    const password = validatePassword(input.password);
    if (this.byEmail.has(email)) throw new ConflictError("an account with that email already exists");

    const passwordHash = await hashPassword(password);
    if (this.byEmail.has(email)) throw new ConflictError("an account with that email already exists");

    const user: User = { id: randomUUID(), email, passwordHash, createdAt: new Date().toISOString() };
    this.byId.set(user.id, user);
    this.byEmail.set(email, user.id);
    return user;
  }

  /** Unknown emails and wrong passwords produce the same error so the endpoint does not leak registered addresses. */
  async authenticate(email: unknown, password: unknown): Promise<User> {
    if (typeof email !== "string" || typeof password !== "string") throw new UnauthorizedError("invalid email or password");

    const user = this.findByEmail(email);
    if (user === undefined) {
      await verifyPassword(password, DUMMY_HASH);
      throw new UnauthorizedError("invalid email or password");
    }
    if (!(await verifyPassword(password, user.passwordHash))) throw new UnauthorizedError("invalid email or password");
    return user;
  }

  clear(): void {
    this.byId.clear();
    this.byEmail.clear();
  }
}
