"use client";

import { useState, useTransition } from "react";
import { Select } from "@/components/ui";
import { setDailyCap } from "./actions";

export function DailyCap({ cap }: { cap: number }) {
  const [value, setValue] = useState(cap);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-fg-muted">Daily limit</span>
      <Select
        className="w-auto"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const n = Number(e.target.value);
          setValue(n);
          setSaved(false);
          start(async () => { await setDailyCap(n); setSaved(true); });
        }}
      >
        {[5, 10, 15, 20, 25, 30, 40, 50].map((n) => <option key={n} value={n}>{n} emails / day</option>)}
      </Select>
      {saved && <span className="text-xs text-success">✓ Saved</span>}
    </label>
  );
}
