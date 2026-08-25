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

export async function getErrorMessage(res: ErrorResponse) {
  try {
    const data = (await res.json()) as any;
    return data?.error || data?.message || "An unexpected error occurred";
  } catch {
    return `Request failed with status ${res.status}`;
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
