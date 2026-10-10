// Checks a company's website for openings (ATS boards, schema.org JobPosting) and published hiring addresses.
// Read-only: a handful of public pages, honours robots.txt, never logs in or submits anything.
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { keepBoardJob, type RolePrefs, type SearchSpec } from "@/lib/jobs/filter";
import type { Level } from "@/lib/jobs/seniority";
import { jobFromHtml } from "@/lib/jobs/sources/url";
import { BOARD_FETCHERS, storeJobsForUser } from "@/lib/jobs/sync";
import type { Ats, NormalizedJob } from "@/lib/jobs/types";
import { htmlToPlain } from "@/lib/jobs/text";
import { extractEmails, type FoundEmail } from "./extract";
import { addContacts } from "./harvest";

const UA = "Mozilla/5.0 (compatible; JobPilot/1.0; personal job search)";
const PATHS = ["/", "/careers", "/jobs", "/contact", "/about"];
const MAX_PAGES = 6;
const LINK_WORDS = /career|jobs?\b|join|work-with-us|hiring|openings|vacanc|contact/i;

export type Board = { ats: Ats; slug: string };
export type PageFindings = { boards: Board[]; jobs: NormalizedJob[]; emails: FoundEmail[]; links: string[] };

/** Pure parser for one page (unit-tested on fixtures). */
export function parseSitePage(html: string, pageUrl: string): PageFindings {
  const boards = new Map<string, Board>();
  const add = (ats: Ats, slug: string | undefined) => {
    if (slug && /^[\w.-]{2,80}$/.test(slug) && !/^(embed|jobs|v1|api)$/i.test(slug)) boards.set(`${ats}:${slug.toLowerCase()}`, { ats, slug: slug.toLowerCase() });
  };
  for (const m of html.matchAll(/(?:job-)?boards(?:-api)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?for=|v1\/boards\/)?([\w.-]+)/gi)) add("greenhouse", m[1]);
  for (const m of html.matchAll(/jobs\.(?:eu\.)?lever\.co\/([\w.-]+)/gi)) add("lever", m[1]);
  for (const m of html.matchAll(/jobs\.ashbyhq\.com\/([\w.%-]+)/gi)) add("ashby", decodeURIComponent(m[1]));

  const base = new URL(pageUrl);
  const links: string[] = [];
  const mailtos: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].trim();
    if (/^mailto:/i.test(href)) {
      mailtos.push(decodeURIComponent(href.slice(7).split("?")[0]));
      continue;
    }
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    const text = m[2].replace(/<[^>]+>/g, " ");
    if (u.host === base.host && /^https?:$/.test(u.protocol) && (LINK_WORDS.test(u.pathname) || LINK_WORDS.test(text))) links.push(u.origin + u.pathname);
  }

  const jobs: NormalizedJob[] = [];
  if (/JobPosting/.test(html)) {
    const j = jobFromHtml(html, pageUrl);
    if (j && j.title) jobs.push({ ...j, source: "website", externalId: pageUrl });
  }
  const text = htmlToPlain(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " "));
  const emails = extractEmails(`${mailtos.join(" ")}\n${text}`);
  return { boards: [...boards.values()], jobs, emails, links: [...new Set(links)] };
}

/** Paths disallowed for all agents in robots.txt (simple prefix rules). */
export function robotsDisallow(robots: string): string[] {
  const out: string[] = [];
  let applies = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const [k, ...rest] = line.split(":");
    const v = rest.join(":").trim();
    if (/^user-agent$/i.test(k)) applies = v === "*" || /jobpilot/i.test(v);
    else if (applies && /^disallow$/i.test(k) && v) out.push(v);
  }
  return out;
}

const isPublicHost = (host: string) =>
  /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) && !/^(localhost|.*\.local|.*\.internal)$/i.test(host) && !/^\d+\.\d+\.\d+\.\d+$/.test(host);

async function get(url: string): Promise<{ ok: boolean; html: string; url: string }> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12000), cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/html|text\/plain/.test(type)) return { ok: false, html: "", url: res.url };
    return { ok: true, html: (await res.text()).slice(0, 1_500_000), url: res.url };
  } catch {
    return { ok: false, html: "", url };
  }
}

export type SiteResult = { pages: number; boards: Board[]; jobsAdded: number; emailsAdded: number; error?: string };

/**
 * Crawls up to 6 pages of a company site, then: tracks found ATS boards (and stores their matching jobs now),
 * stores JSON-LD jobs, and adds published hiring addresses as `website` contacts.
 * `origin` overrides https://<domain> (tests use a local server).
 */
