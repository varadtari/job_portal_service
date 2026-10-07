import type { NormalizedJob } from "../types";
import { decodeEntities, htmlToPlain, isRemoteText } from "../text";
import { fetchAshby } from "./ashby";
import { fetchGreenhouse } from "./greenhouse";
import { fetchLever } from "./lever";

/** Recognises job URLs on supported boards: returns the board + job id for a direct API lookup. */
export function parseBoardUrl(raw: string): { ats: "greenhouse" | "lever" | "ashby"; slug: string; jobId: string } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const parts = u.pathname.split("/").filter(Boolean);
  if (/(^|\.)greenhouse\.io$/.test(u.hostname)) {
    // boards.greenhouse.io/{slug}/jobs/{id}  or  job-boards.greenhouse.io/{slug}/jobs/{id}
    const i = parts.indexOf("jobs");
    if (i === 1) return { ats: "greenhouse", slug: parts[0], jobId: parts[2] };
    const gh = u.searchParams.get("gh_jid") ?? u.searchParams.get("token");
    if (gh && u.searchParams.get("for")) return { ats: "greenhouse", slug: u.searchParams.get("for")!, jobId: gh };
  }
  if (u.hostname === "jobs.lever.co" && parts.length >= 2) return { ats: "lever", slug: parts[0], jobId: parts[1] };
  if (u.hostname === "jobs.ashbyhq.com" && parts.length >= 2) return { ats: "ashby", slug: parts[0], jobId: parts[1] };
  return null;
}

type JsonLdJob = {
  "@type"?: string | string[];
  title?: string;
  description?: string;
  datePosted?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?: unknown;
  jobLocationType?: string;
  baseSalary?: { currency?: string; value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string } };
  identifier?: { value?: string } | string;
};

function findJobPosting(node: unknown): JsonLdJob | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findJobPosting(n);
      if (f) return f;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  const t = o["@type"];
  if (t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"))) return o as JsonLdJob;
  return findJobPosting(o["@graph"]);
}

function locationText(loc: unknown): string | null {
  const list = Array.isArray(loc) ? loc : loc ? [loc] : [];
  const out = list
    .map((l) => {
      const a = (l as { address?: Record<string, string> | string })?.address;
      if (!a) return null;
      if (typeof a === "string") return a;
      return [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(", ");
    })
    .filter(Boolean);
  return out.length ? out.join(" / ") : null;
}

const meta = (html: string, prop: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i"))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i"))?.[1] ??
  null;

/** Imports a single job from a pasted URL. Throws if nothing usable is found. */
export async function importJobFromUrl(url: string): Promise<NormalizedJob> {
  const board = parseBoardUrl(url);
  if (board) {
    const fetcher = { greenhouse: fetchGreenhouse, lever: fetchLever, ashby: fetchAshby }[board.ats];
    const id = `${board.slug}:${board.jobId}`;
    const { jobs } = await fetcher(board.slug, undefined, (j) => j.externalId === id);
    if (jobs[0]) return jobs[0];
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
      Accept: "text/html",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`The page returned HTTP ${res.status}. It may need a login. Add the job manually instead.`);
  const job = jobFromHtml(await res.text(), url, res.url);
  if (!job) throw new Error("Couldn't find job details on that page. Add the job manually instead.");
  return job;
}

/** Extracts a job from a page's schema.org JobPosting data, falling back to OpenGraph tags. */
export function jobFromHtml(html: string, url: string, finalUrl = url): NormalizedJob | null {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const jp = findJobPosting(data);
    if (!jp?.title) continue;
    const company = typeof jp.hiringOrganization === "string" ? jp.hiringOrganization : jp.hiringOrganization?.name;
    const location = locationText(jp.jobLocation);
    const v = jp.baseSalary?.value;
    const salary =
      v && (v.minValue || v.value)
        ? `${jp.baseSalary?.currency ?? ""} ${(v.minValue ?? v.value)!.toLocaleString()}${v.maxValue ? `–${v.maxValue.toLocaleString()}` : ""}${v.unitText ? ` / ${v.unitText.toLowerCase()}` : ""}`.trim()
        : null;
    return {
      source: "manual",
      externalId: url,
      company: decodeEntities(company ?? new URL(finalUrl).hostname.replace(/^www\./, "")),
      title: decodeEntities(jp.title),
      location,
      remote: jp.jobLocationType === "TELECOMMUTE" || isRemoteText(location, jp.title),
      salary,
      description: htmlToPlain(decodeEntities(jp.description ?? "")),
      url,
      postedAt: jp.datePosted ? new Date(jp.datePosted) : null,
    };
  }

  const title = meta(html, "og:title") ?? html.match(/<title>([^<]*)<\/title>/i)?.[1];
  const desc = meta(html, "og:description") ?? meta(html, "description");
  if (title && desc && desc.length > 200) {
    return {
      source: "manual",
      externalId: url,
      company: meta(html, "og:site_name") ?? new URL(finalUrl).hostname.replace(/^www\./, ""),
      title: decodeEntities(title.trim()),
      location: null,
      remote: isRemoteText(title, desc),
      salary: null,
      description: decodeEntities(desc),
      url,
      postedAt: null,
    };
  }
  return null;
}
