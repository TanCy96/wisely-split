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
