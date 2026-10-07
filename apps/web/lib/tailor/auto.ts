import { and, desc, eq } from "drizzle-orm";
import { geminiConfigured, tailorWithGemini } from "@/lib/ai/gemini";
import { db, schema } from "@/lib/db";
import { getUserJob } from "@/lib/jobs/repo";
import { ResumeContent } from "@/lib/resume/types";
import { mergeTailored } from "./guard";
import { scoreResume, tailorByRules } from "./rules";

export type TailorMethod = "rules" | "gemini";

type Meta = { method: TailorMethod; scoreBefore: number | null; scoreAfter: number | null };

/** Saves a tailored resume for a job (shared by the review screen and one-click tailoring). */
export async function createTailoredResume(
  userId: string,
  job: { id: string; title: string; company: string },
  baseResumeId: string,
  content: ResumeContent,
  meta: Meta,
): Promise<string> {
  const [row] = await db()
    .insert(schema.resumes)
    .values({
      userId,
      kind: "tailored",
      jobId: job.id,
      baseResumeId,
      title: `${job.company} – ${job.title}`,
      content,
      tailorMeta: { ...meta, jobTitle: job.title, company: job.company },
    })
    .returning({ id: schema.resumes.id });
  return row.id;
}

export async function latestTailored(userId: string, jobId: string) {
  const [row] = await db()
    .select({ id: schema.resumes.id, tailorMeta: schema.resumes.tailorMeta })
    .from(schema.resumes)
    .where(and(eq(schema.resumes.userId, userId), eq(schema.resumes.jobId, jobId), eq(schema.resumes.kind, "tailored")))
    .orderBy(desc(schema.resumes.createdAt))
    .limit(1);
  return row ?? null;
}

export type AutoTailorResult =
  | { ok: true; resumeId: string; reused: boolean; method: TailorMethod; scoreBefore: number | null; scoreAfter: number | null; note?: string }
  | { ok: false; error: string };

/**
 * One-click tailoring: latest master resume → Gemini (guarded) or rules → saved tailored resume.
 * Reuses an existing tailored resume for the job unless `force`. Falls back to rules when Gemini
 * is unavailable, rate-limited or the description is too short.
 */
export async function autoTailor(userId: string, jobId: string, opts: { force?: boolean } = {}): Promise<AutoTailorResult> {
  if (!opts.force) {
    const existing = await latestTailored(userId, jobId);
    if (existing) {
      return {
        ok: true,
        resumeId: existing.id,
        reused: true,
        method: existing.tailorMeta?.method ?? "rules",
        scoreBefore: existing.tailorMeta?.scoreBefore ?? null,
        scoreAfter: existing.tailorMeta?.scoreAfter ?? null,
      };
    }
  }
  const [row, base] = await Promise.all([
    getUserJob(userId, jobId),
    db()
      .select()
      .from(schema.resumes)
      .where(and(eq(schema.resumes.userId, userId), eq(schema.resumes.kind, "master")))
      .orderBy(desc(schema.resumes.updatedAt))
      .limit(1)
      .then((r) => r[0]),
  ]);
  if (!row) return { ok: false, error: "Job not found." };
  const parsed = ResumeContent.safeParse(base?.content);
  if (!base || !parsed.success) return { ok: false, error: "Upload your master resume first (Resumes page)." };
  const job = row.job;
  const original = parsed.data;

  let content = tailorByRules(original, job.skills);
  let method: TailorMethod = "rules";
  let note: string | undefined;
  if (geminiConfigured() && job.description.trim().length >= 200) {
    try {
      const ai = await tailorWithGemini(original, job, job.skills);
      content = mergeTailored(original, ai).content;
      method = "gemini";
    } catch (e) {
      note = `Gemini unavailable (${(e as Error).message.slice(0, 80)}); used rule-based tailoring.`;
    }
  } else if (geminiConfigured()) {
    note = "Short job description, so rule-based tailoring was used.";
  }

  const scoreBefore = scoreResume(original, job.skills)?.score ?? null;
  const scoreAfter = scoreResume(content, job.skills)?.score ?? null;
  const resumeId = await createTailoredResume(userId, job, base.id, content, { method, scoreBefore, scoreAfter });
  return { ok: true, resumeId, reused: false, method, scoreBefore, scoreAfter, note };
}
