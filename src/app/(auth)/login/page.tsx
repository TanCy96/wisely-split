import Link from "next/link";
import { loginAction } from "@/app/actions";
import { Alert, Button, Card, Field, Input, PageShell } from "@/components/ui";
import { safeNextPath } from "@/lib/safe-redirect";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; error?: string; next?: string }>;
}) {
  const { reset, error, next } = await searchParams;
  const safeNext = safeNextPath(next ?? null);

  return (
    <PageShell narrow>
      <Card title="Log in">
        {reset === "sent" && <Alert tone="success">Password reset email sent.</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}
        <form action={loginAction} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="next" value={safeNext} />
          <Field label="Email">
            <Input name="email" type="email" placeholder="you@example.com" required />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" required />
          </Field>
          <Button>Log in</Button>
        </form>
        <div className="mt-4 flex justify-between gap-3 text-sm font-semibold">
          <Link href={safeNext === "/" ? "/register" : `/register?next=${encodeURIComponent(safeNext)}`} className="text-primary hover:underline">Create account</Link>
          <Link href="/forgot-password" className="text-primary hover:underline">Forgot password?</Link>
        </div>
      </Card>
    </PageShell>
  );
}
