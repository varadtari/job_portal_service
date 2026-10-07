import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { db, schema } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui";
import type { ResumeContent } from "@/lib/resume/types";
import { ResumeEditor } from "./editor";
import { ResumeActions } from "./resume-actions";

export const maxDuration = 120;

export default async function ResumePage(props: PageProps<"/resumes/[id]">) {
  const userId = await requireUserId();
  const { id } = await props.params;
  const { parsed, tailored } = await props.searchParams;
  const [row] = await db()
    .select()
    .from(schema.resumes)
    .where(and(eq(schema.resumes.id, id), eq(schema.resumes.userId, userId)));
  if (!row) notFound();

  return (
    <>
      <Link href="/resumes" className="text-sm text-fg-muted hover:text-fg">← Resumes</Link>
      <PageHeader
        title={row.title}
        description={
          row.kind === "master"
            ? "Master resume. Edits here are used for tailoring."
            : `Tailored for ${row.tailorMeta?.jobTitle ?? "a job"} at ${row.tailorMeta?.company ?? "—"}${row.tailorMeta?.method === "gemini" ? " with Gemini" : ""}.`
        }
        actions={<ResumeActions id={row.id} hasFile={!!row.storagePath} parsed={!!row.content} canReparse={!!row.rawText} />}
      />
      {tailored && (
        <div className="mb-6">
          <Alert tone="success">
            Tailored resume saved{row.tailorMeta?.scoreBefore != null ? ` (skills match ${row.tailorMeta.scoreBefore}% → ${row.tailorMeta.scoreAfter}%)` : ""}. Make any final edits below, then download the PDF.
            {row.jobId && <> <Link href={`/jobs?job=${row.jobId}`} className="font-medium underline">Back to the job</Link></>}
          </Alert>
        </div>
      )}
      {parsed === "rules" && row.content && (
        <div className="mb-6">
          <Alert tone="warning">
            Sections were detected automatically from headings and dates. Check each one, especially job titles vs. company names, and fix anything that landed in the wrong place.
          </Alert>
        </div>
      )}
      {row.content ? (
        <ResumeEditor id={row.id} title={row.title} initial={row.content as ResumeContent} />
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="mb-2 text-sm font-medium">Extracted text</p>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-xs text-fg-muted">{row.rawText}</pre>
        </div>
      )}
    </>
  );
}
