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
      throw new SplitError("not implemented");
    case "percent":
      throw new SplitError("not implemented");
    case "shares":
      throw new SplitError("not implemented");
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
