import { isITRole } from "./it-roles";
import { levelMatches, type Level } from "./seniority";
import type { NormalizedJob } from "./types";

export type SearchSpec = { query: string; location: string | null; remoteOnly: boolean };

const CITY_ALIASES: string[][] = [
  ["bengaluru", "bangalore"],
  ["gurugram", "gurgaon"],
  ["mumbai", "bombay"],
  ["chennai", "madras"],
  ["kolkata", "calcutta"],
  ["delhi", "new delhi", "ncr", "noida", "gurugram", "gurgaon"],
  ["san francisco", "sf", "bay area"],
  ["new york", "nyc"],
];
const INDIA_CITIES = /india|bengaluru|bangalore|pune|mumbai|hyderabad|chennai|delhi|gurgaon|gurugram|noida|kolkata|ahmedabad|jaipur|kochi|chandigarh|indore|coimbatore/i;
const GLOBAL_REMOTE = /anywhere|worldwide|global|apac|asia|^\s*remote\s*$/i;

const words = (s: string) => s.toLowerCase().match(/[a-z0-9+#.]+/g) ?? [];

/** "backend engineer, sde | platform engineer" → [["backend","engineer"],["sde"],["platform","engineer"]] */
export function queryAlternatives(query: string): string[][] {
  return query
    .split(/,|\||\bor\b/i)
    .map((q) => words(q))
    .filter((w) => w.length > 0);
}

export function titleMatches(title: string, query: string): boolean {
  const t = words(title);
  return queryAlternatives(query).some((alt) => alt.every((w) => t.some((tw) => tw.startsWith(w))));
}

export function locationTerms(location: string): string[] {
  const l = location.toLowerCase().trim();
  const group = CITY_ALIASES.find((g) => g.some((c) => l.includes(c)));
  return group ?? [l];
}

export function locationMatches(job: Pick<NormalizedJob, "location" | "remote">, wanted: string | null): boolean {
  if (!wanted) return true;
  const w = wanted.toLowerCase().trim();
  if (w === "remote") return job.remote;
  if (!job.location) return true; // unknown: keep, user can hide it
  const loc = job.location.toLowerCase();
  if (w === "india") return INDIA_CITIES.test(loc) || (job.remote && GLOBAL_REMOTE.test(loc));
  if (locationTerms(w).some((t) => loc.includes(t))) return true;
  // Remote roles open to the user's region
  return job.remote && (GLOBAL_REMOTE.test(loc) || (INDIA_CITIES.test(w) && INDIA_CITIES.test(loc)));
}

export function matchesSearch(job: NormalizedJob, s: SearchSpec): boolean {
  return titleMatches(job.title, s.query) && locationMatches(job, s.location) && (!s.remoteOnly || job.remote);
}

export type RolePrefs = { itOnly: boolean; level: Level };

/** User-wide title filters: IT roles only and experience level. */
export function roleOk(title: string, p: RolePrefs): boolean {
  return (!p.itOnly || isITRole(title)) && levelMatches(title, p.level);
}

/** Company-board jobs are filtered by the user's searches (all kept when there are none). */
export function filterBoardJobs(jobs: NormalizedJob[], searches: SearchSpec[], prefs: RolePrefs = { itOnly: false, level: "any" }): NormalizedJob[] {
  return jobs.filter((j) => keepBoardJob(j, searches, prefs));
}

export function keepBoardJob(j: NormalizedJob, searches: SearchSpec[], prefs: RolePrefs): boolean {
  if (!roleOk(j.title, prefs)) return false;
  return !searches.length || searches.some((s) => matchesSearch(j, s));
}
