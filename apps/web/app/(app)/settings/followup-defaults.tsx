"use client";

import { useState, useTransition } from "react";
import { Label, Select } from "@/components/ui";
import { saveFollowUpDefaults } from "../applications/followup-actions";

export function FollowUpDefaults({ on, days, max }: { on: boolean; days: number; max: number }) {
  const [v, setV] = useState({ on, days, max });
  const [saved, setSaved] = useState(false);
  const [, start] = useTransition();
  // Saves immediately: a separate "Save" button was easy to miss
  const change = (next: typeof v) => {
    setV(next);
    setSaved(false);
    start(async () => {
      await saveFollowUpDefaults(next);
      setSaved(true);
    });
  };
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.on} onChange={(e) => change({ ...v, on: e.target.checked })} />
        Turn on follow-ups for applications by default
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="fd-days">Follow up after</Label>
          <Select id="fd-days" value={v.days} onChange={(e) => change({ ...v, days: Number(e.target.value) })}>
            {[3, 5, 7, 10, 14, 21].map((d) => <option key={d} value={d}>{d} days without a reply</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="fd-max">At most</Label>
          <Select id="fd-max" value={v.max} onChange={(e) => change({ ...v, max: Number(e.target.value) })}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n} follow-up{n > 1 ? "s" : ""} per job</option>)}
          </Select>
        </div>
      </div>
      <p className="h-5 text-sm text-success" aria-live="polite">{saved ? "✓ Saved" : ""}</p>
      <p className="text-xs text-fg-muted">Each day JobPilot drafts due follow-ups and notifies you. Nothing is sent until you tap Send. Each application can override these settings.</p>
    </div>
  );
}
