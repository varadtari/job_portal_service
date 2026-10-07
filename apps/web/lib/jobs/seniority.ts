// Title-based experience-level filter (no AI).

export const LEVELS = [
  { key: "any", label: "Any level" },
  { key: "fresher", label: "Fresher / intern (0–1 yrs)" },
  { key: "junior", label: "Junior (1–3 yrs)" },
  { key: "mid", label: "Mid (3–6 yrs)" },
  { key: "senior", label: "Senior (6+ yrs)" },
] as const;

export type Level = (typeof LEVELS)[number]["key"];

const INTERN = /\bintern(ship)?\b|\btrainee\b|\bapprentice\b|\bgraduate\b|\bnew grad\b|\bfresher\b|\bcampus\b/i;
const SENIOR = /\bsenior\b|\bsr\.?(?=\s|$)|\bstaff\b|\bprincipal\b|\blead\b|\bmanager\b|\bdirector\b|\bhead\b|\barchitect\b|\bvp\b|\bvice president\b|\bdistinguished\b|\bfellow\b|\bchief\b/i;
const LEVEL_3PLUS = /\b(sde|swe|engineer|developer|analyst|scientist)\s*-?\s*(iii|iv|v|3|4|5)\b|\bl[5-9]\b|\bic[4-9]\b/i;
const JUNIORISH = /\bjunior\b|\bjr\.?(?=\s|$)|\bassociate\b|\bentry[- ]level\b|\b(sde|swe|engineer|developer)\s*-?\s*(i|1)\b/i;

export function levelMatches(title: string, level: Level | null | undefined): boolean {
  if (!level || level === "any") return true;
  const intern = INTERN.test(title);
  const senior = SENIOR.test(title) || LEVEL_3PLUS.test(title);
  switch (level) {
    case "fresher":
      return !senior && (intern || JUNIORISH.test(title) || !/\bii\b|\b2\b/.test(title));
    case "junior":
      return !senior && !intern;
    case "mid":
      return !intern && !/\bprincipal\b|\bdirector\b|\bvp\b|\bhead\b|\bdistinguished\b|\bchief\b/i.test(title) && !JUNIORISH.test(title);
    case "senior":
      return !intern && !JUNIORISH.test(title) && (senior || !/\b(i|1|ii|2)\b/.test(title));
  }
}
