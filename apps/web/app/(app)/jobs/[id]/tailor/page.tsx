import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { EmptyState, PageHeader } from "@/components/page-header";
import { geminiConfigured } from "@/lib/ai/gemini";
import { db, schema } from "@/lib/db";
import { getUserJob } from "@/lib/jobs/repo";
import { ResumeContent } from "@/lib/resume/types";
import { tailorByRules } from "@/lib/tailor/rules";
import { Workbench } from "./workbench";

export const maxDuration = 120;

export default async function TailorPage(props: PageProps<"/jobs/[id]/tailor">) {
  const userId = await requireUserId();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const job = await getUserJob(userId, id);
  if (!job) notFound();

  const [masters, existing] = await Promise.all([
    db()
      .select({ id: schema.resumes.id, title: schema.resumes.title, content: schema.resumes.content })
      .from(schema.resumes)
      .where(and(eq(schema.resumes.userId, userId), eq(schema.resumes.kind, "master")))
      .orderBy(desc(schema.resumes.updatedAt)),
    db()
      .select({ id: schema.resumes.id, title: schema.resumes.title, createdAt: schema.resumes.createdAt })
      .from(schema.resumes)
      .where(and(eq(schema.resumes.userId, userId), eq(schema.resumes.jobId, id), eq(schema.resumes.kind, "tailored")))
      .orderBy(desc(schema.resumes.createdAt)),
  ]);

  const usable = masters.filter((m) => ResumeContent.safeParse(m.content).success);
  const header = (
    <>
      <Link href={`/jobs?job=${id}`} className="text-sm text-fg-muted hover:text-fg">← {job.job.title}</Link>
      <PageHeader title="Tailor resume" description={`For ${job.job.title} at ${job.job.company}`} />
    </>
  );
  if (!usable.length) {
    return (
      <>
        {header}
        <EmptyState title="No resume to tailor yet" body="Upload your master resume on the Resumes page first." />
        <p className="mt-4 text-center"><Link href="/resumes" className="text-sm font-medium text-accent hover:underline">Go to Resumes →</Link></p>
      </>
    );
  }
  const base = usable.find((m) => m.id === sp.base) ?? usable[0];
  const content = base.content as ResumeContent;

  return (
    <>
      {header}
      {existing.length > 0 && (
        <p className="mb-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
          You already have {existing.length === 1 ? "a tailored resume" : `${existing.length} tailored resumes`} for this job:{" "}
          {existing.map((e, i) => (
            <span key={e.id}>{i > 0 && ", "}<Link href={`/resumes/${e.id}`} className="font-medium text-accent hover:underline">{e.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Link></span>
          ))}
        </p>
      )}
      <Workbench
        jobId={id}
        job={{ title: job.job.title, company: job.job.company, skills: job.job.skills, descriptionLength: job.job.description.length }}
        bases={usable.map((m) => ({ id: m.id, title: m.title }))}
        baseId={base.id}
        base={content}
        rulesProposal={tailorByRules(content, job.job.skills)}
        geminiOn={geminiConfigured()}
      />
    </>
  );
}
