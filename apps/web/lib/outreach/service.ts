// Outreach drafts and sending. Nothing is sent without the user's click; guardrails are enforced here, not in the UI.
import { and, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { geminiConfigured, writeOutreachWithGemini } from "@/lib/ai/gemini";
import { db, schema } from "@/lib/db";
import { canSend } from "@/lib/followup/service";
import { accessToken } from "@/lib/gmail/client";
import { GmailSendPermissionError, sendEmail } from "@/lib/gmail/send";
import { extractSkills } from "@/lib/match/skills";
import { ResumeContent } from "@/lib/resume/types";
import { templateOutreach, type OutreachInput } from "./template";

const c = schema.outreachContacts;
const oe = schema.outreachEmails;

export const REPEAT_DAYS = 60;
const DAY = 86400_000;
const BLOCKED = ["replied", "bounced", "do_not_contact"] as const;

/** Why a contact can't be emailed now, or null if it can. */
export function contactBlock(ct: { status: string; lastEmailedAt: Date | null }, now = Date.now()): string | null {
  if ((BLOCKED as readonly string[]).includes(ct.status)) return ct.status === "do_not_contact" ? "Marked do not contact" : `Already ${ct.status}`;
  if (ct.lastEmailedAt && now - ct.lastEmailedAt.getTime() < REPEAT_DAYS * DAY) return `Emailed ${Math.floor((now - ct.lastEmailedAt.getTime()) / DAY)} days ago (wait ${REPEAT_DAYS} days)`;
  return null;
}

/** Sends in the last 24 hours vs the user's cap. */
export async function quota(userId: string): Promise<{ cap: number; used: number; left: number }> {
  const [[user], [row]] = await Promise.all([
    db().select({ cap: schema.users.outreachDailyCap }).from(schema.users).where(eq(schema.users.id, userId)),
    db().select({ n: sql<number>`count(*)::int` }).from(oe).where(and(eq(oe.userId, userId), inArray(oe.status, ["sent", "sending"]), gt(oe.sentAt, new Date(Date.now() - DAY)))),
  ]);
  const cap = user?.cap ?? 25;
  return { cap, used: row?.n ?? 0, left: Math.max(0, cap - (row?.n ?? 0)) };
}

async function masterResume(userId: string) {
  const [row] = await db()
    .select({ id: schema.resumes.id, content: schema.resumes.content })
    .from(schema.resumes)
    .where(and(eq(schema.resumes.userId, userId), eq(schema.resumes.kind, "master")))
    .orderBy(desc(schema.resumes.updatedAt))
    .limit(1);
  const content = ResumeContent.safeParse(row?.content).data;
  return row && content ? { id: row.id, content } : null;
}

async function candidate(userId: string) {
  const [[user], profile, [search], resume] = await Promise.all([
    db().select().from(schema.users).where(eq(schema.users.id, userId)),
    db().select().from(schema.profileFields).where(and(eq(schema.profileFields.userId, userId), inArray(schema.profileFields.key, ["first_name", "last_name", "city"]))),
    db().select({ q: schema.savedSearches.query }).from(schema.savedSearches).where(eq(schema.savedSearches.userId, userId)).limit(1),
    masterResume(userId),
  ]);
  const p = (k: string) => profile.find((f) => f.key === k)?.value ?? null;
  const name = [p("first_name"), p("last_name")].filter(Boolean).join(" ") || resume?.content.basics.name || user?.name || "";
  const headline = resume?.content.basics.headline ?? null;
  const targetRole = (search?.q.split(/[,/|]/)[0].trim() || headline?.split("|")[0].trim() || "software engineer").toLowerCase();
  return { user, name, headline, targetRole, city: p("city") ?? resume?.content.basics.location ?? null, resume };
}

/** The contact's matching open role at that company (the job it came from, else the newest job there). */
async function matchingJob(userId: string, ct: typeof c.$inferSelect) {
  const j = schema.jobs;
  if (ct.source === "job_post" && ct.sourceRef && /^[0-9a-f-]{36}$/.test(ct.sourceRef)) {
    const [job] = await db().select({ title: j.title, skills: j.skills }).from(j).where(eq(j.id, ct.sourceRef));
    if (job) return job;
  }
  if (!ct.company) return null;
  const [job] = await db()
    .select({ title: j.title, skills: j.skills })
    .from(j)
    .innerJoin(schema.userJobs, and(eq(schema.userJobs.jobId, j.id), eq(schema.userJobs.userId, userId), eq(schema.userJobs.hidden, false)))
    .where(sql`lower(${j.company}) = lower(${ct.company})`)
    .orderBy(desc(j.postedAt))
    .limit(1);
  return job ?? null;
}

const companyName = (ct: typeof c.$inferSelect) => ct.company || ct.domain.split(".").slice(-2, -1)[0].replace(/^./, (x) => x.toUpperCase());

/** Creates (or returns the pending) draft for a contact. Never sends. */
export async function prepareDraft(userId: string, contactId: string, opts: { regenerate?: boolean } = {}) {
  const [ct] = await db().select().from(c).where(and(eq(c.id, contactId), eq(c.userId, userId)));
  if (!ct) throw new Error("Contact not found");
  const block = contactBlock(ct);
  if (block) throw new Error(block);
  const [pending] = await db().select().from(oe).where(and(eq(oe.contactId, contactId), eq(oe.status, "draft"))).limit(1);
  if (pending && !opts.regenerate) return pending;

  const me = await candidate(userId);
  if (!me.resume) throw new Error("Upload a master resume first. It's attached to every outreach email.");
  const job = await matchingJob(userId, ct);
  const mine = extractSkills(me.resume.content.skills.flatMap((s) => s.items).join(", "));
  const relevant = job?.skills.length ? mine.filter((s) => job.skills.includes(s)) : [];
  const input: OutreachInput = {
    candidateName: me.name,
    headline: me.headline,
    company: companyName(ct),
    role: job?.title ?? null,
    targetRole: me.targetRole,
    contactName: ct.kind === "person" ? ct.name : null,
    skills: [...relevant, ...mine.filter((s) => !relevant.includes(s))].slice(0, 3),
    location: me.city,
  };
  let text = templateOutreach(input, ct.email);
  let method = "template";
  if (geminiConfigured()) {
    try {
      text = await writeOutreachWithGemini(input);
      method = "gemini";
    } catch {
      // template already prepared
    }
  }
  if (pending) {
    const [row] = await db().update(oe).set({ subject: text.subject, body: text.body, method, resumeId: me.resume.id }).where(eq(oe.id, pending.id)).returning();
    return row;
  }
  const [row] = await db().insert(oe).values({ userId, contactId, subject: text.subject, body: text.body, method, resumeId: me.resume.id }).returning();
  return row;
}

/** Sends one reviewed draft with the master resume attached. Enforces the daily cap and the repeat rule. */
export async function sendOutreach(userId: string, emailId: string, edits?: { subject: string; body: string }) {
  const [draft] = await db().select().from(oe).where(and(eq(oe.id, emailId), eq(oe.userId, userId)));
  if (!draft || !["draft", "failed"].includes(draft.status)) throw new Error("This email was already sent or dismissed.");
  const [ct] = await db().select().from(c).where(eq(c.id, draft.contactId));
  const block = ct ? contactBlock(ct) : "Contact not found";
  if (block) throw new Error(block);
  const q = await quota(userId);
  if (q.left <= 0) throw new Error(`Daily limit reached (${q.cap} emails in 24 hours). The rest stay as drafts; send them tomorrow.`);
  const [user] = await db().select().from(schema.users).where(eq(schema.users.id, userId));
  if (!canSend(user?.googleScopes) || !user?.googleRefreshTokenEnc) throw new GmailSendPermissionError();
  const subject = (edits?.subject ?? draft.subject).trim();
  const body = (edits?.body ?? draft.body).trim();
  if (!subject || !body) throw new Error("Subject and message can't be empty.");
  const resume = await masterResume(userId);
  if (!resume) throw new Error("Upload a master resume first.");

  // Claim the draft so a double click / two tabs can't send it twice
  const now = new Date();
  const [claimed] = await db()
    .update(oe)
    .set({ status: "sending", subject, body, sentAt: now, error: null, resumeId: resume.id })
    .where(and(eq(oe.id, emailId), inArray(oe.status, ["draft", "failed"])))
    .returning({ id: oe.id });
  if (!claimed) throw new Error("This email is already being sent.");
  try {
    const { resumeToPdf } = await import("@/lib/export/pdf");
    const pdf = await resumeToPdf(resume.content);
    const filename = `${(resume.content.basics.name || "").replace(/[\\/:*?"<>|]+/g, "").trim()} Resume.pdf`.trim();
    const token = await accessToken(user.googleRefreshTokenEnc);
    const sent = await sendEmail(token, {
      from: user.name ? `${user.name} <${user.email}>` : user.email,
      to: ct!.email,
      subject,
      body,
      attachments: [{ filename, contentType: "application/pdf", data: new Uint8Array(pdf) }],
    });
    await db().update(oe).set({ status: "sent", gmailMessageId: sent.id, threadId: sent.threadId, sentAt: new Date() }).where(eq(oe.id, emailId));
    await db().update(c).set({ status: "emailed", lastEmailedAt: new Date() }).where(eq(c.id, ct!.id));
    return { gmailId: sent.id, threadId: sent.threadId, left: q.left - 1 };
  } catch (e) {
    await db().update(oe).set({ status: "failed", sentAt: null, error: String((e as Error).message).slice(0, 300) }).where(eq(oe.id, emailId));
    throw e;
  }
}

type ThreadMsg = { id: string; payload?: { headers?: { name: string; value: string }[] } };

/** Cron: marks contacts who replied (and adds the reply to Needs review) or whose email bounced. */
export async function checkOutreachReplies(userId: string, token: string): Promise<{ replied: number; bounced: number }> {
  const rows = await db()
    .select({ id: oe.id, threadId: oe.threadId, gmailId: oe.gmailMessageId, contactId: oe.contactId, email: c.email, company: c.company })
    .from(oe)
    .innerJoin(c, eq(c.id, oe.contactId))
    .where(and(eq(oe.userId, userId), eq(oe.status, "sent"), eq(c.status, "emailed"), isNotNull(oe.threadId), gt(oe.sentAt, new Date(Date.now() - 45 * DAY))))
    .limit(60);
  let replied = 0;
  let bounced = 0;
  for (const r of rows) {
    const params = new URLSearchParams({ format: "metadata" });
    for (const h of ["From", "Subject"]) params.append("metadataHeaders", h);
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${r.threadId}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) continue;
    const thread = (await res.json()) as { messages?: ThreadMsg[] };
    for (const m of thread.messages ?? []) {
      if (m.id === r.gmailId) continue;
      const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
      const from = h("from");
      if (/mailer-daemon|postmaster/i.test(from) || /delivery status notification|undeliverable|delivery failure|address not found/i.test(h("subject"))) {
        await db().update(c).set({ status: "bounced" }).where(eq(c.id, r.contactId));
        bounced++;
        break;
      }
      if (from.toLowerCase().includes(r.email)) {
        await db().update(c).set({ status: "replied" }).where(eq(c.id, r.contactId));
        await db()
          .insert(schema.applicationEvents)
          .values({ userId, type: "other", needsReview: true, emailMessageId: m.id, fromAddress: from, subject: h("subject") || `Reply from ${r.company ?? r.email}`, snippet: `Reply to your outreach email to ${r.company ?? r.email}` })
          .onConflictDoNothing();
        replied++;
        break;
      }
    }
  }
  return { replied, bounced };
}
