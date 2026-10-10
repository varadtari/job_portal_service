"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

const ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/queue", label: "Apply queue" },
  { href: "/applications", label: "Applications" },
  { href: "/outreach", label: "Outreach" },
  { href: "/answers", label: "Quick answers" },
  { href: "/resumes", label: "Resumes" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
];

/** Desktop sidebar navigation. */
export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map((i) => {
        const active = isActive(path, i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm ${active ? "bg-muted font-medium text-fg" : "text-fg-muted hover:bg-muted hover:text-fg"}`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

const svg = (d: string) => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const TABS = [
  { href: "/dashboard", label: "Home", icon: svg("M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z") },
  { href: "/jobs", label: "Jobs", icon: svg("M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6M4 6h16a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1zM3 12h18") },
  { href: "/queue", label: "Queue", icon: svg("M4 6h16M4 12h16M4 18h10M18 16l3 2-3 2") },
  { href: "/applications", label: "Applied", icon: svg("M4 4h4v16H4zM10 4h4v11h-4zM16 4h4v7h-4z") },
  { href: "/answers", label: "Answers", icon: svg("M8 4h10a2 2 0 0 1 2 2v10M6 8h10a2 2 0 0 1 2 2v9a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z") },

];

/** Phone bottom tab bar (app-style). */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {TABS.map((t) => {
          const active = isActive(path, t.href);
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-accent" : "text-fg-muted"}`}>
              {t.icon}
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
