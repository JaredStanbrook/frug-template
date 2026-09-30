import { describe, it, expect, vi, afterEach } from "vitest";

import { isOverdue, relativeDueLabel, today } from "../worker/lib/dates";
import { parseAppConfig } from "../worker/config/app.config";

/**
 * "Today" depends on where you are. At 01:00 UTC on 1 March it is already
 * 1 March in Perth (UTC+8) but still 28 February in Los Angeles — so a
 * "due today" screen built on UTC is wrong for most of the world for part of
 * every day. APP_TIMEZONE fixes that without moving how dates are stored.
 */
describe("today() in the site's time zone", () => {
  afterEach(() => vi.useRealTimers());

  it("is the UTC date with no zone, and the local date with one", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T01:00:00Z"));

    expect(today()).toBe("2026-03-01");
    expect(today("Australia/Perth")).toBe("2026-03-01");
    expect(today("America/Los_Angeles")).toBe("2026-02-28");
  });

  it("lets 'overdue' and 'due today' follow that day", () => {
    const from = "2026-02-28";
    expect(isOverdue("2026-02-27", from)).toBe(true);
    expect(isOverdue("2026-02-28", from)).toBe(false);
    expect(relativeDueLabel("2026-02-28", from)).toBe("due today");
    expect(relativeDueLabel("2026-03-01", from)).toBe("due tomorrow");
  });

  it("falls back to UTC for a missing or mistyped APP_TIMEZONE", () => {
    expect(parseAppConfig({}).timezone).toBe("UTC");
    expect(parseAppConfig({ APP_TIMEZONE: "Australia/Perth" }).timezone).toBe("Australia/Perth");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseAppConfig({ APP_TIMEZONE: "Mars/Olympus_Mons" }).timezone).toBe("UTC");
    warn.mockRestore();
  });
});
