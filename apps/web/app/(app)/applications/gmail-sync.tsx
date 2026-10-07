"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { syncGmailNow } from "./actions";

export function GmailSyncButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>();
  return (
    <div className="flex flex-wrap items-center gap-3">
      {msg && <span className={`max-w-md text-sm ${msg.error ? "text-danger" : "text-fg-muted"}`}>{msg.error ?? msg.ok}</span>}
      <Button disabled={pending} onClick={() => start(async () => setMsg(await syncGmailNow()))}>
        {pending ? "Reading Gmail…" : "Sync Gmail"}
      </Button>
    </div>
  );
}
