import type { ResumeContent } from "@/lib/resume/types";

export type Choices = { summary: boolean; skills: boolean; experience: boolean[]; projects: boolean[] };

export const allTailored = (base: ResumeContent): Choices => ({
  summary: true,
  skills: true,
  experience: base.experience.map(() => true),
  projects: base.projects.map(() => true),
});

/**
 * Builds the final resume from the original and a proposal, block by block.
 * Experience is aligned by position (proposals never reorder jobs); projects by name
 * (rule-based tailoring reorders them), using the proposal's project order.
 */
export function assemble(base: ResumeContent, proposal: ResumeContent, c: Choices): ResumeContent {
  const projectByName = new Map(base.projects.map((p, i) => [p.name, i]));
  return {
    ...proposal,
    basics: c.summary ? proposal.basics : base.basics,
    skills: c.skills ? proposal.skills : base.skills,
    experience: base.experience.map((e, i) => (c.experience[i] ? (proposal.experience[i] ?? e) : e)),
    projects: proposal.projects.map((p) => {
      const i = projectByName.get(p.name);
      return i !== undefined && !c.projects[i] ? base.projects[i] : p;
    }),
  };
}
