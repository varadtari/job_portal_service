"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/auth";
import { db, schema } from "@/lib/db";
import { prepareDraft, sendDraft } from "@/lib/followup/service";
import { GmailSendPermissionError } from "@/lib/gmail/send";

export type Draft = { id: string; to: string | null; subject: string; body: string; method: string };

const toDraft = (d: typeof schema.followUps.$inferSelect): Draft => ({ id: d.id, to: d.toAddress, subject: d.subject, body: d.body, method: d.method });

export async function saveFollowUpSettings(
  applicationId: string,
  s: { enabled: boolean | null; everyDays: number | null; max: number | null; contactEmail: string | null },
) {
  const userId = await requireUserId();
  const clamp = (n: number | null, lo: number, hi: number) => (n === null ? null : Math.min(hi, Math.max(lo, Math.round(n))));
  const email = s.contactEmail?.trim() || null;
  if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return { error: "That email address doesn't look right." };
  await db()
    .update(schema.applications)
    .set({ followUpEnabled: s.enabled, followUpEveryDays: clamp(s.everyDays, 1, 60), followUpMax: clamp(s.max, 1, 5), contactEmail: email })
    .where(and(eq(schema.applications.id, applicationId), eq(schema.applications.userId, userId)));
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/applications");
  return { ok: true };
}

export async function writeFollowUp(applicationId: string, regenerate = false): Promise<{ draft?: Draft; error?: string }> {
  const userId = await requireUserId();
  try {
    const d = await prepareDraft(userId, applicationId, { regenerate });
    revalidatePath("/applications");
    return { draft: toDraft(d) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function sendFollowUp(draftId: string, applicationId: string, edits: { to: string; subject: string; body: string }): Promise<{ ok?: true; error?: string; needsPermission?: boolean }> {
  const userId = await requireUserId();
  try {
    await sendDraft(userId, draftId, edits);
  } catch (e) {
    return { error: (e as Error).message, needsPermission: e instanceof GmailSendPermissionError };
  }
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/applications");
  return { ok: true };
}

export async function discardFollowUp(draftId: string, applicationId: string) {
  const userId = await requireUserId();
  await db()
    .update(schema.followUps)
    .set({ status: "dismissed" })
    .where(and(eq(schema.followUps.id, draftId), eq(schema.followUps.userId, userId)));
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/applications");
}

export async function saveFollowUpDefaults(d: { on: boolean; days: number; max: number }) {
  const userId = await requireUserId();
  await db()
    .update(schema.users)
    .set({ followUpDefaultOn: d.on, followUpDefaultDays: Math.min(60, Math.max(1, Math.round(d.days))), followUpDefaultMax: Math.min(5, Math.max(1, Math.round(d.max))) })
    .where(eq(schema.users.id, userId));
  revalidatePath("/settings");
  revalidatePath("/applications");
}

/** Re-consent with Google (adds the Gmail send permission). */
export async function reconnectGoogle() {
  const { signOut } = await import("@/auth");
  await signOut({ redirectTo: "/login" });
}