export async function checkCompanySite(userId: string, siteId: string, opts: { origin?: string } = {}): Promise<SiteResult> {
  const [site] = await db().select().from(schema.companySites).where(and(eq(schema.companySites.id, siteId), eq(schema.companySites.userId, userId)));
  if (!site) return { pages: 0, boards: [], jobsAdded: 0, emailsAdded: 0, error: "Site not found" };
  const finish = async (r: SiteResult, extra: Partial<typeof schema.companySites.$inferInsert> = {}) => {
    await db()
      .update(schema.companySites)
      .set({ lastCheckedAt: new Date(), error: r.error ?? null, jobsFound: r.jobsAdded, emailsFound: r.emailsAdded, ...extra })
      .where(eq(schema.companySites.id, site.id));
    return r;
  };
  if (!opts.origin && !isPublicHost(site.domain)) return finish({ pages: 0, boards: [], jobsAdded: 0, emailsAdded: 0, error: "Not a public website address" });
  const origin = opts.origin ?? `https://${site.domain}`;

  const robots = await get(`${origin}/robots.txt`);
  const disallow = robots.ok ? robotsDisallow(robots.html) : [];
  const allowed = (u: string) => !disallow.some((d) => d === "/" || new URL(u).pathname.startsWith(d));

  const queue = PATHS.map((p) => origin + p);
  const seen = new Set<string>();
  const found: PageFindings = { boards: [], jobs: [], emails: [], links: [] };
  let pages = 0;
  const key = (u: string) => u.replace(/\/+$/, "").toLowerCase();
  while (queue.length && pages < MAX_PAGES) {
    const url = queue.shift()!;
    if (seen.has(key(url)) || !allowed(url)) continue;
    seen.add(key(url));
    const page = await get(url);
    if (!page.ok || (page.url !== url && seen.has(key(page.url)) && key(page.url) !== key(url))) continue;
    seen.add(key(page.url));
    pages++;
    const f = parseSitePage(page.html, page.url);
    found.boards.push(...f.boards);
    found.jobs.push(...f.jobs);
    found.emails.push(...f.emails);
    for (const l of f.links) if (!seen.has(key(l)) && !queue.some((x) => key(x) === key(l))) queue.push(l);
  }
  if (!pages) return finish({ pages, boards: [], jobsAdded: 0, emailsAdded: 0, error: "Website didn't respond (or blocks automated visits)" });

  // Openings: track ATS boards (daily sync keeps them fresh) and store their matching jobs right away
  const [[user], searches] = await Promise.all([
    db().select().from(schema.users).where(eq(schema.users.id, userId)),
    db().select().from(schema.savedSearches).where(eq(schema.savedSearches.userId, userId)),
  ]);
  const specs: SearchSpec[] = searches.map((s) => ({ query: s.query, location: s.location, remoteOnly: s.remoteOnly }));
  const prefs: RolePrefs = { itOnly: user?.itOnly ?? true, level: (user?.experienceLevel ?? "any") as Level };
  const boards = [...new Map(found.boards.map((b) => [`${b.ats}:${b.slug}`, b])).values()];
  const jobs: NormalizedJob[] = found.jobs.filter((j) => keepBoardJob(j, [], prefs));
  const working: Board[] = [];
  for (const b of boards.slice(0, 3)) {
    try {
      const r = await BOARD_FETCHERS[b.ats](b.slug, site.name ?? undefined, (j) => keepBoardJob(j, specs, prefs));
      working.push(b);
      jobs.push(...r.jobs);
      await db().insert(schema.trackedCompanies).values({ userId, ats: b.ats, slug: b.slug, name: r.company || site.name || site.domain }).onConflictDoNothing();
    } catch {
      // not a real board slug (e.g. a link to a different company)
    }
  }
  const jobsAdded = jobs.length ? await storeJobsForUser(userId, jobs) : 0;
  const emailsAdded = await addContacts(
    userId,
    found.emails.map((e) => ({ email: e.email, company: site.name, source: "website" as const, sourceRef: origin })),
  );
  return finish({ pages, boards: working, jobsAdded, emailsAdded }, working[0] ? { ats: working[0].ats, slug: working[0].slug } : {});
}

/** Daily: check sites never checked, then the oldest (re-check after 14 days). */
export async function checkDueSites(userId: string, limit = 30, budgetMs = 120_000): Promise<number> {
  const s = schema.companySites;
  const due = await db()
    .select({ id: s.id })
    .from(s)
    .where(and(eq(s.userId, userId), or(isNull(s.lastCheckedAt), lt(s.lastCheckedAt, new Date(Date.now() - 14 * 86400_000)))))
    .orderBy(asc(s.lastCheckedAt))
    .limit(limit);
  const start = Date.now();
  let n = 0;
  for (const d of due) {
    if (Date.now() - start > budgetMs) break;
    await checkCompanySite(userId, d.id).catch(() => undefined);
    n++;
  }
  return n;
}
