import type { ComponentProps } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Button({
  variant = "primary",
  className,
  ...p
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-accent-fg hover:opacity-90",
        variant === "secondary" && "border border-border bg-surface hover:bg-muted",
        variant === "ghost" && "text-fg-muted hover:bg-muted hover:text-fg",
        variant === "danger" && "text-danger hover:bg-danger/10",
        className,
      )}
    />
  );
}

// Full width unless the caller sets its own width
const width = (className?: string) => (/(^|\s)w-/.test(className ?? "") ? undefined : "w-full");
const field = "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input {...p} className={cx(field, width(className), className)} />;
}

export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea {...p} className={cx(field, width(className), "min-h-20", className)} />;
}

export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select {...p} className={cx(field, width(className), className)} />;
}

export function Label({ className, ...p }: ComponentProps<"label">) {
  return <label {...p} className={cx("mb-1 block text-xs font-medium text-fg-muted", className)} />;
}

export function Card({ className, ...p }: ComponentProps<"section">) {
  return <section {...p} className={cx("rounded-2xl border border-border bg-surface p-5", className)} />;
}

export function Badge({ tone = "neutral", className, ...p }: ComponentProps<"span"> & { tone?: "neutral" | "accent" | "success" | "warning" | "danger" }) {
  return (
    <span
      {...p}
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-muted text-fg-muted",
        tone === "accent" && "bg-accent/15 text-accent",
        tone === "success" && "bg-success/15 text-success",
        tone === "warning" && "bg-warning/15 text-warning",
        tone === "danger" && "bg-danger/15 text-danger",
        className,
      )}
    />
  );
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "success" | "warning"; children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className={cx(
        "rounded-lg border px-3 py-2 text-sm",
        tone === "danger" && "border-danger/30 bg-danger/10 text-danger",
        tone === "success" && "border-success/30 bg-success/10 text-success",
        tone === "warning" && "border-warning/30 bg-warning/10",
      )}
    >
      {children}
    </p>
  );
}
