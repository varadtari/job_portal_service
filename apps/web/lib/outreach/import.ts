// Parses pasted text or CSV into contacts. CSV needs an "email" header; otherwise each line is
// "email, company, location" (only the email is required) or free text containing addresses.
import { deobfuscate } from "./extract";
import type { ContactInput } from "./harvest";

const EMAIL = /[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/gi;
const HAS_EMAIL = new RegExp(EMAIL.source, "i");

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"' && q) {
      cur += '"';
      i++;
    } else if (ch === '"') q = !q;
    else if ((ch === "," || ch === "\t" || ch === ";") && !q) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const truthy = (v: string | undefined) => !!v && /^(y|yes|true|1|remote)$/i.test(v.trim());

export function parseContactsText(text: string): ContactInput[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const out: ContactInput[] = [];
  if (header.includes("email")) {
    const col = (row: string[], ...names: string[]) => {
      const i = header.findIndex((h) => names.includes(h));
      return i >= 0 ? row[i] : undefined;
    };
    for (const line of lines.slice(1)) {
      const row = splitCsv(line);
      const email = col(row, "email")?.match(HAS_EMAIL)?.[0];
      if (!email) continue;
      const loc = col(row, "location", "city", "country");
      out.push({ email, company: col(row, "company", "organisation", "organization"), name: col(row, "name", "contact"), location: loc, remote: truthy(col(row, "remote")) || /remote/i.test(loc ?? ""), source: "manual", allowWebmail: true });
    }
    return out;
  }
  for (const raw of lines) {
    const line = deobfuscate(raw);
    const emails = line.match(EMAIL) ?? [];
    const parts = splitCsv(line).filter((p) => p && !HAS_EMAIL.test(p));
    const [company, location] = emails.length === 1 && parts.length <= 3 ? parts : [];
    for (const email of emails) out.push({ email, company, location, source: "manual", allowWebmail: true });
  }
  return out;
}
