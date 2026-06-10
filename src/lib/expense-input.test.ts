import { describe, expect, it } from "vitest";
import { parseExpenseForm } from "./expense-input";

const members = [
  { id: "11111111-1111-4111-8111-111111111111", displayName: "Ana" },
  { id: "22222222-2222-4222-8222-222222222222", displayName: "Ben" },
  { id: "33333333-3333-4333-8333-333333333333", displayName: "Cleo" },
];
const [ana, ben, cleo] = members;

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const base = {
  description: "Dinner",
  amount: "30.00",
  paid_by: ana.id,
  expense_date: "2026-06-10",
};

describe("parseExpenseForm — equal", () => {
  it("computes equal shares for the checked members", () => {
    const result = parseExpenseForm(
      form({
        ...base,
        split_method: "equal",
        [`participant_${ana.id}`]: "on",
        [`participant_${ben.id}`]: "on",
      }),
      members
    );
    expect(result).toEqual({
      ok: true,
      expense: {
        description: "Dinner",
        amountCents: 3000,
        paidBy: ana.id,
        expenseDate: "2026-06-10",
        splitMethod: "equal",
        shares: [
          { memberId: ana.id, shareCents: 1500, splitValue: null },
          { memberId: ben.id, shareCents: 1500, splitValue: null },
        ],
      },
    });
  });

  it("rejects when nobody is checked", () => {
    const result = parseExpenseForm(form({ ...base, split_method: "equal" }), members);
    expect(result).toEqual({
      ok: false,
      error: "Choose at least one person to split with.",
    });
  });
});

describe("parseExpenseForm — exact", () => {
  it("parses money values per member", () => {
    const result = parseExpenseForm(
      form({
        ...base,
        split_method: "exact",
        [`participant_${ana.id}`]: "on",
        [`participant_${cleo.id}`]: "on",
        [`value_${ana.id}`]: "10.00",
        [`value_${cleo.id}`]: "20.00",
      }),
      members
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.expense.shares).toEqual([
        { memberId: ana.id, shareCents: 1000, splitValue: 1000 },
        { memberId: cleo.id, shareCents: 2000, splitValue: 2000 },
      ]);
    }
  });

  it("surfaces engine errors when amounts do not sum to the total", () => {
    const result = parseExpenseForm(
      form({
        ...base,
        split_method: "exact",
        [`participant_${ana.id}`]: "on",
        [`participant_${ben.id}`]: "on",
        [`value_${ana.id}`]: "10.00",
        [`value_${ben.id}`]: "10.00",
      }),
      members
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/add up to the total/);
  });

  it("requires a value for every checked member", () => {
    const result = parseExpenseForm(
      form({
        ...base,
        split_method: "exact",
        [`participant_${ana.id}`]: "on",
        [`participant_${ben.id}`]: "on",
        [`value_${ana.id}`]: "30.00",
      }),
      members
    );
    expect(result).toEqual({ ok: false, error: "Enter a value for Ben." });
  });
});

describe("parseExpenseForm — percent and shares", () => {
  it("parses plain numbers for percent", () => {
    const result = parseExpenseForm(
      form({
        ...base,
        split_method: "percent",
        [`participant_${ana.id}`]: "on",
        [`participant_${ben.id}`]: "on",
        [`value_${ana.id}`]: "25",
        [`value_${ben.id}`]: "75",
      }),
      members
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.expense.shares).toEqual([
        { memberId: ana.id, shareCents: 750, splitValue: 25 },
        { memberId: ben.id, shareCents: 2250, splitValue: 75 },
      ]);
    }
  });

  it("parses weights for shares", () => {
    const result = parseExpenseForm(
      form({
        ...base,
        amount: "1.00",
        split_method: "shares",
        [`participant_${ana.id}`]: "on",
        [`participant_${ben.id}`]: "on",
        [`value_${ana.id}`]: "2",
        [`value_${ben.id}`]: "1",
      }),
      members
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.expense.shares.map((s) => s.shareCents)).toEqual([67, 33]);
    }
  });

  it("rejects garbage values", () => {
    const result = parseExpenseForm(
      form({
        ...base,
        split_method: "percent",
        [`participant_${ana.id}`]: "on",
        [`value_${ana.id}`]: "abc",
      }),
      members
    );
    expect(result).toEqual({ ok: false, error: "Invalid value for Ana." });
  });
});

describe("parseExpenseForm — field validation", () => {
  it("rejects a missing description", () => {
    const result = parseExpenseForm(
      form({ ...base, description: "  ", split_method: "equal", [`participant_${ana.id}`]: "on" }),
      members
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a zero or malformed amount", () => {
    for (const amount of ["0", "abc", "-5"]) {
      const result = parseExpenseForm(
        form({ ...base, amount, split_method: "equal", [`participant_${ana.id}`]: "on" }),
        members
      );
      expect(result).toEqual({ ok: false, error: "Enter a valid amount (e.g. 12.50)." });
    }
  });

  it("rejects a payer who is not a group member", () => {
    const result = parseExpenseForm(
      form({
        ...base,
        paid_by: "99999999-9999-4999-8999-999999999999",
        split_method: "equal",
        [`participant_${ana.id}`]: "on",
      }),
      members
    );
    expect(result).toEqual({ ok: false, error: "The payer must be a group member." });
  });

  it("rejects a malformed date", () => {
    const result = parseExpenseForm(
      form({ ...base, expense_date: "10/06/2026", split_method: "equal", [`participant_${ana.id}`]: "on" }),
      members
    );
    expect(result.ok).toBe(false);
  });
});
