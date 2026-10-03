import { env } from "@/lib/env";

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
export function isCronAuthorized(req: Request): boolean {
  return req.headers.get("authorization") === `Bearer ${env().CRON_SECRET}`;
}
