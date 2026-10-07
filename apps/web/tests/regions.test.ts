import { describe, expect, it } from "vitest";
import { detectCountry } from "@/lib/jobs/regions";

describe("detectCountry", () => {
  it.each([
    ["Bengaluru, Karnataka, India", "IN"], ["Bangalore", "IN"], ["Pune, Maharashtra", "IN"], ["Gurugram", "IN"], ["Remote (India)", "IN"],
    ["Bangalore, IND; Hyderabad, IND", "IN"], ["Goa, India", "IN"],
    ["San Francisco, CA", "US"], ["New York, NY", "US"], ["Seattle, WA / Remote", "US"], ["Remote - US", "US"], ["United States", "US"], ["Austin, Texas", "US"],
    ["Toronto, Ontario, Canada", "CA"], ["Toronto, Vancouver, Canada-Remote", "CA"],
    ["London, United Kingdom", "GB"], ["Remote - UK", "GB"], ["Dublin, Ireland", "IE"],
    ["Berlin, Germany", "DE"], ["Amsterdam", "NL"], ["Dubai, UAE", "AE"], ["Singapore", "SG"], ["Sydney, Australia", "AU"],
    ["Tokyo, Japan", "JP"], ["São Paulo, Brazil", "BR"],
  ])("%s → %s", (loc, code) => expect(detectCountry(loc)).toBe(code));

  it.each([["Remote"], ["Worldwide"], ["Anywhere"], ["Remote - EMEA"], ["APAC"], [""], [null]])("unknown: %s", (loc) => expect(detectCountry(loc as string | null)).toBeNull());

  it("doesn't mistake words for US state codes", () => {
    expect(detectCountry("Remote, or Hybrid")).toBeNull();
    expect(detectCountry("Co-located team")).toBeNull();
  });
});

import { rotatingCountry } from "@/lib/jobs/sources/region";

describe("rotatingCountry", () => {
  it("cycles through 8 countries day by day", () => {
    const days = Array.from({ length: 8 }, (_, i) => rotatingCountry(new Date(Date.UTC(2026, 9, 1 + i, 12))));
    expect(new Set(days).size).toBe(8);
    expect(rotatingCountry(new Date(Date.UTC(2026, 9, 9, 12)))).toBe(days[0]);
  });
});
