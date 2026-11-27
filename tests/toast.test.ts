import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getFlashToast, redirectWithToast } from "../worker/components/lib/utils";

/**
 * The toast that crosses a navigation: written by `redirectWithToast` (or the
 * server's `flashToast`), read by the toaster on the next page.
 *
 * The writer once put it in sessionStorage and the reader only looked at the
 * cookie, so "Login successful!", "Logged out" and every other redirect toast
 * vanished, and nothing failed. This pins the two ends to each other.
 */

/** Just enough of `document.cookie` and `window.location` for the two functions. */
const fakeBrowser = (initial: Record<string, string> = {}) => {
  const jar = new Map(Object.entries(initial));
  const g = globalThis as any;
  g.document = {
    get cookie() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    set cookie(line: string) {
      const [pair, ...attrs] = line.split(";").map((s) => s.trim());
      const at = pair.indexOf("=");
      const name = pair.slice(0, at);
      if (attrs.some((a) => /^max-age=0$/i.test(a) || /^expires=.*1970/i.test(a))) jar.delete(name);
      else jar.set(name, pair.slice(at + 1));
    },
  };
  g.window = { location: { href: "" } };
  return jar;
};

let saved: { document: unknown; window: unknown };
beforeEach(() => {
  saved = { document: (globalThis as any).document, window: (globalThis as any).window };
});
afterEach(() => {
  (globalThis as any).document = saved.document;
  (globalThis as any).window = saved.window;
});

describe("flash toasts", () => {
  it("carries a client redirect's toast to the reader, once", () => {
    const jar = fakeBrowser();
    redirectWithToast("/", "Login successful!", "Welcome back; good to see you.", "success");

    expect((globalThis as any).window.location.href).toBe("/");
    expect(getFlashToast()).toMatchObject({
      message: "Login successful!",
      description: "Welcome back; good to see you.",
      type: "success",
    });
    expect(jar.has("flash-toast")).toBe(false);
    expect(getFlashToast()).toBeNull();
  });

  it("reads the server's flash cookie, which Hono URI-encodes", () => {
    const toast = { message: "Logged out successfully", type: "success", duration: 4000 };
    fakeBrowser({ "flash-toast": encodeURIComponent(JSON.stringify({ toast })) });
    expect(getFlashToast()).toEqual(toast);
  });

  it("is not thrown off by another cookie, or by a value it cannot read", () => {
    const toast = { message: "Saved" };
    fakeBrowser({
      other: "100%-not-encoded",
      "flash-toast": encodeURIComponent(JSON.stringify({ toast })),
    });
    expect(getFlashToast()).toEqual(toast);

    const jar = fakeBrowser({ "flash-toast": "%7Bbroken" });
    expect(getFlashToast()).toBeNull();
    expect(jar.has("flash-toast")).toBe(false);
  });
});
