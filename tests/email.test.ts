import { describe, it, expect, vi, afterEach } from "vitest";
import { linkEmail, sendEmail, emailFlowsAvailable } from "../worker/services/email.service";

const message = linkEmail({
  to: "member@example.com",
  subject: "Reset your <Test> password",
  intro: "Someone asked to reset it.",
  action: "Choose a new password",
  url: "https://app.test/reset-password?token=abc&x=<y>",
  outro: "If it was not you, ignore this.",
});

afterEach(() => vi.restoreAllMocks());

describe("email service", () => {
  it("never logs the message, link included, outside local development", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => void lines.push(a.join(" ")));
    vi.spyOn(console, "warn").mockImplementation((...a) => void lines.push(a.join(" ")));

    for (const ORIGIN of ["https://app.test", undefined]) {
      expect(await sendEmail({ ORIGIN }, message), String(ORIGIN)).toBe(false);
    }
    // Workers Logs keeps what is logged, and a reset link is a password.
    expect(lines.join("\n")).not.toContain("token=");
    expect(lines.join("\n")).toContain("EMAIL_FROM");
  });

  it("prints the message instead on localhost, so links can be followed", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => void lines.push(a.join(" ")));

    expect(await sendEmail({ ORIGIN: "http://localhost:3000" }, message)).toBe(true);
    expect(lines.join("\n")).toContain("token=abc");
    expect(emailFlowsAvailable({ ORIGIN: "http://localhost:3000" })).toBe(true);
    expect(emailFlowsAvailable({ ORIGIN: "https://app.test" })).toBe(false);
  });

  it("reports a refused send as false rather than throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const EMAIL = {
      send: async () => {
        throw Object.assign(new Error("domain not onboarded"), {
          code: "E_SENDER_DOMAIN_NOT_AVAILABLE",
        });
      },
    } as any;

    expect(await sendEmail({ EMAIL, EMAIL_FROM: "noreply@app.test" }, message)).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("E_SENDER_DOMAIN_NOT_AVAILABLE"),
    );
  });

  it("escapes the HTML part", () => {
    expect(message.html).not.toContain("<y>");
    expect(message.html).toContain("&amp;x=&lt;y&gt;");
    expect(message.text).toContain("https://app.test/reset-password?token=abc&x=<y>");
  });
});
