export type PrivateRole = "ADMIN" | "CREATOR";
type AccessConfig = Record<string, string | undefined>;

/**
 * Map a public username to a pre-provisioned Supabase Auth account.
 * Neither email address nor credential secrets are sent to the browser.
 * The actual password exists ONLY in Supabase Auth.
 */
export function resolvePrivateLogin(username: string, env: AccessConfig = process.env) {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,31}$/.test(normalized)) return null;
  const accounts: { username: string; email: string; role: PrivateRole }[] = [
    { username: env.ADMIN_LOGIN_USERNAME || "", email: env.ADMIN_AUTH_EMAIL || "", role: "ADMIN" },
    { username: env.CREATOR_LOGIN_USERNAME || "", email: env.CREATOR_AUTH_EMAIL || "", role: "CREATOR" },
  ];
  const matches = accounts.filter(
    (entry) =>
      entry.username.trim().toLowerCase() === normalized &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email.trim()),
  );
  // Duplicate usernames must not silently resolve to a privileged account.
  return matches.length === 1 ? { email: matches[0].email.trim(), role: matches[0].role } : null;
}
