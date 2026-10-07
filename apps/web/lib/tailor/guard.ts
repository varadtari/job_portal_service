import { resumeText } from "@/lib/resume/text";
import { extractSkills } from "@/lib/match/skills";
import type { ResumeContent } from "@/lib/resume/types";
import type { TailorOutput } from "./schema";

export type Warning = { section: string; message: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const numbers = (s: string) => new Set(s.match(/\d+(?:[.,]\d+)?\s*%?|\$\s?\d+|₹\s?\d+/g)?.map((n) => n.replace(/\s/g, "")) ?? []);

/**
 * Applies AI suggestions onto the original resume without letting it change facts:
 * employers, titles, dates, education and contact details always come from the original.
 * Flags bullets with numbers that don't appear in the original entry (possible invented metrics)
 * and drops skills that aren't evidenced anywhere in the original resume.
 */
export function mergeTailored(original: ResumeContent, ai: TailorOutput): { content: ResumeContent; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const evidenced = new Set(extractSkills(resumeText(original)).map(norm));
  const originalSkillItems = new Set(original.skills.flatMap((s) => s.items).map(norm));

  const pickEntry = <T extends { bullets: string[] }>(
    orig: T,
    key: string,
    candidates: { key: string; bullets: string[] }[],
    i: number,
    label: string,
    allKeys: Set<string>,
  ): T => {
    // Match by name; fall back to position only if that entry isn't named after a different original
    const byIndex = candidates[i] && (!allKeys.has(norm(candidates[i].key)) || norm(candidates[i].key) === norm(key)) ? candidates[i] : undefined;
    const match = candidates.find((c) => norm(c.key) === norm(key)) ?? byIndex;
    const bullets = (match?.bullets ?? []).map((b) => b.trim()).filter(Boolean);
    if (!bullets.length) return orig;
    if (bullets.length > orig.bullets.length + 1) {
      warnings.push({ section: label, message: `Suggested ${bullets.length} bullets for ${orig.bullets.length} originals; extra ones were dropped.` });
    }
    const allowed = bullets.slice(0, Math.max(orig.bullets.length, 1));
    const origNums = numbers(orig.bullets.join(" "));
    for (const b of allowed) {
      const invented = [...numbers(b)].filter((n) => !origNums.has(n));
      if (invented.length) warnings.push({ section: label, message: `Check “${b.slice(0, 70)}…”: ${invented.join(", ")} isn't in your original bullets.` });
    }
    return { ...orig, bullets: allowed };
  };

  const companies = new Set(original.experience.map((e) => norm(e.company)));
  const projectNames = new Set(original.projects.map((p) => norm(p.name)));
  const experience = original.experience.map((e, i) =>
    pickEntry(e, e.company, ai.experience.map((x) => ({ key: x.company, bullets: x.bullets })), i, `${e.title} @ ${e.company}`, companies),
  );
  const projects = original.projects.map((p, i) =>
    pickEntry(p, p.name, ai.projects.map((x) => ({ key: x.name, bullets: x.bullets })), i, `Project: ${p.name}`, projectNames),
  );

  // Skills: keep AI ordering/grouping, but only items the resume already supports
  const dropped: string[] = [];
  const skills = ai.skills
    .map((cat) => ({
      category: cat.category.trim() || "Skills",
      items: [...new Set(cat.items.map((s) => s.trim()).filter(Boolean))].filter((item) => {
        const ok = originalSkillItems.has(norm(item)) || extractSkills(item).some((s) => evidenced.has(norm(s)));
        if (!ok) dropped.push(item);
        return ok;
      }),
    }))
    .filter((c) => c.items.length);
  // Never lose an original skill the AI forgot
  const kept = new Set(skills.flatMap((s) => s.items).map(norm));
  const forgotten = original.skills.flatMap((s) => s.items).filter((i) => !kept.has(norm(i)));
  if (forgotten.length) skills.push({ category: "Other skills", items: forgotten });
  if (dropped.length) warnings.push({ section: "Skills", message: `Removed skills not found in your resume: ${dropped.join(", ")}. Add them yourself only if you have them.` });

  return {
    content: {
      ...original,
      basics: {
        ...original.basics,
        headline: ai.headline?.trim() || original.basics.headline,
        summary: ai.summary?.trim() || original.basics.summary,
      },
      experience,
      projects,
      skills: skills.length ? skills : original.skills,
    },
    warnings,
  };
}
