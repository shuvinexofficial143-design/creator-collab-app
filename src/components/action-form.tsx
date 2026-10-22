"use client";
import { useActionState } from "react";
export type Result = { error?: string; success?: string };
export function ActionForm({
  action,
  children,
  label = "Save",
}: {
  action: (state: Result, data: FormData) => Promise<Result>;
  children: React.ReactNode;
  label?: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run}>
      {children}
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="success">
          {state.success}
        </p>
      )}
      <button disabled={pending}>{pending ? "Please wait…" : label}</button>
    </form>
  );
}
