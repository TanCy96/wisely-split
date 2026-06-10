import Link from "next/link";
import { registerAction } from "@/app/actions";
import { Alert, Button, Card, Field, Input, PageShell } from "@/components/ui";

export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <PageShell narrow>
      <Card title="Create account">
        {error && <Alert tone="danger">{error}</Alert>}
        <form action={registerAction} className="mt-3 flex flex-col gap-3">
          <Field label="Name">
            <Input name="display_name" placeholder="Alex" required />
          </Field>
          <Field label="Email (for password reset)">
            <Input name="email" type="email" placeholder="you@example.com" required />
          </Field>
          <Field label="Password (min 6)">
            <Input name="password" type="password" minLength={6} placeholder="••••••••" required />
          </Field>
          <Button>Register</Button>
        </form>
        <div className="mt-4 flex justify-between gap-3 text-sm font-semibold">
          <Link href="/login" className="text-primary hover:underline">Already have an account?</Link>
          <Link href="/" className="text-muted hover:underline">Back</Link>
        </div>
      </Card>
    </PageShell>
  );
}
