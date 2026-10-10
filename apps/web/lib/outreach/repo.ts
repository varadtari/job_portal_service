// Reads for the Outreach page.
import { and, count, desc, eq, getTableColumns, inArray, ne, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { locationWhere } from "@/lib/jobs/repo";
import { REGIONS } from "@/lib/jobs/regions";

const c = schema.outreachContacts;
const oe = schema.outreachEmails;

export type ContactFilters = { loc?: string; source?: string; status?: string; kind?: string };

const SOURCES = schema.outreachSource.enumValues;
const STATUSES = schema.outreachContactStatus.enumValues;

function where(userId: string, f: ContactFilters, withLoc = true): SQL {
  const w: SQL[] = [eq(c.userId, userId)];
  if (withLoc) {
    const l = locationWhere(f.loc, { remote: c.remote, countryCode: c.countryCode, location: c.location });
    if (l) w.push(l);
  }
  if (f.source && (SOURCES as readonly string[]).includes(f.source)) w.push(eq(c.source, f.source as (typeof SOURCES)[number]));
  if (f.status && (STATUSES as readonly string[]).includes(f.status)) w.push(eq(c.status, f.status as (typeof STATUSES)[number]));
  else w.push(ne(c.status, "do_not_contact"));
  if (f.kind === "role" || f.kind === "person") w.push(eq(c.kind, f.kind));
  return and(...w)!;
}

export type ContactRow = typeof c.$inferSelect & { draftId: string | null };

export async function listContacts(userId: string, f: ContactFilters, limit = 300): Promise<ContactRow[]> {
  const rows = await db().select().from(c).where(where(userId, f)).orderBy(desc(c.createdAt)).limit(limit);
  const drafts = rows.length
    ? await db().select({ id: oe.id, contactId: oe.contactId }).from(oe).where(and(eq(oe.userId, userId), eq(oe.status, "draft"), inArray(oe.contactId, rows.map((r) => r.id))))
    : [];
  const draftFor = new Map(drafts.map((d) => [d.contactId, d.id]));
  return rows.map((r) => ({ ...r, draftId: draftFor.get(r.id) ?? null }));
}

/** Contact counts per region chip (respecting the other filters). */
export async function contactRegionCounts(userId: string, f: ContactFilters): Promise<Record<string, number>> {
  const rows = await db().select({ country: c.countryCode, remote: c.remote, n: count() }).from(c).where(where(userId, f, false)).groupBy(c.countryCode, c.remote);
  const out: Record<string, number> = {};
  for (const r of REGIONS) {
    out[r.key] = rows
      .filter((x) => (r.key === "anywhere" ? true : r.remoteOnly ? x.remote : !!x.country && !!r.countries?.includes(x.country)))
      .reduce((n, x) => n + Number(x.n), 0);
  }
  return out;
}

export type EmailRow = typeof oe.$inferSelect & { email: string; company: string | null; name: string | null; contactStatus: string; location: string | null };

export async function listEmails(userId: string, statuses: (typeof oe.$inferSelect.status)[], limit = 200): Promise<EmailRow[]> {
  return db()
    .select({ ...getTableColumns(oe), email: c.email, company: c.company, name: c.name, contactStatus: c.status, location: c.location })
    .from(oe)
    .innerJoin(c, eq(c.id, oe.contactId))
    .where(and(eq(oe.userId, userId), inArray(oe.status, statuses)))
    .orderBy(desc(oe.sentAt), desc(oe.createdAt))
    .limit(limit);
}

export async function listSites(userId: string) {
  return db().select().from(schema.companySites).where(eq(schema.companySites.userId, userId)).orderBy(desc(schema.companySites.lastCheckedAt), desc(schema.companySites.createdAt)).limit(300);
}
