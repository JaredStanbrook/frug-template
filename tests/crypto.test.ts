import { describe, it, expect } from "vitest";

import {
  DEFAULT_PBKDF2_ITERATIONS,
  MAX_PBKDF2_ITERATIONS,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "../worker/lib/crypto";
import { parseHashIterations } from "../worker/config/auth.config";

/**
 * Cloudflare's WebCrypto refuses PBKDF2 above 100,000 rounds. Node's does not,
 * so a too-high cost passes every other test here and then fails every sign-up
 * and sign-in in production. These pin the limit down on the Node side.
 */
describe("PBKDF2 cost stays inside the Workers limit", () => {
  it("defaults to the Workers maximum, and never above it", () => {
    expect(MAX_PBKDF2_ITERATIONS).toBe(100_000);
    expect(DEFAULT_PBKDF2_ITERATIONS).toBeLessThanOrEqual(MAX_PBKDF2_ITERATIONS);
  });

  it("clamps a configured cost that the runtime would refuse", () => {
    expect(parseHashIterations("210000")).toBe(MAX_PBKDF2_ITERATIONS);
    expect(parseHashIterations("50000")).toBe(50_000);
    expect(parseHashIterations("")).toBe(DEFAULT_PBKDF2_ITERATIONS);
    expect(parseHashIterations(undefined)).toBe(DEFAULT_PBKDF2_ITERATIONS);
    expect(parseHashIterations("nonsense")).toBe(DEFAULT_PBKDF2_ITERATIONS);
  });

  it("never writes a hash above the limit, even when asked to", async () => {
    const stored = await hashPassword("correct horse battery staple", 210_000);
    expect(stored.startsWith(`pbkdf2-sha256$${MAX_PBKDF2_ITERATIONS}$`)).toBe(true);
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("does not ask to re-hash towards a cost it cannot reach", async () => {
    const stored = await hashPassword("correct horse battery staple", MAX_PBKDF2_ITERATIONS);
    expect(needsRehash(stored, 210_000)).toBe(false);
  });
});
