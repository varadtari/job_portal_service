import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, getUser, signOut } from "@/auth";
import { Nav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await getUser(session.user.id);
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:flex-row">
      <aside className="border-b border-border p-4 md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <Link href="/dashboard" className="mb-4 flex items-center gap-2 px-2">
          <div className="grid size-7 place-items-center rounded-md bg-accent text-sm font-bold text-accent-fg">J</div>
          <span className="font-semibold">JobPilot</span>
        </Link>
        <Nav />
        <div className="mt-6 hidden border-t border-border px-2 pt-4 text-xs text-fg-muted md:block">
          <p className="truncate">{user.email}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="mt-2 hover:text-fg">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {user.gmailNeedsReconnect && (
          <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
            Gmail access expired, so status tracking is paused.{" "}
            <Link href="/login" className="font-medium underline">Reconnect Gmail</Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
