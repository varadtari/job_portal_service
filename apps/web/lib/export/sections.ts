import type { ResumeContent } from "@/lib/resume/types";

// Shared formatting so PDF and DOCX output match. ATS-friendly: one column, standard headings, plain bullets.

export const dateRange = (start: string | null, end: string | null, current = false) =>
  [start, current ? "Present" : end].filter(Boolean).join(" – ");

export function contactLine(r: ResumeContent): string {
  return [r.basics.email, r.basics.phone, r.basics.location, ...r.basics.links.map((l) => l.url.replace(/^https?:\/\//, ""))]
    .filter(Boolean)
    .join("  |  ");
}

export function educationLine(e: ResumeContent["education"][number]) {
  return [e.degree && e.field ? `${e.degree}, ${e.field}` : (e.degree ?? e.field), e.grade].filter(Boolean).join(" · ");
}

/** Content-Disposition value: ASCII fallback plus RFC 5987 UTF-8 name (headers can't carry "–", "é", …). */
export function attachmentHeader(title: string, ext: string): string {
  const pretty = `${title.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 90) || "resume"}.${ext}`;
  const ascii = pretty.normalize("NFKD").replace(/[–—]/g, "-").replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(pretty)}`;
}
