import { describe, expect, it } from "vitest";
import { centsToMoneyString, formatMoney, parseMoneyToCents } from "./money";

describe("parseMoneyToCents", () => {
  it("parses dollars and cents", () => {
    expect(parseMoneyToCents("12.34")).toBe(1234);
    expect(parseMoneyToCents("0.01")).toBe(1);
    expect(parseMoneyToCents("999999.99")).toBe(99999999);
  });

  it("parses whole dollars and single decimals", () => {
    expect(parseMoneyToCents("12")).toBe(1200);
    expect(parseMoneyToCents("12.3")).toBe(1230);
  });

  it("accepts zero and trims whitespace", () => {
    expect(parseMoneyToCents("0")).toBe(0);
    expect(parseMoneyToCents(" 5 ")).toBe(500);
  });

  it("rejects malformed input", () => {
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("-5")).toBeNull();
    expect(parseMoneyToCents("12.345")).toBeNull();
    expect(parseMoneyToCents("1,000")).toBeNull();
    expect(parseMoneyToCents("12.")).toBeNull();
    expect(parseMoneyToCents("1000000")).toBeNull(); // over the cap
  });
});

describe("centsToMoneyString", () => {
  it("renders cents as a money input string", () => {
    expect(centsToMoneyString(1234)).toBe("12.34");
    expect(centsToMoneyString(5)).toBe("0.05");
    expect(centsToMoneyString(0)).toBe("0.00");
    expect(centsToMoneyString(-50)).toBe("-0.50");
  });
});

describe("formatMoney", () => {
  it("prefixes the currency code", () => {
    expect(formatMoney(2500, "SGD")).toBe("SGD 25.00");
    expect(formatMoney(-1, "SGD")).toBe("SGD -0.01");
  });
});
