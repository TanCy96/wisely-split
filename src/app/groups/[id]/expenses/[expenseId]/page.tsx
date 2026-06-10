import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { deleteExpenseAction, updateExpenseAction } from "@/app/group-actions";
import { AuthNav } from "@/components/AuthNav";
import { ExpenseForm } from "@/components/ExpenseForm";
import { Alert, Button, Card, PageShell } from "@/components/ui";
import { getExpense, getGroup, listMembers } from "@/lib/db";
import { centsToMoneyString } from "@/lib/money";
import { currentUserId } from "@/lib/supabase-auth";

export default async function EditExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; expenseId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, expenseId } = await params;
  const { error } = await searchParams;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(expenseId).success) {
    notFound();
  }
  const userId = await currentUserId();
  if (!userId) {
    redirect(
      `/login?next=${encodeURIComponent(`/groups/${id}/expenses/${expenseId}`)}`
    );
  }

  const group = await getGroup(id);
  if (!group) notFound();
  const expense = await getExpense(expenseId);
  if (!expense || expense.group_id !== id) notFound();
  const members = await listMembers(id);

  const included: Record<string, boolean> = {};
  const values: Record<string, string> = {};
  for (const share of expense.expense_shares) {
    included[share.member_id] = true;
    if (expense.split_method === "exact") {
      values[share.member_id] = centsToMoneyString(share.share_cents);
    } else if (share.split_value !== null) {
      values[share.member_id] = String(share.split_value);
    }
  }

  return (
    <PageShell narrow headerRight={<AuthNav />}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-heading">Edit expense</h1>
        <Link
          href={`/groups/${id}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Back to {group.name}
        </Link>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Card>
        <ExpenseForm
          action={updateExpenseAction}
          members={members.map((m) => ({ id: m.id, displayName: m.display_name }))}
          defaultDate={expense.expense_date}
          submitLabel="Save changes"
          hiddenFields={{ group_id: id, expense_id: expenseId }}
          initial={{
            description: expense.description,
            amount: centsToMoneyString(expense.amount_cents),
            paidBy: expense.paid_by,
            expenseDate: expense.expense_date,
            splitMethod: expense.split_method,
            included,
            values,
          }}
        />
      </Card>
      <Card title="Danger zone">
        <form action={deleteExpenseAction}>
          <input type="hidden" name="group_id" value={id} />
          <input type="hidden" name="expense_id" value={expenseId} />
          <Button variant="danger">Delete expense</Button>
        </form>
      </Card>
    </PageShell>
  );
}
