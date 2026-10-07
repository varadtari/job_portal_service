import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserJob } from "@/lib/jobs/repo";
import { Redirector } from "./redirector";

// "Open & apply" goes through here so the JobPilot extension can tell which job this tab is for
// (it then attaches that job's tailored resume and logs the right application). Then forwards to the posting.
export default async function GoPage(props: PageProps<"/go/[id]">) {
  const uid = (await auth())?.user?.id;
  if (!uid) redirect("/login");
  const { id } = await props.params;
  const row = /^[0-9a-f-]{36}$/.test(id) ? await getUserJob(uid, id) : null;
  if (!row?.job.url) redirect("/jobs");
  return (
    <main className="grid min-h-screen place-items-center p-4 text-center">
      <div>
        <p className="text-sm text-fg-muted">Opening {row.job.company} – {row.job.title}…</p>
        <a href={row.job.url} className="mt-2 inline-block text-sm font-medium text-accent hover:underline">Continue to the job posting →</a>
        <Redirector url={row.job.url} />
      </div>
    </main>
  );
}
