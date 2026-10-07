"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { addSharedJob } from "./actions";

export function ShareImporter({ title, text, url }: { title?: string; text?: string; url?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in dev
    started.current = true;
    addSharedJob({ title, text, url }).then((r) => {
      if (r.jobId) router.replace(`/jobs?job=${r.jobId}`);
      else setError(r.error ?? "Couldn't add this job.");
    });
  }, [title, text, url, router]);
  return error ? <Alert>{error}</Alert> : <p className="text-sm text-fg-muted">Adding the job to JobPilot…</p>;
}
