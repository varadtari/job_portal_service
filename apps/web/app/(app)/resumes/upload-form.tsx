"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Label } from "@/components/ui";
import { uploadResume } from "./actions";

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadResume, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <Label htmlFor="file">Resume file (PDF or DOCX, max 4 MB)</Label>
        <Input id="file" name="file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required />
      </div>
      <div>
        <Label htmlFor="title">Name (optional)</Label>
        <Input id="title" name="title" placeholder="e.g. Backend – master" />
      </div>
      <Button disabled={pending}>{pending ? "Uploading…" : "Upload"}</Button>
      {state?.error && <div className="sm:col-span-3"><Alert>{state.error}</Alert></div>}
    </form>
  );
}
