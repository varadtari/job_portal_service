"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserId } from "@/auth";
import { db, schema } from "@/lib/db";
import { parseResumeText, type ParseMethod } from "@/lib/resume/parse";
import { detectMime, extractResumeText } from "@/lib/resume/extract";
import { MAX_RESUME_BYTES, RESUME_MIME, ResumeContent } from "@/lib/resume/types";
import { fillMissingProfileFields } from "@/lib/profile/repo";
import { profileFromResume } from "@/lib/profile/from-resume";
import { putObject, removeObject } from "@/lib/storage";

const r = schema.resumes;

export type ActionState = { error?: string; ok?: string } | undefined;

async function parseAndStore(userId: string, id: string, rawText: string): Promise<ParseMethod> {
  const { content, method } = await parseResumeText(rawText);
  await db().update(r).set({ content }).where(and(eq(r.id, id), eq(r.userId, userId)));
  await fillMissingProfileFields(userId, profileFromResume(content));
  return method;
}

export async function uploadResume(_: ActionState, form: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF or DOCX file." };
  if (file.size > MAX_RESUME_BYTES) return { error: "File is larger than 4 MB." };
  const mime = detectMime(file.name, file.type);
  if (!mime) return { error: "Only PDF and DOCX files are supported." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  let rawText: string;
  try {
    rawText = await extractResumeText(bytes.slice(), mime);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't read this file." };
  }

  const id = randomUUID();
  const storagePath = `${userId}/${id}.${mime === RESUME_MIME.pdf ? "pdf" : "docx"}`;
  await putObject(storagePath, bytes, mime);
  const title = String(form.get("title") || "").trim() || file.name.replace(/\.(pdf|docx)$/i, "");
  await db().insert(r).values({ id, userId, kind: "master", title, storagePath, rawText });

  const method = await parseAndStore(userId, id, rawText);
  revalidatePath("/resumes");
  revalidatePath("/profile");
  redirect(`/resumes/${id}?parsed=${method}`);
}

export async function reparseResume(id: string): Promise<ActionState> {
  const userId = await requireUserId();
  const [row] = await db().select().from(r).where(and(eq(r.id, id), eq(r.userId, userId)));
  if (!row?.rawText) return { error: "Resume not found." };
  await parseAndStore(userId, id, row.rawText);
  revalidatePath(`/resumes/${id}`);
  return { ok: "Re-parsed." };
}

export async function saveResumeContent(id: string, title: string, content: unknown): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = ResumeContent.safeParse(content);
  if (!parsed.success) return { error: "Invalid resume data." };
  await db()
    .update(r)
    .set({ content: parsed.data, title: title.trim() || "Untitled resume" })
    .where(and(eq(r.id, id), eq(r.userId, userId)));
  revalidatePath(`/resumes/${id}`);
  revalidatePath("/resumes");
  return { ok: "Saved." };
}

export async function deleteResume(id: string) {
  const userId = await requireUserId();
  const [row] = await db().delete(r).where(and(eq(r.id, id), eq(r.userId, userId))).returning();
  if (row?.storagePath) await removeObject(row.storagePath).catch(() => {});
  revalidatePath("/resumes");
  redirect("/resumes");
}
