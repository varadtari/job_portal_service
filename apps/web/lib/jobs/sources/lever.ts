import type { NormalizedJob } from "../types";
import { fetchJson, htmlToPlain, isRemoteText } from "../text";
import type { BoardResult, Keep } from "./board";

type LeverJob = {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt: number;
  workplaceType?: string;
  categories?: { location?: string; allLocations?: string[]; commitment?: string; team?: string };
  description?: string;
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additional?: string;
  salaryRange?: { min: number; max: number; currency: string; interval: string } | null;
};

export async function fetchLever(slug: string, displayName?: string, keep: Keep = () => true): Promise<BoardResult> {
  const data = await fetchJson<LeverJob[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`);
  const company = displayName ?? slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const all: NormalizedJob[] = data.map((j) => {
    const location = j.categories?.allLocations?.join(" / ") || j.categories?.location || null;
    const html = [
      j.description ?? "",
      ...(j.lists ?? []).map((l) => `<h3>${l.text}</h3><ul>${l.content}</ul>`),
      j.additional ?? "",
    ].join("\n");
    const s = j.salaryRange;
    return {
      source: "lever" as const,
      externalId: `${slug}:${j.id}`,
      company,
      title: j.text.trim(),
      location,
      remote: j.workplaceType === "remote" || isRemoteText(location, j.text),
      salary: s ? `${s.currency} ${s.min.toLocaleString()}–${s.max.toLocaleString()} / ${s.interval.replace("per-", "")}` : null,
      description: htmlToPlain(html),
      url: j.hostedUrl,
      postedAt: new Date(j.createdAt),
    };
  });
  return { company, total: all.length, jobs: all.filter(keep) };
}
