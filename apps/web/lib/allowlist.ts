export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseAllowlist(raw: string): Set<string> {
  return new Set(raw.split(",").map(normalizeEmail).filter(Boolean));
}

export function isAllowed(
  email: string | null | undefined,
  envList: Set<string>,
  dbList: Iterable<string>,
): boolean {
  if (!email) return false;
  const e = normalizeEmail(email);
  if (envList.has(e)) return true;
  for (const d of dbList) if (normalizeEmail(d) === e) return true;
  return false;
}
