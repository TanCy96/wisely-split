import Link from "next/link";
import { createGroupAction } from "@/app/group-actions";
import { AuthNav } from "@/components/AuthNav";
import { Alert, Button, Card, Field, Input, PageShell } from "@/components/ui";
import { listGroupsForUser } from "@/lib/db";
import { serverAuth } from "@/lib/supabase-auth";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await serverAuth();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return (
      <PageShell narrow headerRight={<AuthNav />}>
        <Card title="Split expenses with your friends">
          <p className="text-sm text-muted">
            Track shared expenses in groups, split them fairly, and settle up
            with the fewest payments. Log in or create an account to start.
          </p>
        </Card>
      </PageShell>
    );
  }

  const groups = await listGroupsForUser();
  const defaultName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : "";

  return (
    <PageShell
      headerRight={<AuthNav />}
      aside={
        <Card title="New group">
          {error && <Alert tone="danger">{error}</Alert>}
          <form action={createGroupAction} className="mt-1 flex flex-col gap-3">
            <Field label="Group name">
              <Input name="name" placeholder="Bali trip" required maxLength={80} />
            </Field>
            <Field label="Currency">
              <Input name="currency_code" defaultValue="SGD" required maxLength={3} />
            </Field>
            <Field label="Your name in this group">
              <Input
                name="display_name"
                defaultValue={defaultName}
                required
                maxLength={80}
              />
            </Field>
            <Button>Create group</Button>
          </form>
        </Card>
      }
    >
      <Card title="Your groups">
        {groups.length === 0 ? (
          <p className="text-sm text-muted">
            No groups yet — create one to get started.
          </p>
        ) : (
          <ul className="flex flex-col">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.id}`}
                  className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span className="font-semibold text-ink">{g.name}</span>
                  <span className="text-muted">{g.currency_code}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
