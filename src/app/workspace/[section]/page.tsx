import {CleanupPanel} from "@/components/cleanup-panel";
import { pendingApplications, pendingSubmissions } from "@/lib/admin-search";
import { findProjects } from "@/lib/project-search";
import { sampleProject } from "@/lib/samples";
import { AdminHistory } from "@/components/admin-history";
import Link from "next/link";
import { notFound } from "next/navigation";
import { account } from "@/lib/auth";
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
  notifications: "Your updates",
  profile: "Your profile",
  admin: "Manage your collaborations",
};
export default async function Section({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ kind?: string; project_search?: string; project_status?: string; project_page?: string; history_page?: string; admin_search?: string; admin_page?: string; app_page?: string; review_page?: string }>;
}) {
  const { section } = await params;
  if (!titles[section]) notFound();
  const { client, profile, user } = await account(
    ["admin", "history", "cleanup"].includes(section),
  );
  const { kind, project_search, project_status, project_page, history_page, admin_search, admin_page, app_page, review_page } = await searchParams;
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
    const kindFilter = kind === "PRODUCT" || kind === "VOICE" ? kind : "ALL";
    const statusFilter = profile.role === "ADMIN" && ["DRAFT","PUBLISHED","CLOSED","ARCHIVED"].includes(project_status || "")
      ? project_status! : "ALL";
    const phrase = String(project_search || "").trim().slice(0, 80);
    const page = project_page && /^[1-9][0-9]{0,2}$/.test(project_page) ? Number(project_page) : 1;
    const data = await findProjects(client,{kind:kindFilter,status:statusFilter,search:phrase,page});
    const pageUrl = (number:number) => {
      const query = new URLSearchParams();
      if (kindFilter !== "ALL") query.set("kind",kindFilter);
      if (statusFilter !== "ALL") query.set("project_status",statusFilter);
      if (phrase) query.set("project_search",phrase);
      query.set("project_page",String(number));
      return `/workspace/projects?${query.toString()}`;
    };
    return (
      <>
        {heading}
        <p>Explore available collaborations with a clear brief. Search covers all projects your account is allowed to see.</p>
        <form action="/workspace/projects" method="get" className="panel">
          <div className="grid three">
            <label>
              Search projects
              <input name="project_search" defaultValue={phrase} maxLength={80}
                placeholder="Project title, description or language" />
            </label>
            <label>
              Project type
              <select name="kind" defaultValue={kindFilter}>
                <option value="ALL">All types</option>
                <option value="PRODUCT">Product videos</option>
                <option value="VOICE">Voice overs</option>
              </select>
            </label>
            {profile.role === "ADMIN" && <label>
              Project status
              <select name="project_status" defaultValue={statusFilter}>
                <option value="ALL">All statuses</option>
                {["DRAFT","PUBLISHED","CLOSED","ARCHIVED"].map((value)=>
                  <option key={value} value={value}>{value}</option>)}
              </select>
            </label>}
          </div>
          <div className="row">
            <button type="submit">Search projects</button>
            <Link className="textlink" href="/workspace/projects">Clear filters</Link>
          </div>
        </form>
        <p>{data.total} matching project(s) · Page {page}</p>
        <div className="grid two">
          {data.items.map((p) => (
            <article className="panel project" key={p.id}>
              <span className="tag">
                {p.kind === "VOICE" ? "VOICE OVER" : "PRODUCT VIDEO"} · {p.status}
              </span>
              <h2>{p.title}</h2>
              <p>{p.description.slice(0, 180)}</p>
              <div className="row">
                                <Link className="textlink" href={`/workspace/projects/${p.id}`}>View brief ↗</Link>
              </div>
            </article>
          ))}
        </div>
        {!data.items.length && <Empty text="No matching projects found. Try another search or filter." />}
        <nav className="filters" aria-label="Project results pages">
          {page > 1 && <Link href={pageUrl(page-1)}>← Previous projects</Link>}
          <span>Page {page} · {data.total} matching projects</span>
          {page*20 < data.total && <Link href={pageUrl(page+1)}>Next projects →</Link>}
        </nav>
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
          <Empty text="Your project updates will appear here." />
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
  const parsePage = (value?: string) => value && /^[1-9][0-9]{0,2}$/.test(value) ? Number(value) : 1;
  const adminPage = parsePage(admin_page);
  const appPage = parsePage(app_page);
  const reviewPage = parsePage(review_page);
  const adminPageSize = 50;
  const adminStart = (adminPage - 1) * adminPageSize;
  const search = String(admin_search || "").trim().slice(0,80);
  const searchSuffix = search ? `&admin_search=${encodeURIComponent(search)}` : "";
  const [metrics, applications, submissions, results] = await Promise.all([
    readWorkspaceMetrics(client),
    pendingApplications(client,search,appPage),
    pendingSubmissions(client,search,reviewPage),
    Promise.all([
      client.from("profiles").select("id,full_name,role,active",{count:"exact"}).order("created_at",{ascending:false}).range(adminStart,adminStart+adminPageSize-1),
      client.from("shipping").select("*",{count:"exact"}).eq("status","READY").order("assignment_id",{ascending:false}).range(adminStart,adminStart+adminPageSize-1),
      client.from("assignments").select("id,status,delivery_deadline,projects(title)",{count:"exact"}).neq("status","APPROVED").order("created_at",{ascending:false}).range(adminStart,adminStart+adminPageSize-1),
    ]),
  ]);
  if (results.some((r)=>r.error)) throw Error("Admin records unavailable");
  const [creators,shipping,deadlines]=results;
  return (
    <>
      {heading}
      <p>Review applications, manage briefs and approve completed work.</p>
      <p className="subtle">Dashboard totals include all authorized records. Applications and reviews search the entire database on separate pages. Other queues display 50 entries per page.</p>
      <div className="grid three">
        <Stat label="Pending applications" value={metrics.pending_applications} />
        <Stat label="Awaiting review" value={metrics.awaiting_review} />
        <Stat label="Active assignments" value={metrics.active_assignments} />
      </div>
      <details className="panel">
        <summary>Create a project</summary>
        <ProjectForm />
      </details>
      <details className="panel">
        <summary>Sample project templates (drafts only)</summary>
        <p>
          These are labeled sample briefs only. Review the instructions before publishing.
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
      {applications.items.map((a) => (
        <article className="panel" key={a.id}>
          <h3>
            {a.project_title} · {a.creator_name || "Creator"}
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
      {!applications.items.length && <Empty text={search ? "No matching pending applications." : "No pending applications."} />}
      <nav className="filters" aria-label="Search application pages">
        {appPage > 1 && <Link href={`/workspace/admin?app_page=${appPage-1}${searchSuffix}`}>← Previous applications</Link>}
        <span>{applications.total} matching applications · Page {appPage}</span>
        {appPage*25 < applications.total && <Link href={`/workspace/admin?app_page=${appPage+1}${searchSuffix}`}>Next applications →</Link>}
      </nav>
      <h2>Work awaiting review</h2>
      {await Promise.all(
        submissions.items.map(async (s) => {
          const { data } = await client.storage
            .from("submissions")
            .createSignedUrl(s.storage_path, 300);
          const mediaKind = s.media_kind;
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
      {!submissions.items.length && <Empty text={search ? "No matching submissions." : "No submissions awaiting review."} />}
      <nav className="filters" aria-label="Search review pages">
        {reviewPage > 1 && <Link href={`/workspace/admin?review_page=${reviewPage-1}${searchSuffix}`}>← Previous reviews</Link>}
        <span>{submissions.total} matching reviews · Page {reviewPage}</span>
        {reviewPage*25 < submissions.total && <Link href={`/workspace/admin?review_page=${reviewPage+1}${searchSuffix}`}>Next reviews →</Link>}
      </nav>
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
        Enter an explicitly agreed new IST deadline.
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
              New delivery deadline (IST)
              <input name="deadline" type="datetime-local" required />
            </label>
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
      <nav className="filters" aria-label="Admin queue navigation">
        {adminPage > 1 && <Link href={`/workspace/admin?admin_page=${adminPage - 1}${searchSuffix}`}>← Previous</Link>}
        <span>Operational queues page {adminPage} · {creators.count ?? "—"} user account(s)</span>
        {results.some((r) => r.count !== null && r.count > adminPage * adminPageSize) && (
          <Link href={`/workspace/admin?admin_page=${adminPage + 1}${searchSuffix}`}>Next →</Link>
        )}
      </nav>
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
