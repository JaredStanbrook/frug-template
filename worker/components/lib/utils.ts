import { hc } from "hono/client";
import { type AppType } from "@server/app";
import { safeNextPath } from "@server/lib/next-path";

const client = hc<AppType>("/");
export const api = client.api;

export type ToastType = "success" | "error" | "info" | "warning";

/**
 * The cookie that carries a toast across a navigation. The server writes it
 * with `flashToast` (worker/lib/htmx-helpers.ts) and `redirectWithToast` below
 * writes the same one, so one reader shows both. Listed in
 * worker/config/cookies.config.ts as strictly necessary.
 */
const FLASH_COOKIE = "flash-toast";

/**
 * Structural subset of a fetch response.
 *
 * The RPC client returns Hono's `ClientResponse`, not a DOM `Response`, and
 * the Workers runtime types make the two incompatible. Both satisfy this, so
 * error handling works for a raw `fetch` and an `api.*.$post()` alike.
 */
type ErrorResponse = {
  status: number;
  json(): Promise<unknown>;
};

/**
 * The server's error, as a sentence. Our routes send `{ error: "…" }`; this
 * also copes with an object in `error` (a validation error from code that does
 * not use worker/lib/validator.ts), which used to be shown as "[object Object]".
 */
export async function getErrorMessage(res: ErrorResponse) {
  const fallback =
    res.status >= 500
      ? "Something went wrong on our side. Please try again."
      : "That did not work. Please check the details and try again.";
  try {
    const data = (await res.json()) as any;
    const error = data?.error ?? data?.message;
    if (typeof error === "string" && error && !error.startsWith("[")) return error;
    const issue = error?.issues?.[0]?.message;
    return typeof issue === "string" ? issue : fallback;
  } catch {
    return fallback;
  }
}

export function toast(message: string, description: string = "", type: ToastType = "info") {
  const event = new CustomEvent("toast", {
    bubbles: true,
    composed: true,
    detail: { message, description, type, duration: 5000 },
  });
  window.dispatchEvent(event);
}

export function redirectWithToast(
  url: string,
  message: string,
  description: string = "",
  type: ToastType = "success",
) {
  const toast = { message, description, type, duration: 5000 };

  // Into the flash cookie, which the toaster on the next page reads. This used
  // to go into sessionStorage under a key nothing read, so every toast sent
  // across a redirect ("Login successful!", "Logged out") was silently lost.
  document.cookie =
    `${FLASH_COOKIE}=${encodeURIComponent(JSON.stringify({ toast }))}` +
    "; path=/; max-age=5; samesite=lax";

  // Perform hard redirect
  window.location.href = url;
}

/** Read and clear the flash toast, if there is one. */
export function getFlashToast() {
  const entry = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${FLASH_COOKIE}=`));
  if (!entry) return null;

  // Cleared first, so a message that cannot be read is not retried on every page.
  document.cookie = `${FLASH_COOKIE}=; max-age=0; path=/`;
  try {
    // Only this cookie's value is decoded: decoding the whole cookie string,
    // as this once did, threw on any other cookie holding a stray "%", and
    // split a message containing ";" in two.
    return JSON.parse(decodeURIComponent(entry.slice(FLASH_COOKIE.length + 1))).toast ?? null;
  } catch {
    return null;
  }
}

/**
 * Where to land after signing in or registering: the page in `?next=` when it
 * is on this site, else home. See `safeNextPath` for what is refused.
 */
export const nextPath = (): string =>
  safeNextPath(new URLSearchParams(window.location.search).get("next"));
