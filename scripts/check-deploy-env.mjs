/** Read-only deployment configuration check; never outputs key values. */
export function validateDeploymentEnv(env) {
  const errors = [];
  const value = (name) => String(env[name] || "").trim();
  function origin(name) {
    const text = value(name);
    if (!text) { errors.push(name + " is missing."); return; }
    try {
      const url = new URL(text);
      const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (url.username || url.password || url.search || url.hash ||
        (url.pathname !== "/" && url.pathname !== "") ||
        (!local && url.protocol !== "https:") ||
        (local && url.protocol !== "http:" && url.protocol !== "https:")) {
        errors.push(name + " must be a clean HTTPS origin (HTTP only for localhost).");
      }
    } catch {
      errors.push(name + " is not a valid origin.");
    }
  }
  origin("NEXT_PUBLIC_SUPABASE_URL");
  origin("APP_URL");
  const key = value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!key) errors.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing.");
  else if (/sb_secret_|service_role|SUPABASE_SERVICE_ROLE_KEY/i.test(key)) {
    errors.push("Do not use a privileged secret in NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  } else if (key.length < 20) {
    errors.push("Publishable key looks incomplete.");
  }
  const supabaseUrl = value("NEXT_PUBLIC_SUPABASE_URL");
  const appUrl = value("APP_URL");
  if (supabaseUrl && appUrl && supabaseUrl === appUrl) {
    errors.push("APP_URL must identify the app, not the Supabase API.");
  }
  return { ok: errors.length === 0, errors };
}
if (process.argv[1] && new URL(import.meta.url).pathname === new URL("file://" + process.argv[1]).pathname) {
  const result = validateDeploymentEnv(process.env);
  if (!result.ok) {
    process.stderr.write("Creator Collab preview preflight: BLOCKED\n" + result.errors.map((e)=>"- "+e).join("\n") + "\n");
    process.exitCode = 1;
  } else {
    process.stdout.write("Creator Collab preview environment: required names and origins validated.\nActual Auth/Storage/URL tests must still be run.\n");
  }
}
