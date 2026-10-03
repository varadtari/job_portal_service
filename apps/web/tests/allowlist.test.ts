import { describe, expect, it } from "vitest";
import { isAllowed, parseAllowlist } from "@/lib/allowlist";

describe("allowlist", () => {
  const envList = parseAllowlist(" Me@Gmail.com, ,other@x.io ");

  it("matches env entries case-insensitively", () => {
    expect(isAllowed("me@gmail.com", envList, [])).toBe(true);
    expect(isAllowed("OTHER@X.IO", envList, [])).toBe(true);
  });

  it("matches db entries", () => {
    expect(isAllowed("friend@y.com", envList, ["Friend@Y.com"])).toBe(true);
  });

  it("rejects everyone else", () => {
    expect(isAllowed("stranger@z.com", envList, ["friend@y.com"])).toBe(false);
    expect(isAllowed(null, envList, [])).toBe(false);
    expect(isAllowed("", parseAllowlist(""), [])).toBe(false);
  });
});
