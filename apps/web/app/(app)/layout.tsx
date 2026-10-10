import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, getUser, signOut } from "@/auth";
import { BottomNav, Nav } from "@/components/nav";
import { ServiceWorkerRegister } from "@/components/pwa";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await getUser(session.user.id);
  if (!user) redirect("/login");

  const logo = (
    <Link href="/dashboard" className="flex items-center gap-2 px-2">
      <div className="grid size-7 place-items-center rounded-md bg-accent text-sm font-bold text-accent-fg">J</div>
      <span className="font-semibold">JobPilot</span>
    </Link>
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:flex-row">
      <ServiceWorkerRegister />
      {/* Desktop sidebar */}
      <aside className="hidden border-r border-border p-4 md:block md:w-56 md:shrink-0">
        <div className="mb-4">{logo}</div>
        <Nav />
        <div className="mt-6 border-t border-border px-2 pt-4 text-xs text-fg-muted">
          <p className="truncate">{user.email}</p>
          <form action={signOutAction}>
            <button className="mt-2 hover:text-fg">Sign out</button>
          </form>
        </div>
      </aside>
      {/* Phone top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-bg/95 px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur md:hidden">
        {logo}
        <div className="flex items-center gap-1 text-sm">
          <Link href="/outreach" className="rounded-lg px-2.5 py-1.5 text-fg-muted hover:bg-muted">Outreach</Link>
          <Link href="/resumes" className="rounded-lg px-2.5 py-1.5 text-fg-muted hover:bg-muted">Resumes</Link>
          <Link href="/profile" className="rounded-lg px-2 py-1.5 text-fg-muted hover:bg-muted" aria-label="Profile" title="Profile">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
          </Link>
          <Link href="/settings" className="rounded-lg px-2 py-1.5 text-fg-muted hover:bg-muted" aria-label="Settings">⚙</Link>
        </div>
      </header>
      <main className="min-w-0 flex-1 p-4 pb-28 md:p-8">
        {user.gmailNeedsReconnect && (
          <form action={signOutAction} className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
            Gmail access expired, so status tracking is paused.{" "}
            <button className="font-medium underline">Sign in again to reconnect</button>
          </form>
        )}
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
