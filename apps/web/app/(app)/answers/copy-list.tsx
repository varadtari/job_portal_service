"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui";

type Item = { label: string; value: string };
type Group = { title: string; items: Item[] };

export function CopyList({ groups }: { groups: Group[] }) {
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return groups;
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => `${i.label} ${i.value}`.toLowerCase().includes(s)) }))
      .filter((g) => g.items.length);
  }, [q, groups]);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback for browsers without async clipboard permission
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };

  return (
    <div className="space-y-6">
      <Input type="search" placeholder="Search answers (e.g. notice, CTC, why)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search answers" />
      {filtered.map((g) => (
        <section key={g.title}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">{g.title}</h2>
          <ul className="space-y-2">
            {g.items.map((i) => {
              const key = `${g.title}:${i.label}`;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => copy(key, i.value)}
                    className="flex w-full items-start justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left active:scale-[0.99] hover:border-accent/50"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs text-fg-muted">{i.label}</span>
                      <span className="line-clamp-3 block whitespace-pre-wrap break-words text-sm">{i.value}</span>
                    </span>
                    <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${copied === key ? "bg-success/15 text-success" : "bg-muted text-fg-muted"}`}>
                      {copied === key ? "Copied" : "Copy"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {filtered.length === 0 && <p className="text-sm text-fg-muted">Nothing matches “{q}”.</p>}
    </div>
  );
}
