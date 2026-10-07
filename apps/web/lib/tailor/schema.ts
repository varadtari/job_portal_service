import { z } from "zod";

// What the AI returns: only the parts it may reword. Facts are merged back from the original (guard.ts).
export const TailorOutput = z.object({
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  experience: z.array(z.object({ company: z.string(), bullets: z.array(z.string()) })),
  projects: z.array(z.object({ name: z.string(), bullets: z.array(z.string()) })),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  notes: z.array(z.string()).describe("Short suggestions for the candidate, e.g. gaps worth addressing"),
});

export type TailorOutput = z.infer<typeof TailorOutput>;
