import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverAuth } from "./supabase-auth";
import { generateToken } from "./tokens";
import type { SplitMethod } from "./splits";

/* ---------- Row types (snake_case as stored; money in integer cents) ---------- */

export type GroupRow = {
  id: string;
  name: string;
  currency_code: string;
  invite_token: string;
  created_by: string;
  created_at: string;
};

export type MemberRow = {
  id: string;
  group_id: string;
  display_name: string;
  user_id: string | null;
  created_at: string;
};

export type ShareRow = {
  id: string;
  expense_id: string;
  member_id: string;
  share_cents: number;
  split_value: number | null;
};

export type ExpenseRow = {
  id: string;
  group_id: string;
  description: string;
  amount_cents: number;
  paid_by: string;
  split_method: SplitMethod;
  is_settlement: boolean;
  expense_date: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  expense_shares: ShareRow[];
};

export type ExpenseInput = {
  groupId: string;
  description: string;
  amountCents: number;
  paidBy: string;
  splitMethod: SplitMethod;
  isSettlement: boolean;
  expenseDate: string;
  createdBy: string;
};

export type ShareInput = {
  memberId: string;
  shareCents: number;
  splitValue: number | null;
};

const GROUP_COLUMNS = "id, name, currency_code, invite_token, created_by, created_at";
const MEMBER_COLUMNS = "id, group_id, display_name, user_id, created_at";
const EXPENSE_COLUMNS =
  "id, group_id, description, amount_cents, paid_by, split_method, is_settlement, " +
  "expense_date, created_by, created_at, updated_at, " +
  "expense_shares (id, expense_id, member_id, share_cents, split_value)";

/* ---------- Member operations (RLS-scoped session client) ---------- */

