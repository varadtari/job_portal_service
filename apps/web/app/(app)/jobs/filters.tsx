"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input, Select } from "@/components/ui";
import { SOURCE_LABEL } from "@/lib/format";
import { REGIONS } from "@/lib/jobs/regions";

export function JobFilters({ regionCounts = {} }: { regionCounts?: Record<string, number> }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const loc = params.get("loc") ?? "anywhere";
  const isRegion = REGIONS.some((r) => r.key === loc);
  const [place, setPlace] = useState(isRegion ? "" : loc);

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    next.delete("job");
    next.delete("limit"); // keeps "view", so filters work inside the Saved/Applied tabs
    router.replace(`${path}?${next}`);
  };

  // Debounced text search
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => set("q", q.trim() || null), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Debounced free-text location
  useEffect(() => {
    const current = isRegion ? "" : loc;
    if (place.trim() === current) return;
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
              {regionCounts[r.key] !== undefined && <span className={`ml-1.5 text-xs ${active ? "opacity-80" : "opacity-70"}`}>{regionCounts[r.key]}</span>}
            </button>
          );
        })}
      </div>
      <Input className="w-36 shrink-0 sm:w-48" placeholder="City or country" value={place} onChange={(e) => setPlace(e.target.value)} aria-label="Filter by city or country" />
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Input className="w-full sm:w-72" placeholder="Search title, company, location" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search jobs" />
      <Select className="w-auto" value={params.get("days") ?? ""} onChange={(e) => set("days", e.target.value)} aria-label="Posted within">
        <option value="">Any time</option>
        <option value="1">Last 24 hours</option>
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
      </Select>
      <Select className="w-auto" value={params.get("source") ?? ""} onChange={(e) => set("source", e.target.value)} aria-label="Source">
        <option value="">All sources</option>
        {Object.entries(SOURCE_LABEL).filter(([k]) => k !== "directory").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      <Select className="w-auto" value={params.get("sort") ?? "newest"} onChange={(e) => set("sort", e.target.value === "newest" ? null : e.target.value)} aria-label="Sort">
        <option value="newest">Newest first</option>
        <option value="match">Best match first</option>
      </Select>
      <label className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
        <input type="checkbox" checked={params.get("remote") === "1"} onChange={(e) => set("remote", e.target.checked ? "1" : null)} />
        Remote only
      </label>
    </div>
    </div>
  );
}
