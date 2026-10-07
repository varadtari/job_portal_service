import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { decodeHtml as decode } from "./match";
import { accessToken, getMessage, GmailReconnectError, JOB_QUERY, listMessageIds, type GmailMessage } from "./client";
import { classifyEmail, nextStatus, type Status } from "./classify";
import { guessCompany, guessTitle, matchApplication } from "./match";
import { ALERT_SENDERS } from "./alerts";
import { importJobAlerts } from "./alerts-sync";
import { sendPush, type PushPayload } from "@/lib/push";

export type GmailSyncSummary = { scanned: number; processed: number; matched: number; created: number; review: number; ignored: number; ghosted: number; alertJobs: number };



async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

export async function syncGmail(userId: string, opts: { lookbackDays?: number } = {}): Promise<GmailSyncSummary> {
  const [user] = await db().select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user?.googleRefreshTokenEnc) throw new GmailReconnectError("Gmail not connected");

  let token: string;
  try {
    token = await accessToken(user.googleRefreshTokenEnc);
  } catch (e) {
    if (e instanceof GmailReconnectError) await db().update(schema.users).set({ gmailNeedsReconnect: true }).where(eq(schema.users.id, userId));
    throw e;
  }

  // Job-alert emails → Jobs feed (records their ids, so the status classifier below skips them)
  const alerts = await importJobAlerts(userId, token).catch(() => null);

  // Incremental after the first run (1h overlap; duplicates are skipped by message id)
  const since = user.gmailSyncedAt
    ? `after:${Math.floor(user.gmailSyncedAt.getTime() / 1000) - 3600}`
    : `newer_than:${opts.lookbackDays ?? 90}d`;
  const ids = await listMessageIds(token, `${since} ${JOB_QUERY}`);

  const seen = ids.length
    ? new Set(
        (await db()
          .select({ id: schema.applicationEvents.emailMessageId })
          .from(schema.applicationEvents)
          .where(and(eq(schema.applicationEvents.userId, userId), inArray(schema.applicationEvents.emailMessageId, ids)))).map((r) => r.id),
      )
    : new Set<string | null>();
  const fresh = ids.filter((id) => !seen.has(id));
  const messages = (await pool(fresh, 5, (id) => getMessage(token, id).catch(() => null)))
    .filter((m): m is GmailMessage => m !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime()); // oldest first so statuses progress in order

  const apps = await db()
    .select({ id: schema.applications.id, company: schema.applications.company, title: schema.applications.title, status: schema.applications.status })
    .from(schema.applications)
    .where(eq(schema.applications.userId, userId));
  const summary: GmailSyncSummary = { scanned: ids.length, processed: messages.length, matched: 0, created: 0, review: 0, ignored: 0, ghosted: 0, alertJobs: alerts?.added ?? 0 };

  const notify: PushPayload[] = [];
  const NOTIFY_TEXT: Partial<Record<Status, string>> = { oa: "Assessment received", interview: "Interview update", offer: "🎉 Offer!", rejected: "Application closed" };

  for (const m of messages) {
    const email = { from: m.from, subject: decode(m.subject), text: m.text };
    const { type, confidence } = ALERT_SENDERS.test(m.from) ? { type: "other" as const, confidence: 1 } : classifyEmail(email);
    if (type === "other") {
      // Remember the id only (no content) so it isn't fetched again
      await db().insert(schema.applicationEvents).values({ userId, type: "other", emailMessageId: m.id, occurredAt: m.date }).onConflictDoNothing();
      summary.ignored++;
      continue;
    }
    const event = { userId, type, emailMessageId: m.id, fromAddress: m.from.slice(0, 300), subject: email.subject.slice(0, 300), snippet: decode(m.snippet).slice(0, 300), aiConfidence: confidence, occurredAt: m.date };

    let { app } = matchApplication(email, apps);
    // Clear confirmations (and assessment invites, which imply an application) create the application if missing
    if (!app && (type === "applied_confirm" || type === "oa") && confidence >= 0.9) {
      const company = guessCompany(email);
      if (company) {
        const [created] = await db()
          .insert(schema.applications)
          .values({ userId, company, title: guessTitle(email) ?? "Role from email", status: type === "oa" ? "oa" : "applied", appliedAt: m.date, lastEmailAt: m.date, notes: "Added from an email" })
          .returning({ id: schema.applications.id, company: schema.applications.company, title: schema.applications.title, status: schema.applications.status });
        apps.push(created);
        app = created;
        summary.created++;
      }
    }
    if (!app) {
      await db().insert(schema.applicationEvents).values({ ...event, needsReview: true }).onConflictDoNothing();
      summary.review++;
      continue;
    }
    const current = apps.find((a) => a.id === app!.id)!;
    const status = nextStatus(current.status as Status, type);
    const betterTitle = current.title === "Role from email" ? guessTitle(email) : null;
    const at = m.date.toISOString();
    // Event + status change together: a failure must not leave the email "seen" but unapplied
    await db().transaction(async (tx) => {
      await tx.insert(schema.applicationEvents).values({ ...event, applicationId: app!.id }).onConflictDoNothing();
      await tx
        .update(schema.applications)
        .set({
          status,
          lastEmailAt: sql`greatest(coalesce(${schema.applications.lastEmailAt}, ${at}::timestamptz), ${at}::timestamptz)`,
          ...(status === "applied" && current.status === "saved" ? { appliedAt: m.date } : {}),
          ...(betterTitle ? { title: betterTitle } : {}),
        })
        .where(eq(schema.applications.id, app!.id));
    });
    if (status !== current.status && NOTIFY_TEXT[status]) {
      notify.push({ title: `${NOTIFY_TEXT[status]}: ${current.company}`, body: email.subject.slice(0, 140), url: `/applications/${current.id}`, tag: `app-${current.id}` });
    }
    current.status = status;
    if (betterTitle) current.title = betterTitle;
    summary.matched++;
  }

  summary.ghosted = await markGhosted(userId);

  // Phone/desktop notifications (only for devices where the user enabled them)
  if (summary.review) notify.push({ title: "JobPilot", body: `${summary.review} job email${summary.review === 1 ? "" : "s"} need${summary.review === 1 ? "s" : ""} your review`, url: "/applications", tag: "review" });
  for (const n of notify.slice(0, 5)) await sendPush(userId, n).catch(() => 0);
  await db().update(schema.users).set({ gmailSyncedAt: new Date(), gmailNeedsReconnect: false }).where(eq(schema.users.id, userId));
  return summary;
}

/** Applied/assessment/interview with no email or update for 30 days → "No response". */
export async function markGhosted(userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 86400000);
  const a = schema.applications;
  const rows = await db()
    .update(a)
    .set({ status: "ghosted" })
    .where(
      and(
        eq(a.userId, userId),
        inArray(a.status, ["applied", "oa", "interview"]),
        isNotNull(a.appliedAt),
        sql`greatest(${a.appliedAt}, coalesce(${a.lastEmailAt}, ${a.appliedAt}), ${a.updatedAt}) < ${cutoff.toISOString()}::timestamptz`,
      ),
    )
    .returning({ id: a.id });
  return rows.length;
}
