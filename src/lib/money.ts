// $999,999.99 — comfortably under the schema's integer-cents column range.
const MAX_CENTS = 99_999_999;

/**
 * Parse a user-typed money string ("12.50", "12", "12.5") into integer cents
 * using string math — no float rounding. Returns null for malformed input.
 * Zero is valid here; callers that need a positive amount check separately.
 */
export function parseMoneyToCents(input: string): number | null {
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const cents =
    Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
  return cents > MAX_CENTS ? null : cents;
}

/**
 * 1234 → "12.34", -50 → "-0.50". Input must be integer cents (every ledger
 * value is, by schema and engine contract) — non-integer input renders as
 * visible garbage on purpose rather than being silently rounded.
 */
export function centsToMoneyString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Display form: "SGD 25.00". */
export function formatMoney(cents: number, currencyCode: string): string {
  return `${currencyCode} ${centsToMoneyString(cents)}`;
}
