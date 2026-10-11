import Link from "next/link";
import { getUser, requireUserId } from "@/auth";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui";
import { COLUMNS } from "@/lib/applications/labels";
import { listApplications, reviewQueue } from "@/lib/applications/repo";
import { nowMs, timeAgo } from "@/lib/format";
import { nextFollowUpAt } from "@/lib/followup/schedule";
import { guessCompany, matchApplication, normCompany } from "@/lib/gmail/match";
import { AddApplication } from "./add-application";
import { GmailSyncButton } from "./gmail-sync";
import { ReviewQueue } from "./review";

export const maxDuration = 300;

export default async function ApplicationsPage() {
  const userId = await requireUserId();
  const [user, apps, review] = await Promise.all([getUser(userId), listApplications(userId), reviewQueue(userId)]);
  const defaults = { followUpDefaultOn: user?.followUpDefaultOn ?? true, followUpDefaultDays: user?.followUpDefaultDays ?? 7, followUpDefaultMax: user?.followUpDefaultMax ?? 2 };
  const now = nowMs();
  const guesses = Object.fromEntries(review.map((e) => [e.id, guessCompany({ from: e.fromAddress ?? "", subject: e.subject ?? "", text: e.snippet ?? "" }) ?? ""]));
  // Preselect an application only when the email clearly points at it (same company)
  const suggestions = Object.fromEntries(
    review.map((e) => {
      const { app } = matchApplication({ from: e.fromAddress ?? "", subject: e.subject ?? "", text: e.snippet ?? "" }, apps);
      const byName = guesses[e.id] ? apps.filter((a) => normCompany(a.company) === normCompany(guesses[e.id])) : [];
      return [e.id, app?.id ?? (byName.length === 1 ? byName[0].id : "")];
    }),
  );

  return (
    <>
      <PageHeader
        title="Applications"
        description={
          user?.gmailSyncedAt
            ? `${apps.length} application${apps.length === 1 ? "" : "s"}. Gmail checked ${timeAgo(user.gmailSyncedAt)}; it syncs automatically once a day.`
            : "Statuses update from your Gmail: confirmations, assessments, interviews, rejections and offers."
        }
        actions={<div className="flex flex-wrap items-center gap-2"><AddApplication /><GmailSyncButton /></div>}
      />
      <ReviewQueue events={review} apps={apps.map(({ id, company, title }) => ({ id, company, title }))} guesses={guesses} suggestions={suggestions} account={user?.email ?? null} />
      {apps.length === 0 ? (
        <EmptyState title="No applications yet" body="Click Sync Gmail to import them from your inbox, mark jobs as applied, or add one manually." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {COLUMNS.map((col) => {
            const items = apps.filter((a) => a.status === col.status);
            return (
              <section key={col.status} aria-label={col.label} className="min-w-0 rounded-2xl bg-muted/60 p-2">
                <h2 className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold">
                  {col.label}
                  <span className="rounded-full bg-surface px-2 text-xs font-normal text-fg-muted">{items.length}</span>
                </h2>
                <ul className="space-y-2">
                  {items.map((a) => (
                    <li key={a.id}>
                      <Link href={`/applications/${a.id}`} className="block rounded-xl border border-border bg-surface p-3 hover:border-accent/50">
                        <p className="truncate text-sm font-medium">{a.company}</p>
                        <p className="line-clamp-2 text-xs text-fg-muted">{a.title}</p>
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-fg-muted">
                          <span>{timeAgo(a.lastEmailAt ?? a.appliedAt ?? a.updatedAt)}</span>
                          {a.events > 0 && <Badge>{a.events} email{a.events === 1 ? "" : "s"}</Badge>}
                          {a.draftPending ? <Badge tone="warning">Follow-up ready</Badge> : (() => {
                            const next = nextFollowUpAt(a, defaults);
                            return next ? <Badge tone="accent">Follow-up {next.getTime() <= now ? "due" : `in ${Math.ceil((next.getTime() - now) / 86400000)}d`}</Badge> : null;
                          })()}
                        </div>
                      </Link>
                    </li>
                  ))}
                  {items.length === 0 && <li className="px-2 py-3 text-xs text-fg-muted">—</li>}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
