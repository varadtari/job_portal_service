import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { geminiConfigured, writeFollowUpWithGemini } from "@/lib/ai/gemini";
import { db, schema } from "@/lib/db";
import { accessToken } from "@/lib/gmail/client";
import { GmailSendPermissionError, messageMeta, sendEmail } from "@/lib/gmail/send";
import { sendPush } from "@/lib/push";
import { ResumeContent } from "@/lib/resume/types";
import { pickContact } from "./contact";
import { isDue, type FollowUpDefaults } from "./schedule";
import { templateFollowUp } from "./template";

const a = schema.applications;
const ev = schema.applicationEvents;
const fu = schema.followUps;

export const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const canSend = (scopes: string | null | undefined) => !!scopes?.split(/\s+/).includes(SEND_SCOPE);

async function loadContext(userId: string, applicationId: string) {
  const [[app], [user], events, [resume], profile] = await Promise.all([
    db().select().from(a).where(and(eq(a.id, applicationId), eq(a.userId, userId))),
    db().select().from(schema.users).where(eq(schema.users.id, userId)),
    db().select().from(ev).where(and(eq(ev.applicationId, applicationId), ne(ev.type, "manual"), ne(ev.type, "other"))).orderBy(desc(ev.occurredAt)),
    db().select({ content: schema.resumes.content }).from(schema.resumes).where(and(eq(schema.resumes.userId, userId), eq(schema.resumes.kind, "master"))).orderBy(desc(schema.resumes.updatedAt)).limit(1),
    db().select().from(schema.profileFields).where(and(eq(schema.profileFields.userId, userId), inArray(schema.profileFields.key, ["first_name", "last_name"]))),
  ]);
  return { app, user, events, resume: ResumeContent.safeParse(resume?.content).data ?? null, profile };
}

/** The email to reply to: the newest company email we have a Gmail id for. */
const replyTarget = (events: (typeof schema.applicationEvents.$inferSelect)[]) => events.find((e) => e.emailMessageId && e.subject) ?? null;

/** Creates (or returns the pending) follow-up draft for an application. Never sends. */
export async function prepareDraft(userId: string, applicationId: string, opts: { regenerate?: boolean } = {}) {
  const { app, user, events, resume, profile } = await loadContext(userId, applicationId);
  if (!app || !user) throw new Error("Application not found");
  const [pending] = await db().select().from(fu).where(and(eq(fu.applicationId, applicationId), eq(fu.status, "draft"))).orderBy(desc(fu.createdAt)).limit(1);
  if (pending && !opts.regenerate) return pending;

  const contact = app.contactEmail ? { email: app.contactEmail, name: app.contactName } : pickContact(events.map((e) => e.fromAddress));
  const target = replyTarget(events);
  const name = [profile.find((p) => p.key === "first_name")?.value, profile.find((p) => p.key === "last_name")?.value].filter(Boolean).join(" ") || user.name || "";
  const skills = resume ? resume.skills.flatMap((s) => s.items).slice(0, 6) : [];
  const highlight = resume?.basics.headline ? `as a ${resume.basics.headline.split("|")[0].trim()}` : null;
  const input = {
    candidateName: name,
    company: app.company,
    role: app.title,
    appliedAt: app.appliedAt,
    followUpNumber: app.followUpCount + 1,
    contactName: contact?.name ?? null,
    highlight,
    replyToSubject: target?.subject ?? null,
  };

  let text = templateFollowUp(input);
  let method = "template";
  if (geminiConfigured()) {
    try {
      text = await writeFollowUpWithGemini({ ...input, appliedOn: app.appliedAt?.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) ?? null, skills });
      method = "gemini";
    } catch {
      // Template already prepared
    }
  }

  if (pending) await db().update(fu).set({ status: "dismissed" }).where(eq(fu.id, pending.id));
  const [draft] = await db()
    .insert(fu)
    .values({ userId, applicationId, toAddress: contact?.email ?? null, subject: text.subject, body: text.body, method, threadId: target?.emailMessageId ?? null })
    .returning();
  return draft;
}

/** Sends a reviewed draft from the user's Gmail (threaded under the company's last email when possible). */
export async function sendDraft(userId: string, draftId: string, edits: { to: string; subject: string; body: string }) {
  const [draft] = await db().select().from(fu).where(and(eq(fu.id, draftId), eq(fu.userId, userId)));
  if (!draft || draft.status !== "draft") throw new Error("This draft was already sent or discarded.");
  const [user] = await db().select().from(schema.users).where(eq(schema.users.id, userId));
  if (!canSend(user?.googleScopes)) throw new GmailSendPermissionError();
  const to = edits.to.trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) throw new Error("Enter a valid recipient email address.");
  if (!edits.subject.trim() || !edits.body.trim()) throw new Error("Subject and message can't be empty.");

  const token = await accessToken(user!.googleRefreshTokenEnc!);
  const replyTo = draft.threadId ? await messageMeta(token, draft.threadId) : null;
  const sent = await sendEmail(token, { from: user!.name ? `${user!.name} <${user!.email}>` : user!.email, to, subject: edits.subject.trim(), body: edits.body.trim(), replyTo });

  const now = new Date();
  await db().update(fu).set({ status: "sent", sentAt: now, toAddress: to, subject: edits.subject.trim(), body: edits.body.trim(), gmailMessageId: sent.id, inReplyTo: replyTo?.messageIdHeader ?? null }).where(eq(fu.id, draftId));
  const [app] = await db().select().from(a).where(eq(a.id, draft.applicationId));
  await db()
    .update(a)
    .set({ followUpCount: (app?.followUpCount ?? 0) + 1, lastFollowUpAt: now, contactEmail: to })
    .where(eq(a.id, draft.applicationId));
  await db().insert(ev).values({ userId, applicationId: draft.applicationId, type: "manual", subject: `Follow-up sent to ${to}`, snippet: edits.body.trim().slice(0, 300), emailMessageId: sent.id, occurredAt: now });
  return { gmailId: sent.id, threadId: sent.threadId };
}

/** Cron: create drafts for due follow-ups and notify. Returns how many drafts were created. */
export async function runDueFollowUps(userId: string): Promise<number> {
  const [user] = await db().select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return 0;
  const defaults: FollowUpDefaults = { followUpDefaultOn: user.followUpDefaultOn, followUpDefaultDays: user.followUpDefaultDays, followUpDefaultMax: user.followUpDefaultMax };
  const apps = await db().select().from(a).where(and(eq(a.userId, userId), inArray(a.status, ["applied", "oa", "ghosted"])));
  const pending = new Set(
    (await db().select({ id: fu.applicationId }).from(fu).where(and(eq(fu.userId, userId), eq(fu.status, "draft")))).map((r) => r.id),
  );
  let created = 0;
  for (const app of apps) {
    if (pending.has(app.id) || !isDue(app, defaults)) continue;
    const draft = await prepareDraft(userId, app.id).catch(() => null);
    if (!draft) continue;
    created++;
    if (created <= 5) {
      await sendPush(userId, { title: `Follow-up ready: ${app.company}`, body: `Review and send your follow-up for ${app.title}.`, url: `/applications/${app.id}?followup=${draft.id}`, tag: `followup-${app.id}` }).catch(() => 0);
    }
  }
  return created;
}
