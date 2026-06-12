import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { claimMemberAction, joinGroupAction } from "@/app/group-actions";
import {
  addExpenseViaTokenAction,
  addMemberViaTokenAction,
  clearIdentityViaTokenAction,
  deleteExpenseViaTokenAction,
  identifyViaTokenAction,
  recordPaymentViaTokenAction,
  updateExpenseViaTokenAction,
} from "@/app/token-actions";
import { AuthNav } from "@/components/AuthNav";
import { GroupView } from "@/components/GroupView";
import { Button, Card, Field, Input } from "@/components/ui";
import { getGroupDataViaToken } from "@/lib/db";
import { currentIdentity } from "@/lib/identity";
import { serverAuth } from "@/lib/supabase-auth";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ inviteToken: string }>;
  searchParams: Promise<{ error?: string; edit?: string }>;
}) {
  const { inviteToken } = await params;
  const { error, edit } = await searchParams;
  const data = await getGroupDataViaToken(inviteToken);
  if (!data) notFound();
  const { group, members, expenses } = data;

  const supabase = await serverAuth();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  // Members use the canonical RLS view.
  if (user && members.some((m) => m.user_id === user.id)) {
    redirect(`/groups/${group.id}`);
  }

  const joinPath = `/g/${inviteToken}`;
  const identityId = await currentIdentity(group.id, members);
  const identityName = identityId
    ? members.find((m) => m.id === identityId)?.display_name
    : undefined;
  const placeholders = members.filter((m) => m.user_id === null);
  const defaultName =
    user && typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : "";

  const identityBar = identityId ? (
    <p className="text-sm text-muted">
      You&apos;re here as{" "}
      <span className="font-semibold text-ink">{identityName}</span> —{" "}
      <span className="inline-block">
        <form action={clearIdentityViaTokenAction} className="inline">
          <input type="hidden" name="token" value={inviteToken} />
          <button className="font-semibold text-primary hover:underline">
            switch
          </button>
        </form>
      </span>
    </p>
  ) : null;

  // The single write-UI replacement while unidentified (GroupView `locked`).
  const locked = identityId ? undefined : !user ? (
    <Card title="Who are you?" highlight>
      <p className="mb-3 text-sm text-muted">
        Pick your name to start adding expenses — no account needed.
      </p>
      <ul className="mb-3 flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.id}>
            <form action={identifyViaTokenAction}>
              <input type="hidden" name="token" value={inviteToken} />
              <input type="hidden" name="member_id" value={m.id} />
              <Button variant="secondary" className="w-full">
                I&apos;m {m.display_name}
              </Button>
            </form>
          </li>
        ))}
      </ul>
      <form action={identifyViaTokenAction} className="flex items-end gap-2">
        <input type="hidden" name="token" value={inviteToken} />
        <Field label="Or add your name">
          <Input name="display_name" placeholder="Alex" required maxLength={80} />
        </Field>
        <Button className="shrink-0">That&apos;s me</Button>
      </form>
    </Card>
  ) : (
    <Card title="Want to add expenses?">
      <p className="text-sm text-muted">
        Claim your name or join the group first — see the cards at the top of
        the page.
      </p>
    </Card>
  );

  const topCards = !user ? (
    <>
      {identityBar}
      {!identityId && (
        <Card>
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">
              You can use this page without an account.
            </span>{" "}
            Pick your name in the &quot;Who are you?&quot; card to start adding
            expenses, and bookmark this link to come back. If you want this
            group on your own dashboard,{" "}
            <Link
              href={`/login?next=${encodeURIComponent(joinPath)}`}
              className="font-semibold text-primary hover:underline"
            >
              log in
            </Link>{" "}
            or{" "}
            <Link
              href={`/register?next=${encodeURIComponent(joinPath)}`}
              className="font-semibold text-primary hover:underline"
            >
              register
            </Link>
            .
          </p>
        </Card>
      )}
    </>
  ) : (
    <>
      {identityBar}
      {placeholders.length > 0 && (
        <Card title="Is one of these you?">
          <ul className="flex flex-col gap-2">
            {placeholders.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-semibold text-ink">{m.display_name}</span>
                <form action={claimMemberAction}>
                  <input type="hidden" name="token" value={inviteToken} />
                  <input type="hidden" name="member_id" value={m.id} />
                  <Button variant="secondary" className="px-3 py-1.5 text-xs">
                    This is me
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Join as a new member">
        <form action={joinGroupAction} className="flex flex-col gap-3">
          <input type="hidden" name="token" value={inviteToken} />
          <Field label="Your name">
            <Input
              name="display_name"
              defaultValue={defaultName}
              required
              maxLength={80}
            />
          </Field>
          <Button>Join group</Button>
        </form>
      </Card>
    </>
  );

  return (
    <GroupView
      group={group}
      members={members}
      expenses={expenses}
      actions={{
        addExpense: addExpenseViaTokenAction,
        updateExpense: updateExpenseViaTokenAction,
        deleteExpense: deleteExpenseViaTokenAction,
        recordPayment: recordPaymentViaTokenAction,
        addMember: addMemberViaTokenAction,
      }}
      hiddenFields={{ token: inviteToken }}
      basePath={joinPath}
      editingId={edit}
      error={error}
      inviteUrl={`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}${joinPath}`}
      headerRight={<AuthNav />}
      topCards={topCards}
      locked={locked}
      defaultPaidBy={identityId ?? undefined}
    />
  );
}
