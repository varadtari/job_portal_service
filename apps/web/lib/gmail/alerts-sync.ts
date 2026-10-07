import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { roleOk } from "@/lib/jobs/filter";
import type { Level } from "@/lib/jobs/seniority";
import { storeJobsForUser } from "@/lib/jobs/sync";
import { accessToken, getMessage, GmailReconnectError, listMessageIds } from "./client";
import { ALERT_QUERY, parseJobAlert } from "./alerts";

export type AlertImport = { emails: number; found: number; kept: number; added: number };

/**
 * Imports jobs from job-alert emails (Indeed, Naukri, hirist) into the Jobs feed.
 * Uses its own cursor; the first run looks back 14 days. Alert emails are recorded by id only.
 */
export async function importJobAlerts(userId: string, token?: string): Promise<AlertImport | null> {
  const [user] = await db().select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user?.googleRefreshTokenEnc || user.disabledSources.includes("email")) return null;
  try {
    token ??= await accessToken(user.googleRefreshTokenEnc);
  } catch (e) {
    if (e instanceof GmailReconnectError) await db().update(schema.users).set({ gmailNeedsReconnect: true }).where(eq(schema.users.id, userId));
    throw e;
  }
  const since = user.alertsSyncedAt ? `after:${Math.floor(user.alertsSyncedAt.getTime() / 1000) - 3600}` : "newer_than:14d";
  const ids = await listMessageIds(token, `${since} ${ALERT_QUERY}`, 300);
  const seen = ids.length
    ? new Set(
        (await db()
          .select({ id: schema.applicationEvents.emailMessageId })
          .from(schema.applicationEvents)
          .where(and(eq(schema.applicationEvents.userId, userId), inArray(schema.applicationEvents.emailMessageId, ids)))).map((r) => r.id),
      )
    : new Set<string | null>();
  const fresh = ids.filter((id) => !seen.has(id));

  const prefs = { itOnly: user.itOnly, level: user.experienceLevel as Level };
  const cutoff = Date.now() - 30 * 86400000;
  const jobs = [];
  let found = 0;
  for (let i = 0; i < fresh.length; i += 5) {
    const batch = await Promise.all(fresh.slice(i, i + 5).map((id) => getMessage(token!, id).catch(() => null)));
    for (const m of batch) {
      if (!m) continue;
      const parsed = parseJobAlert({ from: m.from, subject: m.subject, html: m.html, date: m.date });
      found += parsed.length;
      jobs.push(...parsed.filter((j) => roleOk(j.title, prefs) && (!j.postedAt || j.postedAt.getTime() >= cutoff)));
      await db().insert(schema.applicationEvents).values({ userId, type: "other", emailMessageId: m.id, occurredAt: m.date }).onConflictDoNothing();
    }
  }
  const added = jobs.length ? await storeJobsForUser(userId, jobs) : 0;
  await db().update(schema.users).set({ alertsSyncedAt: new Date() }).where(eq(schema.users.id, userId));
  return { emails: fresh.length, found, kept: jobs.length, added };
}
