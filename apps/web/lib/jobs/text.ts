import { convert } from "html-to-text";

/** HTML job description → readable plain text (headings, paragraphs, bullet lists kept). */
export function htmlToPlain(html: string): string {
  if (!html) return "";
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
      { selector: "h1", options: { uppercase: false } },
      { selector: "h2", options: { uppercase: false } },
      { selector: "h3", options: { uppercase: false } },
      { selector: "h4", options: { uppercase: false } },
      { selector: "ul", options: { itemPrefix: "• " } },
    ],
  })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Greenhouse double-escapes its HTML content. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export function isRemoteText(...parts: (string | null | undefined)[]): boolean {
  return parts.some((p) => !!p && /\bremote\b|work from home|\bwfh\b|anywhere/i.test(p));
}

export async function fetchJson<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": "JobPilot/1.0 (personal job search)", Accept: "application/json", ...init?.headers },
    signal: AbortSignal.timeout(init?.timeoutMs ?? 25000),
    cache: "no-store",
  });
  if (res.status === 404) throw new SourceNotFoundError(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return (await res.json()) as T;
}

export class SourceNotFoundError extends Error {
  constructor(url: string) {
    super(`Board not found (${new URL(url).host})`);
  }
}
