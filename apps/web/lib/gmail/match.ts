// Links an email to one of the user's applications using company names, sender domain and job title.

export type AppRef = { id: string; company: string; title: string };
export type EmailMeta = { from: string; subject: string; text: string };

const GENERIC = new Set([
  "inc", "llc", "ltd", "limited", "pvt", "private", "corp", "corporation", "co", "company", "technologies", "technology", "tech",
  "solutions", "labs", "systems", "software", "services", "group", "global", "india", "the", "careers", "jobs", "hiring", "recruiting",
  "talent", "team", "hr", "noreply", "no", "reply", "notifications", "mail", "email", "board", "boards",
]);
// Senders that mail on behalf of companies: their domain says nothing about the employer.
const PLATFORM_DOMAINS = /greenhouse|lever\.co|ashbyhq|myworkday|workday|smartrecruiters|icims|hackerrank|codility|hackerearth|codesignal|naukri|linkedin|instahyre|wellfound|indeed|gmail|outlook|yahoo|zohorecruit|freshteam|darwinbox|keka|recruitee|teamtailor|workable|bamboohr|jobvite|successfactors|taleo/i;

export const normCompany = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !GENERIC.has(w))
    .join(" ");

function senderParts(from: string): { name: string; domain: string } {
  const m = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  const email = (m ? m[2] : from).trim().toLowerCase();
  const name = (m ? m[1] : "").trim();
  const domain = email.split("@")[1] ?? "";
  return { name, domain };
}

/** Best-guess employer name from the email itself (for confirmations of applications made outside JobPilot). */
export function guessCompany(e: EmailMeta): string | null {
  const s = e.subject;
  const m =
    s.match(/^(.+?)\s+invites you\b/i) ??
    s.match(/^application successful:\s*([^-–|]+?)\s*[-–|]/i) ??
    s.match(/(?:applying|application|applied|interest)\s+(?:to|at|with)\s+([A-Z][\w&.\- ]{1,40}?)(?:\s*[!.,:|–-]|\s+for\b|$)/) ??
    s.match(/^(?:thank you|thanks)[^|–-]*[|–-]\s*([A-Z][\w&.\- ]{1,40})$/i) ??
    e.text.match(/(?:applying|application)\s+(?:to|at|with)\s+([A-Z][\w&.\-]+(?:\s[A-Z][\w&.\-]+){0,3})/);
  if (m) return m[1].trim();
  const { name, domain } = senderParts(e.from);
  if (PLATFORM_DOMAINS.test(domain) && PLATFORM_DOMAINS.test(name)) return null; // e.g. "Indeed Apply" isn't the employer
  if (domain && !PLATFORM_DOMAINS.test(domain)) {
    // Registrable part: jobalerts.cisco.com → cisco, careers.tcs.co.in → tcs
    const parts = domain.split(".");
    const sld = parts.length >= 3 && ["co", "com", "ac", "org", "gov", "net"].includes(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2];
    if (sld && sld.length > 1 && !/^(gmail|outlook|yahoo|hotmail)$/.test(sld)) return sld.charAt(0).toUpperCase() + sld.slice(1);
  }
  if (PLATFORM_DOMAINS.test(name)) return null;
  const cleaned = name.replace(/\b(careers|jobs|hiring|recruiting|recruitment|talent( acquisition)?|team|hr|support|via .*|@.*)\b/gi, "").trim();
  return cleaned.length > 1 ? cleaned : null;
}

