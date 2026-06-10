export type SplitMethod = "equal" | "exact" | "percent" | "shares";

export type SplitParticipant = {
  memberId: string;
  /** Raw input: null for "equal"; cents for "exact"; percentage for "percent"; weight for "shares". */
  value: number | null;
};

export type ComputedShare = {
  memberId: string;
  shareCents: number;
  /** Echo of the raw input, persisted to expense_shares.split_value for edit-form redisplay. */
  splitValue: number | null;
};

export class SplitError extends Error {}

export function computeShares(
  method: SplitMethod,
  amountCents: number,
  participants: SplitParticipant[]
): ComputedShare[] {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new SplitError("Amount must be a positive whole number of cents.");
  }
  if (participants.length === 0) {
    throw new SplitError("At least one participant is required.");
  }
  const ids = new Set(participants.map((p) => p.memberId));
  if (ids.size !== participants.length) {
    throw new SplitError("Participants must be unique.");
  }

  switch (method) {
    case "equal":
      return splitEqual(amountCents, participants);
    case "exact":
      return splitExact(amountCents, participants);
    case "percent":
      return splitProportional(amountCents, participants, "percent");
    case "shares":
      return splitProportional(amountCents, participants, "shares");
  }
}

function splitProportional(
  amountCents: number,
  participants: SplitParticipant[],
  kind: "percent" | "shares"
): ComputedShare[] {
  for (const p of participants) {
    if (p.value === null || !Number.isFinite(p.value) || p.value < 0) {
      throw new SplitError(
        kind === "percent"
          ? "Each percentage must be a number (0 or more)."
          : "Each share weight must be a number (0 or more)."
      );
    }
  }
  const total = participants.reduce((acc, p) => acc + (p.value as number), 0);
  if (kind === "percent" && Math.abs(total - 100) > 1e-6) {
    throw new SplitError(`Percentages must add up to 100 (got ${total}).`);
  }
  if (kind === "shares" && total <= 0) {
    throw new SplitError("Share weights must add up to more than zero.");
  }

  const floors = participants.map((p) =>
    Math.floor((amountCents * (p.value as number)) / total)
  );
  let remainder = amountCents - floors.reduce((acc, f) => acc + f, 0);
  const result = participants.map((p, i) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return {
      memberId: p.memberId,
      shareCents: floors[i] + extra,
      splitValue: p.value,
    };
  });
  assertSharesSumToAmount(result, amountCents);
  return result;
}

function splitExact(
  amountCents: number,
  participants: SplitParticipant[]
): ComputedShare[] {
  for (const p of participants) {
    if (p.value === null || !Number.isInteger(p.value) || p.value < 0) {
      throw new SplitError(
        "Each exact amount must be a whole number of cents (0 or more)."
      );
    }
  }
  const sum = participants.reduce((acc, p) => acc + (p.value as number), 0);
  if (sum !== amountCents) {
    throw new SplitError(
      `Exact amounts must add up to the total (got ${sum}, expected ${amountCents}).`
    );
  }
  return participants.map((p) => ({
    memberId: p.memberId,
    shareCents: p.value as number,
    splitValue: p.value,
  }));
}

function assertSharesSumToAmount(
  shares: ComputedShare[],
  amountCents: number
) {
  const sum = shares.reduce((acc, s) => acc + s.shareCents, 0);
  if (sum !== amountCents) {
    throw new SplitError(
      "Could not compute a valid split for these values."
    );
  }
}

function splitEqual(
  amountCents: number,
  participants: SplitParticipant[]
): ComputedShare[] {
  const n = participants.length;
  const base = Math.floor(amountCents / n);
  const remainder = amountCents % n;
  return participants.map((p, i) => ({
    memberId: p.memberId,
    shareCents: base + (i < remainder ? 1 : 0),
    splitValue: null,
  }));
}
