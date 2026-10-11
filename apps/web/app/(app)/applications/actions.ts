"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserId } from "@/auth";
import { db, schema } from "@/lib/db";
import { STATUSES, type AppStatus } from "@/lib/applications/repo";
import { GmailReconnectError } from "@/lib/gmail/client";
import { nextStatus, type EmailType, type Status } from "@/lib/gmail/classify";
import { syncGmail } from "@/lib/gmail/sync";
import { recomputeStatus } from "@/lib/applications/status";

const a = schema.applications;
const ev = schema.applicationEvents;

const revalidate = () => {
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
};

export async function syncGmailNow(): Promise<{ ok?: string; error?: string; reconnect?: boolean }> {
  const userId = await requireUserId();
  try {
    const s = await syncGmail(userId);
    revalidate();
    const parts = [
      `${s.processed} new email${s.processed === 1 ? "" : "s"}`,
      s.matched && `${s.matched} matched`,
      s.created && `${s.created} application${s.created === 1 ? "" : "s"} added`,
      s.review && `${s.review} to review`,
      s.ghosted && `${s.ghosted} marked no response`,
      s.alertJobs && `${s.alertJobs} job${s.alertJobs === 1 ? "" : "s"} from alert emails added to Jobs`,
    ].filter(Boolean);
    return { ok: `Gmail synced: ${parts.join(", ")}.` };
  } catch (e) {
    if (e instanceof GmailReconnectError) return { error: "Gmail access expired. Sign out and sign in again to reconnect.", reconnect: true };
    return { error: `Gmail sync failed: ${(e as Error).message}` };
  }
}

export async function setStatus(id: string, status: string) {
  const userId = await requireUserId();
  if (!STATUSES.includes(status as AppStatus)) return;
  const [app] = await db().select().from(a).where(and(eq(a.id, id), eq(a.userId, userId)));
  if (!app) return;
  await db()
    .update(a)
    .set({ status: status as AppStatus, ...(status !== "saved" && !app.appliedAt ? { appliedAt: new Date() } : {}) })
    .where(eq(a.id, id));
  await db().insert(ev).values({ userId, applicationId: id, type: "manual", subject: `Status changed to ${status}`, occurredAt: new Date() });
  revalidate();
  revalidatePath(`/applications/${id}`);
}

export async function saveNotes(id: string, notes: string) {
  const userId = await requireUserId();
  await db().update(a).set({ notes: notes.slice(0, 5000) }).where(and(eq(a.id, id), eq(a.userId, userId)));
  revalidatePath(`/applications/${id}`);
}

export async function deleteApplication(id: string) {
  const userId = await requireUserId();
  await db().delete(a).where(and(eq(a.id, id), eq(a.userId, userId)));
  revalidate();
  redirect("/applications");
}

export async function addApplication(_: unknown, form: FormData): Promise<{ error?: string } | undefined> {
  const userId = await requireUserId();
  const company = String(form.get("company") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  if (!company || !title) return { error: "Company and role are required." };
  const status = (STATUSES.includes(String(form.get("status")) as AppStatus) ? String(form.get("status")) : "applied") as AppStatus;
  const [row] = await db()
    .insert(a)
    .values({ userId, company, title, url: String(form.get("url") ?? "").trim() || null, status, appliedAt: status === "saved" ? null : new Date() })
    .returning({ id: a.id });
  revalidate();
  redirect(`/applications/${row.id}`);
}

/** Resolves a "Needs review" email: attach it to an application, create one from it, or dismiss it. */
export async function resolveEvent(eventId: string, action: { attachTo?: string; create?: { company: string; title: string }; dismiss?: boolean }) {
  const userId = await requireUserId();
  const [event] = await db().select().from(ev).where(and(eq(ev.id, eventId), eq(ev.userId, userId)));
  if (!event) return;
  if (action.dismiss) {
    await db().update(ev).set({ needsReview: false, type: "other" }).where(eq(ev.id, eventId));
    revalidate();
    return;
  }
  let appId = action.attachTo;
  if (action.create) {
    const company = action.create.company.trim().slice(0, 200);
    const title = action.create.title.trim().slice(0, 200) || "Role from email";
    if (!company) return;
    const [row] = await db().insert(a).values({ userId, company, title, status: "applied", appliedAt: event.occurredAt }).returning({ id: a.id });
    appId = row.id;
  }
  if (!appId) return;
  const [app] = await db().select().from(a).where(and(eq(a.id, appId), eq(a.userId, userId)));
  if (!app) return;
  await db().update(ev).set({ applicationId: app.id, needsReview: false }).where(eq(ev.id, eventId));
  const status = nextStatus(app.status as Status, event.type as EmailType);
  await db()
    .update(a)
    .set({ status, lastEmailAt: !app.lastEmailAt || app.lastEmailAt < event.occurredAt ? event.occurredAt : app.lastEmailAt })
    .where(eq(a.id, app.id));
  revalidate();
}

/** "Wrong application": sends an email back to Needs review and recalculates the application's status without it. */
export async function detachEvent(eventId: string) {
  const userId = await requireUserId();
  const [event] = await db().select().from(ev).where(and(eq(ev.id, eventId), eq(ev.userId, userId)));
  if (!event?.applicationId || event.type === "manual") return;
  await db().update(ev).set({ applicationId: null, needsReview: true }).where(eq(ev.id, eventId));
  await recomputeStatus(event.applicationId);
  revalidate();
  revalidatePath(`/applications/${event.applicationId}`);
}
