import type { ReactNode } from "react";

export function SectionHeading({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
      <h2 className="text-base font-extrabold text-heading">{children}</h2>
      {trailing != null && (
        <span className="text-sm font-bold text-primary">{trailing}</span>
      )}
    </div>
  );
}
