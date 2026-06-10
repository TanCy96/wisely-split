import type { ReactNode } from "react";

type Tone = "success" | "danger";

const tones: Record<Tone, string> = {
  success: "bg-success-bg text-success-ink",
  danger: "bg-danger-bg text-danger-ink",
};

export function Alert({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div
      role="status"
      className={"rounded-xl px-3 py-2.5 text-sm font-medium " + tones[tone]}
    >
      {children}
    </div>
  );
}
