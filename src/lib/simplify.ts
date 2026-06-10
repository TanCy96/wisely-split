export type SuggestedTransfer = {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
};

type Party = { id: string; cents: number };

/**
 * Greedy minimum-transfer suggestions: repeatedly settle the largest debtor
 * against the largest creditor (ties broken by member id, so output is
 * deterministic). Display-layer only — the ledger remains the source of truth.
 */
export function simplifyDebts(
  balances: Map<string, number>
): SuggestedTransfer[] {
  const debtors: Party[] = [];
  const creditors: Party[] = [];
  for (const [id, net] of balances) {
    if (net < 0) debtors.push({ id, cents: -net });
    if (net > 0) creditors.push({ id, cents: net });
  }

  const byAmountDescThenId = (a: Party, b: Party) =>
    b.cents - a.cents || a.id.localeCompare(b.id);

  const transfers: SuggestedTransfer[] = [];
  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(byAmountDescThenId);
    creditors.sort(byAmountDescThenId);
    const debtor = debtors[0];
    const creditor = creditors[0];
    const amount = Math.min(debtor.cents, creditor.cents);
    transfers.push({
      fromMemberId: debtor.id,
      toMemberId: creditor.id,
      amountCents: amount,
    });
    debtor.cents -= amount;
    creditor.cents -= amount;
    if (debtor.cents === 0) debtors.shift();
    if (creditor.cents === 0) creditors.shift();
  }
  return transfers;
}
