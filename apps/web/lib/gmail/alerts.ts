import { createHash } from "node:crypto";
import type { NormalizedJob } from "@/lib/jobs/types";
import { htmlToPlain } from "@/lib/jobs/text";
import { decodeHtml } from "./match";

// Extracts job listings from job-alert emails (Indeed digests & matches, Naukri, hirist). Rule-based.

export type AlertEmail = { from: string; subject: string; html: string; date: Date };
type Line = { text: string; href?: string };

export const ALERT_SENDERS = /@(match\.indeed\.com|jobalert\.indeed\.com|naukri\.com|[a-z.]*hirist\.tech|jobalerts-noreply@linkedin\.com)/i;
export const ALERT_QUERY = "from:(match.indeed.com OR jobalert.indeed.com OR naukri.com OR hirist.tech)";

/** HTML → text lines, keeping which line came from which link. */
function linesWithLinks(html: string): Line[] {
  const hrefs: string[] = [];
  const marked = html.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi, (_, href: string) => {
    hrefs.push(href.replace(/&amp;/g, "&"));
    return `<br><a href="#">⟦${hrefs.length - 1}⟧`;
  });
  // Each link on its own line, so "Apply" never merges with the next title
  // Email layouts are tables: break after every cell/block so fields land on separate lines
  return htmlToPlain(marked.replace(/<\/a>/gi, "</a><br>").replace(/<\/(td|th|tr|div|p|li|h[1-6]|table)>/gi, "$&<br>"))
    .split("\n")
    .map((raw) => {
      const m = raw.match(/⟦(\d+)⟧/);
      const text = decodeHtml(raw.replace(/⟦\d+⟧/g, "")).replace(/[​-‍͏­ ]+/g, "").replace(/\s+/g, " ").trim();
      return { text, href: m ? hrefs[Number(m[1])] : undefined };
    })
    .filter((l) => l.text);
}

const SALARY = /₹|\$|€|£|\b(a|per) (month|year|hour|annum)\b|\blpa\b|lacs?|lakhs?|not disclosed/i;
const ago = (s: string, from: Date): Date | null => {
  const m = s.match(/(\d+)\+?\s+days?\s+ago/i);
  if (m) return new Date(from.getTime() - Number(m[1]) * 86400000);
  if (/just posted|today|hours? ago/i.test(s)) return from;
  if (/yesterday/i.test(s)) return new Date(from.getTime() - 86400000);
  return null;
};
const remote = (s: string | null) => !!s && /remote|work from home|wfh/i.test(s);
const id = (provider: string, company: string, title: string, location: string | null) =>
  `${provider}:${createHash("sha1").update(`${company}|${title}|${location ?? ""}`.toLowerCase()).digest("hex").slice(0, 20)}`;

function job(provider: string, via: string, p: { title: string; company: string; location: string | null; salary: string | null; url: string; postedAt: Date | null; description: string }): NormalizedJob {
  return {
    source: "email",
    externalId: id(provider, p.company, p.title, p.location),
    company: p.company.slice(0, 200),
    title: p.title.slice(0, 300),
    location: p.location,
    remote: remote(p.location) || remote(p.title),
    salary: p.salary,
    description: p.description,
    url: p.url,
    postedAt: p.postedAt,
    via,
  };
}

function indeedDigest(e: AlertEmail): NormalizedJob[] {
  const lines = linesWithLinks(e.html);
  const out: NormalizedJob[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.href || !/\/rc\/clk|viewjob|\/pagead\/clk/.test(l.href)) continue;
    const rest: string[] = [];
    for (let j = i + 1; j < lines.length && rest.length < 8; j++) {
      if (lines[j].href && /\/rc\/clk|viewjob|\/pagead\/clk/.test(lines[j].href!)) break;
      rest.push(lines[j].text);
    }
    const [company, location] = rest;
    if (!company) continue;
    const salary = rest.slice(2).find((t) => SALARY.test(t) && /\d/.test(t)) ?? null;
    const postedAt = rest.map((t) => ago(t, e.date)).find(Boolean) ?? e.date;
    out.push(
      job("indeed", "Indeed", {
        title: l.text,
        company,
        location: location ?? null,
        salary,
        url: l.href,
        postedAt,
        description: [`${l.text} at ${company}${location ? `, ${location}` : ""}.`, salary && `Salary: ${salary}.`, rest.filter((t) => /easily apply|responsive employer|urgently hiring/i.test(t)).join(" · ")]
          .filter(Boolean)
          .join("\n") + "\n\n(From an Indeed job alert. Open the posting for the full description.)",
      }),
    );
  }
  return out;
}

