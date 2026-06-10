import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const browserAuth = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

export async function serverAuth() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              store.set(name, value, options)
            );
          } catch {
            // cookies() is read-only during Server Component renders; the
            // refreshed token is persisted on the next Server Action instead.
          }
        },
      },
    }
  );
}

export async function currentUserId(): Promise<string | null> {
  const supabase = await serverAuth();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Alias for currentUserId — used by copied auth pages from smash-kaki. */
export const currentPlayerId = currentUserId;
