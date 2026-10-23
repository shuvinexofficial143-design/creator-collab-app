"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { configured } from "@/lib/config";
import { resolvePrivateLogin } from "@/lib/private-access";
import type { Result } from "@/components/action-form";

export async function authenticate(
  mode: string,
  _: Result,
  form: FormData,
): Promise<Result> {
  if (mode !== "login") return { error: "Account registration is invitation-only." };
  if (!configured()) return { error: "Service is not configured yet." };

  const username = String(form.get("username") || "");
  const password = String(form.get("password") || "");
  const identity = resolvePrivateLogin(username);
  if (!identity || password.length < 10 || password.length > 128)
    return { error: "Invalid username or password." };

  const client = await db();
  const { data, error } = await client.auth.signInWithPassword({
    email: identity.email,
    password,
  });
  if (error || !data.user)
    return { error: "Invalid username or password." };

  // Confirm the database role matches the server-side username mapping.
  const { data: profile, error: roleError } = await client
    .from("profiles")
    .select("role,active")
    .eq("id", data.user.id)
    .single();
  if (roleError || !profile?.active || profile.role !== identity.role) {
    await client.auth.signOut();
    return { error: "Account access is not available. Contact the owner." };
  }
  redirect("/workspace");
}

export async function logout() {
  if (configured()) {
    const client = await db();
    await client.auth.signOut();
  }
  redirect("/auth/login");
}
