"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { syncNow } from "./actions";

export function SyncButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>();
  return (
    <div className="flex items-center gap-3">
      {msg && <span className={`text-sm ${msg.error ? "text-danger" : "text-fg-muted"}`}>{msg.error ?? msg.ok}</span>}
      <Button variant={variant} disabled={pending} onClick={() => start(async () => setMsg(await syncNow()))}>
        {pending ? "Syncing…" : "Sync now"}
      </Button>
    </div>
  );
}
