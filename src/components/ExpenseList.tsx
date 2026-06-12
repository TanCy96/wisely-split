"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Card } from "@/components/ui";
import {
  ExpenseForm,
  type ExpenseFormInitial,
  type ExpenseFormMemberOption,
} from "@/components/ExpenseForm";

export type ExpenseListItem = {
  id: string;
  description: string;
  amountLabel: string; // preformatted money string
  meta: string; // "2026-06-12 · paid by X · settle-up · added by Y"
  initial: ExpenseFormInitial; // precomputed server-side
};

/**
 * Expense list + edit modal. The URL (?edit=<id>) is the source of truth;
 * opening uses history.replaceState so it's instant (Next syncs
 * useSearchParams without a server request). Plain rows when !canEdit
 * (anonymous visitor who hasn't picked an identity).
 */
export function ExpenseList({
  items,
  members,
  basePath,
  hiddenFields,
  updateAction,
  deleteAction,
  canEdit,
}: {
  items: ExpenseListItem[];
  members: ExpenseFormMemberOption[];
  basePath: string;
  hiddenFields: Record<string, string>;
  updateAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
  canEdit: boolean;
}) {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const error = searchParams.get("error") ?? undefined;
  const editing = canEdit && editId ? items.find((i) => i.id === editId) : undefined;

  const close = () => window.history.replaceState(null, "", basePath);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  const rowClass =
    "flex items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-sm";
  const rowBody = (item: ExpenseListItem) => (
    <>
      <span>
        <span className="font-semibold text-ink">{item.description}</span>
        <span className="ml-2 text-xs text-muted">{item.meta}</span>
      </span>
      <span className="font-semibold text-ink">{item.amountLabel}</span>
    </>
  );

  return (
    <>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            {canEdit ? (
              <a
                href={`${basePath}?edit=${item.id}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  window.history.replaceState(
                    null,
                    "",
                    `${basePath}?edit=${item.id}`
                  );
                }}
                className={
                  rowClass +
                  " hover:bg-black/5 dark:hover:bg-white/5" +
                  (item.id === editing?.id ? " bg-black/5 dark:bg-white/5" : "")
                }
              >
                {rowBody(item)}
              </a>
            ) : (
              <div className={rowClass}>{rowBody(item)}</div>
            )}
          </li>
        ))}
      </ul>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 sm:py-10"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className="w-full max-w-md"
            role="dialog"
            aria-modal="true"
            aria-label="Edit expense"
          >
            <Card title="Edit expense" className="shadow-xl">
              {error && <Alert tone="danger">{error}</Alert>}
              <ExpenseForm
                key={editing.id}
                action={updateAction}
                members={members}
                defaultDate={editing.initial.expenseDate}
                submitLabel="Save changes"
                hiddenFields={{ ...hiddenFields, expense_id: editing.id }}
                initial={editing.initial}
              />
              <div className="mt-3 flex items-center justify-between">
                <a
                  href={basePath}
                  onClick={(e) => {
                    e.preventDefault();
                    close();
                  }}
                  className="text-sm font-semibold text-muted hover:underline"
                >
                  Cancel
                </a>
                <form action={deleteAction}>
                  {Object.entries(hiddenFields).map(([name, value]) => (
                    <input key={name} type="hidden" name={name} value={value} />
                  ))}
                  <input type="hidden" name="expense_id" value={editing.id} />
                  <Button variant="danger" className="px-3 py-1.5 text-xs">
                    Delete expense
                  </Button>
                </form>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
