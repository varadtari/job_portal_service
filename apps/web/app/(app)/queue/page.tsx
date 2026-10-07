import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireUserId } from "@/auth";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge, Card } from "@/components/ui";
import { db, schema } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { listQueue } from "@/lib/queue";
import { QueueItemControls } from "./controls";

export default async function QueuePage() {
  const userId = await requireUserId();
  const [pending, finished] = await Promise.all([listQueue(userId), listQueue(userId, ["done", "skipped"])]);
  const jobIds = pending.map((p) => p.jobId);
  const tailored = jobIds.length
    ? await db()
        .select({ jobId: schema.resumes.jobId, id: schema.resumes.id, meta: schema.resumes.tailorMeta })
        .from(schema.resumes)
        .where(and(eq(schema.resumes.userId, userId), eq(schema.resumes.kind, "tailored"), inArray(schema.resumes.jobId, jobIds)))
        .orderBy(desc(schema.resumes.createdAt))
    : [];
  const resumeFor = new Map<string, (typeof tailored)[number]>();
  for (const t of tailored) if (t.jobId && !resumeFor.has(t.jobId)) resumeFor.set(t.jobId, t);

  return (
    <>
      <PageHeader title="Apply queue" description={pending.length ? `${pending.length} job${pending.length === 1 ? "" : "s"} waiting. The extension opens each one, fills it in and attaches its resume; you check and press Submit.` : "Queue jobs from the Jobs page, then apply to them one after another."} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-6">
          {pending.length === 0 ? (
            <EmptyState title="Queue is empty" body="On Jobs, tick some jobs and choose “Tailor & queue”, or open a job and click “Add to apply queue”." />
          ) : (
            <ol className="space-y-2">
              {pending.map((item, i) => {
                const t = resumeFor.get(item.jobId);
                return (
                  <li key={item.id} className="rounded-2xl border border-border bg-surface p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-fg-muted">#{i + 1}{item.status === "active" ? " · in progress" : ""}</p>
                        <Link href={`/jobs?job=${item.jobId}`} className="font-medium hover:underline">{item.title}</Link>
                        <p className="text-sm text-fg-muted">{item.company}{item.location ? ` · ${item.location}` : ""}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                          {t ? (
                            <a href={`/api/resumes/${t.id}/export?format=pdf`}><Badge tone="success">Tailored resume{t.meta?.scoreAfter != null ? ` · ${t.meta.scoreAfter}%` : ""}</Badge></a>
                          ) : (
                            <Badge tone="warning">Master resume (not tailored)</Badge>
                          )}
                          {item.url && <a href={`/go/${item.jobId}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Open posting ↗</a>}
                        </div>
                      </div>
                      <QueueItemControls id={item.id} jobId={item.jobId} first={i === 0} last={i === pending.length - 1} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {finished.length > 0 && (
            <Card>
              <h2 className="mb-2 font-semibold">Finished</h2>
              <ul className="divide-y divide-border text-sm">
                {finished.slice(-20).reverse().map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">{f.company} – {f.title}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-fg-muted">
                      <Badge tone={f.status === "done" ? "success" : "neutral"}>{f.status === "done" ? "Applied" : "Skipped"}</Badge>
                      {timeAgo(f.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <Card className="space-y-3 text-sm">
          <h2 className="font-semibold">How to work through the queue</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Open the <b>JobPilot extension</b> (Chrome on your computer, or Firefox on your phone) and tap <b>Start apply queue</b>.</li>
            <li>It opens the first job, fills in the form, attaches that job&apos;s tailored resume, and shows a bar at the bottom of the page.</li>
            <li>Check the answers (yellow = needs you), then press the site&apos;s <b>Submit</b>. JobPilot marks it applied and opens the next job.</li>
            <li>Use <b>Skip</b> on the bar to move on without applying.</li>
          </ol>
          <p className="text-fg-muted">No extension handy? Use <b>Open posting</b> and <b>Mark applied</b> here.</p>
        </Card>
      </div>
    </>
  );
}
