import { and, count, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const a = schema.applications;
const ev = schema.applicationEvents;

export const STATUSES = ["saved", "applied", "oa", "interview", "offer", "rejected", "ghosted"] as const;
export type AppStatus = (typeof STATUSES)[number];

export async function listApplications(userId: string) {
  return db()
    .select({
      id: a.id,
      company: a.company,
      title: a.title,
      status: a.status,
      url: a.url,
      jobId: a.jobId,
      appliedAt: a.appliedAt,
      lastEmailAt: a.lastEmailAt,
      updatedAt: a.updatedAt,
      followUpEnabled: a.followUpEnabled,
      followUpEveryDays: a.followUpEveryDays,
      followUpMax: a.followUpMax,
      followUpCount: a.followUpCount,
      lastFollowUpAt: a.lastFollowUpAt,
      // Qualified explicitly: an unqualified "id" inside the subquery would resolve to follow_ups.id
      draftPending: sql<boolean>`exists(select 1 from follow_ups f where f.application_id = "applications"."id" and f.status = 'draft')`,
      events: sql<number>`(select count(*)::int from ${ev} where ${ev.applicationId} = ${a.id})`,
    })
    .from(a)
    .where(eq(a.userId, userId))
    .orderBy(desc(sql`greatest(coalesce(${a.lastEmailAt}, ${a.updatedAt}), ${a.updatedAt})`));
}

export async function reviewQueue(userId: string) {
  return db()
    .select()
    .from(ev)
    .where(and(eq(ev.userId, userId), eq(ev.needsReview, true)))
    .orderBy(desc(ev.occurredAt));
}

export async function getApplication(userId: string, id: string) {
  const [app] = await db().select().from(a).where(and(eq(a.id, id), eq(a.userId, userId)));
  if (!app) return null;
  const events = await db().select().from(ev).where(eq(ev.applicationId, id)).orderBy(desc(ev.occurredAt));
  return { app, events };
}

export async function statusCounts(userId: string) {
  const rows = await db().select({ status: a.status, n: count() }).from(a).where(eq(a.userId, userId)).groupBy(a.status);
  return Object.fromEntries(STATUSES.map((s) => [s, rows.find((r) => r.status === s)?.n ?? 0])) as Record<AppStatus, number>;
}

export async function recentEvents(userId: string, limit = 8) {
  return db()
    .select({ id: ev.id, type: ev.type, subject: ev.subject, occurredAt: ev.occurredAt, applicationId: ev.applicationId, emailMessageId: ev.emailMessageId, company: a.company, title: a.title })
    .from(ev)
    .innerJoin(a, eq(ev.applicationId, a.id))
    .where(and(eq(ev.userId, userId), sql`${ev.type} <> 'other'`))
    .orderBy(desc(ev.occurredAt))
    .limit(limit);
}
