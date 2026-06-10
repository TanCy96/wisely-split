import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { serverAuth } from "@/lib/supabase-auth";

/**
 * PKCE callback for Supabase email links (e.g. password recovery). Exchanges
 * the one-time `?code` for a cookie session, then forwards to `?next` (a
 * sanitized in-app path). On failure, sends the user back to /login.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  // Behind Vercel's proxy, prefer the forwarded host for the final redirect.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocal = process.env.NODE_ENV === "development";
  const base = isLocal || !forwardedHost ? url.origin : `https://${forwardedHost}`;

  if (code) {
    const supabase = await serverAuth();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  const message = "That reset link is invalid or has expired. Please request a new one.";
  return NextResponse.redirect(
    `${base}/login?error=${encodeURIComponent(message)}`
  );
}
