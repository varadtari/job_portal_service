import type { ResumeContent } from "./types";

// Rule-based resume parser used when no AI key is configured.
// Best effort: the output is meant to be reviewed in the editor.

type SectionKind = "summary" | "experience" | "education" | "skills" | "projects" | "certifications" | "extra";

const HEADINGS: [RegExp, SectionKind][] = [
  [/^(professional\s+)?(summary|profile|about( me)?|objective|career objective)$/, "summary"],
  [/^((work|professional|relevant|earlier|previous|prior|other|additional)\s+)?(experience|employment( history)?|work history|career history)$|^internships?( experience)?$/, "experience"],
  [/^(education|academics?|academic (background|qualifications?)|qualifications?)$/, "education"],
  [/^((technical|core|key)\s+)?(skills|competencies|technologies|tech stack|skills? (&|and) tools)$/, "skills"],
  [/^((personal|academic|selected|key)\s+)?projects?$/, "projects"],
  [/^(certifications?|certificates?|licen[cs]es?( (&|and) certifications?)?)$/, "certifications"],
  [/^(awards?|achievements?|honou?rs?( (&|and) awards?)?|publications?|languages?|volunteer(ing)?( experience)?|interests|hobbies|activities|extra-?curricular( activities)?|leadership|positions? of responsibility)$/, "extra"],
];

const BULLET = /^\s*([-–•*▪●◦·‣➢>]|\d{1,2}[.)])\s+/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;
const URL_RE = /\b((https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|in|io|dev|me|org|net|ai|app|co|tech|xyz)(\/[^\s|,]*)?)/i;
// In body sections, require a scheme, www or a path so "Socket.io" / "Node.js" aren't URLs.
const STRICT_URL = /\b((https?:\/\/|www\.)[^\s|,()]+|[a-z0-9-]+(\.[a-z0-9-]+)+\/[^\s|,()]*)/i;
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE = `(?:${MONTH}\\s*'?\\d{2,4}|\\d{1,2}[/.-]\\d{2,4}|\\d{4})`;
const RANGE = new RegExp(`\\(?\\s*(${DATE})\\s*(?:[-–—]|to|till|until)\\s*(${DATE}|present|current|now|ongoing|till date)\\s*\\)?`, "i");
const SINGLE_DATE = new RegExp(`\\(?\\s*(${DATE})\\s*\\)?[\\s|,]*$`, "i");
const SEP = /\s+[|—–]\s+|\s+-\s+|\s*\|\s*|\s+@\s+|\s+at\s+/;

function headingOf(line: string): { kind: SectionKind; heading: string } | null {
  const clean = line.replace(/[:：]\s*$/, "").trim();
  if (clean.length > 45 || BULLET.test(line)) return null;
  const norm = clean.toLowerCase().replace(/\s+/g, " ");
  for (const [re, kind] of HEADINGS) if (re.test(norm)) return { kind, heading: titleCase(clean) };
  return null;
}

function titleCase(s: string) {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s;
}

