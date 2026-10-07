"use client";

import { useActionState } from "react";
import { Alert, Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { FIELD_GROUPS } from "@/lib/profile/fields";
import { saveProfile } from "./actions";

type Values = Record<string, { value: string; source: string }>;

export function ProfileForm({ values }: { values: Values }) {
  const [state, action, pending] = useActionState(saveProfile, undefined);
  return (
    <form action={action} className="space-y-6">
      {FIELD_GROUPS.map((g) => (
        <Card key={g.title}>
          <h2 className="font-semibold">{g.title}</h2>
          {g.description && <p className="text-sm text-fg-muted">{g.description}</p>}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {g.fields.map((f) => {
              const v = values[f.key];
              const common = { id: f.key, name: f.key, defaultValue: v?.value ?? "", placeholder: f.placeholder };
              return (
                <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
                  <Label htmlFor={f.key}>
                    {f.label}
                    {v?.source === "resume" && <span className="ml-2 font-normal text-accent">from resume</span>}
                    {v?.source === "learned" && <span className="ml-2 font-normal text-accent">learned</span>}
                  </Label>
                  {f.type === "textarea" ? (
                    <Textarea rows={5} {...common} />
                  ) : f.type === "select" ? (
                    <Select {...common}>
                      <option value="">—</option>
                      {f.options!.map((o) => <option key={o}>{o}</option>)}
                    </Select>
                  ) : (
                    <Input type={f.type ?? "text"} {...common} />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      <div className="sticky bottom-[calc(57px+env(safe-area-inset-bottom))] md:bottom-0 flex items-center justify-end gap-3 border-t border-border bg-bg/95 py-3 backdrop-blur">
        {state?.ok && <span className="text-sm text-success">{state.ok}</span>}
        {state?.error && <Alert>{state.error}</Alert>}
        <Button disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
      </div>
    </form>
  );
}
