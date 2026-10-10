import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { requireUserId } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Badge, Card } from "@/components/ui";
import { db, schema } from "@/lib/db";
import { canSend } from "@/lib/followup/service";
import { timeAgo } from "@/lib/format";
import { contactRegionCounts, listContacts, listEmails, listSites, type ContactFilters as Filters } from "@/lib/outreach/repo";
import { quota } from "@/lib/outreach/service";
import { AddContacts } from "./add-contacts";
import { DailyCap } from "./cap";
import { ContactList } from "./contact-list";
import { Drafts } from "./drafts";
import { ContactFilters } from "./filters";
import { Sites } from "./sites";

const TABS = [
  { key: "contacts", label: "Contacts" },
  { key: "drafts", label: "Drafts" },
  { key: "sent", label: "Sent" },
  { key: "sites", label: "Websites" },
] as const;

export default async function OutreachPage(props: PageProps<"/outreach">) {
  const userId = await requireUserId();
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const tab = TABS.find((t) => t.key === one("tab"))?.key ?? "contacts";
  const filters: Filters = { loc: one("loc"), source: one("source"), status: one("status"), kind: one("kind") };

  const oe = schema.outreachEmails;
  const [[user], q, counts, [resume]] = await Promise.all([
    db().select({ scopes: schema.users.googleScopes }).from(schema.users).where(eq(schema.users.id, userId)),
    quota(userId),
    db().select({ status: oe.status, n: count() }).from(oe).where(eq(oe.userId, userId)).groupBy(oe.status),
    db().select({ title: schema.resumes.title }).from(schema.resumes).where(and(eq(schema.resumes.userId, userId), eq(schema.resumes.kind, "master"))).orderBy(desc(schema.resumes.updatedAt)).limit(1),
  ]);
  const n = (s: string) => Number(counts.find((c) => c.status === s)?.n ?? 0);
  const badge: Partial<Record<(typeof TABS)[number]["key"], number>> = { drafts: n("draft") + n("failed"), sent: n("sent") };
  const href = (key: string) => (key === "contacts" ? "/outreach" : `/outreach?tab=${key}`);

  return (
    <>
      <PageHeader
        title="Outreach"
        description="Email companies directly with your master resume attached. Contacts come from job posts, recruiters in your Gmail, company websites and addresses you add. You review every email; sending is slow and capped to protect your Gmail."
      />
      <nav className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1" aria-label="Outreach sections">
        {TABS.map((t) => (
          <Link key={t.key} href={href(t.key)} aria-current={tab === t.key ? "page" : undefined} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${tab === t.key ? "bg-muted font-medium" : "text-fg-muted hover:bg-muted"}`}>
            {t.label}
            {badge[t.key] ? <span className="ml-1.5 rounded-full bg-accent px-1.5 text-xs text-accent-fg">{badge[t.key]}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "contacts" && <ContactsTab userId={userId} filters={filters} hasResume={!!resume} />}
      {tab === "drafts" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg-muted">
            <span>{q.used} sent in the last 24 hours</span>
            <DailyCap cap={q.cap} />
          </div>
          <Drafts drafts={await listEmails(userId, ["draft", "failed"])} left={q.left} canSend={canSend(user?.scopes)} resumeName={resume?.title ?? null} />
        </div>
      )}
      {tab === "sent" && <SentTab userId={userId} />}
      {tab === "sites" && <Sites sites={await listSites(userId)} />}
    </>
  );
}

async function ContactsTab({ userId, filters, hasResume }: { userId: string; filters: Filters; hasResume: boolean }) {
  const [items, regionCounts] = await Promise.all([listContacts(userId, filters), contactRegionCounts(userId, filters)]);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 pb-24 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
      <div>
        <ContactFilters regionCounts={regionCounts} />
        {!hasResume && <p className="mb-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">Upload a master resume on <Link href="/resumes" className="underline">Resumes</Link> first; it&apos;s attached to every outreach email.</p>}
        {items.length ? (
          <ContactList items={items} canDraft={hasResume} />
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-fg-muted">No contacts match these filters. Add some on the right, or check a company&apos;s website on the Websites tab.</p>
        )}
      </div>
      <Card><AddContacts /></Card>
    </div>
  );
}

async function SentTab({ userId }: { userId: string }) {
  const sent = await listEmails(userId, ["sent"]);
  if (!sent.length) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-fg-muted">Nothing sent yet.</p>;
  const tone = { replied: "success", bounced: "danger", emailed: "accent" } as const;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-sm">
      {sent.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{e.company ?? e.email} <span className="font-normal text-fg-muted">· {e.email}</span></p>
            <p className="truncate text-fg-muted">{e.subject}</p>
          </div>
          <span className="flex items-center gap-2 text-xs text-fg-muted">
            <Badge tone={tone[e.contactStatus as keyof typeof tone] ?? "neutral"}>{e.contactStatus === "replied" ? "Replied" : e.contactStatus === "bounced" ? "Bounced" : "Waiting"}</Badge>
            {timeAgo(e.sentAt)}
            {e.threadId && <a href={`https://mail.google.com/mail/u/0/#all/${e.threadId}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Open in Gmail ↗</a>}
          </span>
        </li>
      ))}
    </ul>
  );
}
