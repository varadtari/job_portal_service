import Link from "next/link";
import { requireUserId } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { CANONICAL_KEYS } from "@/lib/profile/fields";
import { listProfileFields } from "@/lib/profile/repo";
import { SavedAnswers } from "./answers";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const userId = await requireUserId();
  const rows = await listProfileFields(userId);
  const values = Object.fromEntries(
    rows.filter((r) => CANONICAL_KEYS.has(r.key)).map((r) => [r.key, { value: r.value, source: r.source }]),
  );
  const answers = rows
    .filter((r) => !CANONICAL_KEYS.has(r.key))
    .map(({ key, label, value, source, useCount }) => ({ key, label, value, source, useCount }));
  const filled = Object.keys(values).length;

  return (
    <>
      <PageHeader
        title="Profile"
        description={`These details autofill job applications. ${filled} of ${CANONICAL_KEYS.size} fields filled.`}
        actions={
          filled === 0 ? (
            <Link href="/resumes" className="text-sm font-medium text-accent hover:underline">Upload a resume to prefill →</Link>
          ) : undefined
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px] xl:items-start">
        <ProfileForm values={values} />
        <div className="xl:sticky xl:top-8"><SavedAnswers answers={answers} /></div>
      </div>
    </>
  );
}
