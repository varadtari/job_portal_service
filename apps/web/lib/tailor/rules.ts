import { resumeText } from "@/lib/resume/text";
import { extractSkills, matchSkills, type MatchResult } from "@/lib/match/skills";
import type { ResumeContent } from "@/lib/resume/types";

/** How many of the job's skills a piece of text mentions. */
export function relevance(text: string, jobSkills: Set<string>): number {
  return extractSkills(text).filter((s) => jobSkills.has(s)).length;
}

const stableSortBy = <T,>(items: T[], score: (t: T) => number) =>
  items
    .map((item, i) => ({ item, i, s: score(item) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);

export function scoreResume(r: ResumeContent, jobSkills: string[], extra: string[] = []): MatchResult {
  return matchSkills(jobSkills, new Set([...extractSkills(resumeText(r)), ...extra]));
}

/**
 * Free, deterministic tailoring: no rewording, only emphasis.
 * - bullets within each job/project: most relevant first (job order stays chronological)
 * - projects: most relevant first
 * - skills: matching items first; categories with more matches first
 */
export function tailorByRules(r: ResumeContent, jobSkillList: string[]): ResumeContent {
  const job = new Set(jobSkillList);
  const rel = (t: string) => relevance(t, job);
  return {
    ...r,
    experience: r.experience.map((e) => ({ ...e, bullets: stableSortBy(e.bullets, rel) })),
    projects: stableSortBy(
      r.projects.map((p) => ({ ...p, bullets: stableSortBy(p.bullets, rel) })),
      (p) => rel([p.name, ...p.tech, ...p.bullets].join("\n")),
    ),
    skills: stableSortBy(
      r.skills.map((s) => ({ ...s, items: stableSortBy(s.items, rel) })),
      (s) => s.items.filter((i) => rel(i) > 0).length,
    ),
    certifications: stableSortBy(r.certifications, (c) => rel(c.name)),
  };
}

/** Adds skills the user confirmed they have to an "Additional skills" category. */
export function addConfirmedSkills(r: ResumeContent, skills: string[]): ResumeContent {
  const existing = new Set(extractSkills(resumeText(r)));
  const add = skills.filter((s) => !existing.has(s));
  if (!add.length) return r;
  const idx = r.skills.findIndex((s) => /additional/i.test(s.category));
  const skillsCopy = r.skills.map((s) => ({ ...s, items: [...s.items] }));
  if (idx >= 0) skillsCopy[idx].items.push(...add);
  else skillsCopy.push({ category: "Additional skills", items: add });
  return { ...r, skills: skillsCopy };
}
