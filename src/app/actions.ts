"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authErrorMessage, authErrorRedirectPath } from "@/lib/auth-errors";
import { serverAuth } from "@/lib/supabase-auth";

export async function registerAction(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const displayName = String(formData.get("display_name"));
  const supabase = await serverAuth();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) {
    redirect(authErrorRedirectPath("/register", authErrorMessage(error)));
  }

  revalidatePath("/");
  redirect("/");
}

export async function loginAction(formData: FormData) {
  const supabase = await serverAuth();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) {
    redirect(authErrorRedirectPath("/login", authErrorMessage(error)));
  }

  revalidatePath("/");
  redirect("/");
}

export async function logoutAction() {
  const supabase = await serverAuth();
  await supabase.auth.signOut();

  revalidatePath("/");
  redirect("/");
}

export async function forgotPasswordAction(formData: FormData) {
  const supabase = await serverAuth();
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  const { error } = await supabase.auth.resetPasswordForEmail(
    String(formData.get("email")),
    {
      redirectTo: `${base}/auth/callback?next=/update-password`,
    }
  );
  if (error) {
    redirect(authErrorRedirectPath("/forgot-password", authErrorMessage(error)));
  }

  redirect("/login?reset=sent");
}

const updatePasswordSchema = z.object({
  password: z.string().min(6),
});

export async function updatePasswordAction(formData: FormData) {
  const parsed = updatePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      authErrorRedirectPath(
        "/update-password",
        "Password must be at least 6 characters."
      )
    );
  }

  const supabase = await serverAuth();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    redirect(authErrorRedirectPath("/update-password", authErrorMessage(error)));
  }

  revalidatePath("/");
  redirect("/");
}
