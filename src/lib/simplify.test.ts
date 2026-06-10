import { describe, expect, it } from "vitest";
import { computeBalances, type LedgerExpense } from "./balances";
import { simplifyDebts } from "./simplify";

describe("simplifyDebts", () => {
  it("returns no transfers when everyone is settled", () => {
    expect(simplifyDebts(new Map([["a", 0], ["b", 0]]))).toEqual([]);
    expect(simplifyDebts(new Map())).toEqual([]);
  });

  it("suggests a single transfer for a single debt", () => {
    const transfers = simplifyDebts(new Map([["a", 500], ["b", -500]]));
    expect(transfers).toEqual([
      { fromMemberId: "b", toMemberId: "a", amountCents: 500 },
    ]);
  });

  it("matches the largest debtor against the largest creditor", () => {
    const transfers = simplifyDebts(
      new Map([["a", 100], ["b", 50], ["c", -150]])
    );
    expect(transfers).toEqual([
      { fromMemberId: "c", toMemberId: "a", amountCents: 100 },
      { fromMemberId: "c", toMemberId: "b", amountCents: 50 },
    ]);
  });

  it("breaks amount ties deterministically by member id", () => {
    const transfers = simplifyDebts(
      new Map([["b", 50], ["a", 50], ["d", -50], ["c", -50]])
    );
    expect(transfers).toEqual([
      { fromMemberId: "c", toMemberId: "a", amountCents: 50 },
      { fromMemberId: "d", toMemberId: "b", amountCents: 50 },
    ]);
  });

  it("zeroes every balance when its suggestions are recorded as settlements", () => {
    const members = ["a", "b", "c", "d"];
    const expenses: LedgerExpense[] = [
      {
        paidByMemberId: "a",
        amountCents: 10001,
        shares: [
          { memberId: "a", shareCents: 2501 },
          { memberId: "b", shareCents: 2500 },
          { memberId: "c", shareCents: 2500 },
          { memberId: "d", shareCents: 2500 },
        ],
      },
      {
        paidByMemberId: "b",
        amountCents: 333,
        shares: [
          { memberId: "c", shareCents: 167 },
          { memberId: "d", shareCents: 166 },
        ],
      },
    ];
    const balances = computeBalances(members, expenses);
    const transfers = simplifyDebts(balances);

    // Record each suggestion as a settlement expense and recompute.
    const settlements: LedgerExpense[] = transfers.map((t) => ({
      paidByMemberId: t.fromMemberId,
      amountCents: t.amountCents,
      shares: [{ memberId: t.toMemberId, shareCents: t.amountCents }],
    }));
    const after = computeBalances(members, [...expenses, ...settlements]);
    for (const id of members) {
      expect(after.get(id)).toBe(0);
    }
  });

  it("never suggests more transfers than members minus one", () => {
    const balances = new Map([
      ["a", 300],
      ["b", -100],
      ["c", -100],
      ["d", -100],
    ]);
    expect(simplifyDebts(balances).length).toBeLessThanOrEqual(3);
  });
});
