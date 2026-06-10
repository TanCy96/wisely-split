"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import type { SplitMethod } from "@/lib/splits";

export type ExpenseFormMemberOption = { id: string; displayName: string };

export type ExpenseFormInitial = {
  description: string;
  amount: string;
  paidBy: string;
  expenseDate: string;
  splitMethod: SplitMethod;
  included: Record<string, boolean>;
  values: Record<string, string>;
};

const VALUE_PLACEHOLDER: Record<Exclude<SplitMethod, "equal">, string> = {
  exact: "0.00",
  percent: "%",
  shares: "shares",
};

/**
 * Shared add/edit expense form. Field names form a contract with
 * parseExpenseForm in src/lib/expense-input.ts — change them together.
 */
export function ExpenseForm({
  action,
  members,
  defaultDate,
  submitLabel,
  hiddenFields,
  initial,
}: {
  action: (formData: FormData) => void | Promise<void>;
  members: ExpenseFormMemberOption[];
  defaultDate: string;
  submitLabel: string;
  hiddenFields: Record<string, string>;
  initial?: ExpenseFormInitial;
}) {
  const [method, setMethod] = useState<SplitMethod>(
    initial?.splitMethod ?? "equal"
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Field label="Description">
        <Input
          name="description"
          placeholder="Dinner"
          required
          maxLength={200}
          defaultValue={initial?.description}
        />
      </Field>
      <Field label="Amount">
        <Input
          name="amount"
          inputMode="decimal"
          placeholder="12.50"
          required
          defaultValue={initial?.amount}
        />
      </Field>
      <Field label="Paid by">
        <Select name="paid_by" defaultValue={initial?.paidBy}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Date">
        <Input
          name="expense_date"
          type="date"
          required
          defaultValue={initial?.expenseDate ?? defaultDate}
        />
      </Field>
      <Field label="Split">
        <Select
          name="split_method"
          value={method}
          onChange={(e) => setMethod(e.target.value as SplitMethod)}
        >
          <option value="equal">Equally</option>
          <option value="exact">Exact amounts</option>
          <option value="percent">Percentages</option>
          <option value="shares">Shares</option>
        </Select>
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-ink">
          Split between
        </legend>
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3">
            <label className="flex flex-1 items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name={`participant_${m.id}`}
                defaultChecked={initial ? Boolean(initial.included[m.id]) : true}
              />
              {m.displayName}
            </label>
            {method !== "equal" && (
              <Input
                name={`value_${m.id}`}
                inputMode="decimal"
                className="w-28"
                placeholder={VALUE_PLACEHOLDER[method]}
                defaultValue={initial?.values[m.id] ?? ""}
                aria-label={`Value for ${m.displayName}`}
              />
            )}
          </div>
        ))}
      </fieldset>
      <Button>{submitLabel}</Button>
    </form>
  );
}
