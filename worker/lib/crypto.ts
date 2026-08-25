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
 * Hash a password using SHA-256 with salt
 * Format: salt.hash (both base64url encoded)
 */
export async function hashPassword(password: string): Promise<string> {
  // Generate random salt
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  // Derive key using PBKDF2
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const key = await crypto.subtle.importKey("raw", passwordBuffer, { name: "PBKDF2" }, false, [
    "deriveBits",
  ]);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000, // Adjust based on your security requirements
      hash: "SHA-256",
    },
    key,
    256, // 32 bytes
  );

  // Convert to base64url
  const saltB64 = btoa(String.fromCharCode(...salt))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(derivedBits)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${saltB64}.${hashB64}`;
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const [saltB64, expectedHashB64] = hash.split(".");
    if (!saltB64 || !expectedHashB64) return false;

    // Decode salt from base64url
    const saltStr = atob(saltB64.replace(/-/g, "+").replace(/_/g, "/"));
    const salt = new Uint8Array(saltStr.length);
    for (let i = 0; i < saltStr.length; i++) {
      salt[i] = saltStr.charCodeAt(i);
    }

    // Derive key with same parameters
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    const key = await crypto.subtle.importKey("raw", passwordBuffer, { name: "PBKDF2" }, false, [
      "deriveBits",
    ]);

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      key,
      256,
    );

    const actualHashB64 = btoa(String.fromCharCode(...new Uint8Array(derivedBits)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    // Constant-time comparison
    return constantTimeEqual(actualHashB64, expectedHashB64);
  } catch {
    return false;
  }
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
