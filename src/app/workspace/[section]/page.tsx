import {CleanupPanel} from "@/components/cleanup-panel";
import { projectKindFromSubmission } from "@/lib/submission-media";
import { sampleProject } from "@/lib/samples";
import { AdminHistory } from "@/components/admin-history";
import Link from "next/link";
import { notFound } from "next/navigation";
import { account } from "@/lib/auth";
import { money } from "@/lib/config";
import { readWorkspaceMetrics } from "@/lib/workspace-metrics";
import { ActionForm } from "@/components/action-form";
import { ProjectForm } from "@/components/project-form";
import { mutate } from "../actions";
const titles: Record<string, string> = {
  history: "Operations history",
  cleanup: "Review abandoned uploads",
  projects: "Find your next collaboration",
  applications: "Your applications",
  work: "Your creative work",
  earnings: "Earnings & payments",
  notifications: "Your updates",
  profile: "Your profile",
  admin: "Manage your collaborations",
};
export default async function Section({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ kind?: string; history_page?: string; admin_search?: string; earnings_page?: string }>;
}) {
  const { section } = await params;
  if (!titles[section]) notFound();
  const { client, profile, user } = await account(
    ["admin", "history", "cleanup"].includes(section),
  );
  const { kind, history_page, admin_search, earnings_page } = await searchParams;
  const heading = (
    <>
      <span className="eyebrow">CREATOR COLLABORATION</span>
      <h1>{titles[section]}</h1>
    </>
  );
  if (section === "cleanup") return <>{heading}<CleanupPanel/></>;
  if (section === "history")
    return (
      <>
        {heading}
        <AdminHistory page={history_page && /^[1-9][0-9]{0,2}$/.test(history_page) ? Number(history_page) : 1} />
      </>
    );
  if (section === "profile")
    return (
      <>
        {heading}
        <div className="panel">
          <p>{user.email}</p>
          <ActionForm action={mutate.bind(null, "profile")}>
            <label>
              Full name
              <input
                name="full_name"
                required
                maxLength={120}
                defaultValue={profile.full_name}
              />
            </label>
          </ActionForm>
        </div>
      </>
    );
  if (section === "projects") {
    let query = client
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (kind === "PRODUCT" || kind === "VOICE") query = query.eq("kind", kind);
    const { data, error } = await query;
    if (error) throw Error("Projects unavailable");
    return (
      <>
        {heading}
        <p>Clear briefs, transparent payments, personal approval.</p>
        <div className="filters">
          <Link href="/workspace/projects">All projects</Link>
          <Link href="?kind=PRODUCT">Product videos</Link>
          <Link href="?kind=VOICE">Voice overs</Link>
        </div>
        <div className="grid two">
          {data.map((p) => (
            <article className="panel project" key={p.id}>
              <span className="tag">
                {p.kind === "VOICE" ? "VOICE OVER" : "PRODUCT VIDEO"} ·{" "}
                {p.status}
              </span>
              <h2>{p.title}</h2>
              <p>{p.description.slice(0, 180)}</p>
              <div className="row">
                <strong>{money(p.payment_paise)}</strong>
                <Link className="textlink" href={`/workspace/projects/${p.id}`}>
                  View brief ↗
                </Link>
              </div>
            </article>
          ))}
        </div>
        {!data.length && (
          <Empty text="No projects available yet. Check back when a new brief is published." />
        )}
      </>
    );
  }
  if (section === "notifications") {
    const { data, error } = await client
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw Error("Updates unavailable");
    return (
      <>
        {heading}
        {data.map((n) => (
          <article className="panel" key={n.id}>
            <strong>{n.message}</strong>
            {!n.read_at && (
              <ActionForm
                action={mutate.bind(null, "read_notification")}
                label="Mark as read"
              >
                <input type="hidden" name="target" value={n.id} />
              </ActionForm>
            )}
            <p>{new Date(n.created_at).toLocaleString("en-IN")}</p>
          </article>
        ))}
        {!data.length && (
          <Empty text="Your project and payment updates will appear here." />
        )}
      </>
    );
  }
  if (section === "applications") {
    const { data, error } = await client
      .from("applications")
      .select("*,projects(title)")
      .order("created_at", { ascending: false });
    if (error) throw Error("Applications unavailable");
    return (
      <>
        {heading}
        {data.map((a) => (
          <article className="panel" key={a.id}>
            <span className="tag">{a.status}</span>
            <h2>{a.projects?.title}</h2>
            <p>{a.note}</p>
            {a.reason && <p>Feedback: {a.reason}</p>}
          </article>
        ))}
        {!data.length && (
          <Empty text="You haven’t applied yet. Explore projects to find your first collaboration." />
        )}
      </>
    );
  }
  if (section === "work") {
    const { data, error } = await client
      .from("assignments")
      .select("*,projects(title)")
      .order("created_at", { ascending: false });
    if (error) throw Error("Assignments unavailable");
    return (
      <>
        {heading}
        {data.map((a) => (
          <article className="panel row" key={a.id}>
            <div>
              <span className="tag">{a.status}</span>
              <h2>{a.projects?.title}</h2>
              <p>Agreed payment: {money(a.payment_paise)}</p>
            </div>
            <Link
              className="button"
              href={`/workspace/projects/${a.project_id}`}
            >
              Open assignment
            </Link>
          </article>
        ))}
        {!data.length && (
          <Empty text="Approved assignments will appear here with your script, shipping and upload options." />
        )}
      </>
    );
  }
  if (section === "earnings") {
    const metrics = await readWorkspaceMetrics(client);
    const page = earnings_page && /^[1-9][0-9]{0,2}$/.test(earnings_page)
      ? Number(earnings_page) : 1;
    const pageSize = 25;
    const { data, error } = await client
      .from("payments")
      .select("*")
      .order("id", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw Error("Payments unavailable");
    return (
      <>
        {heading}
        <p>
          Actual transfers happen manually outside this app. A payment is marked
          paid only after an Admin records it. Totals include all authorized
          payment records, not just the visible page.
        </p>
        <div className="grid three">
          {[
            ["Approved earnings", metrics.approved_earnings_paise],
            ["Pending payment", metrics.pending_earnings_paise],
            ["Actually paid", metrics.paid_earnings_paise],
          ].map(([label, amount]) => (
            <article className="panel stat" key={String(label)}>
              <span>{String(label)}</span>
              <strong>{money(Number(amount))}</strong>
            </article>
          ))}
        </div>
        {data.map((p) => (
          <article className="panel row" key={p.id}>
            <strong>{money(p.amount_paise)}</strong>
            <span className="tag">{p.status}</span>
            <span>
              {p.reference || "Awaiting transfer"}
              {p.paid_at && ` · ${new Date(p.paid_at).toLocaleDateString("en-IN")}`}
            </span>
          </article>
        ))}
        {!metrics.payable_count && (
          <Empty text="No approved earnings yet. They appear after your work is approved." />
        )}
        <nav className="filters" aria-label="Earnings history pages">
          {page > 1 && <Link href={`/workspace/earnings?earnings_page=${page - 1}`}>← Previous</Link>}
          <span>Page {page} · {metrics.payable_count} total records</span>
          {page * pageSize < metrics.payable_count && (
            <Link href={`/workspace/earnings?earnings_page=${page + 1}`}>Next →</Link>
          )}
        </nav>
      </>
    );
  }
  const [metrics, results] = await Promise.all([readWorkspaceMetrics(client), Promise.all([
    client
      .from("applications")
      .select("*,projects(title),profiles(full_name)")
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(50),
    client.from("payments").select("*").neq("status", "PAID").order("id", { ascending: false }).limit(50),
    client.from("profiles").select("id,full_name,role,active").order("created_at", { ascending: false }).limit(50),
    client.from("submissions").select("*,assignments(projects(kind))").eq("status", "SUBMITTED").order("created_at", { ascending: false }).limit(50),
    client.from("shipping").select("*").eq("status", "READY").order("assignment_id", { ascending: false }).limit(50),
    client.from("assignments")
      .select("id,status,delivery_deadline,projects(title)")
      .neq("status", "APPROVED")
      .order("created_at", { ascending: false })
      .limit(50),
  ])]);
  if (results.some((r) => r.error)) throw Error("Admin records unavailable");
  const [applications, payments, creators, submissions, shipping, deadlines] = results;
  const search = String(admin_search || "").trim().toLowerCase().slice(0, 80);
  const filteredApplications = applications.data!.filter((a) =>
    !search || [a.note, a.projects?.title, a.profiles?.full_name]
      .some((value) => String(value || "").toLowerCase().includes(search)),
  );
  const filteredSubmissions = submissions.data!.filter((s) =>
    !search || String(s.note || "").toLowerCase().includes(search),
  );
  return (
    <>
      {heading}
      <p>Review applications, manage briefs, and record completed transfers.</p>
      <p className="subtle">Dashboard totals count all authorized records. Work queues show only their 50 newest entries.</p>
      <div className="grid three">
        <Stat label="Pending applications" value={metrics.pending_applications} />
        <Stat label="Awaiting review" value={metrics.awaiting_review} />
        <Stat label="Outstanding payments" value={metrics.outstanding_payments} />
      </div>
      <details className="panel">
        <summary>Create a project</summary>
        <ProjectForm />
      </details>
      <details className="panel">
        <summary>Sample project templates (drafts only)</summary>
        <p>
          These are clearly labeled examples. No earnings, users or payments are
          generated. Review and replace sample terms before publishing.
        </p>
        {(["birthday", "unboxing", "voice"] as const).map((kind) => (
          <details className="panel" key={kind}>
            <summary>{sampleProject(kind).title}</summary>
            <ProjectForm
              project={sampleProject(kind)}
              script={
                kind === "voice"
                  ? "नमस्कार! यह केवल एक SAMPLE voice over script है। असली काम के लिए इसे बदलें।"
                  : ""
              }
            />
          </details>
        ))}
      </details>
      <form action="/workspace/admin" className="filters" method="get">
        <label>
          Search applications and submission notes
          <input name="admin_search" maxLength={80} defaultValue={admin_search || ""} placeholder="Creator, project or note" />
        </label>
        <button type="submit">Search</button>
        <Link href="/workspace/admin">Clear</Link>
      </form>
      <h2>Incoming applications</h2>
      {filteredApplications.map((a) => (
        <article className="panel" key={a.id}>
          <h3>
            {a.projects?.title} · {a.profiles?.full_name || "Creator"}
          </h3>
          <p>{a.note}</p>
          <ActionForm
            action={mutate.bind(null, "decision")}
            label="Save decision"
          >
            <input type="hidden" name="target" value={a.id} />
            <label>
              Decision
              <select name="status">
                <option>APPROVED</option>
                <option>REJECTED</option>
              </select>
            </label>
            <label>
              Reason / feedback
              <textarea name="reason" maxLength={2000} />
            </label>
          </ActionForm>
        </article>
      ))}
      {!filteredApplications.length && <Empty text={search ? "No matching pending applications." : "No pending applications."} />}
      <h2>Work awaiting review</h2>
      {await Promise.all(
        filteredSubmissions.map(async (s) => {
          const { data } = await client.storage
            .from("submissions")
            .createSignedUrl(s.storage_path, 300);
          const mediaKind = projectKindFromSubmission(s.assignments);
          return (
            <article key={s.id} className="panel">
              <p>{s.note || "New submission"}</p>
              {data && (
                <>
                  {mediaKind === "VOICE" ? (
                    <audio controls preload="metadata" src={data.signedUrl} />
                  ) : mediaKind === "PRODUCT" ? (
                    <video playsInline controls preload="metadata" src={data.signedUrl} />
                  ) : (
                    <p role="status">Media type unavailable. Use the signed original link below.</p>
                  )}
                  <a href={data.signedUrl} target="_blank" rel="noreferrer">
                    Open original audio / video (5-minute link)
                  </a>
                </>
              )}
              <ActionForm
                action={mutate.bind(null, "review")}
                label="Submit review"
              >
                <input type="hidden" name="target" value={s.id} />
                <label>
                  Decision
                  <select name="status">
                    <option>APPROVED</option>
                    <option>REVISION</option>
                  </select>
                </label>
                <label>
                  Feedback
                  <textarea name="reason" maxLength={5000} />
                </label>
              </ActionForm>
            </article>
          );
        }),
      )}
      <h2>Ready for dispatch</h2>
      {shipping.data!.map((s) => (
        <article key={s.assignment_id} className="panel">
          <p className="pre">{s.address}</p>
          <ActionForm
            action={mutate.bind(null, "dispatch")}
            label="Record dispatch"
          >
            <input type="hidden" name="target" value={s.assignment_id} />
            <label>
              Courier
              <input name="courier" required minLength={2} />
            </label>
            <label>
              Tracking number
              <input name="tracking" required minLength={2} />
            </label>
          </ActionForm>
        </article>
      ))}
      <h2>Assignment delivery deadlines</h2>
      <p className="subtle">
        Extensions are recorded in the audit trail and notify the creator.
        Enter an explicitly agreed new UTC deadline.
      </p>
      {deadlines.data!.map((a) => (
        <article className="panel" key={a.id}>
          <strong>{a.projects?.[0]?.title || "Assigned project"}</strong>
          <p>
            {a.status} · Current deadline:{" "}
            {a.delivery_deadline
              ? new Date(a.delivery_deadline).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST"
              : "Not yet set (legacy assignment)"}
          </p>
          <ActionForm
            action={mutate.bind(null, "extend_deadline")}
            label="Extend deadline"
          >
            <input type="hidden" name="target" value={a.id} />
            <label>
              New delivery deadline (UTC)
              <input name="deadline" type="datetime-local" required />
            </label>
          </ActionForm>
        </article>
      ))}
      <h2>Outstanding payments</h2>
      {payments.data!.map((p) => (
        <article className="panel" key={p.id}>
          <h3>
            {money(p.amount_paise)} · {p.status}
          </h3>
          <p>Creator ID: {p.creator_id}</p>
          <ActionForm
            action={mutate.bind(null, "payment")}
            label="Record payment status"
          >
            <input type="hidden" name="target" value={p.id} />
            <label>
              Status
              <select name="status">
                <option>PROCESSING</option>
                <option>PAID</option>
              </select>
            </label>
            <label>
              Actual UPI / bank transaction reference
              <input name="reference" maxLength={200} />
            </label>
            <p className="subtle">
              Choose PAID only after the actual transfer. A reference is
              required.
            </p>
          </ActionForm>
        </article>
      ))}
      <h2>Creators</h2>
      {creators.data!.map((c) => (
        <div key={c.id} className="panel row">
          <strong>{c.full_name || "Unnamed account"}</strong>
          <span>
            {c.role} · {c.active ? "Active" : "Inactive"}
          </span>
          {c.role === "CREATOR" && (
            <ActionForm
              action={mutate.bind(null, "creator_status")}
              label={c.active ? "Suspend account" : "Reactivate account"}
            >
              <input type="hidden" name="target" value={c.id} />
              <input type="hidden" name="active" value={String(!c.active)} />
            </ActionForm>
          )}
        </div>
      ))}
    </>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <span>◈</span>
      <p>{text}</p>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <article className="panel stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
