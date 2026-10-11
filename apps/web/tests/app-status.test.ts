import { describe, expect, it } from "vitest";
import { statusFromEvents } from "@/lib/applications/status";

const e = (type: string, day: number, subject: string | null = null) => ({ type, subject, occurredAt: new Date(2026, 9, day) });

describe("statusFromEvents", () => {
  it("rebuilds the status after a wrong rejection is removed", () => {
    expect(statusFromEvents([e("applied_confirm", 2), e("oa", 8)], "applied")).toBe("oa");
    expect(statusFromEvents([e("applied_confirm", 2), e("rejection", 6), e("oa", 8)], "applied")).toBe("rejected");
  });
  it("keeps a manual status until a later email moves it", () => {
    expect(statusFromEvents([e("applied_confirm", 2), e("manual", 3, "Status changed to interview")], "applied")).toBe("interview");
    expect(statusFromEvents([e("manual", 3, "Status changed to oa"), e("interview", 5)], "applied")).toBe("interview");
  });
});
