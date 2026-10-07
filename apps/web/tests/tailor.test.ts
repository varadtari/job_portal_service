import { describe, expect, it } from "vitest";
import { addConfirmedSkills, scoreResume, tailorByRules } from "@/lib/tailor/rules";
import { mergeTailored } from "@/lib/tailor/guard";
import type { ResumeContent } from "@/lib/resume/types";

const resume: ResumeContent = {
  basics: { name: "A", email: null, phone: null, location: null, headline: "Engineer", summary: "Builds things.", links: [] },
  experience: [
    { company: "Acme", title: "SDE", location: null, start: "2022", end: null, current: true, bullets: ["Wrote docs for the team", "Built Kafka consumers in Go processing 2M events/day", "Set up Docker builds"] },
    { company: "Beta", title: "Intern", location: null, start: "2021", end: "2022", current: false, bullets: ["Made a React dashboard"] },
  ],
  education: [],
  skills: [{ category: "Tools", items: ["Excel", "Docker", "Kafka"] }, { category: "Languages", items: ["Python", "Go"] }],
  projects: [
    { name: "Blog", url: null, tech: ["Hugo"], bullets: ["Static site"] },
    { name: "Stream processor", url: null, tech: ["Go", "Kafka"], bullets: ["Real-time pipeline"] },
  ],
  certifications: [],
  extra: [],
};
const job = ["Go", "Kafka", "Docker", "AWS"];

describe("tailorByRules", () => {
  const t = tailorByRules(resume, job);
  it("moves relevant bullets up but keeps job order", () => {
    expect(t.experience.map((e) => e.company)).toEqual(["Acme", "Beta"]);
    expect(t.experience[0].bullets[0]).toMatch(/Kafka/);
    expect(t.experience[0].bullets.at(-1)).toBe("Wrote docs for the team");
  });
  it("puts relevant projects and skills first", () => {
    expect(t.projects[0].name).toBe("Stream processor");
    expect(t.skills[0].items.slice(0, 2)).toEqual(["Docker", "Kafka"]);
  });
  it("doesn't change content, only order", () => {
    expect(t.experience[0].bullets.slice().sort()).toEqual(resume.experience[0].bullets.slice().sort());
  });
});

describe("scoring and confirmed skills", () => {
  it("scores and improves only with confirmed skills", () => {
    expect(scoreResume(resume, job)?.score).toBe(75);
    const withAws = addConfirmedSkills(resume, ["AWS"]);
    expect(withAws.skills.at(-1)).toEqual({ category: "Additional skills", items: ["AWS"] });
    expect(scoreResume(withAws, job)?.score).toBe(100);
  });
});

describe("mergeTailored guardrails", () => {
  const ai = {
    headline: "Backend Engineer (Go, Kafka)",
    summary: "Backend engineer focused on Go and Kafka.",
    experience: [
      { company: "Acme", bullets: ["Built Go Kafka consumers processing 2M events/day", "Cut costs by 35% with Docker", "Docs", "Extra 1", "Extra 2"] },
      { company: "Beta", bullets: [] },
    ],
    projects: [{ name: "Stream processor", bullets: ["Real-time Go/Kafka pipeline"] }],
    skills: [{ category: "Backend", items: ["Go", "Kafka", "AWS", "Docker"] }],
    notes: [],
  };
  const { content, warnings } = mergeTailored(resume, ai);

  it("keeps facts from the original", () => {
    expect(content.experience.map((e) => [e.company, e.title, e.start])).toEqual([["Acme", "SDE", "2022"], ["Beta", "Intern", "2021"]]);
    expect(content.basics.summary).toBe("Backend engineer focused on Go and Kafka.");
  });
  it("caps bullet count and keeps originals when AI returns none", () => {
    expect(content.experience[0].bullets).toHaveLength(3);
    expect(content.experience[1].bullets).toEqual(["Made a React dashboard"]);
  });
  it("matches projects by name", () => {
    expect(content.projects.find((p) => p.name === "Stream processor")?.bullets).toEqual(["Real-time Go/Kafka pipeline"]);
    expect(content.projects.find((p) => p.name === "Blog")?.bullets).toEqual(["Static site"]);
  });
  it("drops unevidenced skills and keeps forgotten originals", () => {
    const all = content.skills.flatMap((s) => s.items);
    expect(all).not.toContain("AWS");
    expect(all).toEqual(expect.arrayContaining(["Go", "Kafka", "Docker", "Excel", "Python"]));
    expect(warnings.some((w) => w.section === "Skills" && /AWS/.test(w.message))).toBe(true);
  });
  it("flags invented numbers", () => {
    expect(warnings.some((w) => /35%/.test(w.message))).toBe(true);
    expect(warnings.some((w) => /2M/.test(w.message))).toBe(false);
  });
});

import { attachmentHeader } from "@/lib/export/sections";

describe("attachmentHeader", () => {
  it("is header-safe ASCII with a UTF-8 alternative", () => {
    const h = attachmentHeader("Asha Kulkarni – Clera – Backend Engineer / Pune", "pdf");
    expect([...h].every((c) => c.charCodeAt(0) < 256)).toBe(true);
    expect(h).toContain('filename="Asha_Kulkarni_-_Clera_-_Backend_Engineer_Pune.pdf"');
    expect(h).toContain("filename*=UTF-8''Asha%20Kulkarni%20%E2%80%93%20Clera");
  });
});
