import { z } from "zod";

// Structured resume. Nullable (not optional) fields keep the schema valid for structured outputs.
export const ResumeContent = z.object({
  basics: z.object({
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
    headline: z.string().nullable().describe("One-line professional title, e.g. 'Senior Backend Engineer'"),
    summary: z.string().nullable(),
    links: z.array(z.object({ label: z.string(), url: z.string() })),
  }),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      location: z.string().nullable(),
      start: z.string().nullable().describe("As written, e.g. 'Jan 2022' or '2022'"),
      end: z.string().nullable().describe("null when current"),
      current: z.boolean(),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string().nullable(),
      field: z.string().nullable(),
      start: z.string().nullable(),
      end: z.string().nullable(),
      grade: z.string().nullable(),
      details: z.array(z.string()),
    }),
  ),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  projects: z.array(
    z.object({
      name: z.string(),
      url: z.string().nullable(),
      tech: z.array(z.string()),
      bullets: z.array(z.string()),
    }),
  ),
  certifications: z.array(z.object({ name: z.string(), issuer: z.string().nullable(), date: z.string().nullable() })),
  // Anything else: awards, languages, publications, volunteering
  extra: z.array(z.object({ heading: z.string(), items: z.array(z.string()) })),
});

export type ResumeContent = z.infer<typeof ResumeContent>;

export const MAX_RESUME_BYTES = 4 * 1024 * 1024;

export const RESUME_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;