/** Re-joins lines the PDF extractor wrapped mid-field. */
function unwrap(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    const isContinuation =
      prev !== undefined &&
      !BULLET.test(line) &&
      !headingOf(line) &&
      !headingOf(prev) &&
      !EMAIL.test(line.split(/\s/)[0]) &&
      !URL_RE.test(line.split(/\s/)[0]) &&
      (/[,(&/]$|\b(and|of|in|for|with|the|to)$/i.test(prev) || /^[a-z(]/.test(line) || /^[\d.]+%?\)?$/.test(line));
    if (isContinuation) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out;
}

function splitParts(s: string) {
  return s.split(SEP).map((p) => p.replace(/^[,\s]+|[,\s]+$/g, "")).filter(Boolean);
}

function extractDates(s: string): { rest: string; start: string | null; end: string | null; current: boolean } {
  const m = s.match(RANGE);
  if (m) {
    const endRaw = m[2];
    const current = /present|current|now|ongoing|till date/i.test(endRaw);
    return { rest: s.replace(m[0], " ").trim(), start: m[1], end: current ? null : endRaw, current };
  }
  const single = s.match(SINGLE_DATE);
  if (single) return { rest: s.replace(single[0], " ").trim(), start: null, end: single[1], current: false };
  return { rest: s, start: null, end: null, current: false };
}

const ROLE_WORDS = /\b(engineer(ing)?|developer|development|software|backend|back-end|frontend|front-end|full[- ]?stack|integration|intern|analyst|manager|lead|architect|consultant|designer|scientist|sde|associate|specialist|administrator|tester|qa|devops|data|cloud|programmer|executive|officer|head|director)\b/i;
const COMPANY_WORDS = /\b(pvt|private|ltd|limited|llp|llc|inc|corp(oration)?|co\.|company|technologies|technology|tech|solutions|labs?|systems|software|services|innovations?|infotech|consultancy|consulting|group|global|gmbh|bank|ventures|networks|digital|studios?|india)\b/i;
const KNOWN_PLACES = /india|bengaluru|bangalore|pune|mumbai|hyderabad|chennai|delhi|gurgaon|gurugram|noida|kolkata|ahmedabad|goa|kochi|jaipur|indore|nagpur|usa|united states|uk|london|singapore|dubai|remote/i;

function looksLikeLocation(t: string): boolean {
  if (/\d{3,}|@|&|\bhttps?:/i.test(t) || ROLE_WORDS.test(t)) return false;
  if (KNOWN_PLACES.test(t)) return true;
  const parts = t.split(",").map((p) => p.trim());
  return parts.length >= 2 && parts.length <= 4 && parts.every((p) => p && p.split(/\s+/).length <= 3);
}

/** Orders two header parts into [title, company]. */
function titleAndCompany(a: string, b: string): [string, string] {
  const score = (s: string) => (ROLE_WORDS.test(s) ? 1 : 0) - (COMPANY_WORDS.test(s) ? 1 : 0);
  // Default convention is "Company — Title"; swap when the first part reads more like a title.
  return score(a) > score(b) ? [a, b] : [b, a];
}

type Entry = { header: string[]; bullets: string[] };

/** Groups lines into entries: header line(s) followed by bullets. */
function entries(lines: string[]): Entry[] {
  const out: Entry[] = [];
  let cur: Entry | null = null;
  for (const line of lines) {
    if (BULLET.test(line)) {
      if (!cur) cur = { header: [], bullets: [] };
      cur.bullets.push(line.replace(BULLET, "").trim());
      continue;
    }
    // A non-bullet line after bullets starts a new entry; consecutive header lines stay together (max 3).
    const dated = (l: string) => RANGE.test(l) || /\b(19|20)\d{2}\b/.test(l);
    const startsNew = !cur || cur.bullets.length > 0 || cur.header.length >= 3 || (dated(line) && cur.header.some(dated));
    if (startsNew) {
      if (cur) out.push(cur);
      cur = { header: [line], bullets: [] };
    } else cur!.header.push(line);
  }
  if (cur) out.push(cur);
  return out;
}

function parseBasics(lines: string[]): ResumeContent["basics"] {
  const text = lines.join("\n");
  const email = text.match(EMAIL)?.[0] ?? null;
  const links: { label: string; url: string }[] = [];
  const tokens = lines.flatMap((l) => l.split(/\s*[|•·]\s*|\s{3,}/)).map((t) => t.trim()).filter(Boolean);
  let name = "";
  let headline: string | null = null;
  let location: string | null = null;
  let phone: string | null = null;

  for (const t of tokens) {
    if (EMAIL.test(t)) continue;
    const url = t.match(URL_RE);
    if (url && !t.includes(" ")) {
      const u = url[1];
      const label = /linkedin/i.test(u) ? "LinkedIn" : /github/i.test(u) ? "GitHub" : "Website";
      links.push({ label, url: u });
      continue;
    }
    const ph = t.match(PHONE);
    if (ph && ph[1].replace(/\D/g, "").length >= 10) {
      phone ??= ph[1].trim();
      continue;
    }
    if (!name) name = t;
    else if (!location && looksLikeLocation(t)) location = t;
    else if (!headline) headline = t;
    else if (ROLE_WORDS.test(t) && headline.length + t.length < 90) headline = `${headline} | ${t}`;
  }
  return { name, email, phone, location, headline, summary: null, links };
}

function parseExperience(lines: string[]): ResumeContent["experience"] {
  return entries(lines).map(({ header, bullets }) => {
    const { rest, start, end, current } = extractDates(header.join(" | "));
    const parts = splitParts(rest);
    let [title, company] = parts.length >= 2 ? titleAndCompany(parts[0], parts[1]) : ["", parts[0] ?? ""];
    let location: string | null = parts[2] ?? null;
    // "Title at Company"
    const at = rest.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
    if (at) [title, company] = [at[1].trim(), splitParts(at[2])[0]];
    // "Title, Location" inside the second part
    if (!location && title.includes(",")) {
      const [t, ...loc] = title.split(",").map((s) => s.trim());
      title = t;
      location = loc.join(", ") || null;
    }
    return { company, title, location, start, end, current, bullets };
  });
}

const DEGREE = /\b(b\.?\s?tech|b\.?\s?e\.?|b\.?\s?sc?|b\.?\s?com|b\.?\s?a\.?|bca|m\.?\s?tech|m\.?\s?e\.?|m\.?\s?sc?|mca|mba|ph\.?\s?d|bachelor[^,|]*|master[^,|]*|diploma[^,|]*|hsc|ssc|class (x|xii|10|12)(th)?|12th|10th)\b/i;
const INSTITUTION = /(university|college|institute|school|academy|iit|nit|iiit|bits|vidyalaya|polytechnic)/i;

function parseEducation(lines: string[]): ResumeContent["education"] {
  return entries(lines).map(({ header, bullets }) => {
    let rest = header.join(" | ");
    const gradeMatch = rest.match(/(c?gpa|cpi|sgpa|percentage|score)\s*[:\-]?\s*([\d.]+\s*(\/\s*[\d.]+)?%?)|([\d.]+\s*%)/i);
    const grade = gradeMatch ? gradeMatch[0].trim() : null;
    if (gradeMatch) rest = rest.replace(gradeMatch[0], " ");
    const dates = extractDates(rest);
    const { start, end } = dates;
    rest = dates.rest;
    const parts = rest.split(/\s+[|—–]\s+|\s*\|\s*|,\s*/).map((p) => p.trim()).filter(Boolean);
    const institution = parts.find((p) => INSTITUTION.test(p)) ?? parts[0] ?? "";
    const degreePart = parts.find((p) => p !== institution && DEGREE.test(p)) ?? null;
    let degree = degreePart;
    let field: string | null = null;
    if (degreePart) {
      const inMatch = degreePart.match(/^(.+?)\s+in\s+(.+)$/i);
      if (inMatch) [degree, field] = [inMatch[1], inMatch[2]];
      else field = parts[parts.indexOf(degreePart) + 1] ?? null;
      if (field && (INSTITUTION.test(field) || field === institution)) field = null;
    }
    return { institution, degree, field, start, end, grade, details: bullets };
  });
}

function parseSkills(lines: string[]): ResumeContent["skills"] {
  const out: ResumeContent["skills"] = [];
  for (const raw of lines) {
    const line = raw.replace(BULLET, "");
    const m = line.match(/^([^:]{2,40}):\s*(.+)$/);
    const items = (m ? m[2] : line).split(/\s*[,|•·;]\s*/).map((s) => s.trim()).filter(Boolean);
    if (!items.length) continue;
    if (m) out.push({ category: m[1].trim(), items });
    else if (out.length && out[out.length - 1].category === "Skills") out[out.length - 1].items.push(...items);
    else out.push({ category: "Skills", items });
  }
  return out;
}

function parseProjects(lines: string[]): ResumeContent["projects"] {
  return entries(lines).map(({ header, bullets }) => {
    const h = extractDates(header.join(" | ")).rest;
    const url = h.match(STRICT_URL)?.[1] ?? null;
    const noUrl = url ? h.replace(url, " ") : h;
    const techParen = noUrl.match(/\(([^)]+)\)/);
    const parts = splitParts(noUrl.replace(techParen?.[0] ?? "", " "));
    const techText = techParen?.[1] ?? parts.slice(1).join(", ");
    const tech = techText.replace(/^(tech(nologies)?|stack|tools)\s*:\s*/i, "").split(/\s*[,/]\s*/).map((s) => s.trim()).filter(Boolean);
    return { name: parts[0] ?? h, url, tech, bullets };
  });
}

