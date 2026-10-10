import { and, count, desc, eq, gte, ilike, inArray, isNotNull, ne, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, schema } from "@/lib/db";
import { matchRank, matchSkills, type MatchResult } from "@/lib/match/skills";
import { locationTerms } from "./filter";
import { detectCountry, REGIONS, regionByKey } from "./regions";

const j = schema.jobs;
const uj = schema.userJobs;
const app = schema.applications;

export type JobView = "all" | "saved" | "applied";

export type JobFilters = {
  view?: JobView;
  /** Region key from lib/jobs/regions.ts ("india", "us", "remote", …) or free text (a city / country). */
  loc?: string;
  q?: string;
  remote?: boolean;
  source?: string;
  days?: number;
  sort?: "newest" | "match";
};

export type JobListItem = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  salary: string | null;
  source: string;
  via: string | null;
  postedAt: Date | null;
  lastSeenAt: Date;
  status: (typeof schema.applicationStatus.enumValues)[number] | null;
  match: MatchResult;
};

/** SQL condition for a region key or a free-text place (city aliases and detected country included). */
type LocationCols = { remote: AnyPgColumn; countryCode: AnyPgColumn; location: AnyPgColumn };

/** SQL filter for a region key or free-text place. Columns default to the jobs table (Outreach reuses it for contacts). */
export function locationWhere(loc: string | undefined, cols: LocationCols = { remote: j.remote, countryCode: j.countryCode, location: j.location }): SQL | undefined {
  const value = loc?.trim();
  if (!value || value === "anywhere") return undefined;
  const region = regionByKey(value);
  if (region?.remoteOnly) return eq(cols.remote, true);
  if (region?.countries) return inArray(cols.countryCode, region.countries);
  // Free text: match the location text (with aliases like Bengaluru/Bangalore) or the detected country
  const terms = locationTerms(value);
  const country = detectCountry(value);
  const conds = terms.map((t) => ilike(cols.location, `%${t.replace(/[%_]/g, "")}%`));
  if (country) conds.push(eq(cols.countryCode, country));
  return or(...conds);
}

/** Job counts per region chip for the user's visible feed (respecting the other filters). */
export async function regionCounts(userId: string, f: JobFilters): Promise<Record<string, number>> {
  const view = f.view ?? "all";
  const where: SQL[] = [eq(uj.userId, userId)];
  if (view === "all") where.push(eq(uj.hidden, false));
  if (f.remote) where.push(eq(j.remote, true));
  if (f.source) where.push(eq(j.source, f.source));
  if (f.days) where.push(gte(j.postedAt, new Date(Date.now() - f.days * 86400000)));
  const rows = await db()
    .select({ country: j.countryCode, remote: j.remote, n: count() })
    .from(uj)
    .innerJoin(j, eq(uj.jobId, j.id))
    .leftJoin(app, and(eq(app.jobId, j.id), eq(app.userId, userId)))
    .where(and(...where, ...(view === "saved" ? [eq(app.status, "saved")] : view === "applied" ? [isNotNull(app.status), ne(app.status, "saved")] : [])))
    .groupBy(j.countryCode, j.remote);
  const out: Record<string, number> = {};
  for (const r of REGIONS) {
    out[r.key] = rows
      .filter((x) => (r.key === "anywhere" ? true : r.remoteOnly ? x.remote : !!x.country && !!r.countries?.includes(x.country)))
      .reduce((n, x) => n + x.n, 0);
  }
  return out;
}

export async function listUserJobs(userId: string, f: JobFilters, candidate: Set<string>, limit: number) {
  const view = f.view ?? "all";
  const where: SQL[] = [eq(uj.userId, userId)];
  // Saved/applied jobs stay listed in their tabs even if later marked "not interested"
  if (view === "all") where.push(eq(uj.hidden, false));
  if (view === "saved") where.push(eq(app.status, "saved"));
  if (view === "applied") where.push(isNotNull(app.status), ne(app.status, "saved"));
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    where.push(or(ilike(j.title, like), ilike(j.company, like), ilike(j.location, like))!);
  }
  if (f.remote) where.push(eq(j.remote, true));
  if (f.source) where.push(eq(j.source, f.source));
  if (f.days) where.push(gte(j.postedAt, new Date(Date.now() - f.days * 86400000)));
  const locWhere = locationWhere(f.loc);
  if (locWhere) where.push(locWhere);

  const rows = await db()
    .select({
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      remote: j.remote,
      salary: j.salary,
      source: j.source,
      via: j.via,
      postedAt: j.postedAt,
      lastSeenAt: j.lastSeenAt,
      skills: j.skills,
      dedupHash: j.dedupHash,
      status: app.status,
    })
    .from(uj)
    .innerJoin(j, eq(uj.jobId, j.id))
    .leftJoin(app, and(eq(app.jobId, j.id), eq(app.userId, userId)))
    .where(and(...where))
    // Tabs list most recently saved/applied first; the main feed newest posting first
    .orderBy(...(view === "all" ? [desc(j.postedAt)] : [desc(app.updatedAt), desc(j.postedAt)]));

  // Same job from multiple sources: keep the first (newest / one with an application).
  const seen = new Map<string, JobListItem>();
  for (const r of rows) {
    const existing = seen.get(r.dedupHash);
    if (existing && !(r.status && !existing.status)) continue;
    const { skills, dedupHash, ...rest } = r;
    seen.set(dedupHash, { ...rest, match: candidate.size ? matchSkills(skills, candidate) : null });
  }
  const items = [...seen.values()];
  if (f.sort === "match") items.sort((a, b) => matchRank(b.match) - matchRank(a.match));
  return { items: items.slice(0, limit), total: items.length };
}

export async function getUserJob(userId: string, jobId: string) {
  const [row] = await db()
    .select({ job: j, status: app.status, applicationId: app.id })
    .from(uj)
    .innerJoin(j, eq(uj.jobId, j.id))
    .leftJoin(app, and(eq(app.jobId, j.id), eq(app.userId, userId)))
    .where(and(eq(uj.userId, userId), eq(uj.jobId, jobId)));
  return row ?? null;
}

/** Job counts for the Saved / Applied tabs. */
export async function countByView(userId: string): Promise<{ saved: number; applied: number }> {
  const rows = await db()
    .select({ status: app.status, n: count() })
    .from(app)
    .where(and(eq(app.userId, userId), isNotNull(app.jobId)))
    .groupBy(app.status);
  const saved = rows.find((r) => r.status === "saved")?.n ?? 0;
  const applied = rows.filter((r) => r.status !== "saved").reduce((n, r) => n + r.n, 0);
  return { saved, applied };
}
