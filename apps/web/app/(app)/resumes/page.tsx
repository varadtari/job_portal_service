import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireUserId } from "@/auth";
import { db, schema } from "@/lib/db";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge, Card } from "@/components/ui";
import { UploadForm } from "./upload-form";

export const maxDuration = 120;

export default async function ResumesPage() {
  const userId = await requireUserId();
  const rows = await db()
    .select({
      id: schema.resumes.id,
      title: schema.resumes.title,
      kind: schema.resumes.kind,
      parsed: schema.resumes.content,
      tailorMeta: schema.resumes.tailorMeta,
      updatedAt: schema.resumes.updatedAt,
    })
    .from(schema.resumes)
    .where(eq(schema.resumes.userId, userId))
    .orderBy(desc(schema.resumes.updatedAt));

  return (
    <>
      <PageHeader title="Resumes" description="Upload your full resume once. It's parsed into sections you can edit, and fills your profile." />
      <Card className="mb-6">
        <UploadForm />
      </Card>
      {rows.length === 0 ? (
        <EmptyState title="No resumes yet" body="Upload your most complete resume. Then open any job and click “Tailor resume”." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/resumes/${r.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-muted">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="text-xs text-fg-muted">Updated {r.updatedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {r.tailorMeta?.scoreAfter != null && <Badge tone="success">{r.tailorMeta.scoreAfter}% match</Badge>}
                  <Badge tone={r.kind === "master" ? "accent" : "neutral"}>{r.kind === "master" ? "Master" : "Tailored"}</Badge>
                  {!r.parsed && <Badge tone="warning">Not parsed</Badge>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
