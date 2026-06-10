import { redirect } from "next/navigation";
import { updatePasswordAction } from "@/app/actions";
import { Alert, Button, Card, Field, Input, PageShell } from "@/components/ui";
import { currentPlayerId } from "@/lib/supabase-auth";

export default async function UpdatePassword({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // Reachable only with an active session (the recovery link establishes one
  // via /auth/callback). Direct visits without a session go back to reset.
  const playerId = await currentPlayerId();
  if (!playerId) redirect("/forgot-password");

  return (
    <PageShell narrow>
      <Card title="Set a new password">
        {error && <Alert tone="danger">{error}</Alert>}
        <form action={updatePasswordAction} className="mt-3 flex flex-col gap-3">
          <Field label="New password (min 6)">
            <Input name="password" type="password" minLength={6} required />
          </Field>
          <Button>Update password</Button>
        </form>
      </Card>
    </PageShell>
  );
}
