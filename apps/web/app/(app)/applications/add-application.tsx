"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Card, Input, Label, Select } from "@/components/ui";
import { COLUMNS } from "@/lib/applications/labels";
import { addApplication } from "./actions";

export function AddApplication() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addApplication, undefined);
  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>+ Add</Button>;
  return (
    <Card className="mb-6 w-full">
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto] sm:items-end">
        <div><Label htmlFor="ap-company">Company</Label><Input id="ap-company" name="company" required /></div>
        <div><Label htmlFor="ap-title">Role</Label><Input id="ap-title" name="title" required /></div>
        <div><Label htmlFor="ap-url">Link (optional)</Label><Input id="ap-url" name="url" type="url" /></div>
        <div>
          <Label htmlFor="ap-status">Status</Label>
          <Select id="ap-status" name="status" defaultValue="applied" className="w-auto">
            {COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button disabled={pending}>Add</Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
        {state?.error && <div className="sm:col-span-5"><Alert>{state.error}</Alert></div>}
      </form>
    </Card>
  );
}
