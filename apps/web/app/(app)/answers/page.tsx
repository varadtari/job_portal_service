import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireUserId } from "@/auth";
import { EmptyState, PageHeader } from "@/components/page-header";
import { db, schema } from "@/lib/db";
import { CANONICAL_KEYS, FIELD_GROUPS } from "@/lib/profile/fields";
import { listProfileFields } from "@/lib/profile/repo";
import { CopyList } from "./copy-list";

export default async function AnswersPage() {
  const userId = await requireUserId();
  const [rows, [resume]] = await Promise.all([
    listProfileFields(userId),
    db()
      .select({ id: schema.resumes.id })
      .from(schema.resumes)
      .where(and(eq(schema.resumes.userId, userId), eq(schema.resumes.kind, "master")))
      .orderBy(desc(schema.resumes.updatedAt))
      .limit(1),
  ]);
  const values = new Map(rows.map((r) => [r.key, r.value]));
  const name = [values.get("first_name"), values.get("last_name")].filter(Boolean).join(" ");
  const location = [values.get("city"), values.get("state"), values.get("country")].filter(Boolean).join(", ");

  const groups = FIELD_GROUPS.map((g) => ({
    title: g.title,
    items: [
      ...(g.title === "Personal" && name ? [{ label: "Full name", value: name }] : []),
      ...(g.title === "Personal" && location ? [{ label: "Location", value: location }] : []),
      ...g.fields.filter((f) => values.get(f.key)).map((f) => ({ label: f.label, value: values.get(f.key)! })),
    ],
  }));
  const saved = rows.filter((r) => !CANONICAL_KEYS.has(r.key)).map((r) => ({ label: r.label ?? r.key, value: r.value }));
  const all = [...(saved.length ? [{ title: "Saved answers", items: saved }] : []), ...groups].filter((g) => g.items.length);

  return (
    <>
      <PageHeader
        title="Quick answers"
        description="Tap to copy, then paste into any application form or app."
        actions={resume ? <a href={`/api/resumes/${resume.id}/export?format=pdf`} className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium hover:bg-muted">Resume PDF</a> : undefined}
      />
      {all.length === 0 ? (
        <>
          <EmptyState title="No answers yet" body="Fill in your Profile, or upload a resume, and your answers will appear here." />
          <p className="mt-4 text-center"><Link href="/profile" className="text-sm font-medium text-accent hover:underline">Go to Profile →</Link></p>
        </>
      ) : (
        <div className="max-w-2xl"><CopyList groups={all} /></div>
      )}
    </>
  );
}
