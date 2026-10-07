import type { NormalizedJob } from "../types";
import { decodeEntities, fetchJson, htmlToPlain, isRemoteText } from "../text";
import type { BoardResult, Keep } from "./board";

type GHJob = {
  id: number;
  title: string;
  absolute_url: string;
  updated_at: string;
  first_published?: string | null;
  location?: { name?: string } | null;
  content?: string;
  company_name?: string;
};

const base = (slug: string) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs`;

function normalize(slug: string, j: GHJob, company: string): NormalizedJob {
  const location = j.location?.name?.trim() || null;
  return {
    source: "greenhouse",
    externalId: `${slug}:${j.id}`,
    company: j.company_name ?? company,
    title: j.title.trim(),
    location,
    remote: isRemoteText(location, j.title),
    salary: null,
    description: j.content ? htmlToPlain(decodeEntities(j.content)) : "",
    url: j.absolute_url,
    postedAt: new Date(j.first_published ?? j.updated_at),
  };
}

/**
 * Lists the board without descriptions (~12x smaller), filters with `keep`,
 * then fetches full content only for the kept jobs.
 */
export async function fetchGreenhouse(slug: string, displayName?: string, keep: Keep = () => true): Promise<BoardResult> {
  const data = await fetchJson<{ jobs: GHJob[] }>(base(slug));
  const company = displayName ?? data.jobs[0]?.company_name ?? slug;
  const kept = data.jobs.filter((j) => keep(normalize(slug, j, company)));
  const jobs: NormalizedJob[] = [];
  for (let i = 0; i < kept.length; i += 8) {
    const batch = await Promise.all(
      kept.slice(i, i + 8).map((j) => fetchJson<GHJob>(`${base(slug)}/${j.id}`).catch(() => j)),
    );
    jobs.push(...batch.map((j) => normalize(slug, j, company)));
  }
  return { company, total: data.jobs.length, jobs };
}
