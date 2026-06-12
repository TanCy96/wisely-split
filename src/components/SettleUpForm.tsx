"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";

type Member = { id: string; displayName: string };

/** Record-payment form; the To list excludes whoever is selected as From. */
export function SettleUpForm({
  action,
  members,
  hiddenFields,
}: {
  action: (formData: FormData) => void | Promise<void>;
  members: Member[];
  hiddenFields: Record<string, string>;
}) {
  const [from, setFrom] = useState(members[0]?.id ?? "");
  const toOptions = members.filter((m) => m.id !== from);

  if (members.length < 2) {
    return (
      <p className="text-sm text-muted">
        Add another member to record payments.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Field label="From">
        <Select
          name="from_member"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="To">
        {/* key={from} remounts so the default stays valid when From changes */}
        <Select name="to_member" key={from} defaultValue={toOptions[0]?.id}>
          {toOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount">
        <Input
          name="amount"
          inputMode="decimal"
          placeholder="10.00"
          required
          className="w-28"
        />
      </Field>
      <Button variant="secondary" className="shrink-0">
        Record payment
      </Button>
    </form>
  );
}
