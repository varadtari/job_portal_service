import type { NormalizedJob } from "../types";
import { fetchJson } from "../text";
import { queryAlternatives } from "../filter";
import { countryFor, rotatingCountry } from "./region";

// JSearch (RapidAPI) aggregates Google for Jobs: LinkedIn, Indeed, Naukri, Glassdoor, company sites.
type JSJob = {
  job_id: string;
  employer_name: string;
  job_title: string;
  job_city?: string | null;
  job_state?: string | null;
  job_country?: string | null;
  job_location?: string | null;
  job_is_remote?: boolean;
  job_description?: string;
  job_apply_link: string;
  job_posted_at_datetime_utc?: string | null;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_period?: string | null;
  job_salary_string?: string | null;
  job_publisher?: string | null;
};

export async function fetchJSearch(
  apiKey: string,
  search: { query: string; location: string | null; remoteOnly: boolean },
): Promise<NormalizedJob[]> {
  // "backend engineer, sde" → "backend engineer OR sde" (Google for Jobs understands OR)
  const what = queryAlternatives(search.query).slice(0, 4).map((w) => w.join(" ")).join(" OR ");
  const q = search.location ? `${what} in ${search.location}` : what;
  const country = search.location ? countryFor(search.location) : rotatingCountry();
  const params = new URLSearchParams({ query: q, page: "1", num_pages: "1", date_posted: "week", country });
  if (search.remoteOnly) params.set("work_from_home", "true");
  // v1 "/search" was retired; "/search-v2" returns { data: { jobs, cursor } }
  const data = await fetchJson<{ data?: { jobs?: JSJob[] } }>(`https://jsearch.p.rapidapi.com/search-v2?${params}`, {
    headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" },
    timeoutMs: 60000, // JSearch often takes 20–40s
  });
  return (data.data?.jobs ?? []).map((j) => {
    const location = j.job_location || [j.job_city, j.job_state, j.job_country].filter(Boolean).join(", ") || null;
    const salary =
      j.job_salary_string ||
      (j.job_min_salary && j.job_max_salary
        ? `${j.job_min_salary.toLocaleString()}–${j.job_max_salary.toLocaleString()}${j.job_salary_period ? ` / ${j.job_salary_period.toLowerCase()}` : ""}`
        : null);
    return {
      source: "jsearch" as const,
      externalId: j.job_id,
      company: j.employer_name,
      title: j.job_title,
      location,
      remote: !!j.job_is_remote,
      salary,
      description: j.job_description ?? "",
      url: j.job_apply_link,
      postedAt: j.job_posted_at_datetime_utc ? new Date(j.job_posted_at_datetime_utc) : null,
      via: j.job_publisher ?? null,
    };
  });
}
