import { describe, it, expect } from "vitest";
import { safeNextPath, withNext } from "../worker/lib/next-path";

/**
 * `?next=` decides where a browser goes straight after someone types their
 * password, so anything that would leave the site has to come back as "/".
 */
describe("safeNextPath", () => {
  it("keeps a path on this site, with its query and fragment", () => {
    expect(safeNextPath("/notes")).toBe("/notes");
    expect(safeNextPath("/book?step=details&session=10#top")).toBe(
      "/book?step=details&session=10#top",
    );
  });

  it("sends anything that leaves the site home", () => {
    for (const value of [
      "//evil.example",
      "/\\evil.example",
      // Browsers drop tabs and newlines before parsing, leaving `//evil…`.
      "/\t/evil.example",
      "/\n/evil.example",
      "https://evil.example/",
      "javascript:alert(1)",
      "evil.example",
      "",
      null,
      undefined,
    ]) {
      expect(safeNextPath(value), JSON.stringify(value)).toBe("/");
    }
  });
});

describe("withNext", () => {
  it("adds ?next= only when there is somewhere to go back to", () => {
    expect(withNext("/login", "/")).toBe("/login");
    expect(withNext("/login", "/notes?q=a&b=1")).toBe("/login?next=%2Fnotes%3Fq%3Da%26b%3D1");
  });
});
