"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserId } from "@/auth";
import { geminiConfigured, tailorWithGemini } from "@/lib/ai/gemini";
import { db, schema } from "@/lib/db";
import { getUserJob } from "@/lib/jobs/repo";
import { ResumeContent } from "@/lib/resume/types";
import { mergeTailored, type Warning } from "@/lib/tailor/guard";
import { createTailoredResume } from "@/lib/tailor/auto";

async function loadBase(userId: string, resumeId: string) {
  const [row] = await db()
    .select()
    .from(schema.resumes)
    .where(and(eq(schema.resumes.id, resumeId), eq(schema.resumes.userId, userId)));
  const parsed = ResumeContent.safeParse(row?.content);
  return parsed.success ? { row, content: parsed.data } : null;
}

export type GeminiResult = { proposal?: ResumeContent; warnings?: Warning[]; notes?: string[]; error?: string };

export async function tailorWithAI(jobId: string, baseResumeId: string): Promise<GeminiResult> {
  const userId = await requireUserId();
  if (!geminiConfigured()) return { error: "Gemini isn't configured (GEMINI_API_KEY)." };
  const [job, base] = await Promise.all([getUserJob(userId, jobId), loadBase(userId, baseResumeId)]);
  if (!job) return { error: "Job not found." };
  if (!base) return { error: "Resume not found or not parsed yet." };
  if (job.job.description.trim().length < 200) return { error: "This job has too little description to tailor against. Add the full description first." };
  try {
    const ai = await tailorWithGemini(base.content, job.job, job.job.skills);
    const { content, warnings } = mergeTailored(base.content, ai);
    return { proposal: content, warnings, notes: ai.notes.slice(0, 4) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function saveTailored(input: {
  jobId: string;
  baseResumeId: string;
  content: unknown;
  method: "rules" | "gemini";
  scoreBefore: number | null;
  scoreAfter: number | null;
}): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const parsed = ResumeContent.safeParse(input.content);
  if (!parsed.success) return { error: "Invalid resume data." };
  const job = await getUserJob(userId, input.jobId);
  if (!job) return { error: "Job not found." };
  const id = await createTailoredResume(userId, job.job, input.baseResumeId, parsed.data, {
    method: input.method,
    scoreBefore: input.scoreBefore,
    scoreAfter: input.scoreAfter,
  });
  revalidatePath("/resumes");
  redirect(`/resumes/${id}?tailored=1`);
}
