import { describe, expect, it } from "vitest";
import { computeShares, SplitError } from "./splits";

describe("computeShares — validation", () => {
  it("rejects a zero amount", () => {
    expect(() =>
      computeShares("equal", 0, [{ memberId: "a", value: null }])
    ).toThrow(SplitError);
  });

  it("rejects a non-integer amount", () => {
    expect(() =>
      computeShares("equal", 10.5, [{ memberId: "a", value: null }])
    ).toThrow(SplitError);
  });

  it("rejects an empty participant list", () => {
    expect(() => computeShares("equal", 100, [])).toThrow(SplitError);
  });

  it("rejects duplicate members", () => {
    expect(() =>
      computeShares("equal", 100, [
        { memberId: "a", value: null },
        { memberId: "a", value: null },
      ])
    ).toThrow(SplitError);
  });
});

describe("computeShares — equal", () => {
  it("splits evenly when divisible", () => {
    const result = computeShares("equal", 3000, [
      { memberId: "a", value: null },
      { memberId: "b", value: null },
      { memberId: "c", value: null },
    ]);
    expect(result).toEqual([
      { memberId: "a", shareCents: 1000, splitValue: null },
      { memberId: "b", shareCents: 1000, splitValue: null },
      { memberId: "c", shareCents: 1000, splitValue: null },
    ]);
  });

  it("gives remainder cents to the first members by position order", () => {
    const result = computeShares("equal", 100, [
      { memberId: "a", value: null },
      { memberId: "b", value: null },
      { memberId: "c", value: null },
    ]);
    expect(result.map((s) => s.shareCents)).toEqual([34, 33, 33]);
  });

  it("handles a 1-cent total", () => {
    const result = computeShares("equal", 1, [
      { memberId: "a", value: null },
      { memberId: "b", value: null },
    ]);
    expect(result.map((s) => s.shareCents)).toEqual([1, 0]);
  });

  it("gives a single member everything", () => {
    const result = computeShares("equal", 999, [{ memberId: "solo", value: null }]);
    expect(result).toEqual([{ memberId: "solo", shareCents: 999, splitValue: null }]);
  });
});

describe("computeShares — exact", () => {
  it("uses the entered cents and echoes splitValue", () => {
    const result = computeShares("exact", 5000, [
      { memberId: "a", value: 1250 },
      { memberId: "b", value: 3750 },
    ]);
    expect(result).toEqual([
      { memberId: "a", shareCents: 1250, splitValue: 1250 },
      { memberId: "b", shareCents: 3750, splitValue: 3750 },
    ]);
  });

  it("allows a zero share", () => {
    const result = computeShares("exact", 100, [
      { memberId: "a", value: 100 },
      { memberId: "b", value: 0 },
    ]);
    expect(result.map((s) => s.shareCents)).toEqual([100, 0]);
  });

  it("rejects amounts that do not sum to the total", () => {
    expect(() =>
      computeShares("exact", 5000, [
        { memberId: "a", value: 1250 },
        { memberId: "b", value: 3000 },
      ])
    ).toThrow(SplitError);
  });

  it("rejects missing, negative, or fractional cents", () => {
    expect(() =>
      computeShares("exact", 100, [{ memberId: "a", value: null }])
    ).toThrow(SplitError);
    expect(() =>
      computeShares("exact", 100, [
        { memberId: "a", value: 150 },
        { memberId: "b", value: -50 },
      ])
    ).toThrow(SplitError);
    expect(() =>
      computeShares("exact", 100, [
        { memberId: "a", value: 50.5 },
        { memberId: "b", value: 49.5 },
      ])
    ).toThrow(SplitError);
  });
});

describe("computeShares — percent", () => {
  it("converts percentages to cents", () => {
    const result = computeShares("percent", 8000, [
      { memberId: "a", value: 25 },
      { memberId: "b", value: 75 },
    ]);
    expect(result).toEqual([
      { memberId: "a", shareCents: 2000, splitValue: 25 },
      { memberId: "b", shareCents: 6000, splitValue: 75 },
    ]);
  });

  it("distributes the rounding remainder to the first members by position order", () => {
    const result = computeShares("percent", 100, [
      { memberId: "a", value: 33.33 },
      { memberId: "b", value: 33.33 },
      { memberId: "c", value: 33.34 },
    ]);
    expect(result.map((s) => s.shareCents)).toEqual([34, 33, 33]);
    expect(result.reduce((acc, s) => acc + s.shareCents, 0)).toBe(100);
  });

  it("rejects percentages that do not sum to 100", () => {
    expect(() =>
      computeShares("percent", 100, [
        { memberId: "a", value: 50 },
        { memberId: "b", value: 49 },
      ])
    ).toThrow(SplitError);
  });

  it("rejects missing or negative percentages", () => {
    expect(() =>
      computeShares("percent", 100, [
        { memberId: "a", value: null },
        { memberId: "b", value: 100 },
      ])
    ).toThrow(SplitError);
    expect(() =>
      computeShares("percent", 100, [
        { memberId: "a", value: 150 },
        { memberId: "b", value: -50 },
      ])
    ).toThrow(SplitError);
  });
});

describe("computeShares — shares", () => {
  it("splits proportionally by weight with remainder to the first members", () => {
    const result = computeShares("shares", 100, [
      { memberId: "a", value: 2 },
      { memberId: "b", value: 1 },
    ]);
    // 100 × 2/3 = 66.67 → 66; 100 × 1/3 = 33.33 → 33; remainder 1 → first member
    expect(result).toEqual([
      { memberId: "a", shareCents: 67, splitValue: 2 },
      { memberId: "b", shareCents: 33, splitValue: 1 },
    ]);
  });

  it("allows a zero weight (member owes nothing)", () => {
    const result = computeShares("shares", 100, [
      { memberId: "a", value: 1 },
      { memberId: "b", value: 0 },
    ]);
    expect(result.map((s) => s.shareCents)).toEqual([100, 0]);
  });

  it("rejects all-zero weights", () => {
    expect(() =>
      computeShares("shares", 100, [
        { memberId: "a", value: 0 },
        { memberId: "b", value: 0 },
      ])
    ).toThrow(SplitError);
  });
});

describe("computeShares — sum invariant", () => {
  it("shares always sum exactly to the amount", () => {
    const members = (n: number) =>
      Array.from({ length: n }, (_, i) => `m${i + 1}`);
    for (let amount = 1; amount <= 250; amount++) {
      for (let n = 1; n <= 5; n++) {
        const equal = computeShares(
          "equal",
          amount,
          members(n).map((id) => ({ memberId: id, value: null }))
        );
        expect(equal.reduce((acc, s) => acc + s.shareCents, 0)).toBe(amount);

        const weighted = computeShares(
          "shares",
          amount,
          members(n).map((id, i) => ({ memberId: id, value: i + 1 }))
        );
        expect(weighted.reduce((acc, s) => acc + s.shareCents, 0)).toBe(amount);
      }
    }
  });
});
