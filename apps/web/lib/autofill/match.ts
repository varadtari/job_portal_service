import { CANONICAL_KEYS, learnedKey } from "@/lib/profile/fields";

// Maps form fields (as described by the extension) to profile values. Rule-based, no AI.

export type FieldDescriptor = {
  id: string; // extension-assigned
  label: string; // best label text found near the field
  name?: string;
  placeholder?: string;
  autocomplete?: string;
  type: string; // text | email | tel | url | number | date | textarea | select | radio | checkbox
  options?: string[]; // select options / radio + checkbox labels
  required?: boolean;
};

export type FieldMatch = {
  id: string;
  key: string | null;
  value: string | null; // for select/radio: the exact option text to pick
  source: "rule" | "learned" | null;
  confidence: number;
};

export type ProfileValue = { key: string; label: string | null; value: string; source: string };

// Order matters: first match wins. Tested against labels from Greenhouse, Lever, Ashby, Workday, Naukri-style forms.
const RULES: [key: string, re: RegExp][] = [
  // Questions first: they often mention "country", "email" or "name" in passing
  ["requires_sponsorship", /sponsor/],
  ["work_authorization", /authori[sz](ed|ation) to work|work authori[sz]ation|right to work|legally (allowed|permitted|eligible) to work/],
  ["willing_to_relocate", /relocat/],
  ["how_did_you_hear", /how did you (hear|find|learn)|where did you (hear|find)|source of application/],
  ["notice_period", /notice period|how soon can you (join|start)/],
  ["current_salary", /current (ctc|salary|compensation|pay|annual)/],
  ["expected_salary", /expected (ctc|salary|compensation)|salary expectation|desired (salary|compensation|pay)|compensation expectation/],
  ["years_experience", /years of (relevant |professional |total )?(work )?experience|total experience|how many years|experience \(?in years\)?/],
  ["earliest_start_date", /(earliest )?start date|available to start|availability date|date (you )?can (start|join)|joining date/],
  ["preferred_work_mode", /work (mode|arrangement|setup)|remote,? hybrid|(prefer|preference).*(remote|onsite|on-site|hybrid)/],
  ["preferred_locations", /preferred (work )?location/],
  ["cover_letter", /cover letter/],
  ["short_bio", /about (yourself|you)|tell us (a bit )?about|summary|introduce yourself|\bbio\b/],
  ["pronouns", /pronoun/],
  ["gender", /gender|\bsex\b/],
  ["veteran_status", /veteran/],
  ["disability_status", /disabilit/],
  ["current_company", /current (company|employer|organi[sz]ation)|present employer|most recent (company|employer)/],
  ["current_title", /current (job )?(title|role|designation|position)|^designation$|most recent (job )?title/],
  ["highest_degree", /highest (degree|level of education|qualification)|^degree$|education level/],
  ["field_of_study", /field of study|\bmajor\b|discipline|specialization|branch/],
  ["graduation_year", /graduation (year|date)|year of (graduation|passing)|passing year|passout/],
  ["university", /university|college|school|institution/],
  // Identity & contact
  ["preferred_name", /preferred (first )?name|nick ?name/],
  ["first_name", /\bfirst name\b|\bgiven name\b|\bfname\b|^first$/],
  ["last_name", /\blast name\b|\bsurname\b|\bfamily name\b|\blname\b|^last$/],
  ["full_name", /^(your |candidate |applicant )?(full )?name$|^legal name$|full legal name/],
  ["email", /e-?mail/],
  ["phone", /phone|mobile|contact number|\bcell\b/],
  ["linkedin_url", /linked ?in/],
  ["github_url", /git ?hub/],
  ["twitter_url", /twitter|\bx\.com\b/],
  ["portfolio_url", /portfolio|personal (web)?site|^website$|website url|\bblog\b/],
  // Address
  ["location", /^(current )?location$|where are you (currently )?(based|located)|city,? state/],
  ["postal_code", /postal|\bzip\b|pin ?code/],
  ["address_line1", /street|address line 1|^address$|current address/],
  ["city", /\bcity\b|\btown\b/],
  ["state", /\bstate\b|province/],
  ["country", /\bcountry\b/],
];

