export function timeAgo(d: Date | null | undefined): string {
  if (!d) return "";
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export const SOURCE_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  jsearch: "JSearch",
  adzuna: "Adzuna",
  remotive: "Remotive",
  himalayas: "Himalayas",
  jobicy: "Jobicy",
  email: "Email alert",
  directory: "Company directory",
  manual: "Added by you",
  website: "Company website",
};

export const STATUS_LABEL: Record<string, string> = {
  saved: "Saved",
  applied: "Applied",
  oa: "Assessment",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  ghosted: "No response",
};

const ATS_SOURCES = new Set(["greenhouse", "lever", "ashby"]);

/** Company-board jobs not returned by a sync for 3+ days have probably been closed. */
export function isProbablyClosed(source: string, lastSeenAt: Date): boolean {
  return ATS_SOURCES.has(source) && Date.now() - lastSeenAt.getTime() > 3 * 86400000;
}

/** A Date `days` before now (kept out of render bodies for the purity lint rule). */
export const daysAgo = (days: number) => new Date(Date.now() - days * 86400000);

/** Current time (kept out of render bodies for the purity lint rule). */
export const nowMs = () => Date.now();
