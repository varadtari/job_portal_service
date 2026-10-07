import type { NormalizedJob } from "../types";
import { fetchJson, htmlToPlain, isRemoteText } from "../text";
import type { BoardResult, Keep } from "./board";

type AshbyJob = {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location: string }[];
  isRemote?: boolean;
  workplaceType?: string | null;
  publishedAt?: string;
  jobUrl: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  isListed?: boolean;
  compensation?: { compensationTierSummary?: string | null } | null;
};

export async function fetchAshby(slug: string, displayName?: string, keep: Keep = () => true): Promise<BoardResult> {
  const data = await fetchJson<{ jobs: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
  );
  const company = displayName ?? slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const all: NormalizedJob[] = data.jobs
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const locs = [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)].filter(Boolean);
      const location = locs.join(" / ") || null;
      return {
        source: "ashby" as const,
        externalId: `${slug}:${j.id}`,
        company,
        title: j.title.trim(),
        location,
        // isRemote is also true for hybrid roles; trust workplaceType first
        remote: j.workplaceType === "Remote" || (!j.workplaceType && !!j.isRemote) || isRemoteText(j.location),
        salary: j.compensation?.compensationTierSummary ?? null,
        description: j.descriptionPlain?.trim() || htmlToPlain(j.descriptionHtml ?? ""),
        url: j.jobUrl,
        postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
      };
    });
  return { company, total: all.length, jobs: all.filter(keep) };
}