// Never auto-fill these; they need a fresh, deliberate answer.
const SKIP = /password|otp|one[- ]time|captcha|verification code|signature|i (certify|agree|acknowledge|consent)|terms|privacy policy|resume|cv\b|attach|upload|photo/;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[*:?()\[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function describe(f: FieldDescriptor): string {
  return norm([f.label, f.placeholder, f.name?.replace(/[_\-.[\]]+/g, " ")].filter(Boolean).join(" | "));
}

export function ruleKey(f: FieldDescriptor): string | null {
  const ac = f.autocomplete?.toLowerCase();
  const AC: Record<string, string> = {
    "given-name": "first_name",
    "family-name": "last_name",
    name: "full_name",
    email: "email",
    tel: "phone",
    "tel-national": "phone",
    "postal-code": "postal_code",
    "address-line1": "address_line1",
    "address-level2": "city",
    "address-level1": "state",
    "country-name": "country",
    country: "country",
    organization: "current_company",
    "organization-title": "current_title",
  };
  if (ac && AC[ac]) return AC[ac];
  // Prefer the visible label; fall back to placeholder and name attribute
  for (const text of [norm(f.label), describe(f)]) {
    if (!text) continue;
    if (SKIP.test(text)) return null;
    for (const [key, re] of RULES) if (re.test(text)) return key;
  }
  return null;
}

// ---- learned answers: fuzzy question matching (trigram similarity, like pg_trgm) ----

function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.split(" ").filter(Boolean)) {
    const p = `  ${w} `;
    for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

const jaccard = <T,>(A: Set<T>, B: Set<T>) => {
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
};

/** Max of character-trigram and word overlap, so "…work at Stripe?" still matches "…work at our company?". */
export function similarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.split(" ").filter(Boolean));
  return Math.max(jaccard(trigrams(a), trigrams(b)), jaccard(words(a), words(b)));
}

// ---- option picking for selects / radios ----

const YES = /^(yes|y|true|i am|i do|i will|i have|willing|open to|authori[sz]ed)\b/i;
const NO = /^(no|n|false|i am not|i do not|i don.t|i will not|not willing|not authori[sz]ed)\b/i;

function parseRange(opt: string): [number, number] | null {
  const o = opt.toLowerCase();
  let m = o.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/);
  if (m) return [Number(m[1]), Number(m[2])];
  m = o.match(/(\d+(?:\.\d+)?)\s*\+|more than\s*(\d+)|over\s*(\d+)|(\d+)\s*(?:years?)?\s*(?:or more|and above|\+)/);
  if (m) return [Number(m[1] ?? m[2] ?? m[3] ?? m[4]), Infinity];
  m = o.match(/less than\s*(\d+)|under\s*(\d+)|<\s*(\d+)/);
  if (m) return [0, Number(m[1] ?? m[2] ?? m[3]) - 0.001];
  m = o.match(/^(\d+(?:\.\d+)?)\s*(years?|yrs?)?$/);
  if (m) return [Number(m[1]), Number(m[1])];
  if (/fresher|no experience|^0$/.test(o)) return [0, 0.99];
  return null;
}

export function pickOption(value: string, options: string[]): string | null {
  const opts = options.filter((o) => o.trim() && !/^(select|choose|please select|--|—)/i.test(o.trim()));
  if (!opts.length) return null;
  const v = value.trim().toLowerCase();
  const exact = opts.find((o) => o.trim().toLowerCase() === v);
  if (exact) return exact;
  // Yes / No style questions
  const isYes = YES.test(v);
  const isNo = NO.test(v);
  if (isYes || isNo) {
    const hit = opts.find((o) => (isYes ? YES.test(o.trim()) && !NO.test(o.trim()) : NO.test(o.trim())));
    if (hit) return hit;
  }
  // Numeric value into ranges ("2" → "1-3 years")
  const num = Number(v.replace(/[^\d.]/g, ""));
  if (v && /^\d+(\.\d+)?\s*(years?|yrs?)?$/.test(v) && !Number.isNaN(num)) {
    const inRange = opts.find((o) => {
      const r = parseRange(o);
      return r && num >= r[0] && num <= r[1];
    });
    if (inRange) return inRange;
  }
  const starts = opts.find((o) => o.trim().toLowerCase().startsWith(v) || v.startsWith(o.trim().toLowerCase()));
  if (starts) return starts;
  const contains = opts.find((o) => o.toLowerCase().includes(v) || (v.length > 3 && v.includes(o.trim().toLowerCase()) && o.trim().length > 3));
  if (contains) return contains;
  // Best fuzzy option
  let best: string | null = null;
  let bestSim = 0;
  for (const o of opts) {
    const s = similarity(norm(o), norm(v));
    if (s > bestSim) [best, bestSim] = [o, s];
  }
  return bestSim >= 0.45 ? best : null;
}

