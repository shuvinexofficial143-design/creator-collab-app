"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/supabase";
import { configured } from "@/lib/config";
import { credentials } from "@/lib/validation";
import type { Result } from "@/components/action-form";
export async function authenticate(
  mode: string,
  _: Result,
  form: FormData,
): Promise<Result> {
  if (!configured()) return { error: "Service is not configured yet." };
  const client = await db();
  const email = String(form.get("email") || "");
  const password = String(form.get("password") || "");
  if (mode === "forgot") {
    if (!z.email().safeParse(email).success)
      return { error: "Enter a valid email." };
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.APP_URL}/auth/callback?next=/auth/reset`,
    });
    return error
      ? { error: "Unable to request password recovery. Try again later." }
      : { success: "If this account exists, a recovery email has been sent." };
  }
  if (mode === "reset") {
    if (password.length < 10 || password.length > 128)
      return { error: "Use 10–128 characters." };
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { error: "Open your password recovery link first." };
    const { error } = await client.auth.updateUser({ password });
    if (error) return { error: "Could not update password." };
    redirect("/workspace");
  }
  if (!credentials.safeParse({ email, password }).success)
    return { error: "Enter a valid email and password of 10–128 characters." };
  if (mode === "register") {
    const { error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: String(form.get("full_name") || "").slice(0, 120) },
        emailRedirectTo: `${process.env.APP_URL}/auth/callback`,
      },
    });
    return error
      ? { error: "Registration could not be completed. Please try again." }
      : { success: "Check your email to confirm your account, then sign in." };
  }
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error)
    return {
      error:
        "Email or password is incorrect, or email confirmation is pending.",
    };
  redirect("/workspace");
}
export async function logout() {
  if (configured()) {
    const client = await db();
    await client.auth.signOut();
  }
  redirect("/auth/login");
}
