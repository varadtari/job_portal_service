import Link from "next/link";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { getUser, requireUserId } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Badge, Card } from "@/components/ui";
import { db, schema } from "@/lib/db";
import { funnel } from "@/lib/applications/funnel";
import { EVENT_LABEL, gmailLink } from "@/lib/applications/labels";
import { recentEvents, reviewQueue, statusCounts } from "@/lib/applications/repo";
import { daysAgo, timeAgo } from "@/lib/format";

function Stat({ label, value, hint, href }: { label: string; value: string | number; hint?: string; href?: string }) {
  const body = (
    <Card className="h-full p-4">
      <p className="text-xs font-medium text-fg-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </Card>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

export default async function DashboardPage() {
  const userId = await requireUserId();
  const a = schema.applications;
  const ev = schema.applicationEvents;
  const dayAgo = daysAgo(1);

  const [user, counts, review, recent, apps, events, [newJobs], [feed]] = await Promise.all([
    getUser(userId),
    statusCounts(userId),
    reviewQueue(userId),
    recentEvents(userId),
    db().select({ id: a.id, status: a.status, appliedAt: a.appliedAt }).from(a).where(eq(a.userId, userId)),
    db().select({ applicationId: ev.applicationId, type: ev.type }).from(ev).where(and(eq(ev.userId, userId), inArray(ev.type, ["applied_confirm", "oa", "interview", "offer", "rejection"]))),
    db().select({ n: count() }).from(schema.userJobs).where(and(eq(schema.userJobs.userId, userId), gte(schema.userJobs.createdAt, dayAgo))),
    db().select({ n: count() }).from(schema.userJobs).where(and(eq(schema.userJobs.userId, userId), eq(schema.userJobs.hidden, false))),
  ]);
  const byApp = new Map<string, string[]>();
  for (const e of events) if (e.applicationId) byApp.set(e.applicationId, [...(byApp.get(e.applicationId) ?? []), e.type]);
  const f = funnel(apps.map((x) => ({ status: x.status, appliedAt: x.appliedAt, eventTypes: byApp.get(x.id) ?? [] })));
  const max = Math.max(1, ...f.steps.map((s) => s.n));
  const active = counts.applied + counts.oa + counts.interview;

  return (
    <>
      <PageHeader title={`Hi${user?.name ? `, ${user.name.split(" ")[0]}` : ""}`} description="Your job search at a glance." />

      {review.length > 0 && (
        <Link href="/applications" className="mb-6 flex items-center justify-between rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm hover:bg-warning/15">
          <span><b>{review.length}</b> job email{review.length === 1 ? "" : "s"} need{review.length === 1 ? "s" : ""} your review</span>
          <span aria-hidden>→</span>
        </Link>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active applications" value={active} hint="Applied, assessment or interview" href="/applications" />
        <Stat label="Interviews" value={counts.interview} hint={counts.oa ? `+ ${counts.oa} assessment${counts.oa === 1 ? "" : "s"}` : undefined} href="/applications" />
        <Stat label="Offers" value={counts.offer} href="/applications" />
        <Stat label="Response rate" value={f.responseRate === null ? "–" : `${f.responseRate}%`} hint="Applications with any reply beyond a confirmation" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <h2 className="font-semibold">Application funnel</h2>
          <p className="mb-4 text-sm text-fg-muted">How many applications reached each stage (including ones later rejected).</p>
          {f.steps[0].n === 0 ? (
            <p className="text-sm text-fg-muted">No applications yet.</p>
          ) : (
            <div className="space-y-3" role="table" aria-label="Application funnel">
              {f.steps.map((s, i) => {
                const pct = i === 0 || !f.steps[0].n ? null : Math.round((s.n / f.steps[0].n) * 100);
                return (
                  <div key={s.label} role="row" className="grid grid-cols-[6.5rem_1fr_4.5rem] items-center gap-3 text-sm" title={`${s.label}: ${s.n}${pct !== null ? ` (${pct}% of applied)` : ""}`}>
                    <span role="rowheader" className="text-fg-muted">{s.label}</span>
                    <div className="h-3 rounded-full bg-muted" aria-hidden>
                      <div className="h-3 rounded-full bg-accent transition-all" style={{ width: `${(s.n / max) * 100}%`, minWidth: s.n ? 6 : 0 }} />
                    </div>
                    <span role="cell" className="text-right tabular-nums">
                      {s.n}
                      {pct !== null && <span className="ml-1 text-xs text-fg-muted">{pct}%</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4 text-xs">
            <Badge>Saved {counts.saved}</Badge>
            <Badge tone="danger">Rejected {counts.rejected}</Badge>
            <Badge>No response {counts.ghosted}</Badge>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent activity</h2>
            <span className="text-xs text-fg-muted">{user?.gmailSyncedAt ? `Gmail checked ${timeAgo(user.gmailSyncedAt)}` : "Gmail not synced yet"}</span>
          </div>
          {recent.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">Nothing yet. Sync Gmail on the Applications page.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {recent.map((e) => (
                <li key={e.id} className="flex items-start gap-2">
                  <Link href={`/applications/${e.applicationId}`} className="flex min-w-0 flex-1 items-start justify-between gap-3 py-2.5 hover:opacity-80">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.company} <span className="font-normal text-fg-muted">· {e.title}</span></p>
                      <p className="truncate text-xs text-fg-muted">{e.subject}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge>{EVENT_LABEL[e.type] ?? e.type}</Badge>
                      <p className="mt-1 text-xs text-fg-muted">{timeAgo(e.occurredAt)}</p>
                    </div>
                  </Link>
                  {e.emailMessageId && e.type !== "manual" && (
                    <a
                      href={gmailLink(e.emailMessageId, user?.email)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open in Gmail"
                      aria-label={`Open “${e.subject ?? "email"}” in Gmail`}
                      className="mt-2 shrink-0 rounded-md px-1.5 py-1 text-xs text-accent hover:bg-muted"
                    >
                      ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold">Jobs</h2>
          <p className="mt-1 text-sm"><b className="tabular-nums">{newJobs.n}</b> new in the last 24 hours · <b className="tabular-nums">{feed.n}</b> in your feed · <b className="tabular-nums">{counts.saved}</b> saved</p>
          <div className="mt-3 flex gap-3 text-sm">
            <Link href="/jobs?sort=match" className="text-accent hover:underline">Best matches →</Link>
            <Link href="/jobs?view=saved" className="text-accent hover:underline">Saved jobs →</Link>
          </div>
        </Card>
      </div>
    </>
  );
}
