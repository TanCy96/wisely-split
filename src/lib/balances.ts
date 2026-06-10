export type LedgerShare = {
  memberId: string;
  shareCents: number;
};

export type LedgerExpense = {
  paidByMemberId: string;
  amountCents: number;
  shares: LedgerShare[];
};

/**
 * Net cents per member across the whole ledger: positive = the group owes
 * them, negative = they owe the group. Settlements are ordinary expenses.
 * Invariant: values always sum to zero when every expense's shares sum to its
 * amount.
 */
export function computeBalances(
  memberIds: string[],
  expenses: LedgerExpense[]
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const id of memberIds) {
    balances.set(id, 0);
  }
  for (const expense of expenses) {
    add(balances, expense.paidByMemberId, expense.amountCents);
    for (const share of expense.shares) {
      add(balances, share.memberId, -share.shareCents);
    }
  }
  return balances;
}

function add(balances: Map<string, number>, memberId: string, delta: number) {
  balances.set(memberId, (balances.get(memberId) ?? 0) + delta);
}
