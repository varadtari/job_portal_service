import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getUser, requireUserId } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Badge, Card } from "@/components/ui";
import { db, schema } from "@/lib/db";
import { COLUMNS, EVENT_LABEL, gmailLink } from "@/lib/applications/labels";
import { getApplication } from "@/lib/applications/repo";
import { DeleteApplication, DetachEvent, Notes, StatusControl } from "./controls";
import { FollowUpPanel } from "./followup-panel";
import { nextFollowUpAt } from "@/lib/followup/schedule";
import { canSend } from "@/lib/followup/service";

const TONE: Record<string, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  applied_confirm: "accent", oa: "warning", interview: "warning", offer: "success", rejection: "danger", manual: "neutral", other: "neutral",
};

export default async function ApplicationPage(props: PageProps<"/applications/[id]">) {
  const userId = await requireUserId();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const [data, user] = await Promise.all([getApplication(userId, id), getUser(userId)]);
  if (!data || !user) notFound();
  const { app, events } = data;
  const followUps = await db().select().from(schema.followUps).where(eq(schema.followUps.applicationId, app.id)).orderBy(desc(schema.followUps.createdAt));
  const pendingDraft = followUps.find((f) => f.status === "draft") ?? null;
  const defaults = { followUpDefaultOn: user.followUpDefaultOn, followUpDefaultDays: user.followUpDefaultDays, followUpDefaultMax: user.followUpDefaultMax };
  const nextAt = nextFollowUpAt(app, defaults);
  const tailored = app.jobId
    ? await db()
        .select({ id: schema.resumes.id, title: schema.resumes.title })
        .from(schema.resumes)
        .where(and(eq(schema.resumes.userId, userId), eq(schema.resumes.jobId, app.jobId)))
        .orderBy(desc(schema.resumes.createdAt))
    : [];
  const col = COLUMNS.find((c) => c.status === app.status);

  return (
    <>
      <Link href="/applications" className="text-sm text-fg-muted hover:text-fg">← Applications</Link>
      <PageHeader
        title={app.company}
        description={app.title}
        actions={<div className="flex items-center gap-2"><Badge tone={col?.tone}>{col?.label}</Badge><StatusControl id={app.id} status={app.status} /></div>}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <Card>
          <h2 className="mb-4 font-semibold">Timeline</h2>
          {events.length === 0 ? (
            <p className="text-sm text-fg-muted">No emails linked yet. Sync Gmail to pick up updates.</p>
          ) : (
            <ol className="relative space-y-5 border-l border-border pl-5">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-surface bg-accent" aria-hidden />
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONE[e.type]}>{EVENT_LABEL[e.type] ?? e.type}</Badge>
                    <span className="text-xs text-fg-muted">{e.occurredAt.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  {e.subject && <p className="mt-1 text-sm font-medium">{e.subject}</p>}
                  {e.snippet && <p className="text-sm text-fg-muted">{e.snippet}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-fg-muted">
                    {e.fromAddress && <span>From {e.fromAddress}</span>}
                    {e.emailMessageId && e.type !== "manual" && (
                      <a href={gmailLink(e.emailMessageId, user?.email)} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                        Open in Gmail ↗
                      </a>
                    )}
                    {e.emailMessageId && e.type !== "manual" && <DetachEvent id={e.id} />}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <div className="space-y-6">
          <Card className="space-y-3 text-sm">
            {app.appliedAt && <p><span className="text-fg-muted">Applied:</span> {app.appliedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>}
            {app.url && <p className="truncate"><span className="text-fg-muted">Posting:</span> <a href={app.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{app.url.replace(/^https?:\/\//, "")}</a></p>}
            {app.jobId && <p><Link href={`/jobs?job=${app.jobId}`} className="text-accent hover:underline">View job in JobPilot</Link></p>}
            {tailored.length > 0 && (
              <p><span className="text-fg-muted">Resume used:</span> {tailored.map((r) => <Link key={r.id} href={`/resumes/${r.id}`} className="text-accent hover:underline">{r.title}</Link>)}</p>
            )}
          </Card>
          <FollowUpPanel
            applicationId={app.id}
            status={app.status}
            settings={{ enabled: app.followUpEnabled, everyDays: app.followUpEveryDays, max: app.followUpMax, contactEmail: app.contactEmail }}
            defaults={{ on: user.followUpDefaultOn, days: user.followUpDefaultDays, max: user.followUpDefaultMax }}
            nextAt={nextAt?.toISOString() ?? null}
            count={app.followUpCount}
            canSend={canSend(user.googleScopes)}
            pendingDraft={pendingDraft ? { id: pendingDraft.id, to: pendingDraft.toAddress, subject: pendingDraft.subject, body: pendingDraft.body, method: pendingDraft.method } : null}
            autoOpen={typeof sp.followup === "string" && sp.followup === pendingDraft?.id}
            history={followUps.filter((f) => f.status === "sent").map((f) => ({ id: f.id, sentAt: (f.sentAt ?? f.createdAt).toISOString(), to: f.toAddress ?? "", subject: f.subject }))}
          />
          <Card><Notes id={app.id} initial={app.notes ?? ""} /></Card>
          <DeleteApplication id={app.id} />
        </div>
      </div>
    </>
  );
}
