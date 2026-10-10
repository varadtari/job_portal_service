import { describe, expect, it } from "vitest";
import { extractEmails } from "@/lib/outreach/extract";

describe("extractEmails", () => {
  it("keeps hiring addresses and classifies role vs person", () => {
    const r = extractEmails("Send your CV to careers@acme.io or priya.s@acme.io. Questions: privacy@acme.io");
    expect(r).toEqual([
      { email: "careers@acme.io", domain: "acme.io", kind: "role" },
      { email: "priya.s@acme.io", domain: "acme.io", kind: "person" },
    ]);
  });
  it("drops EEO, accommodation, no-reply, ATS and webmail addresses", () => {
    const t = "EEOCompliance@spacex.com accommodations@stripe.com no-reply@acme.com jobs@greenhouse.io someone@gmail.com logo@2x.png";
    expect(extractEmails(t)).toEqual([]);
    const help = "candidate_accessibility@samsara.com accessibleinterviewing@agilebits.com assistance@zuora.com askpeople@clickup.com candidate.exp@newrelic.com hiring@jobalerts.cisco.com";
    expect(extractEmails(help)).toEqual([]);
  });
  it("allows webmail when asked (manual import)", () => {
    expect(extractEmails("hr.startup@gmail.com", { allowWebmail: true })[0]?.email).toBe("hr.startup@gmail.com");
  });
  it("decodes obfuscated addresses", () => {
    expect(extractEmails("mail hr [at] tesslo [dot] com today").map((e) => e.email)).toEqual(["hr@tesslo.com"]);
    expect(extractEmails("jobs(at)foo.in").map((e) => e.email)).toEqual(["jobs@foo.in"]);
  });
});
