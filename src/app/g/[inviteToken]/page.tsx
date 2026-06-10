import Link from "next/link";
import { notFound } from "next/navigation";
import { claimMemberAction, joinGroupAction } from "@/app/group-actions";
import { AuthNav } from "@/components/AuthNav";
import { Alert, Button, Card, Field, Input, PageShell } from "@/components/ui";
import { getGroupByInviteToken } from "@/lib/db";
import { serverAuth } from "@/lib/supabase-auth";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ inviteToken: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { inviteToken } = await params;
  const { error } = await searchParams;
  const invite = await getGroupByInviteToken(inviteToken);
  if (!invite) notFound();
  const { group, members } = invite;

  const supabase = await serverAuth();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const joinPath = `/g/${inviteToken}`;
  const existing = user ? members.find((m) => m.user_id === user.id) : undefined;
  const placeholders = members.filter((m) => m.user_id === null);
  const defaultName =
    user && typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : "";

  return (
    <PageShell narrow headerRight={<AuthNav />}>
      <Card title={`Join "${group.name}"`}>
        {error && <Alert tone="danger">{error}</Alert>}
        <p className="text-sm text-muted">
          {members.length} member{members.length === 1 ? "" : "s"}:{" "}
          {members.map((m) => m.display_name).join(", ") || "none yet"}
        </p>
      </Card>

      {!user && (
        <Card>
          <p className="text-sm text-muted">
            Log in or create an account to join this group.
          </p>
          <div className="mt-3 flex gap-3 text-sm font-semibold">
            <Link
              href={`/login?next=${encodeURIComponent(joinPath)}`}
              className="text-primary hover:underline"
            >
              Log in
            </Link>
            <Link
              href={`/register?next=${encodeURIComponent(joinPath)}`}
              className="text-primary hover:underline"
            >
              Register
            </Link>
          </div>
        </Card>
      )}

      {user && existing && (
        <Card>
          <p className="text-sm text-muted">
            You&apos;re already in this group as {existing.display_name}.
          </p>
          <Link
            href={`/groups/${group.id}`}
            className="mt-2 inline-block text-sm font-semibold text-primary hover:underline"
          >
            Open {group.name}
          </Link>
        </Card>
      )}

      {user && !existing && (
        <>
          {placeholders.length > 0 && (
            <Card title="Is one of these you?">
              <ul className="flex flex-col gap-2">
                {placeholders.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="font-semibold text-ink">
                      {m.display_name}
                    </span>
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
      )}
    </PageShell>
  );
}
