// When is a follow-up due? Pure functions so the rules are easy to test.

export type FollowUpApp = {
  status: string;
  appliedAt: Date | null;
  lastEmailAt: Date | null;
  lastFollowUpAt: Date | null;
  followUpEnabled: boolean | null;
  followUpEveryDays: number | null;
  followUpMax: number | null;
  followUpCount: number;
};
export type FollowUpDefaults = { followUpDefaultOn: boolean; followUpDefaultDays: number; followUpDefaultMax: number };

// Follow up while waiting; stop once there's an interview, offer or rejection
const WAITING = new Set(["applied", "oa", "ghosted"]);

export function effective(app: FollowUpApp, d: FollowUpDefaults) {
  return {
    enabled: app.followUpEnabled ?? d.followUpDefaultOn,
    everyDays: app.followUpEveryDays ?? d.followUpDefaultDays,
    max: app.followUpMax ?? d.followUpDefaultMax,
  };
}

/** Next follow-up date, or null when follow-ups are off/finished for this application. */
export function nextFollowUpAt(app: FollowUpApp, d: FollowUpDefaults): Date | null {
  const e = effective(app, d);
  if (!e.enabled || !app.appliedAt || !WAITING.has(app.status) || app.followUpCount >= e.max) return null;
  // The timer restarts on the latest of: applying, our last follow-up, their last email
  const base = Math.max(app.appliedAt.getTime(), app.lastFollowUpAt?.getTime() ?? 0, app.lastEmailAt?.getTime() ?? 0);
  return new Date(base + e.everyDays * 86400000);
}

// Following up more than a month after the last activity isn't useful
const STALE_DAYS = 30;

export function isDue(app: FollowUpApp, d: FollowUpDefaults, now = new Date()): boolean {
  const next = nextFollowUpAt(app, d);
  if (!next || next.getTime() > now.getTime()) return false;
  const base = next.getTime() - effective(app, d).everyDays * 86400000;
  return now.getTime() - base <= STALE_DAYS * 86400000;
}
