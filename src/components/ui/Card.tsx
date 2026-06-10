import type { ReactNode } from "react";

export function Card({
  title,
  children,
  className = "",
  highlight = false,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  highlight?: boolean;
}) {
  return (
    <section
      className={
        "rounded-2xl bg-card p-4 sm:p-5 shadow-sm " +
        (highlight
          ? "border-2 border-primary"
          : "border border-border") +
        " " +
        className
      }
    >
      {title != null && (
        <h2 className="mb-3 text-base font-extrabold text-heading">{title}</h2>
      )}
      {children}
    </section>
  );
}
