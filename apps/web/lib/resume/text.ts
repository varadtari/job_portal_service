import type { ResumeContent } from "./types";

/** Flattens the parts of a resume that describe skills and experience (for keyword matching). */
export function resumeText(r: ResumeContent): string {
  return [
    r.basics.headline,
    r.basics.summary,
    ...r.skills.flatMap((s) => s.items),
    ...r.experience.flatMap((e) => [e.title, ...e.bullets]),
    ...r.projects.flatMap((p) => [p.name, ...p.tech, ...p.bullets]),
    ...r.certifications.map((c) => c.name),
  ]
    .filter(Boolean)
    .join("\n");
}
