"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  addMemberViaToken,
  createExpenseViaToken,
  deleteExpenseViaToken,
  getGroupByInviteToken,
  updateExpenseViaToken,
} from "@/lib/db";
import { parseExpenseForm } from "@/lib/expense-input";
import { parseMoneyToCents } from "@/lib/money";
import { currentUserId } from "@/lib/supabase-auth";

const fail = (path: string, message: string) =>
  `${path}?error=${encodeURIComponent(message)}`;

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
const nameSchema = z.string().trim().min(1).max(80);

/** Validates the token + loads members, or redirects away. */
async function requireInvite(formData: FormData) {
  const token = tokenSchema.safeParse(formData.get("token"));
  if (!token.success) redirect("/");
  const invite = await getGroupByInviteToken(token.data);
  if (!invite) redirect("/");
  return { token: token.data, invite, path: `/g/${token.data}` };
}

export async function addMemberViaTokenAction(formData: FormData) {
  const { token, path } = await requireInvite(formData);
  const name = nameSchema.safeParse(formData.get("display_name"));
  if (!name.success) redirect(fail(path, "Member name is required."));
  const result = await addMemberViaToken(token, name.data);
  if ("error" in result) redirect(fail(path, result.error));
  revalidatePath(path);
  redirect(path);
}

export async function addExpenseViaTokenAction(formData: FormData) {
  const { token, invite, path } = await requireInvite(formData);
  const result = parseExpenseForm(
    formData,
    invite.members.map((m) => ({ id: m.id, displayName: m.display_name }))
  );
  if (!result.ok) redirect(fail(path, result.error));
  const outcome = await createExpenseViaToken(
    token,
    {
      description: result.expense.description,
      amountCents: result.expense.amountCents,
      paidBy: result.expense.paidBy,
      splitMethod: result.expense.splitMethod,
      isSettlement: false,
      expenseDate: result.expense.expenseDate,
      createdBy: await currentUserId(),
    },
    result.expense.shares.map((s) => ({
      memberId: s.memberId,
      shareCents: s.shareCents,
      splitValue: s.splitValue,
    }))
  );
  if ("error" in outcome) redirect(fail(path, outcome.error));
  revalidatePath(path);
  redirect(path);
}

export async function recordPaymentViaTokenAction(formData: FormData) {
  const { token, invite, path } = await requireInvite(formData);
  const parsed = z
    .object({
      from_member: z.uuid(),
      to_member: z.uuid(),
      amount: z.string(),
    })
    .safeParse({
      from_member: formData.get("from_member"),
      to_member: formData.get("to_member"),
      amount: formData.get("amount"),
    });
  if (!parsed.success) redirect(fail(path, "Invalid payment."));
  const { from_member, to_member, amount } = parsed.data;
  if (from_member === to_member) {
    redirect(fail(path, "Payer and payee must be different people."));
  }
  const amountCents = parseMoneyToCents(amount);
  if (amountCents === null || amountCents <= 0) {
    redirect(fail(path, "Enter a valid amount (e.g. 12.50)."));
  }
  const names = new Map(invite.members.map((m) => [m.id, m.display_name]));
  if (!names.has(from_member) || !names.has(to_member)) {
    redirect(fail(path, "Both people must be group members."));
  }
  const outcome = await createExpenseViaToken(
    token,
    {
      description: `${names.get(from_member)} paid ${names.get(to_member)}`,
      amountCents,
      paidBy: from_member,
      splitMethod: "exact",
      isSettlement: true,
      expenseDate: new Date().toISOString().slice(0, 10),
      createdBy: await currentUserId(),
    },
    [{ memberId: to_member, shareCents: amountCents, splitValue: amountCents }]
  );
  if ("error" in outcome) redirect(fail(path, outcome.error));
  revalidatePath(path);
  redirect(path);
}

export async function updateExpenseViaTokenAction(formData: FormData) {
  const { token, invite, path } = await requireInvite(formData);
  const expenseId = z.uuid().safeParse(formData.get("expense_id"));
  if (!expenseId.success) redirect(path);
  const result = parseExpenseForm(
    formData,
    invite.members.map((m) => ({ id: m.id, displayName: m.display_name }))
  );
  if (!result.ok) {
    redirect(`${path}?edit=${expenseId.data}&error=${encodeURIComponent(result.error)}`);
  }
  const outcome = await updateExpenseViaToken(
    token,
    expenseId.data,
    {
      description: result.expense.description,
      amountCents: result.expense.amountCents,
      paidBy: result.expense.paidBy,
      splitMethod: result.expense.splitMethod,
      expenseDate: result.expense.expenseDate,
    },
    result.expense.shares.map((s) => ({
      memberId: s.memberId,
      shareCents: s.shareCents,
      splitValue: s.splitValue,
    }))
  );
  if ("error" in outcome) redirect(fail(path, outcome.error));
  revalidatePath(path);
  redirect(path);
}

export async function deleteExpenseViaTokenAction(formData: FormData) {
  const { token, path } = await requireInvite(formData);
  const expenseId = z.uuid().safeParse(formData.get("expense_id"));
  if (!expenseId.success) redirect(path);
  const outcome = await deleteExpenseViaToken(token, expenseId.data);
  if ("error" in outcome) redirect(fail(path, outcome.error));
  revalidatePath(path);
  redirect(path);
}
