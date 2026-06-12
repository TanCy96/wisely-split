import Link from "next/link";
import type { ReactNode } from "react";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { ExpenseForm } from "@/components/ExpenseForm";
import { SettleUpForm } from "@/components/SettleUpForm";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageShell,
  StatRow,
} from "@/components/ui";
import { computeBalances } from "@/lib/balances";
import type { ExpenseRow, GroupRow, MemberRow } from "@/lib/db";
import { centsToMoneyString, formatMoney } from "@/lib/money";
import { simplifyDebts } from "@/lib/simplify";

export type GroupViewActions = {
  addExpense: (formData: FormData) => void | Promise<void>;
  updateExpense: (formData: FormData) => void | Promise<void>;
  deleteExpense: (formData: FormData) => void | Promise<void>;
  recordPayment: (formData: FormData) => void | Promise<void>;
  addMember: (formData: FormData) => void | Promise<void>;
};

/**
 * The whole group UI, shared by the member view (/groups/[id], RLS-scoped
 * actions keyed by group_id) and the anonymous invite view (/g/[token],
 * token-authorized actions). All authorization lives in the actions and the
 * hidden fields they read — this component only renders.
 */
export function GroupView({
  group,
  members,
  expenses,
  actions,
  hiddenFields,
  basePath,
  editingId,
  error,
  inviteUrl,
  headerRight,
  topCards,
}: {
  group: GroupRow;
  members: MemberRow[];
  expenses: ExpenseRow[];
  actions: GroupViewActions;
  hiddenFields: Record<string, string>;
  basePath: string;
  editingId?: string;
  error?: string;
  inviteUrl: string;
  headerRight?: ReactNode;
  topCards?: ReactNode;
}) {
  const ledger = expenses.map((e) => ({
    paidByMemberId: e.paid_by,
    amountCents: e.amount_cents,
    shares: e.expense_shares.map((s) => ({
      memberId: s.member_id,
      shareCents: s.share_cents,
    })),
  }));
  const balances = computeBalances(members.map((m) => m.id), ledger);
  const transfers = simplifyDebts(balances);
  // Settlements are money movement, not spending.
  const totalSpentCents = expenses
    .filter((e) => !e.is_settlement)
    .reduce((acc, e) => acc + e.amount_cents, 0);
  const nameOf = new Map(members.map((m) => [m.id, m.display_name]));
  const today = new Date().toISOString().slice(0, 10);
  const memberOptions = members.map((m) => ({
    id: m.id,
    displayName: m.display_name,
  }));

  const editing = editingId
    ? expenses.find((e) => e.id === editingId)
    : undefined;
  let editingInitial;
  if (editing) {
    const included: Record<string, boolean> = {};
    const values: Record<string, string> = {};
    for (const share of editing.expense_shares) {
      included[share.member_id] = true;
      if (editing.split_method === "exact") {
        values[share.member_id] = centsToMoneyString(share.share_cents);
      } else if (share.split_value !== null) {
        values[share.member_id] = String(share.split_value);
      }
    }
    editingInitial = {
      description: editing.description,
      amount: centsToMoneyString(editing.amount_cents),
      paidBy: editing.paid_by,
      expenseDate: editing.expense_date,
      splitMethod: editing.split_method,
      included,
      values,
    };
  }

  const hiddenInputs = Object.entries(hiddenFields).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));

  return (
    <PageShell
      headerRight={headerRight}
      aside={
        <>
          {editing ? (
            <Card title="Edit expense" highlight>
              <ExpenseForm
                key={editing.id}
                action={actions.updateExpense}
                members={memberOptions}
                defaultDate={editing.expense_date}
                submitLabel="Save changes"
                hiddenFields={{ ...hiddenFields, expense_id: editing.id }}
                initial={editingInitial}
              />
              <div className="mt-3 flex items-center justify-between">
                <Link
                  href={basePath}
                  className="text-sm font-semibold text-muted hover:underline"
                >
                  Cancel
                </Link>
                <form action={actions.deleteExpense}>
                  {hiddenInputs}
                  <input type="hidden" name="expense_id" value={editing.id} />
                  <Button variant="danger" className="px-3 py-1.5 text-xs">
                    Delete expense
                  </Button>
                </form>
              </div>
            </Card>
          ) : (
            <Card title="Add expense">
              <ExpenseForm
                key="new"
                action={actions.addExpense}
                members={memberOptions}
                defaultDate={today}
                submitLabel="Add expense"
                hiddenFields={hiddenFields}
              />
            </Card>
          )}
          <Card title="Members">
            <ul className="mb-3 flex flex-col gap-1 text-sm">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-ink">{m.display_name}</span>
                </li>
              ))}
            </ul>
            <form action={actions.addMember} className="flex items-end gap-2">
              {hiddenInputs}
              <Field label="Add a name">
                <Input name="display_name" placeholder="Alex" required maxLength={80} />
              </Field>
              <Button variant="secondary" className="shrink-0">
                Add
              </Button>
            </form>
          </Card>
        </>
      }
    >
      {topCards}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-heading">{group.name}</h1>
        <CopyLinkButton url={inviteUrl} label="Copy invite link" />
      </div>
      {error && <Alert tone="danger">{error}</Alert>}

      <Card title="Balances">
        <div className="flex items-baseline justify-between gap-3 pb-2">
          <span className="text-sm font-semibold text-heading">Total spent</span>
          <span className="text-lg font-extrabold text-heading">
            {formatMoney(totalSpentCents, group.currency_code)}
          </span>
        </div>
        <div className="mb-1 border-t border-border" />
        {members.map((m) => {
          const net = balances.get(m.id) ?? 0;
          return (
            <StatRow
              key={m.id}
              label={m.display_name}
              value={
                net === 0 ? (
                  <span className="font-medium text-muted">settled up</span>
                ) : net > 0 ? (
                  <span className="text-success-ink">
                    is owed {formatMoney(net, group.currency_code)}
                  </span>
                ) : (
                  <span className="text-danger">
                    owes {formatMoney(-net, group.currency_code)}
                  </span>
                )
              }
            />
          );
        })}
      </Card>

      <Card title="Settle up">
        {transfers.length === 0 ? (
          <p className="text-sm text-muted">All settled up 🎉</p>
        ) : (
          <ul className="mb-3 flex flex-col gap-1 text-sm">
            {transfers.map((t, i) => (
              <li key={i}>
                <span className="font-semibold">{nameOf.get(t.fromMemberId)}</span>{" "}
                pays{" "}
                <span className="font-semibold">{nameOf.get(t.toMemberId)}</span>{" "}
                {formatMoney(t.amountCents, group.currency_code)}
              </li>
            ))}
          </ul>
        )}
        <SettleUpForm
          action={actions.recordPayment}
          members={memberOptions}
          hiddenFields={hiddenFields}
        />
      </Card>

      <Card title="Expenses">
        {expenses.length === 0 ? (
          <p className="text-sm text-muted">No expenses yet.</p>
        ) : (
          <ul className="flex flex-col">
            {expenses.map((e) => (
              <li key={e.id}>
                <Link
                  href={`${basePath}?edit=${e.id}`}
                  className={
                    "flex items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5" +
                    (e.id === editing?.id ? " bg-black/5 dark:bg-white/5" : "")
                  }
                >
                  <span>
                    <span className="font-semibold text-ink">{e.description}</span>
                    <span className="ml-2 text-xs text-muted">
                      {e.expense_date} · paid by {nameOf.get(e.paid_by) ?? "?"}
                      {e.is_settlement ? " · settle-up" : ""}
                    </span>
                  </span>
                  <span className="font-semibold text-ink">
                    {formatMoney(e.amount_cents, group.currency_code)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
