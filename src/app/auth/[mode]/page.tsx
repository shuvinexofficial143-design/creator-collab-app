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
  if (mode !== "login") notFound();
  return (
    <main className="auth">
      <Link href="/" className="eyebrow">← Creator Collaboration</Link>
      <div className="panel">
        <span className="tag">PRIVATE CREATOR WORKSPACE</span>
        <h1>Welcome back</h1>
        <p>One secure place for product briefs, reference videos and your completed work.</p>
        {error && <p role="alert" className="error">{error}</p>}
        <ActionForm action={authenticate.bind(null, "login")} label="Enter workspace">
          <label>
            Username
            <input name="username" required autoComplete="username" minLength={3} maxLength={32} />
          </label>
          <label>
            Password
            <input name="password" required type="password" minLength={10} maxLength={128} autoComplete="current-password" />
          </label>
          <small>Private accounts are provided directly by the business owner. There is no public registration.</small>
        </ActionForm>
      </div>
    </main>
  );
}
