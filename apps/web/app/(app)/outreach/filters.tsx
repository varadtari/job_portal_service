"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input, Select } from "@/components/ui";
import { REGIONS } from "@/lib/jobs/regions";

export function ContactFilters({ regionCounts }: { regionCounts: Record<string, number> }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const loc = params.get("loc") ?? "anywhere";
  const isRegion = REGIONS.some((r) => r.key === loc);
  const [place, setPlace] = useState(isRegion ? "" : loc);

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(`${path}?${next}`);
  };

  useEffect(() => {
    if (place.trim() === (isRegion ? "" : loc)) return;
    const t = setTimeout(() => set("loc", place.trim() || null), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place]);

  return (
    <div className="mb-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Location">
          {REGIONS.filter((r) => r.key === "anywhere" || (regionCounts[r.key] ?? 0) > 0 || r.key === loc).map((r) => {
            const active = loc === r.key;
            return (
              <button
                key={r.key}
                type="button"
                aria-pressed={active}
                onClick={() => { setPlace(""); set("loc", r.key === "anywhere" ? null : r.key); }}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-sm ${active ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface text-fg-muted hover:text-fg"}`}
              >
                {r.label}
                <span className={`ml-1.5 text-xs ${active ? "opacity-80" : "opacity-70"}`}>{regionCounts[r.key] ?? 0}</span>
              </button>
            );
          })}
        </div>
        <Input className="w-36 shrink-0 sm:w-48" placeholder="City or country" value={place} onChange={(e) => setPlace(e.target.value)} aria-label="Filter by city or country" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-auto" value={params.get("source") ?? ""} onChange={(e) => set("source", e.target.value || null)} aria-label="Source">
          <option value="">All sources</option>
          <option value="job_post">Job posts</option>
          <option value="gmail">Your Gmail</option>
          <option value="website">Company websites</option>
          <option value="manual">Added by you</option>
        </Select>
        <Select className="w-auto" value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value || null)} aria-label="Status">
          <option value="">Not yet emailed + emailed</option>
          <option value="new">Not yet emailed</option>
          <option value="emailed">Emailed</option>
          <option value="replied">Replied</option>
          <option value="bounced">Bounced</option>
          <option value="do_not_contact">Do not contact</option>
        </Select>
        <Select className="w-auto" value={params.get("kind") ?? ""} onChange={(e) => set("kind", e.target.value || null)} aria-label="Contact type">
          <option value="">People + team inboxes</option>
          <option value="person">People only</option>
          <option value="role">Team inboxes (careers@, hr@…)</option>
        </Select>
      </div>
    </div>
  );
}
