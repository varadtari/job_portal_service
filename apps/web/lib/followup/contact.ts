// Picks who to follow up with from the application's emails: a real person, not a no-reply/ATS sender.

const NO_REPLY = /no-?reply|do-?not-?reply|donotreply|notifications?@|mailer-daemon|bounce|alerts?@|jobs-noreply|talent-noreply/i;
const PLATFORM = /greenhouse|lever\.co|ashbyhq|myworkday|workday|smartrecruiters|icims|hackerrank|codility|hackerearth|codesignal|coderbyte|naukri|linkedin|instahyre|indeed|hirist|wellfound|zohorecruit|freshteam|darwinbox|keka|recruitee|teamtailor|workable|bamboohr|jobvite|successfactors|taleo|greenhouse-mail/i;

export function parseAddress(from: string): { name: string | null; email: string } | null {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+@[^>]+)>\s*$/) ?? from.match(/^\s*()([^\s<>]+@[^\s<>]+)\s*$/);
  if (!m) return null;
  return { name: m[1]?.trim() || null, email: m[2].trim().toLowerCase() };
}

/** Most recent human sender among the application's emails (events are newest first). */
export function pickContact(fromAddresses: (string | null)[]): { name: string | null; email: string } | null {
  for (const f of fromAddresses) {
    if (!f) continue;
    const a = parseAddress(f);
    if (a && !NO_REPLY.test(a.email) && !PLATFORM.test(a.email.split("@")[1] ?? "")) return a;
  }
  return null;
}