function indeedMatch(e: AlertEmail): NormalizedJob[] {
  const m = decodeHtml(e.subject).match(/^(.+?)\s+@\s+(.+)$/);
  if (!m) return [];
  const [, title, company] = m.map((x) => x.trim());
  const lines = linesWithLinks(e.html);
  const url = lines.find((l) => l.href && /view job/i.test(l.text))?.href ?? lines.find((l) => l.href && l.text === title)?.href;
  if (!url) return [];
  // Card: title (link) → company → location
  const t = lines.findIndex((l) => l.text === title && l.href);
  const location = t >= 0 && lines[t + 1]?.text === company ? (lines[t + 2]?.text ?? null) : null;
  const salary = lines.find((l) => SALARY.test(l.text) && /\d/.test(l.text) && l.text.length < 60)?.text.replace(/\.$/, "") ?? null;
  const body = lines.map((l) => l.text).filter((x) => !/^(view job|this is a bad match|learn more|yes|no|edit profile|pause these emails|indeed)$/i.test(x));
  const footer = body.findIndex((x) => /^(was this|did we|why am i receiving|©)/i.test(x));
  return [job("indeed", "Indeed", { title, company, location, salary, url, postedAt: e.date, description: body.slice(0, footer > 0 ? footer : undefined).join("\n").slice(0, 8000) })];
}

function hirist(e: AlertEmail): NormalizedJob[] {
  const m = decodeHtml(e.subject).match(/hiring\s*\|\s*(.+?)\s+at\s+(.+)$/i);
  if (!m) return [];
  const [, title, company] = m.map((x) => x.trim());
  const lines = linesWithLinks(e.html);
  const url = lines.find((l) => l.href && /apply now/i.test(l.text))?.href;
  if (!url) return [];
  const location = lines.find((l) => /^location\s*:/i.test(l.text))?.text.replace(/^location\s*:\s*/i, "") ?? null;
  const exp = lines.find((l) => /^experience\s*:/i.test(l.text))?.text;
  const start = lines.findIndex((l) => /apply now/i.test(l.text));
  const desc = lines.slice(start + 1).map((l) => l.text).filter((x) => !/early applicants|apply now|get app|unsubscribe/i.test(x));
  return [job("hirist", "hirist", { title, company, location, salary: null, url, postedAt: e.date, description: [exp, ...desc].filter(Boolean).join("\n").slice(0, 8000) })];
}

function naukri(e: AlertEmail): NormalizedJob[] {
  const lines = linesWithLinks(e.html);
  const out: NormalizedJob[] = [];
  let block: Line[] = [];
  const SKIP = /^(get app|apply|view all|are these jobs relevant|jobs outside your preference|seize all|switch to app|find jobs that)/i;
  for (const l of lines) {
    if (/^apply$/i.test(l.text)) {
      const b = block.filter((x) => !SKIP.test(x.text));
      block = [];
      if (b.length < 3) continue;
      const [t, c, meta] = b.slice(-3);
      const sal = meta.text.match(/(\d[\d.\s–-]*\s*(lacs|lakhs|lpa|cr)[^,]*|not disclosed)$/i);
      const location = (sal ? meta.text.slice(0, sal.index).trim() : meta.text) || null;
      out.push(
        job("naukri", "Naukri", {
          title: t.text,
          company: c.text.replace(/\s+\d(\.\d)?$/, ""), // trailing rating "PlanetSpark 3.7"
          location,
          salary: sal && !/not disclosed/i.test(sal[0]) ? sal[0] : null,
          url: l.href ?? t.href ?? "",
          postedAt: e.date,
          description: `${t.text} at ${c.text}${location ? `, ${location}` : ""}.\n\n(From a Naukri job alert. Open the posting for the full description.)`,
        }),
      );
      continue;
    }
    block.push(l);
  }
  return out.filter((j) => j.url);
}

export function parseJobAlert(e: AlertEmail): NormalizedJob[] {
  const from = e.from.toLowerCase();
  if (from.includes("match.indeed.com")) return indeedMatch(e);
  if (from.includes("jobalert.indeed.com")) return indeedDigest(e);
  if (from.includes("hirist.tech")) return hirist(e);
  if (from.includes("naukri.com")) return naukri(e);
  return [];
}
