// utils/crypto.ts - Using Web Crypto API

/**
 * Generate a random string of specified length
 */
export function randomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

/**
 * Generate a random base64url string
 */
export function randomBase64Url(byteLength: number = 32): string {
  const array = new Uint8Array(byteLength);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * How many PBKDF2 rounds a new password hash gets.
 *
 * OWASP's current advice for PBKDF2-SHA256 is 600,000. This template runs on
 * Workers, where every round is CPU charged to the request and a sign-in has
 * to finish inside the plan's CPU budget — 600,000 rounds is roughly a quarter
 * of a second of pure compute per login. 210,000 is the compromise: a little
 * over twice the work this used to do, comfortably inside that budget.
 *
 * It is not a permanent choice, which is the point of the format below. The
 * stored hash records the cost it was made with, `needsRehash` reports when one
 * is behind, and the auth service re-hashes on the next successful sign-in — so
 * raising this number upgrades every active account on its own, with no reset
 * emails and no downtime. Set PASSWORD_HASH_ITERATIONS to override it.
 */
export const DEFAULT_PBKDF2_ITERATIONS = 210_000;

/** What the legacy `salt.hash` format was always hashed with. */
const LEGACY_ITERATIONS = 100_000;

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

const fromBase64Url = (value: string) => {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const derive = async (password: string, salt: Uint8Array, iterations: number) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return toBase64Url(new Uint8Array(bits));
};

/**
 * Parse either hash format.
 *
 * Current: `pbkdf2-sha256$<iterations>$<salt>$<hash>`
 * Legacy:  `<salt>.<hash>`, which was always 100,000 rounds.
 *
 * Recording the parameters next to the hash is what makes the cost changeable
 * at all. With the number living only in the code, the day you raise it every
 * existing password stops verifying — which is why, in practice, it never gets
 * raised.
 */
const parseHash = (stored: string) => {
  if (stored.startsWith("pbkdf2-sha256$")) {
    const [, iterations, salt, hash] = stored.split("$");
    const rounds = Number(iterations);
    if (!salt || !hash || !Number.isInteger(rounds) || rounds <= 0) return null;
    return { iterations: rounds, salt, hash };
  }

  const [salt, hash] = stored.split(".");
  if (!salt || !hash) return null;
  return { iterations: LEGACY_ITERATIONS, salt, hash };
};

/**
 * Hash a password with PBKDF2-SHA256 and a random 16-byte salt.
 */
export async function hashPassword(
  password: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const hash = await derive(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${toBase64Url(salt)}$${hash}`;
}

/**
 * Verify a password against a stored hash, in whichever format it was written.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parsed = parseHash(stored);
    if (!parsed) return false;

    const actual = await derive(password, fromBase64Url(parsed.salt), parsed.iterations);
    return constantTimeEqual(actual, parsed.hash);
  } catch {
    return false;
  }
}

/**
 * Whether this hash was made with less work than we now do.
 *
 * Callers re-hash on a successful sign-in, when the plaintext is in hand and
 * the upgrade costs nothing. The alternative is asking every user to reset a
 * password that was never actually compromised.
 */
export function needsRehash(
  stored: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
): boolean {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  return parsed.iterations < iterations;
}

/**
 * Hash a secret (for session tokens)
 */
export async function hashSecret(secret: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function constantTimeEqual(a: string | Uint8Array, b: string | Uint8Array): boolean {
  // Convert to Uint8Array if strings
  const aArr = typeof a === "string" ? new TextEncoder().encode(a) : a;
  const bArr = typeof b === "string" ? new TextEncoder().encode(b) : b;

  if (aArr.length !== bArr.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < aArr.length; i++) {
    result |= aArr[i] ^ bArr[i];
  }

  return result === 0;
}

/**
 * Generate a random PIN of specified length
 */
export function generatePin(length: number = 6): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => (byte % 10).toString()).join("");
}

/**
 * Generate a TOTP secret (base32 encoded)
 */
export function generateTotpSecret(): string {
  const array = new Uint8Array(20); // 160 bits
  crypto.getRandomValues(array);

  // Base32 encode
  const base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < array.length; i++) {
    value = (value << 8) | array[i];
    bits += 8;

    while (bits >= 5) {
      output += base32chars[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += base32chars[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Verify TOTP code
 */
export async function verifyTotpCode(
  secret: string,
  code: string,
  window: number = 1,
): Promise<boolean> {
  // Decode base32 secret
  const base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < secret.length; i++) {
    const idx = base32chars.indexOf(secret[i].toUpperCase());
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  const key = new Uint8Array(output);

  // Get current time step (30-second intervals)
  const timeStep = Math.floor(Date.now() / 1000 / 30);

  // Check current time step and adjacent windows
  for (let i = -window; i <= window; i++) {
    const counter = timeStep + i;
    const generatedCode = await generateTotpCode(key, counter);

    if (constantTimeEqual(code, generatedCode)) {
      return true;
    }
  }

  return false;
}

/**
 * Generate TOTP code for a given counter
 */
async function generateTotpCode(key: Uint8Array, counter: number): Promise<string> {
  // Convert counter to 8-byte buffer (big-endian)
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(4, counter, false); // big-endian

  // Import key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  // Generate HMAC
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, buffer);
  const signatureArray = new Uint8Array(signature);

  // Dynamic truncation
  const offset = signatureArray[signatureArray.length - 1] & 0x0f;
  const code =
    (((signatureArray[offset] & 0x7f) << 24) |
      ((signatureArray[offset + 1] & 0xff) << 16) |
      ((signatureArray[offset + 2] & 0xff) << 8) |
      (signatureArray[offset + 3] & 0xff)) %
    1000000;

  return code.toString().padStart(6, "0");
}

/**
 * Base64URL encoding/decoding utilities
 */
export const isoBase64URL = {
  toBuffer: (base64url: string): Uint8Array => {
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  },

  fromBuffer: (buffer: Uint8Array): string => {
    const binary = String.fromCharCode(...buffer);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  },
};
