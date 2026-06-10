import Link from "next/link";
import type { ReactNode } from "react";

function Header({ headerRight }: { headerRight?: ReactNode }) {
  return (
    <header className="border-b border-border bg-card/60 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-extrabold text-heading">
          💸 wisely-split
        </Link>
        {headerRight}
      </div>
    </header>
  );
}

/**
 * Page frame.
 * - `aside` omitted  -> single centered column (good for forms, auth).
 * - `aside` provided -> two columns on lg+: `main` (left) and a sticky
 *   `aside` (right); stacks to one column on phone, aside below main.
 * - `narrow` centers a slim column (auth pages).
 */
export function PageShell({
  children,
  aside,
  headerRight,
  narrow = false,
}: {
  children: ReactNode;
  aside?: ReactNode;
  headerRight?: ReactNode;
  narrow?: boolean;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <Header headerRight={headerRight} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        {aside ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
            <div className="flex flex-col gap-5">{children}</div>
            <aside className="flex flex-col gap-5 lg:sticky lg:top-6">
              {aside}
            </aside>
          </div>
        ) : (
          <div
            className={
              "mx-auto flex flex-col gap-5 " + (narrow ? "max-w-sm" : "max-w-xl")
            }
          >
            {children}
          </div>
        )}
      </main>
    </div>
  );
}
