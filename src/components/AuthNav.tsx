import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui";
import { serverAuth } from "@/lib/supabase-auth";

/**
 * Header auth controls: a log-out form when signed in, otherwise log in /
 * register links. Display name lives in auth user metadata (set at sign-up);
 * there is no profiles table.
 */
export async function AuthNav() {
  const supabase = await serverAuth();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (user) {
    const displayName =
      typeof user.user_metadata?.display_name === "string"
        ? user.user_metadata.display_name
        : "";
    return (
      <form action={logoutAction} className="flex items-center gap-3 text-sm">
        <span className="max-w-32 truncate font-medium text-muted">
          {displayName || "Signed in"}
        </span>
        <Button variant="ghost" className="px-2 py-1">
          Log out
        </Button>
      </form>
    );
  }

  return (
    <div className="flex gap-2 text-sm font-semibold">
      <Link href="/login" className="text-primary hover:underline">
        Log in
      </Link>
      <Link href="/register" className="text-primary hover:underline">
        Register
      </Link>
    </div>
  );
}