function parseCertifications(lines: string[]): ResumeContent["certifications"] {
  return lines.map((raw) => {
    const { rest, end } = extractDates(raw.replace(BULLET, ""));
    const [name, issuer] = splitParts(rest);
    return { name: name ?? rest, issuer: issuer ?? null, date: end };
  });
}

export function parseResumeHeuristic(rawText: string): ResumeContent {
  const lines = unwrap(rawText.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean));

  const header: string[] = [];
  const sections: { kind: SectionKind; heading: string; lines: string[] }[] = [];
  for (const line of lines) {
    const h = headingOf(line);
    if (h) sections.push({ ...h, lines: [] });
    else if (sections.length) sections[sections.length - 1].lines.push(line);
    else header.push(line);
  }

  const result: ResumeContent = {
    basics: parseBasics(header),
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    extra: [],
  };

  for (const s of sections) {
    switch (s.kind) {
      case "summary":
        result.basics.summary = [result.basics.summary, s.lines.join(" ")].filter(Boolean).join("\n") || null;
        break;
      case "experience":
        result.experience.push(...parseExperience(s.lines));
        break;
      case "education":
        result.education.push(...parseEducation(s.lines));
        break;
      case "skills":
        result.skills.push(...parseSkills(s.lines));
        break;
      case "projects":
        result.projects.push(...parseProjects(s.lines));
        break;
      case "certifications":
        result.certifications.push(...parseCertifications(s.lines));
        break;
      case "extra":
        result.extra.push({ heading: s.heading, items: s.lines.map((l) => l.replace(BULLET, "")) });
        break;
    }
  }
  return result;
}
