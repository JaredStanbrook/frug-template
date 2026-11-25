import { hc } from "hono/client";
import { type AppType } from "@server/app";

const client = hc<AppType>("/");
export const api = client.api;

export type ToastType = "success" | "error" | "info" | "warning";

const FLASH_TOAST_KEY = "pending_toast";

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
  const toastData = {
    message,
    description,
    type,
    duration: 5000,
  };

  // Save to session storage
  sessionStorage.setItem(FLASH_TOAST_KEY, JSON.stringify(toastData));

  // Perform hard redirect
  window.location.href = url;
}

export function getFlashToast() {
  const name = "flash-toast=";
  const decodedCookie = decodeURIComponent(document.cookie);
  const ca = decodedCookie.split(";");

  for (let i = 0; i < ca.length; i++) {
    const c = ca[i].trim();
    if (c.indexOf(name) === 0) {
      const jsonStr = c.substring(name.length, c.length);
      try {
        const data = JSON.parse(jsonStr);
        // DELETE COOKIE: Set expiry to the past
        document.cookie = "flash-toast=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        return data.toast; // Returns { message, description, type, etc. }
      } catch {
        return null;
      }
    }
  }
  return null;
}
