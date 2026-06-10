import type { ComponentProps, ReactNode } from "react";

const control =
  "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-ink " +
  "shadow-sm outline-none transition " +
  "placeholder:text-muted " +
  "focus:border-primary focus:ring-2 focus:ring-primary/30 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

/** Wraps a labelled control with an optional error message. */
export function Field({
  label,
  error,
  children,
}: {
  label: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
      {label}
      {children}
      {error && <span className="text-xs font-medium text-danger">{error}</span>}
    </label>
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${control} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea className={`${control} min-h-24 ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select className={`${control} ${className}`} {...props} />;
}
