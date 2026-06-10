import type { ReactNode } from "react";

type Tone = "confirmed" | "draft" | "cancelled";

const tones: Record<Tone, string> = {
  confirmed: "bg-primary text-on-primary",
  draft: "bg-accent-bg text-accent-ink",
  cancelled: "bg-danger-bg text-danger-ink",
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide " +
        tones[tone]
      }
    >
      {children}
    </span>
  );
}
