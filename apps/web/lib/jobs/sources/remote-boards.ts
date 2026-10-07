import type { NormalizedJob } from "../types";
import { fetchJson, htmlToPlain } from "../text";

// Free remote-job APIs (no keys). Location = the regions candidates may live in.

type RemotiveJob = {
  id: number;
  title: string;
  company_name: string;
  candidate_required_location: string;
  publication_date: string;
  url: string;
  salary: string;
  description: string;
};

export async function fetchRemotive(query: string): Promise<NormalizedJob[]> {
  const data = await fetchJson<{ jobs: RemotiveJob[] }>(
    `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=100`,
  );
  return data.jobs.map((j) => ({
    source: "remotive",
    externalId: String(j.id),
    company: j.company_name,
    title: j.title,
    location: j.candidate_required_location || "Worldwide",
    remote: true,
    salary: j.salary || null,
    description: htmlToPlain(j.description),
    url: j.url,
    postedAt: new Date(j.publication_date),
  }));
}

type HimalayasJob = {
  guid: string;
  title: string;
  companyName: string;
  locationRestrictions: string[];
  pubDate: number | string;
  applicationLink: string;
  minSalary: number | null;
  maxSalary: number | null;
  currency: string | null;
  description: string;
};

export async function fetchHimalayas(query: string): Promise<NormalizedJob[]> {
  const data = await fetchJson<{ jobs: HimalayasJob[] }>(
    `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(query)}&limit=20`,
  );
  return data.jobs.map((j) => ({
    source: "himalayas",
    externalId: j.guid,
    company: j.companyName,
    title: j.title,
    location: j.locationRestrictions?.length ? j.locationRestrictions.join(", ") : "Worldwide",
    remote: true,
    salary: j.minSalary && j.maxSalary ? `${j.currency ?? ""} ${j.minSalary.toLocaleString()}–${j.maxSalary.toLocaleString()}`.trim() : null,
    description: htmlToPlain(j.description),
    url: j.applicationLink,
    postedAt: new Date(Number(j.pubDate) * 1000),
  }));
}

type JobicyJob = {
  id: number;
  jobTitle: string;
  companyName: string;
  jobGeo: string;
  pubDate: string;
  url: string;
  jobDescription: string;
};

export async function fetchJobicy(query: string): Promise<NormalizedJob[]> {
  // Jobicy filters by tag; use the first meaningful word of the query
  const tag = query.split(/[,|]/)[0].trim().split(/\s+/)[0] ?? query;
  const data = await fetchJson<{ jobs?: JobicyJob[] }>(
    `https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(tag)}`,
  );
  return (data.jobs ?? []).map((j) => ({
    source: "jobicy",
    externalId: String(j.id),
    company: j.companyName,
    title: j.jobTitle,
    location: j.jobGeo || "Worldwide",
    remote: true,
    salary: null,
    description: htmlToPlain(j.jobDescription),
    url: j.url,
    postedAt: new Date(j.pubDate),
  }));
}
