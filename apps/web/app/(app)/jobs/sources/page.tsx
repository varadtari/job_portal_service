import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getUser, requireUserId } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Badge, Card } from "@/components/ui";
import { db, schema } from "@/lib/db";
import { SEARCH_SOURCES, sourceConfigured } from "@/lib/jobs/sync";
import { ATS_LABEL } from "@/lib/jobs/types";
import { SOURCE_LABEL, timeAgo } from "@/lib/format";
import { SyncButton } from "../sync-button";
import { AddCompanyForm, AddSearchForm, DeleteButton } from "./forms";
import { ItOnlyToggle, LevelSelect, SourceToggle } from "./toggles";

export const maxDuration = 300;

export default async function SourcesPage() {
  const userId = await requireUserId();
  const [user, searches, companies] = await Promise.all([
    getUser(userId),
    db().select().from(schema.savedSearches).where(eq(schema.savedSearches.userId, userId)).orderBy(desc(schema.savedSearches.createdAt)),
    db().select().from(schema.trackedCompanies).where(eq(schema.trackedCompanies.userId, userId)).orderBy(schema.trackedCompanies.name),
  ]);

  return (
    <>
      <Link href="/jobs" className="text-sm text-fg-muted hover:text-fg">← Jobs</Link>
      <PageHeader
        title="Job sources"
        description={user?.jobsSyncedAt ? `Last synced ${timeAgo(user.jobsSyncedAt)}. Syncs automatically once a day.` : "Syncs automatically once a day, or click Sync now."}
        actions={<SyncButton variant="primary" />}
      />
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <div className="space-y-6">
          <Card>
            <h2 className="font-semibold">Searches</h2>
            <p className="mb-4 text-sm text-fg-muted">Each search runs on every source below. Add your target titles and city.</p>
            <AddSearchForm />
            <ul className="mt-4 divide-y divide-border">
              {searches.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{s.query}</p>
                    <p className="text-xs text-fg-muted">{s.location ?? "Any location"}{s.remoteOnly ? " · remote only" : ""}</p>
                  </div>
                  <DeleteButton id={s.id} kind="search" />
                </li>
              ))}
              {searches.length === 0 && <li className="py-3 text-sm text-fg-muted">No searches yet. Add one to start pulling jobs from all sources.</li>}
            </ul>
          </Card>
          <Card>
            <h2 className="font-semibold">Where searches run</h2>
            <div className="mt-3 space-y-4 border-b border-border pb-4">
              <ItOnlyToggle value={user?.itOnly ?? true} />
              <LevelSelect value={user?.experienceLevel ?? "any"} />
            </div>
            <ul className="divide-y divide-border">
              {SEARCH_SOURCES.map((src) => (
                <SourceToggle
                  key={src.key}
                  k={src.key}
                  name={src.name}
                  note={src.note}
                  needs={src.needs}
                  configured={sourceConfigured(src.key)}
                  on={!user?.disabledSources.includes(src.key)}
                />
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="font-semibold">Tracked companies</h2>
            <p className="mb-4 text-sm text-fg-muted">Extra companies beyond the built-in directory (Greenhouse, Lever and Ashby boards). Searches filter these too; with no searches, all their roles are kept.</p>
            <AddCompanyForm />
            <ul className="mt-4 divide-y divide-border">
              {companies.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-fg-muted">{ATS_LABEL[c.ats]} · {c.slug}</p>
                  </div>
                  <DeleteButton id={c.id} kind="company" />
                </li>
              ))}
              {companies.length === 0 && <li className="py-3 text-sm text-fg-muted">No companies tracked yet.</li>}
            </ul>
          </Card>
          {user?.jobsSyncReport && user.jobsSyncReport.length > 0 && (
            <Card>
              <h2 className="mb-3 font-semibold">Last sync</h2>
              <ul className="space-y-2 text-sm">
                {user.jobsSyncReport.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{r.label} <span className="text-fg-muted">· {SOURCE_LABEL[r.source] ?? r.source}</span></span>
                    {r.error ? <Badge tone="danger" title={r.error}>Failed</Badge> : <span className="shrink-0 text-fg-muted">{r.kept} kept / {r.fetched} found</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
