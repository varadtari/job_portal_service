// Finds hiring email addresses in text (job descriptions, company web pages). Rule-based.
import { NO_REPLY, PLATFORM } from "@/lib/followup/contact";

export type FoundEmail = { email: string; domain: string; kind: "role" | "person" };

// Inboxes that are published in postings but are not for applications
const NOT_HIRING = /accessib|assistance|^ask|askhr|askpeople|candidate[._-]?(exp|support|care)|helpdesk|privacy|gdpr|dpo@|data-?protection|eeo|equal-?opportunit|accommodat|disabilit|\bada\b|ada@|legal|compliance|ethics|whistle|benefits|payroll|support|help@|info@|sales|press|media|marketing|security|abuse|investor|ir@|billing|accounts?@|webmaster|admin@|example\.|sentry|wixpress|@\d|noreply/i;
const WEBMAIL = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|aol|proton|protonmail|rediffmail|zoho)\./i;
const ROLE = /^(careers?|jobs?|hr|hiring|recruit\w*|talent\w*|people|apply|resumes?|cv|hr\.\w+|work|joinus|join)([._-]?\w*)?@/i;
const EMAIL = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/gi;
const ASSET = /\.(png|jpe?g|gif|svg|webp|css|js)$/i;

/** Turns "hr [at] acme [dot] com" / "hr(at)acme.com" into real addresses. */
export function deobfuscate(text: string): string {
  return text
    .replace(/\s*[[({<]\s*at\s*[\])}>]\s*/gi, "@")
    .replace(/\s*[[({<]\s*dot\s*[\])}>]\s*/gi, ".")
    .replace(/([a-z0-9._-]+)\s+at\s+([a-z0-9-]+)\s+dot\s+([a-z]{2,})/gi, "$1@$2.$3");
}

export function classify(email: string, opts: { allowWebmail?: boolean } = {}): FoundEmail | null {
  const e = email.toLowerCase().replace(/^mailto:/, "").replace(/[.,;:]+$/, "");
  const at = e.lastIndexOf("@");
  if (at < 1) return null;
  const domain = e.slice(at + 1);
  if (ASSET.test(e) || NOT_HIRING.test(e) || NO_REPLY.test(e) || PLATFORM.test(domain) || /(^|\.)(job)?alerts?\.|(^|\.)(mail|email|e|news|notify|notifications)\./.test(domain)) return null;
  if (!opts.allowWebmail && WEBMAIL.test(domain)) return null;
  return { email: e, domain, kind: ROLE.test(e) ? "role" : "person" };
}

/** Unique hiring addresses found in a block of text. */
export function extractEmails(text: string, opts: { allowWebmail?: boolean } = {}): FoundEmail[] {
  const seen = new Map<string, FoundEmail>();
  for (const m of deobfuscate(text).matchAll(EMAIL)) {
    const f = classify(m[0], opts);
    if (f && !seen.has(f.email)) seen.set(f.email, f);
  }
  return [...seen.values()];
}
