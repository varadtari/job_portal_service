import Link from "next/link";
import { Suspense } from "react";
import { requireUserId } from "@/auth";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui";
import { countByView, getUserJob, listUserJobs, regionCounts, type JobFilters, type JobView } from "@/lib/jobs/repo";
import { candidateSkills } from "@/lib/match/candidate";
import { matchSkills } from "@/lib/match/skills";
import { isProbablyClosed, SOURCE_LABEL, STATUS_LABEL, timeAgo } from "@/lib/format";
import { db, schema } from "@/lib/db";
import { count, eq } from "drizzle-orm";
import { AddJob } from "./add-job";
import { JobFilters as Filters } from "./filters";
import { JobActions } from "./job-actions";
import { JobList } from "./job-list";
import { OneClickTailor } from "./one-click-tailor";
import { AddToQueue } from "../queue/controls";
import { latestTailored } from "@/lib/tailor/auto";
import { SyncButton } from "./sync-button";

export const maxDuration = 300;

const PAGE = 50;

function MatchChip({ score }: { score: number }) {
  const tone = score >= 70 ? "success" : score >= 40 ? "warning" : "neutral";
  return <Badge tone={tone}>{score}% match</Badge>;
}

async function JobDetail({ userId, jobId, candidate, hasResume }: { userId: string; jobId: string; candidate: Set<string>; hasResume: boolean }) {
  const row = await getUserJob(userId, jobId);
  if (!row) return <EmptyState title="Job not found" body="It may have been removed." />;
  const { job, status } = row;
  const tailored = await latestTailored(userId, job.id);
  const match = matchSkills(job.skills, candidate);
  const stale = isProbablyClosed(job.source, job.lastSeenAt);
  return (
    <article className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-xl font-semibold leading-tight">{job.title}</h2>
      <p className="mt-1 text-fg-muted">
        {job.company}
        {job.location ? ` · ${job.location}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {job.remote && <Badge tone="accent">Remote</Badge>}
        {job.salary && <Badge>{job.salary}</Badge>}
        {status && <Badge tone="success">{STATUS_LABEL[status]}</Badge>}
        <Badge>Posted {timeAgo(job.postedAt) || "date unknown"}</Badge>
        <Badge>{job.via ? `${job.via} via ${SOURCE_LABEL[job.source]}` : SOURCE_LABEL[job.source]}</Badge>
        {stale && <Badge tone="warning">Possibly closed</Badge>}
      </div>
      <div className="mt-4"><JobActions jobId={job.id} url={job.url} status={status} /></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
        <OneClickTailor jobId={job.id} existing={tailored ? { resumeId: tailored.id, scoreBefore: tailored.tailorMeta?.scoreBefore ?? null, scoreAfter: tailored.tailorMeta?.scoreAfter ?? null } : null} />
        <AddToQueue jobIds={[job.id]} />
      </div>

      <section className="mt-5 rounded-xl bg-muted p-4">
        <h3 className="text-sm font-semibold">Skills match</h3>
        {!hasResume ? (
          <p className="mt-1 text-sm text-fg-muted"><Link href="/resumes" className="text-accent hover:underline">Upload your resume</Link> to see how well you match.</p>
        ) : !match ? (
          <p className="mt-1 text-sm text-fg-muted">Not enough recognisable skills in this description to score it.</p>
        ) : (
          <div className="mt-2 space-y-2 text-sm">
            <p><MatchChip score={match.score} /> <span className="text-fg-muted">You have {match.matched.length} of {job.skills.length} skills this job mentions.</span></p>
            {match.matched.length > 0 && (
              <div className="flex flex-wrap gap-1">{match.matched.map((s) => <Badge key={s} tone="success">✓ {s}</Badge>)}</div>
            )}
            {match.missing.length > 0 && (
              <div className="flex flex-wrap gap-1">{match.missing.map((s) => <Badge key={s}>{s}</Badge>)}</div>
            )}
          </div>
        )}
      </section>

      <div className="mt-5 whitespace-pre-wrap text-sm leading-relaxed">{job.description || "No description available."}</div>
    </article>
  );
}

export default async function JobsPage(props: PageProps<"/jobs">) {
  const userId = await requireUserId();
  const sp = await props.searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const view: JobView = str("view") === "saved" ? "saved" : str("view") === "applied" ? "applied" : "all";
  const filters: JobFilters = {
    view,
    loc: str("loc"),
    q: str("q"),
    remote: str("remote") === "1",
    source: str("source"),
    days: str("days") ? Number(str("days")) : undefined,
    sort: str("sort") === "match" ? "match" : "newest",
  };
  const limit = Math.min(Number(str("limit") ?? PAGE) || PAGE, 1000);
  const selected = str("job");

  const [{ skills: candidate, hasResume }, [searches], [companies], counts] = await Promise.all([
    candidateSkills(userId),
    db().select({ n: count() }).from(schema.savedSearches).where(eq(schema.savedSearches.userId, userId)),
    db().select({ n: count() }).from(schema.trackedCompanies).where(eq(schema.trackedCompanies.userId, userId)),
    countByView(userId),
  ]);
  const sourceCount = searches.n + companies.n;
  const [{ items, total }, regions] = await Promise.all([listUserJobs(userId, filters, candidate, limit), regionCounts(userId, filters)]);

  const hrefWith = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") p.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `/jobs?${p}`;
  };

  const tabHref = (v: JobView) => {
    const p = new URLSearchParams();
    for (const [k, val] of Object.entries(sp)) if (typeof val === "string" && !["job", "limit", "view"].includes(k)) p.set(k, val);
    if (v !== "all") p.set("view", v);
    return `/jobs${p.size ? `?${p}` : ""}`;
  };
  const tabs: { key: JobView; label: string; n?: number }[] = [
    { key: "all", label: "All jobs" },
    { key: "saved", label: "Saved", n: counts.saved },
    { key: "applied", label: "Applied", n: counts.applied },
  ];
  const description =
    view === "saved"
      ? `${total} saved job${total === 1 ? "" : "s"}. Tailor your resume and apply when you're ready.`
      : view === "applied"
        ? `${total} job${total === 1 ? "" : "s"} you've applied to.`
        : sourceCount
          ? `${total} job${total === 1 ? "" : "s"} from your searches and tracked companies.`
          : "Set up sources to start collecting jobs.";

  return (
    <>
      <PageHeader
        title="Jobs"
        description={description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SyncButton />
            <Link href="/jobs/sources" className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium hover:bg-muted">Sources</Link>
            <AddJob />
          </div>
        }
      />
      <nav aria-label="Job lists" className="mb-4 flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            aria-current={view === t.key ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${view === t.key ? "border-accent font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg"}`}
          >
            {t.label}
            {t.n !== undefined && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs">{t.n}</span>}
          </Link>
        ))}
      </nav>
      {view === "all" && sourceCount === 0 && total === 0 ? (
        <EmptyState title="No sources yet" body="Add job title searches and companies to track on the Sources page, then click Sync now." />
      ) : (
        <>
          <Suspense><Filters regionCounts={regions} /></Suspense>
          {items.length === 0 ? (
            view === "saved" ? (
              <EmptyState title="No saved jobs" body="Click Save on any job to keep it here for later." />
            ) : view === "applied" ? (
              <EmptyState title="No applications yet" body="Click Mark applied on a job after you apply, and it moves here." />
            ) : (
              <EmptyState title="No matching jobs" body="Try different filters, or sync to fetch new listings." />
            )
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
              <div className={selected ? "hidden lg:block" : ""}>
                <JobList items={items} hrefs={Object.fromEntries(items.map((j) => [j.id, hrefWith({ job: j.id })]))} selectedId={selected} />
                {total > items.length && (
                  <Link href={hrefWith({ limit: String(limit + PAGE) })} scroll={false} className="mt-3 block rounded-lg border border-border bg-surface py-2 text-center text-sm hover:bg-muted">
                    Show more ({total - items.length} remaining)
                  </Link>
                )}
              </div>
              <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
                {selected ? (
                  <>
                    <Link href={hrefWith({ job: null })} scroll={false} className="mb-2 inline-block text-sm text-fg-muted hover:text-fg lg:hidden">← All jobs</Link>
                    <JobDetail userId={userId} jobId={selected} candidate={candidate} hasResume={hasResume} />
                  </>
                ) : (
                  <div className="hidden rounded-2xl border border-dashed border-border p-10 text-center text-sm text-fg-muted lg:block">Select a job to see details.</div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
