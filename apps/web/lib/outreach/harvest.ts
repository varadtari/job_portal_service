// Builds the outreach contact list from job descriptions, Gmail senders and manual imports.
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { parseAddress } from "@/lib/followup/contact";
import { detectCountry } from "@/lib/jobs/regions";
import { classify, extractEmails } from "./extract";

export type ContactInput = {
  email: string;
  name?: string | null;
  company?: string | null;
  location?: string | null;
  remote?: boolean;
  source: (typeof schema.outreachSource.enumValues)[number];
  sourceRef?: string | null;
  allowWebmail?: boolean;
};

/** Inserts new contacts (existing addresses are left as they are) and registers their sites. Returns how many were new. */
export async function addContacts(userId: string, input: ContactInput[]): Promise<number> {
  const rows = new Map<string, typeof schema.outreachContacts.$inferInsert>();
  for (const c of input) {
    const f = classify(c.email, { allowWebmail: c.allowWebmail });
    if (!f || rows.has(f.email)) continue;
    rows.set(f.email, {
      userId,
      email: f.email,
      domain: f.domain,
      kind: f.kind,
      name: c.name?.trim() || null,
      company: c.company?.trim() || null,
      location: c.location?.trim() || null,
      countryCode: detectCountry(c.location),
      remote: c.remote ?? /remote/i.test(c.location ?? ""),
      source: c.source,
      sourceRef: c.sourceRef ?? null,
    });
  }
  if (!rows.size) return 0;
  let added = 0;
  const values = [...rows.values()];
  for (let i = 0; i < values.length; i += 200) {
    const res = await db().insert(schema.outreachContacts).values(values.slice(i, i + 200)).onConflictDoNothing().returning({ id: schema.outreachContacts.id });
    added += res.length;
  }
  await addSites(userId, values.filter((v) => !/^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|rediffmail|proton)/.test(v.domain)).map((v) => ({ domain: v.domain, name: v.company ?? null })));
  return added;
}

/** Company's main domain: ats.latinumhr.com → latinumhr.com, careers.tcs.co.in → tcs.co.in. */
export function siteDomain(domain: string): string {
  const parts = domain.toLowerCase().replace(/^www\./, "").split(".");
  const twoLevel = parts.length >= 3 && /^(co|com|ac|edu|org|gov|net)$/.test(parts[parts.length - 2]) && parts[parts.length - 1].length === 2;
  return parts.slice(twoLevel ? -3 : -2).join(".");
}

/** Remembers company domains so their websites get checked for openings and hiring addresses. */
export async function addSites(userId: string, sites: { domain: string; name: string | null }[]) {
  const uniq = [...new Map(sites.map((s) => [siteDomain(s.domain), s])).entries()];
  if (!uniq.length) return;
  await db()
    .insert(schema.companySites)
    .values(uniq.map(([domain, s]) => ({ userId, domain, name: s.name })))
    .onConflictDoNothing();
}

/** Hiring addresses published in the user's job descriptions. */
export async function harvestFromJobs(userId: string): Promise<number> {
  const j = schema.jobs;
  const rows = await db()
    .select({ id: j.id, company: j.company, location: j.location, remote: j.remote, description: j.description })
    .from(j)
    .innerJoin(schema.userJobs, and(eq(schema.userJobs.jobId, j.id), eq(schema.userJobs.userId, userId)))
    .where(sql`${j.description} ~* '[a-z0-9._%+-]+(@|\\s*[\\[(]at[\\])]\\s*)[a-z0-9-]+'`);
  const input: ContactInput[] = rows.flatMap((r) =>
    extractEmails(r.description).map((e) => ({ email: e.email, company: r.company, location: r.location, remote: r.remote, source: "job_post" as const, sourceRef: r.id })),
  );
  return addContacts(userId, input);
}

/** People and companies who emailed the user about applications (no-reply/ATS senders are skipped). */
export async function harvestFromGmail(userId: string): Promise<number> {
  const e = schema.applicationEvents;
  const a = schema.applications;
  const rows = await db()
    .select({ from: e.fromAddress, msg: e.emailMessageId, company: a.company, location: schema.jobs.location, remote: schema.jobs.remote })
    .from(e)
    .innerJoin(a, eq(a.id, e.applicationId))
    .leftJoin(schema.jobs, eq(schema.jobs.id, a.jobId))
    .where(and(eq(e.userId, userId), isNotNull(e.fromAddress)));
  const input: ContactInput[] = [];
  for (const r of rows) {
    const addr = parseAddress(r.from!);
    if (addr) input.push({ email: addr.email, name: addr.name, company: r.company, location: r.location, remote: r.remote ?? false, source: "gmail", sourceRef: r.msg });
  }
  return addContacts(userId, input);
}
