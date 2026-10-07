// Parses what Android apps send to the share target (LinkedIn, Naukri, Indeed, Chrome…).

export type Shared = { url: string | null; title: string | null; company: string | null };

const URL_RE = /https?:\/\/[^\s"'<>]+/i;

export function parseShared(input: { title?: string | null; text?: string | null; url?: string | null }): Shared {
  const text = [input.text, input.title].filter(Boolean).join("\n");
  const url = (input.url && URL_RE.test(input.url) ? input.url : text.match(URL_RE)?.[0] ?? null)?.replace(/[).,]+$/, "") ?? null;
  const plain = text.replace(URL_RE, " ").replace(/\(\s*\)/g, " ").replace(/\s+/g, " ").trim().replace(/[\s.,;:(]+$/, "");

  const patterns: [RegExp, (m: RegExpMatchArray) => [string | null, string | null]][] = [
    // LinkedIn: "Check out this job at Acme Corp: Software Engineer"
    [/job at (.+?):\s*(.+)$/i, (m) => [m[2], m[1]]],
    // "Software Engineer at Acme Corp" / "Software Engineer @ Acme"
    [/^(?:i found this job on \w+:?\s*)?(.+?)\s+(?:at|@)\s+(.+?)(?:\s+[-|–]\s+.*)?$/i, (m) => [m[1], m[2]]],
    // "Acme is hiring a Software Engineer"
    [/^(.+?) is hiring (?:an? )?(.+)$/i, (m) => [m[2], m[1]]],
  ];
  for (const [re, pick] of patterns) {
    const m = plain.match(re);
    if (m) {
      const [title, company] = pick(m).map((s) => s?.replace(/^["“]|["”]$/g, "").trim() || null);
      if (title && title.length <= 150) return { url, title, company: company?.slice(0, 120) ?? null };
    }
  }
  return { url, title: plain ? plain.slice(0, 150) : null, company: null };
}
