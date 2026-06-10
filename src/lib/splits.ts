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
      throw new SplitError("not implemented");
    case "shares":
      throw new SplitError("not implemented");
  }
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
