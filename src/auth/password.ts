import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing on `node:crypto` scrypt. Stored hashes are self-describing:
 *
 *   scrypt$<N>$<r>$<p>$<salt-base64>$<key-base64>
 *
 * so cost parameters can be raised later while old hashes still verify.
 */

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
  keyLength: number;
  saltLength: number;
}

export const DEFAULT_SCRYPT_PARAMS: Readonly<ScryptParams> = Object.freeze({ N: 16384, r: 8, p: 1, keyLength: 64, saltLength: 16 });

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * scrypt output is prefix-stable: a shorter key is a prefix of a longer one from
 * the same inputs. Refusing short keys stops a truncated stored hash verifying.
 */
export const MIN_KEY_LENGTH = 32;

const PREFIX = "scrypt";

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 1 && (n & (n - 1)) === 0;
}

function assertParams(params: ScryptParams): void {
  if (!isPowerOfTwo(params.N)) throw new RangeError(`scrypt N must be a power of two > 1, got ${params.N}`);
  if (!Number.isInteger(params.r) || params.r < 1) throw new RangeError(`scrypt r must be a positive integer`);
  if (!Number.isInteger(params.p) || params.p < 1) throw new RangeError(`scrypt p must be a positive integer`);
  if (!Number.isInteger(params.keyLength) || params.keyLength < MIN_KEY_LENGTH) {
    throw new RangeError(`scrypt keyLength must be >= ${MIN_KEY_LENGTH}`);
  }
  if (!Number.isInteger(params.saltLength) || params.saltLength < 8) throw new RangeError(`scrypt saltLength must be >= 8`);
}

/** Returns a problem with the password, or `null` when it is acceptable. Length bounds only. */
export function checkPasswordPolicy(password: unknown): string | null {
  if (typeof password !== "string") return "password must be a string";
  if (password.length < MIN_PASSWORD_LENGTH) return `password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > MAX_PASSWORD_LENGTH) return `password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  if (password.trim().length === 0) return "password must not be blank";
  return null;
}

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const options: ScryptOptions = { N: params.N, r: params.r, p: params.p, maxmem: 256 * params.N * params.r };
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, params.keyLength, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string, params: ScryptParams = DEFAULT_SCRYPT_PARAMS): Promise<string> {
  assertParams(params);
  const salt = randomBytes(params.saltLength);
  const key = await derive(password, salt, params);
  return [PREFIX, params.N, params.r, params.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export interface ParsedHash {
  params: ScryptParams;
  salt: Buffer;
  key: Buffer;
}

/** Splits a stored hash. Returns `null` for anything malformed so a corrupt record just fails verification. */
export function parseHash(stored: string): ParsedHash | null {
  if (typeof stored !== "string") return null;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== PREFIX) return null;

  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (!isPowerOfTwo(N) || !Number.isInteger(r) || r < 1 || !Number.isInteger(p) || p < 1) return null;

  const salt = Buffer.from(parts[4], "base64");
  const key = Buffer.from(parts[5], "base64");
  if (salt.length < 8 || key.length < MIN_KEY_LENGTH) return null;

  return { params: { N, r, p, keyLength: key.length, saltLength: salt.length }, salt, key };
}

/** Constant-time verification. Malformed hashes return `false`. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (parsed === null) return false;
  const candidate = await derive(password, parsed.salt, parsed.params);
  return candidate.length === parsed.key.length && timingSafeEqual(candidate, parsed.key);
}
