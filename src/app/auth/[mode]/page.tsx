import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { authenticate } from "../actions";
export default async function Auth({
  params,
  searchParams,
}: {
  params: Promise<{ mode: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { mode } = await params;
  const { error } = await searchParams;
  if (!["login", "register", "forgot", "reset"].includes(mode)) notFound();
  const title = (
    {
      login: "Welcome back",
      register: "Start creating with us",
      forgot: "Reset your password",
      reset: "Choose a new password",
    } as Record<string, string>
  )[mode];
  return (
    <main className="auth">
      <Link href="/" className="eyebrow">
        ← Creator Collaboration
      </Link>
      <div className="panel">
        <span className="tag">YOUR CREATIVE WORKSPACE</span>
        <h1>{title}</h1>
        <p>Product stories. Great voices. Meaningful collaborations.</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <ActionForm
          action={authenticate.bind(null, mode)}
          label={
            mode === "login"
              ? "Sign in"
              : mode === "register"
                ? "Create account"
                : "Continue"
          }
        >
          {mode === "register" && (
            <label>
              Full name
              <input
                name="full_name"
                required
                maxLength={120}
                autoComplete="name"
              />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={10}
                maxLength={128}
                required
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
            </label>
          )}
        </ActionForm>
        <div className="links">
          <Link href="/auth/login">Sign in</Link>
          <Link href="/auth/register">Register</Link>
          <Link href="/auth/forgot">Forgot password?</Link>
        </div>
      </div>
    </main>
  );
}
