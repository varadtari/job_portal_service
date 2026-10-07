import type { ResumeContent } from "@/lib/resume/types";

/** Derives canonical profile values from a parsed resume. */
export function profileFromResume(r: ResumeContent): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (k: string, v: string | null | undefined) => {
    if (v && v.trim()) out[k] = v.trim();
  };

  const parts = r.basics.name.trim().split(/\s+/);
  if (parts.length > 1) {
    set("first_name", parts[0]);
    set("last_name", parts.slice(1).join(" "));
  } else set("first_name", parts[0]);
  set("email", r.basics.email);
  set("phone", r.basics.phone);
  if (r.basics.location) {
    const [city, ...rest] = r.basics.location.split(",").map((s) => s.trim());
    set("city", city);
    if (rest.length === 1) set("country", rest[0]);
    if (rest.length >= 2) {
      set("state", rest[0]);
      set("country", rest[rest.length - 1]);
    }
  }
  set("short_bio", r.basics.summary);

  for (const l of r.basics.links) {
    const u = l.url.toLowerCase();
    const url = /^https?:\/\//.test(l.url) ? l.url : `https://${l.url}`;
    if (u.includes("linkedin.com")) set("linkedin_url", url);
    else if (u.includes("github.com")) set("github_url", url);
    else if (u.includes("twitter.com") || u.includes("x.com/")) set("twitter_url", url);
    else if (!out.portfolio_url) set("portfolio_url", url);
  }

  const current = r.experience.find((e) => e.current) ?? r.experience[0];
  if (current) {
    set("current_title", current.title);
    set("current_company", current.company);
  }

  const edu = r.education[0];
  if (edu) {
    set("highest_degree", edu.degree);
    set("field_of_study", edu.field);
    set("university", edu.institution);
    set("graduation_year", edu.end?.match(/\d{4}/)?.[0]);
  }
  return out;
}