export async function listGroupsForUser(): Promise<GroupRow[]> {
  const supabase = await serverAuth();
  const { data, error } = await supabase
    .from("groups")
    .select(GROUP_COLUMNS)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

export async function getGroup(groupId: string): Promise<GroupRow | null> {
  const supabase = await serverAuth();
  const { data, error } = await supabase
    .from("groups")
    .select(GROUP_COLUMNS)
    .eq("id", groupId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createGroup(input: {
  name: string;
  currencyCode: string;
  userId: string;
  displayName: string;
}): Promise<string> {
  const supabase = await serverAuth();
  // App-generated id: the creator is not a member yet when this row is
  // inserted, so the SELECT policy would hide an INSERT ... RETURNING.
  const groupId = crypto.randomUUID();
  const { error } = await supabase.from("groups").insert({
    id: groupId,
    name: input.name,
    currency_code: input.currencyCode,
    invite_token: generateToken(),
    created_by: input.userId,
  });
  if (error) throw new Error(error.message);
  const { error: memberError } = await supabase.from("group_members").insert({
    group_id: groupId,
    display_name: input.displayName,
    user_id: input.userId,
  });
  if (memberError) throw new Error(memberError.message);
  return groupId;
}

export async function listMembers(groupId: string): Promise<MemberRow[]> {
  const supabase = await serverAuth();
  const { data, error } = await supabase
    .from("group_members")
    .select(MEMBER_COLUMNS)
    .eq("group_id", groupId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

export async function addPlaceholderMember(
  groupId: string,
  displayName: string
): Promise<void> {
  const supabase = await serverAuth();
  const { error } = await supabase.from("group_members").insert({
    group_id: groupId,
    display_name: displayName,
    user_id: null,
  });
  if (error) throw new Error(error.message);
}

export async function listExpenses(groupId: string): Promise<ExpenseRow[]> {
  const supabase = await serverAuth();
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .eq("group_id", groupId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as unknown as ExpenseRow[];
}

export async function getExpense(expenseId: string): Promise<ExpenseRow | null> {
  const supabase = await serverAuth();
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .eq("id", expenseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as ExpenseRow | null;
}

export async function createExpense(
  input: ExpenseInput,
  shares: ShareInput[]
): Promise<void> {
  const supabase = await serverAuth();
  const expenseId = crypto.randomUUID();
  const { error } = await supabase.from("expenses").insert({
    id: expenseId,
    group_id: input.groupId,
    description: input.description,
    amount_cents: input.amountCents,
    paid_by: input.paidBy,
    split_method: input.splitMethod,
    is_settlement: input.isSettlement,
    expense_date: input.expenseDate,
    created_by: input.createdBy,
  });
  if (error) throw new Error(error.message);
  const { error: sharesError } = await supabase
    .from("expense_shares")
    .insert(shares.map((s) => toShareRow(expenseId, s)));
  if (sharesError) {
    // Two statements, no transaction (supabase-js limitation): best-effort
    // rollback so a failed shares insert doesn't leave a shareless expense
    // skewing balances.
    await supabase.from("expenses").delete().eq("id", expenseId);
    throw new Error(sharesError.message);
  }
}

export async function updateExpense(
  expenseId: string,
  input: Omit<ExpenseInput, "groupId" | "isSettlement" | "createdBy">,
  shares: ShareInput[]
): Promise<void> {
  const supabase = await serverAuth();
  const { error } = await supabase
    .from("expenses")
    .update({
      description: input.description,
      amount_cents: input.amountCents,
      paid_by: input.paidBy,
      split_method: input.splitMethod,
      expense_date: input.expenseDate,
    })
    .eq("id", expenseId);
  if (error) throw new Error(error.message);
  const { error: deleteError } = await supabase
    .from("expense_shares")
    .delete()
    .eq("expense_id", expenseId);
  if (deleteError) throw new Error(deleteError.message);
  const { error: insertError } = await supabase
    .from("expense_shares")
    .insert(shares.map((s) => toShareRow(expenseId, s)));
  if (insertError) throw new Error(insertError.message);
}

export async function deleteExpense(expenseId: string): Promise<void> {
  const supabase = await serverAuth();
  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) throw new Error(error.message);
}

function toShareRow(expenseId: string, share: ShareInput) {
  return {
    expense_id: expenseId,
    member_id: share.memberId,
    share_cents: share.shareCents,
    split_value: share.splitValue,
  };
}

/* ---------- Invite-token flows (service role; the token is the authorization) ---------- */

let cachedAdmin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!cachedAdmin) {
    cachedAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return cachedAdmin;
}

export type InviteView = { group: GroupRow; members: MemberRow[] };

export async function getGroupByInviteToken(
  token: string
): Promise<InviteView | null> {
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return null;
  const { data: group, error } = await admin()
    .from("groups")
    .select(GROUP_COLUMNS)
    .eq("invite_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!group) return null;
  const { data: members, error: membersError } = await admin()
    .from("group_members")
    .select(MEMBER_COLUMNS)
    .eq("group_id", group.id)
    .order("created_at");
  if (membersError) throw new Error(membersError.message);
  return { group, members };
}

export type TokenJoinResult = { groupId: string } | { error: string };

export async function claimMemberViaToken(
  token: string,
  memberId: string,
  userId: string
): Promise<TokenJoinResult> {
  const invite = await getGroupByInviteToken(token);
  if (!invite) return { error: "This invite link is invalid." };
  if (invite.members.some((m) => m.user_id === userId)) {
    return { error: "You are already a member of this group." };
  }
  const member = invite.members.find((m) => m.id === memberId);
  if (!member || member.user_id !== null) {
    return { error: "That name has already been claimed." };
  }
  const { data, error } = await admin()
    .from("group_members")
    .update({ user_id: userId })
    .eq("id", memberId)
    .is("user_id", null) // guards the race where two visitors claim at once
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: "That name has already been claimed." };
  }
  return { groupId: invite.group.id };
}

export async function joinGroupViaToken(
  token: string,
  userId: string,
  displayName: string
): Promise<TokenJoinResult> {
  const invite = await getGroupByInviteToken(token);
  if (!invite) return { error: "This invite link is invalid." };
  if (invite.members.some((m) => m.user_id === userId)) {
    return { error: "You are already a member of this group." };
  }
  const { error } = await admin().from("group_members").insert({
    group_id: invite.group.id,
    display_name: displayName,
    user_id: userId,
  });
  // unique (group_id, user_id) also backstops a join/claim race
  if (error) return { error: "Could not join this group. Please try again." };
  return { groupId: invite.group.id };
}