/** Scores each application; returns the best one only if it clearly beats the rest. */
export function matchApplication(e: EmailMeta, apps: AppRef[]): { app: AppRef | null; score: number; ambiguous: boolean } {
  const { name, domain } = senderParts(e.from);
  const subject = e.subject.toLowerCase();
  const body = e.text.slice(0, 8000).toLowerCase();
  const sender = `${name} ${PLATFORM_DOMAINS.test(domain) ? "" : domain}`.toLowerCase();

  const scored = apps.map((a) => {
    const company = normCompany(a.company);
    if (!company) return { app: a, score: 0 };
    const re = new RegExp(`(^|[^a-z0-9])${company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[^a-z0-9]*")}([^a-z0-9]|$)`, "i");
    let score = 0;
    if (re.test(sender) || (domain && domain.replace(/[^a-z0-9]/g, "").includes(company.replace(/ /g, "")))) score += 3;
    if (re.test(subject)) score += 3;
    if (re.test(body)) score += 2;
    if (score === 0) return { app: a, score };
    // Title evidence, proportional, counting level markers like "II" / "3" (they separate roles at one company)
    const titleWords = a.title
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter((w) => (w.length > 2 || /^(i{1,3}|iv|v|\d)$/.test(w)) && !["and", "the", "for", "with"].includes(w));
    const text = ` ${subject} ${body} `.replace(/[^a-z0-9+#]+/g, " ");
    const titleHits = titleWords.filter((w) => text.includes(` ${w} `)).length;
    if (titleWords.length && titleHits / titleWords.length >= 0.5) score += (2 * titleHits) / titleWords.length;
    return { app: a, score };
  });
  scored.sort((x, y) => y.score - x.score);
  const [best, second] = scored;
  if (!best || best.score < 3) return { app: null, score: best?.score ?? 0, ambiguous: false };
  const ambiguous = !!second && second.score === best.score;
  return { app: ambiguous ? null : best.app, score: best.score, ambiguous };
}

const ROLE_WORD = /\b(engineer|developer|analyst|intern|manager|scientist|designer|consultant|architect|sde|swe|specialist|lead|associate|executive|administrator|tester|programmer|devops|sre|qa)\b/i;

export const decodeHtml = (s: string) =>
  s.replace(/&nbsp;| /g, " ").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");

function cleanTitle(t: string): string | null {
  const out = t
    .replace(/^(the|our|a|an)\s+/i, "")
    .replace(/^(post|position|role|job) of\s+/i, "")
    .replace(/\s*\((?:[^)]*\d{3,}[^)]*|req[^)]*|job id[^)]*)\)\s*$/i, "") // trailing ids like (502927)
    .replace(/\s*[-–|]\s*(job id|req(uisition)?)\b.*$/i, "")
    .replace(/[\s.,!:;–-]+$/, "")
    .trim();
  return out.length >= 3 && out.length <= 100 && ROLE_WORD.test(out) ? out : null;
}

/** Job title from an email, or null if nothing role-like is found. */
export function guessTitle(e: EmailMeta): string | null {
  const subject = decodeHtml(e.subject);
  const body = decodeHtml(e.text.slice(0, 4000));
  const subjectPatterns = [
    /^application successful:\s*[^-–|]+?\s*[-–|]\s*(.+?)(?:\s*\(|$)/i,
    /^indeed application:\s*(.+)$/i,
    /update on your application (?:to|at|with) [^-–|]+?\s*[-–|]\s*(.+)$/i,
    /(?:application|applying|applied) (?:for|to) (?:the |our )?(?:post of |position of )?(.+?)(?:\s+(?:position|role|job|opening)\b|\s+(?:at|with)\s+|\s*[-–|(]|$)/i,
    /(?:for|:)\s+(?:the\s+)?(.+?)\s+(?:position|role|opening)\b/i,
    /^(?:interview|assessment)[^:–-]*[:–-]\s*(.+)$/i,
  ];
  for (const re of subjectPatterns) {
    const t = subject.match(re)?.[1];
    const c = t && cleanTitle(t);
    if (c) return c;
  }
  const bodyPatterns = [
    /(?:applying|application|applied) (?:for|to) (?:the |our )?(?:position of |post of |role of )?([A-Z][^.\n!?]{2,90}?)(?:\s+(?:position|role|opening)\b|\s*\(|[.!?\n]|\s+(?:at|with)\s)/,
    /(?:position|role) of ([A-Z][^.\n!?]{2,80}?)(?:[.!?\n]|\s+(?:at|with)\s)/,
  ];
  for (const re of bodyPatterns) {
    const t = body.match(re)?.[1];
    const c = t && cleanTitle(t);
    if (c) return c;
  }
  return null;
}
