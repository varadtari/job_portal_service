import type { NormalizedJob } from "../types";
import { fetchJson, isRemoteText } from "../text";
import { queryAlternatives } from "../filter";
import { countryFor } from "./region";

type AdzJob = {
  id: string;
  title: string;
  description: string; // truncated by Adzuna (~500 chars)
  redirect_url: string;
  created: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
};

const strip = (s: string) => s.replace(/<[^>]+>/g, "").trim();

/** One request per title alternative (max 5); Adzuna has no OR across phrases. */
export async function fetchAdzuna(
  appId: string,
  appKey: string,
  search: { query: string; location: string | null; remoteOnly: boolean },
): Promise<NormalizedJob[]> {
  const alts = queryAlternatives(search.query).slice(0, 5).map((w) => w.join(" "));
  return (await Promise.all(alts.map((what) => fetchAdzunaOne(appId, appKey, { ...search, query: what })))).flat();
}

async function fetchAdzunaOne(
  appId: string,
  appKey: string,
  search: { query: string; location: string | null; remoteOnly: boolean },
): Promise<NormalizedJob[]> {
  const country = countryFor(search.location);
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    what_phrase: search.query,
    ...(search.remoteOnly ? { what: "remote" } : {}),
    results_per_page: "50",
    max_days_old: "14",
    sort_by: "date",
  });
  if (search.location && !/^(india|remote)$/i.test(search.location.trim())) params.set("where", search.location);
  const data = await fetchJson<{ results?: AdzJob[] }>(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`);
  return (data.results ?? []).map((j) => {
    const title = strip(j.title);
    const location = j.location?.display_name ?? null;
    return {
      source: "adzuna" as const,
      externalId: String(j.id),
      company: j.company?.display_name ?? "Unknown company",
      title,
      location,
      remote: isRemoteText(title, location, j.description),
      salary: j.salary_min && j.salary_max ? `${Math.round(j.salary_min).toLocaleString()}–${Math.round(j.salary_max).toLocaleString()}` : null,
      description: `${strip(j.description)}\n\n(Preview only; open the listing for the full description.)`,
      url: j.redirect_url,
      postedAt: new Date(j.created),
    };
  });
}
