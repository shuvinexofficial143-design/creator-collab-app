"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="auth">
      <div className="panel">
        <h1>Something couldn’t load.</h1>
        <p>Please retry. If this continues, contact the workspace owner.</p>
        <button onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
