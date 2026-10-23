import Link from "next/link";
import { account } from "@/lib/auth";
import { readWorkspaceMetrics } from "@/lib/workspace-metrics";
export default async function Overview() {
  const { client, profile } = await account();
  const metrics = await readWorkspaceMetrics(client);
  return (
    <>
      <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
      <h1>Hello, {profile.full_name || "creator"}.</h1>
      <p>Here is where your collaborations stand today.</p>
      <div className="grid three">
        {[
          ["Pending applications", metrics.pending_applications],
          ["Active assignments", metrics.active_assignments],
          ["Work awaiting review", metrics.awaiting_review],
        ].map(([label, value]) => (
          <article className="panel stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="welcome panel">
        <span className="tag">LET’S MAKE SOMETHING GOOD</span>
        <h2>
          A great collaboration starts
          <br />
          with the right brief.
        </h2>
        <p>
          Find product videos and voice over projects that suit your skills.
        </p>
        <Link href="/workspace/projects" className="button">
          Explore available projects ↗
        </Link>
      </div>
    </>
  );
}
