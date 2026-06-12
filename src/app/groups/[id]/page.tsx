import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import {
  addExpenseAction,
  addMemberAction,
  deleteExpenseAction,
  recordPaymentAction,
  updateExpenseAction,
} from "@/app/group-actions";
import { AuthNav } from "@/components/AuthNav";
import { GroupView } from "@/components/GroupView";
import { getGroup, listExpenses, listMembers } from "@/lib/db";
import { currentUserId } from "@/lib/supabase-auth";

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; edit?: string }>;
}) {
  const { id } = await params;
  const { error, edit } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const userId = await currentUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(`/groups/${id}`)}`);

  const group = await getGroup(id);
  if (!group) notFound(); // unknown id, or not a member (RLS hides it)
  const members = await listMembers(id);
  const expenses = await listExpenses(id);
  const myMemberId = members.find((m) => m.user_id === userId)?.id;

  return (
    <GroupView
      group={group}
      members={members}
      expenses={expenses}
      actions={{
        addExpense: addExpenseAction,
        updateExpense: updateExpenseAction,
        deleteExpense: deleteExpenseAction,
        recordPayment: recordPaymentAction,
        addMember: addMemberAction,
      }}
      hiddenFields={{ group_id: group.id }}
      basePath={`/groups/${group.id}`}
      editingId={edit}
      error={error}
      inviteUrl={`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/g/${group.invite_token}`}
      headerRight={<AuthNav />}
      defaultPaidBy={myMemberId}
    />
  );
}
