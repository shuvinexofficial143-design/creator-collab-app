import { account } from "@/lib/auth";
import { money } from "@/lib/config";
export async function AdminHistory() {
  const { client } = await account(true);
  const [applications, payments, audits, shipping] = await Promise.all([
    client
      .from("applications")
      .select("*,projects(title),profiles(full_name)")
      .neq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("payments")
      .select("*")
      .eq("status", "PAID")
      .order("paid_at", { ascending: false })
      .limit(100),
    client
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("shipping")
      .select("*")
      .in("status", ["DISPATCHED", "DELIVERED"]),
  ]);
  if ([applications, payments, audits, shipping].some((r) => r.error))
    throw Error("History unavailable");
  return (
    <>
      <p>
        Most recent 100 records per history section. Times are displayed in IST.
      </p>
      <h2>Application decisions</h2>
      {applications.data!.map((a) => (
        <article className="panel" key={a.id}>
          <h3>
            {a.projects?.title} · {a.profiles?.full_name}
          </h3>
          <span className="tag">{a.status}</span>
          <p>{a.reason || "Application approved"}</p>
        </article>
      ))}
      <h2>Completed payments</h2>
      {payments.data!.map((p) => (
        <article className="panel" key={p.id}>
          <strong>{money(p.amount_paise)}</strong>
          <p>
            Reference: {p.reference}
            <br />
            Creator: {p.creator_id}
            <br />
            {new Date(p.paid_at).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}
          </p>
        </article>
      ))}
      <h2>Shipment history</h2>
      {shipping.data!.map((s) => (
        <article className="panel" key={s.assignment_id}>
          <span className="tag">{s.status}</span>
          <p>
            {s.courier} · {s.tracking}
          </p>
        </article>
      ))}
      <h2>Audit trail</h2>
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
    </>
  );
}
