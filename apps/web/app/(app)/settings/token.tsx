"use client";

import { useState, useTransition } from "react";
import { Alert, Badge, Button } from "@/components/ui";
import { createExtensionToken, revokeExtensionToken } from "./actions";

export function ExtensionToken({ active }: { active: boolean }) {
  const [token, setToken] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={active || token ? "success" : "neutral"}>{active || token ? "Token active" : "No token"}</Badge>
        <Button
          variant={active ? "secondary" : "primary"}
          disabled={pending}
          onClick={() => {
            if (active && !confirm("Create a new token? The extension will need the new one; the old token stops working.")) return;
            start(async () => { setToken((await createExtensionToken()).token); setCopied(false); });
          }}
        >
          {active ? "Create new token" : "Create token"}
        </Button>
        {active && !token && (
          <Button variant="danger" disabled={pending} onClick={() => confirm("Revoke the token? The extension stops working until you create a new one.") && start(() => revokeExtensionToken())}>
            Revoke
          </Button>
        )}
      </div>
      {token && (
        <div className="space-y-2">
          <Alert tone="warning">Copy this now. It won&apos;t be shown again. Paste it into the extension&apos;s popup.</Alert>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs">{token}</code>
            <Button variant="secondary" onClick={async () => { await navigator.clipboard.writeText(token); setCopied(true); }}>{copied ? "Copied" : "Copy"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
