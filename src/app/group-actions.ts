"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  addPlaceholderMember,
  claimMemberViaToken,
  createExpense,
  createGroup,
  deleteExpense,
  getExpense,
  joinGroupViaToken,
  listMembers,
  updateExpense,
} from "@/lib/db";
import { parseExpenseForm } from "@/lib/expense-input";
import { parseMoneyToCents } from "@/lib/money";
import { currentUserId } from "@/lib/supabase-auth";

const fail = (path: string, message: string) =>
  `${path}?error=${encodeURIComponent(message)}`;

async function requireUserId(nextPath = "/"): Promise<string> {
  const userId = await currentUserId();
  if (!userId) {
    redirect(
      nextPath === "/"
        ? "/login"
        : `/login?next=${encodeURIComponent(nextPath)}`
    );
  }
  return userId;
}

const nameSchema = z.string().trim().min(1).max(80);

/* ---------- Groups & members ---------- */

const createGroupSchema = z.object({
  name: nameSchema,
  currency_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code."),
  display_name: nameSchema,
});

export async function createGroupAction(formData: FormData) {
  const userId = await requireUserId();
  const parsed = createGroupSchema.safeParse({
    name: formData.get("name"),
    currency_code: formData.get("currency_code"),
    display_name: formData.get("display_name"),
  });
  if (!parsed.success) {
    redirect(fail("/", parsed.error.issues[0]?.message ?? "Invalid input."));
  }
  const groupId = await createGroup({
    name: parsed.data.name,
    currencyCode: parsed.data.currency_code,
    userId,
    displayName: parsed.data.display_name,
  });
  revalidatePath("/");
  redirect(`/groups/${groupId}`);
}

export async function addMemberAction(formData: FormData) {
  await requireUserId();
  const groupId = z.uuid().safeParse(formData.get("group_id"));
  if (!groupId.success) redirect("/");
  const path = `/groups/${groupId.data}`;
  const name = nameSchema.safeParse(formData.get("display_name"));
  if (!name.success) redirect(fail(path, "Member name is required."));
  await addPlaceholderMember(groupId.data, name.data);
  revalidatePath(path);
  redirect(path);
}

/* ---------- Expenses ---------- */

export async function addExpenseAction(formData: FormData) {
  const userId = await requireUserId();
  const groupId = z.uuid().safeParse(formData.get("group_id"));
  if (!groupId.success) redirect("/");
  const path = `/groups/${groupId.data}`;

  // RLS returns an empty list to non-members.
  const members = await listMembers(groupId.data);
  if (members.length === 0) redirect("/");

  const result = parseExpenseForm(
    formData,
    members.map((m) => ({ id: m.id, displayName: m.display_name }))
  );
  if (!result.ok) redirect(fail(path, result.error));

  await createExpense(
    {
      groupId: groupId.data,
      description: result.expense.description,
      amountCents: result.expense.amountCents,
      paidBy: result.expense.paidBy,
      splitMethod: result.expense.splitMethod,
      isSettlement: false,
      expenseDate: result.expense.expenseDate,
      createdBy: userId,
    },
    result.expense.shares.map((s) => ({
      memberId: s.memberId,
      shareCents: s.shareCents,
      splitValue: s.splitValue,
    }))
  );
  revalidatePath(path);
  redirect(path);
}

const paymentSchema = z.object({
  group_id: z.uuid(),
  from_member: z.uuid(),
  to_member: z.uuid(),
  amount: z.string(),
});

export async function recordPaymentAction(formData: FormData) {
  const userId = await requireUserId();
  const parsed = paymentSchema.safeParse({
    group_id: formData.get("group_id"),
    from_member: formData.get("from_member"),
    to_member: formData.get("to_member"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) redirect("/");
  const { group_id, from_member, to_member, amount } = parsed.data;
  const path = `/groups/${group_id}`;

  if (from_member === to_member) {
    redirect(fail(path, "Payer and payee must be different people."));
  }
  const amountCents = parseMoneyToCents(amount);
  if (amountCents === null || amountCents <= 0) {
    redirect(fail(path, "Enter a valid amount (e.g. 12.50)."));
  }
  const members = await listMembers(group_id);
  const names = new Map(members.map((m) => [m.id, m.display_name]));
  if (!names.has(from_member) || !names.has(to_member)) {
    redirect(fail(path, "Both people must be group members."));
  }

  // A settle-up payment is an ordinary expense: payer pays, one share for the payee.
  await createExpense(
    {
      groupId: group_id,
      description: `${names.get(from_member)} paid ${names.get(to_member)}`,
      amountCents,
      paidBy: from_member,
      splitMethod: "exact",
      isSettlement: true,
      expenseDate: new Date().toISOString().slice(0, 10),
      createdBy: userId,
    },
    [{ memberId: to_member, shareCents: amountCents, splitValue: amountCents }]
  );
  revalidatePath(path);
  redirect(path);
}

const expenseIdsSchema = z.object({
  group_id: z.uuid(),
  expense_id: z.uuid(),
});

export async function updateExpenseAction(formData: FormData) {
  await requireUserId();
  const ids = expenseIdsSchema.safeParse({
    group_id: formData.get("group_id"),
    expense_id: formData.get("expense_id"),
  });
  if (!ids.success) redirect("/");
  const path = `/groups/${ids.data.group_id}`;
  const editPath = `${path}/expenses/${ids.data.expense_id}`;

  const existing = await getExpense(ids.data.expense_id);
  if (!existing || existing.group_id !== ids.data.group_id) redirect("/");

  const members = await listMembers(ids.data.group_id);
  const result = parseExpenseForm(
    formData,
    members.map((m) => ({ id: m.id, displayName: m.display_name }))
  );
  if (!result.ok) redirect(fail(editPath, result.error));

  await updateExpense(
    ids.data.expense_id,
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
  revalidatePath(path);
  redirect(path);
}

export async function deleteExpenseAction(formData: FormData) {
  await requireUserId();
  const ids = expenseIdsSchema.safeParse({
    group_id: formData.get("group_id"),
    expense_id: formData.get("expense_id"),
  });
  if (!ids.success) redirect("/");
  // RLS: non-members delete nothing.
  await deleteExpense(ids.data.expense_id);
  const path = `/groups/${ids.data.group_id}`;
  revalidatePath(path);
  redirect(path);
}

/* ---------- Invite-token join/claim ---------- */

export async function claimMemberAction(formData: FormData) {
  const parsed = z
    .object({ token: z.string().min(1), member_id: z.uuid() })
    .safeParse({
      token: formData.get("token"),
      member_id: formData.get("member_id"),
    });
  if (!parsed.success) redirect("/");
  const joinPath = `/g/${parsed.data.token}`;
  const userId = await requireUserId(joinPath);
  const result = await claimMemberViaToken(
    parsed.data.token,
    parsed.data.member_id,
    userId
  );
  if ("error" in result) redirect(fail(joinPath, result.error));
  revalidatePath(`/groups/${result.groupId}`);
  redirect(`/groups/${result.groupId}`);
}

export async function joinGroupAction(formData: FormData) {
  const token = z.string().min(1).safeParse(formData.get("token"));
  if (!token.success) redirect("/");
  const joinPath = `/g/${token.data}`;
  const userId = await requireUserId(joinPath);
  const name = nameSchema.safeParse(formData.get("display_name"));
  if (!name.success) redirect(fail(joinPath, "Your name is required."));
  const result = await joinGroupViaToken(token.data, userId, name.data);
  if ("error" in result) redirect(fail(joinPath, result.error));
  revalidatePath(`/groups/${result.groupId}`);
  redirect(`/groups/${result.groupId}`);
}
