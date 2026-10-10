import { describe, expect, it } from "vitest";
import { isDue, nextFollowUpAt, type FollowUpApp } from "@/lib/followup/schedule";
import { pickContact } from "@/lib/followup/contact";
import { templateFollowUp } from "@/lib/followup/template";
import { buildMime } from "@/lib/gmail/mime";

const d = (s: string) => new Date(s + "T10:00:00Z");
const defaults = { followUpDefaultOn: true, followUpDefaultDays: 7, followUpDefaultMax: 2 };
const app = (p: Partial<FollowUpApp> = {}): FollowUpApp => ({
  status: "applied", appliedAt: d("2026-10-01"), lastEmailAt: null, lastFollowUpAt: null,
  followUpEnabled: null, followUpEveryDays: null, followUpMax: null, followUpCount: 0, ...p,
});

describe("follow-up schedule", () => {
  it("is due N days after applying, using defaults", () => {
    expect(nextFollowUpAt(app(), defaults)?.toISOString().slice(0, 10)).toBe("2026-10-08");
    expect(isDue(app(), defaults, d("2026-10-07"))).toBe(false);
    expect(isDue(app(), defaults, d("2026-10-08"))).toBe(true);
  });
  it("per-application settings override defaults; off means never", () => {
    expect(nextFollowUpAt(app({ followUpEveryDays: 3 }), defaults)?.toISOString().slice(0, 10)).toBe("2026-10-04");
    expect(nextFollowUpAt(app({ followUpEnabled: false }), defaults)).toBeNull();
    expect(nextFollowUpAt(app(), { ...defaults, followUpDefaultOn: false })).toBeNull();
    expect(nextFollowUpAt(app({ followUpEnabled: true }), { ...defaults, followUpDefaultOn: false })).not.toBeNull();
  });
  it("a company email or our last follow-up restarts the timer", () => {
    expect(nextFollowUpAt(app({ lastEmailAt: d("2026-10-05") }), defaults)?.toISOString().slice(0, 10)).toBe("2026-10-12");
    expect(nextFollowUpAt(app({ lastFollowUpAt: d("2026-10-08"), followUpCount: 1 }), defaults)?.toISOString().slice(0, 10)).toBe("2026-10-15");
  });
  it("stops at the maximum and after interviews, offers or rejections", () => {
    expect(nextFollowUpAt(app({ followUpCount: 2 }), defaults)).toBeNull();
    for (const status of ["interview", "offer", "rejected", "saved"]) expect(nextFollowUpAt(app({ status }), defaults)).toBeNull();
    expect(nextFollowUpAt(app({ status: "ghosted" }), defaults)).not.toBeNull();
    expect(nextFollowUpAt(app({ appliedAt: null }), defaults)).toBeNull();
  });
});

describe("pickContact", () => {
  it("skips no-reply and ATS senders, takes the newest human", () => {
    expect(pickContact(["Acme <no-reply@us.greenhouse-mail.io>", "Priya Shah <priya@acme.com>", "Bob <bob@acme.com>"])).toEqual({ name: "Priya Shah", email: "priya@acme.com" });
    expect(pickContact(["jobs-noreply@linkedin.com", "notifications@acme.com", null])).toBeNull();
    expect(pickContact(["recruiter@startup.io"])).toEqual({ name: null, email: "recruiter@startup.io" });
  });
});

describe("templateFollowUp", () => {
  const base = { candidateName: "Varad Tari", company: "Canonical", role: "Golang Engineer", appliedAt: d("2026-10-01"), contactName: "Priya Shah", highlight: "Building REST APIs in Go and Python", replyToSubject: null };
  it("first follow-up mentions role, date and a highlight", () => {
    const t = templateFollowUp({ ...base, followUpNumber: 1 });
    expect(t.subject).toBe("Following up on my application: Golang Engineer");
    expect(t.body).toContain("Hi Priya,");
    expect(t.body).toContain("Golang Engineer position at Canonical on 1 October");
    expect(t.body).toContain("building REST APIs in Go");
    expect(t.body.endsWith("Varad Tari")).toBe(true);
  });
  it("second is shorter and replies keep the thread subject", () => {
    const t = templateFollowUp({ ...base, followUpNumber: 2, replyToSubject: "Thank you for applying to Canonical" });
    expect(t.subject).toBe("Re: Thank you for applying to Canonical");
    expect(t.body.length).toBeLessThan(templateFollowUp({ ...base, followUpNumber: 1 }).body.length);
  });
});

describe("buildMime", () => {
  const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");
  it("threads replies and encodes UTF-8 safely", () => {
    const m = decode(buildMime({ from: "Varad <v@gmail.com>", to: "priya@acme.com", subject: "Re: Update – ₹ role", body: "Hi Priya,\nThanks!", inReplyTo: "<abc@mail.gmail.com>" }));
    expect(m).toContain("In-Reply-To: <abc@mail.gmail.com>");
    expect(m).toContain("References: <abc@mail.gmail.com>");
    expect(m).toMatch(/Subject: =\?UTF-8\?B\?/);
    const body = m.split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toBe("Hi Priya,\r\nThanks!");
  });
  it("blocks header injection", () => {
    const m = decode(buildMime({ from: "a@b.c", to: "x@y.z\r\nBcc: evil@z.z", subject: "s", body: "b" }));
    expect(m).not.toMatch(/\r\nBcc:/);
  });
});

describe("stale applications", () => {
  it("doesn't draft follow-ups more than 30 days after the last activity", () => {
    expect(isDue(app({ appliedAt: d("2026-07-01") }), defaults, d("2026-10-06"))).toBe(false);
    expect(isDue(app({ appliedAt: d("2026-07-01"), lastEmailAt: d("2026-09-25") }), defaults, d("2026-10-06"))).toBe(true);
  });
});

describe("buildMime attachments", () => {
  it("builds multipart/mixed with the PDF intact", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 255, 10, 13]);
    const m = Buffer.from(buildMime({ from: "a@b.c", to: "hr@acme.io", subject: "Backend role", body: "Hello", attachments: [{ filename: "Varad\r\nX: y Resume.pdf", contentType: "application/pdf", data: pdf }] }), "base64url").toString("utf8");
    const boundary = m.match(/boundary="([^"]+)"/)![1];
    const parts = m.split(`--${boundary}`).slice(1, -1);
    expect(parts).toHaveLength(2);
    expect(Buffer.from(parts[0].split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString()).toBe("Hello");
    expect(parts[1]).toContain('Content-Disposition: attachment; filename="Varad X: y Resume.pdf"');
    expect(new Uint8Array(Buffer.from(parts[1].split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64"))).toEqual(pdf);
    expect(m.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
    expect(m).not.toMatch(/\r\nX: y/);
  });
});
