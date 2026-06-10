import Link from "next/link";
import { forgotPasswordAction } from "@/app/actions";
import { Alert, Button, Card, Field, Input, PageShell } from "@/components/ui";

export default async function Forgot({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <PageShell narrow>
      <Card title="Reset password">
        {error && <Alert tone="danger">{error}</Alert>}
        <form action={forgotPasswordAction} className="mt-3 flex flex-col gap-3">
          <Field label="Your account email">
            <Input name="email" type="email" placeholder="you@example.com" required />
          </Field>
          <Button>Send reset link</Button>
        </form>
        <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
          Back to login
        </Link>
      </Card>
    </PageShell>
  );
}
