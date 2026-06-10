import { describe, expect, it } from "vitest";
import { computeBalances, type LedgerExpense } from "./balances";

describe("computeBalances", () => {
  it("returns zero for every member when there are no expenses", () => {
    const balances = computeBalances(["a", "b"], []);
    expect(balances.get("a")).toBe(0);
    expect(balances.get("b")).toBe(0);
  });

  it("credits the payer and debits the sharers", () => {
    // a pays 3000, split equally three ways
    const expenses: LedgerExpense[] = [
      {
        paidByMemberId: "a",
        amountCents: 3000,
        shares: [
          { memberId: "a", shareCents: 1000 },
          { memberId: "b", shareCents: 1000 },
          { memberId: "c", shareCents: 1000 },
        ],
      },
    ];
    const balances = computeBalances(["a", "b", "c"], expenses);
    expect(balances.get("a")).toBe(2000);
    expect(balances.get("b")).toBe(-1000);
    expect(balances.get("c")).toBe(-1000);
  });

  it("treats a settlement like any other expense", () => {
    const expenses: LedgerExpense[] = [
      {
        paidByMemberId: "a",
        amountCents: 2000,
        shares: [
          { memberId: "a", shareCents: 1000 },
          { memberId: "b", shareCents: 1000 },
        ],
      },
      // b settles up: pays a 1000, single share for a
      {
        paidByMemberId: "b",
        amountCents: 1000,
        shares: [{ memberId: "a", shareCents: 1000 }],
      },
    ];
    const balances = computeBalances(["a", "b"], expenses);
    expect(balances.get("a")).toBe(0);
    expect(balances.get("b")).toBe(0);
  });

  it("nets always sum to zero", () => {
    const expenses: LedgerExpense[] = [
      {
        paidByMemberId: "a",
        amountCents: 101,
        shares: [
          { memberId: "a", shareCents: 34 },
          { memberId: "b", shareCents: 34 },
          { memberId: "c", shareCents: 33 },
        ],
      },
      {
        paidByMemberId: "b",
        amountCents: 999,
        shares: [
          { memberId: "b", shareCents: 500 },
          { memberId: "c", shareCents: 499 },
        ],
      },
      {
        paidByMemberId: "c",
        amountCents: 7,
        shares: [{ memberId: "a", shareCents: 7 }],
      },
    ];
    const balances = computeBalances(["a", "b", "c"], expenses);
    const total = [...balances.values()].reduce((acc, v) => acc + v, 0);
    expect(total).toBe(0);
  });
});