// ---- main ----

function derived(values: Map<string, string>, key: string): string | null {
  if (values.has(key)) return values.get(key)!;
  const g = (k: string) => values.get(k);
  switch (key) {
    case "full_name":
      return [g("first_name"), g("last_name")].filter(Boolean).join(" ") || null;
    case "location":
      return [g("city"), g("state"), g("country")].filter(Boolean).join(", ") || null;
    case "preferred_name":
      return g("first_name") ?? null;
    default:
      return null;
  }
}

export function matchFields(fields: FieldDescriptor[], profile: ProfileValue[]): FieldMatch[] {
  const values = new Map(profile.filter((p) => CANONICAL_KEYS.has(p.key)).map((p) => [p.key, p.value]));
  const learned = profile.filter((p) => !CANONICAL_KEYS.has(p.key));

  return fields.map((f) => {
    const none: FieldMatch = { id: f.id, key: null, value: null, source: null, confidence: 0 };
    const text = describe(f);
    if (!text || SKIP.test(norm(f.label || text))) return none;

    let key = ruleKey(f);
    let value = key ? derived(values, key) : null;
    let source: FieldMatch["source"] = key ? "rule" : null;
    let confidence = key ? 0.9 : 0;

    // Fall back to learned answers (exact normalised question, then fuzzy)
    if (!value) {
      const q = learnedKey(f.label || f.placeholder || "");
      if (q.length >= 4) {
        let best: ProfileValue | null = null;
        let bestSim = 0;
        for (const l of learned) {
          const s = l.key === q ? 1 : similarity(l.key, q);
          if (s > bestSim) [best, bestSim] = [l, s];
        }
        if (best && bestSim >= 0.6) {
          key = best.key;
          value = best.value;
          source = "learned";
          confidence = bestSim;
        }
      }
    }
    if (!value) return { ...none, key };

    if ((f.type === "select" || f.type === "radio") && f.options?.length) {
      const opt = pickOption(value, f.options);
      if (!opt) return { ...none, key };
      return { id: f.id, key, value: opt, source, confidence };
    }
    if (f.type === "checkbox") return { ...none, key }; // ambiguous; leave for the user
    return { id: f.id, key, value, source, confidence };
  });
}

/** Turns answers the user typed into profile updates (learned questions + missing canonical fields). */
export function answersToLearn(
  fields: (FieldDescriptor & { value: string })[],
  profile: ProfileValue[],
): { key: string; label: string | null; value: string }[] {
  const have = new Map(profile.map((p) => [p.key, p]));
  const out = new Map<string, { key: string; label: string | null; value: string }>();
  for (const f of fields) {
    const value = f.value?.trim();
    if (!value || value.length > 5000) continue;
    const label = f.label?.trim();
    if (!label || SKIP.test(norm(label)) || f.type === "checkbox") continue;
    const key = ruleKey(f);
    if (key && CANONICAL_KEYS.has(key)) {
      if (!have.has(key)) out.set(key, { key, label: null, value }); // fill gaps only; never overwrite profile
      continue;
    }
    if (key) continue; // derived keys like full_name / location
    const lk = learnedKey(label);
    if (lk.length < 4) continue;
    // Same answer already saved under a similar question (e.g. autofilled from it): nothing new to learn
    if (profile.some((p) => p.value.trim() === value && !CANONICAL_KEYS.has(p.key) && similarity(p.key, lk) >= 0.6)) continue;
    const existing = have.get(lk);
    if (existing?.source === "manual" && existing.value === value) continue;
    if (existing?.source === "manual") continue; // user's own wording wins
    if (existing?.value === value) continue;
    out.set(lk, { key: lk, label, value });
  }
  return [...out.values()];
}
