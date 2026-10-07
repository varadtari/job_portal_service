export type JobSource = "greenhouse" | "lever" | "ashby" | "jsearch" | "adzuna" | "remotive" | "himalayas" | "jobicy" | "email" | "manual";

export type NormalizedJob = {
  source: JobSource;
  externalId: string;
  company: string;
  title: string;
  location: string | null;
  remote: boolean;
  salary: string | null;
  description: string; // plain text
  url: string;
  postedAt: Date | null;
  via?: string | null; // original site for aggregator results, e.g. "LinkedIn"
};

export type Ats = "greenhouse" | "lever" | "ashby";

export const ATS_LABEL: Record<Ats, string> = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby" };
