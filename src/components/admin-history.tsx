import { account } from "@/lib/auth";
import Link from "next/link";
export async function AdminHistory({ page = 1 }: { page?: number }) {
  const size = 25;
  const start = (page - 1) * size;
  const { client } = await account(true);
  const [applications, audits, shipping] = await Promise.all([
    client
      .from("applications")
      .select("*,projects(title),profiles(full_name)", { count: "exact" })
      .neq("status", "PENDING")
      .order("created_at", { ascending: false })
      .range(start, start + size - 1),
    client
      .from("audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(start, start + size - 1),
    client
      .from("shipping")
      .select("*", { count: "exact" })
      .in("status", ["DISPATCHED", "DELIVERED"])
      .order("assignment_id", { ascending: false })
      .range(start, start + size - 1),
  ]);
  if ([applications, audits, shipping].some((r) => r.error))
    throw Error("History unavailable");
  return (
    <>
      <p>
        Showing page {page} of each history section (25 records per section). Times are displayed in IST.
      </p>
      <p>Admin CSV exports include the full dataset up to 5,000 records. Oversized exports are refused rather than truncated. Exports are private and never cached.</p>
      <nav className="filters" aria-label="Admin CSV exports">
        <Link href="/api/admin/export?kind=applications">Applications CSV</Link>
        <Link href="/api/admin/export?kind=shipping">Shipping CSV</Link>
        <Link href="/api/admin/export?kind=audit">Audit CSV</Link>
      </nav>
      <h2>Application decisions ({applications.count ?? "—"})</h2>
      {applications.data!.map((a) => (
        <article className="panel" key={a.id}>
          <h3>
            {a.projects?.title} · {a.profiles?.full_name}
          </h3>
          <span className="tag">{a.status}</span>
          <p>{a.reason || "Application approved"}</p>
        </article>
      ))}
      <h2>Shipment history ({shipping.count ?? "—"})</h2>
      {shipping.data!.map((s) => (
        <article className="panel" key={s.assignment_id}>
          <span className="tag">{s.status}</span>
          <p>
            {s.courier} · {s.tracking}
          </p>
        </article>
      ))}
      <h2>Audit trail ({audits.count ?? "—"})</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Time (IST)</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Record</th>
            </tr>
          </thead>
          <tbody>
            {audits.data!.map((a) => (
              <tr key={a.id}>
                <td>
                  {new Date(a.created_at).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </td>
                <td>{a.action}</td>
                <td>{a.actor_id}</td>
                <td>{a.target_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="filters" aria-label="History pagination">
        {page > 1 && <Link href={`/workspace/history?history_page=${page - 1}`}>← Previous page</Link>}
        <span>Page {page}</span>
        {[applications, payments, audits, shipping].some((r) =>
          r.count !== null && r.count > page * size
        ) && (
          <Link href={`/workspace/history?history_page=${page + 1}`}>Next page →</Link>
        )}
      </nav>
    </>
  );
}
