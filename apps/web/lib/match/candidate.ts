import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resumeText } from "@/lib/resume/text";
import type { ResumeContent } from "@/lib/resume/types";
import { extractSkills } from "./skills";

/** Skills from the user's most recently updated master resume. */
export async function candidateSkills(userId: string): Promise<{ skills: Set<string>; hasResume: boolean }> {
  const [row] = await db()
    .select({ content: schema.resumes.content })
    .from(schema.resumes)
    .where(and(eq(schema.resumes.userId, userId), eq(schema.resumes.kind, "master")))
    .orderBy(desc(schema.resumes.updatedAt))
    .limit(1);
  if (!row?.content) return { skills: new Set(), hasResume: false };
  return { skills: new Set(extractSkills(resumeText(row.content as ResumeContent))), hasResume: true };
}
