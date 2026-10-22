export const dynamic = "force-dynamic";
import Link from "next/link";
import { account } from "@/lib/auth";
import { brand } from "@/lib/config";
import { logout } from "@/app/auth/actions";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await account();
  const links = [
    ["", "Overview"],
    ["projects", "Explore projects"],
    ["applications", "Applications"],
    ["work", "My work"],
    ["earnings", "Earnings"],
    ["notifications", "Updates"],
    ["profile", "Profile"],
  ];
  if (profile.role === "ADMIN")
    links.push(["admin", "Admin panel"], ["history", "Operations history"]);
  return (
    <div className="shell">
      <aside>
        <Link href="/" className="brand">
          ◈ {brand}
        </Link>
        <span className="eyebrow">CREATOR WORKSPACE</span>
        <nav>
          {links.map(([path, title]) => (
            <Link key={path} href={`/workspace/${path}`}>
              {title}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <strong>{profile.full_name || "Your account"}</strong>
          <small>{profile.role}</small>
          <form action={logout}>
            <button className="secondary">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="workspace">
        <header>
          <span>
            Workspace / <strong>Collaboration</strong>
          </span>
          <span className="tag">
            {profile.role === "ADMIN" ? "ADMIN" : "CREATOR"}
          </span>
        </header>
        {children}
      </main>
    </div>
  );
}
