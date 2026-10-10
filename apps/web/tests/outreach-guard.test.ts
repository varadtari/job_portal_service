import { describe, expect, it } from "vitest";
import { contactBlock } from "@/lib/outreach/service";

const now = new Date("2026-10-10T12:00:00Z").getTime();
const daysAgo = (n: number) => new Date(now - n * 86400_000);

describe("contactBlock", () => {
  it("allows new contacts and ones emailed 60+ days ago", () => {
    expect(contactBlock({ status: "new", lastEmailedAt: null }, now)).toBeNull();
    expect(contactBlock({ status: "emailed", lastEmailedAt: daysAgo(61) }, now)).toBeNull();
  });
  it("blocks repeats within 60 days and replied/bounced/do-not-contact", () => {
    expect(contactBlock({ status: "emailed", lastEmailedAt: daysAgo(10) }, now)).toMatch(/10 days ago/);
    for (const status of ["replied", "bounced", "do_not_contact"]) expect(contactBlock({ status, lastEmailedAt: null }, now)).not.toBeNull();
  });
});
