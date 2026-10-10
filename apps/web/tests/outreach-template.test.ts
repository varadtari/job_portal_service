import { describe, expect, it } from "vitest";
import { templateOutreach } from "@/lib/outreach/template";

const base = { candidateName: "Varad Tari", headline: "Backend Developer", company: "Acme", role: null, targetRole: "backend developer", contactName: null, skills: ["Go", "PostgreSQL", "Docker", "AWS"], location: "Pune" };

describe("templateOutreach", () => {
  it("varies wording across companies and stays factual", () => {
    const bodies = new Set(["Acme", "Globex", "Initech", "Umbrella", "Hooli"].map((c) => templateOutreach({ ...base, company: c }).body.split("\n")[2].replace(/Acme|Globex|Initech|Umbrella|Hooli/g, "X")));
    expect(bodies.size).toBeGreaterThan(1);
    const t = templateOutreach(base);
    expect(t.body).toContain("Go, PostgreSQL and Docker");
    expect(t.body).not.toContain("AWS");
    expect(t.body.trim().endsWith("Varad Tari")).toBe(true);
    expect(t.body).toMatch(/attached/);
  });
  it("uses the open role and the contact's first name", () => {
    const t = templateOutreach({ ...base, role: "Software Engineer II", contactName: "Priya Sharma" });
    expect(t.body.startsWith("Hi Priya,")).toBe(true);
    expect(`${t.subject} ${t.body}`).toContain("Software Engineer II");
  });
});
