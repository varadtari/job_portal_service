"use client";

import { useOptimistic, useTransition } from "react";
import { Badge } from "@/components/ui";
import { Select } from "@/components/ui";
import { LEVELS } from "@/lib/jobs/seniority";
import { setExperienceLevel, setItOnly, setSourceEnabled } from "../actions";

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-40 ${checked ? "bg-accent" : "bg-border"}`}
    >
      <span className={`inline-block size-5 rounded-full bg-white shadow transition ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export function ItOnlyToggle({ value }: { value: boolean }) {
  const [opt, setOpt] = useOptimistic(value);
  const [, start] = useTransition();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="font-medium">IT & software roles only</p>
        <p className="text-xs text-fg-muted">Drops sales, marketing, HR, finance and non-software engineering roles from every source.</p>
      </div>
      <Switch checked={opt} label="IT roles only" onChange={(v) => start(async () => { setOpt(v); await setItOnly(v); })} />
    </div>
  );
}

export function SourceToggle({ k, name, note, on, configured, needs }: { k: string; name: string; note: string; on: boolean; configured: boolean; needs: string | null }) {
  const [opt, setOpt] = useOptimistic(on);
  const [, start] = useTransition();
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="flex items-center gap-2 font-medium">
          {name}
          {!configured && <Badge>Needs {needs}</Badge>}
        </p>
        <p className="text-xs text-fg-muted">{note}</p>
      </div>
      <Switch
        checked={configured && opt}
        disabled={!configured}
        label={`Use ${name}`}
        onChange={(v) => start(async () => { setOpt(v); await setSourceEnabled(k, v); })}
      />
    </li>
  );
}

export function LevelSelect({ value }: { value: string }) {
  const [opt, setOpt] = useOptimistic(value);
  const [, start] = useTransition();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="font-medium">Experience level</p>
        <p className="text-xs text-fg-muted">Filters by title, e.g. Junior drops Senior, Staff, Lead, Manager, SDE III and intern roles.</p>
      </div>
      <Select
        className="w-auto"
        aria-label="Experience level"
        value={opt}
        onChange={(e) => {
          const v = e.target.value;
          start(async () => { setOpt(v); await setExperienceLevel(v); });
        }}
      >
        {LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
      </Select>
    </div>
  );
}
