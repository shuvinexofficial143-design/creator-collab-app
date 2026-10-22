import Image from "next/image";
import { MediaUpload } from "@/components/media-upload";
import { notFound } from "next/navigation";
import { account } from "@/lib/auth";
import { money } from "@/lib/config";
import { uuid } from "@/lib/validation";
import { ActionForm } from "@/components/action-form";
import { ProjectForm } from "@/components/project-form";
import { Upload } from "@/components/upload";
import { mutate } from "../../actions";
export default async function Project({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const { client, profile, user } = await account();
  const { data: p, error } = await client
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw Error("Project unavailable");
  if (!p) notFound();
  const admin = profile.role === "ADMIN";
  const { data: w } = await client
    .from("assignments")
    .select("*")
    .eq("project_id", id)
    .eq("creator_id", user.id)
    .maybeSingle();
  const { data: a } = await client
    .from("applications")
    .select("*")
    .eq("project_id", id)
    .eq("creator_id", user.id)
    .maybeSingle();
  const { data: script } = await client
    .from("project_scripts")
    .select("script")
    .eq("project_id", id)
    .maybeSingle();
  const shipping = w
    ? (
        await client
          .from("shipping")
          .select("*")
          .eq("assignment_id", w.id)
          .maybeSingle()
      ).data
    : null;
  const submissions = w
    ? (
        await client
          .from("submissions")
          .select("*")
          .eq("assignment_id", w.id)
          .order("created_at", { ascending: false })
      ).data
    : [];
  const { data: media } = await client
    .from("project_media")
    .select("*")
    .eq("project_id", id);
  return (
    <>
      <span className="tag">
        {p.kind} · {p.status}
      </span>
      <h1>{p.title}</h1>
      <div className="grid two">
        <article className="panel">
          <h2>The brief</h2>
          <p className="pre">{p.description}</p>
          <h3>Recording instructions</h3>
          <p className="pre">
            {p.instructions || "Follow the project description."}
          </p>
          {p.details && (
            <>
              <h3>Project details</h3>
              <p>
                {p.details.category} · {p.details.duration_seconds || "—"}{" "}
                seconds · {p.details.revision_limit ?? "—"} included revisions
              </p>
              {p.kind === "VOICE" && (
                <p>
                  {p.details.voice_tone} · {p.details.audio_format}
                </p>
              )}
              {p.details.delivery_deadline && (
                <p>
                  Delivery:{" "}
                  {new Date(p.details.delivery_deadline).toLocaleString(
                    "en-IN",
                    { timeZone: "Asia/Kolkata" },
                  )}{" "}
                  IST
                </p>
              )}
              {p.details.reference_url &&
                /^https?:\/\//i.test(p.details.reference_url) && (
                  <a
                    className="textlink"
                    href={p.details.reference_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Reference / example ↗
                  </a>
                )}
            </>
          )}
          <h3>Usage & revision terms</h3>
          <p className="pre">{p.usage_terms}</p>
        </article>
        <article className="panel">
          <span className="eyebrow">PROJECT PAYMENT</span>
          <h2>{money(w?.payment_paise ?? p.payment_paise)}</h2>
          <p>
            {p.capacity} creator slot(s) · {p.language}
          </p>
          <p>
            Applications close:{" "}
            {new Date(p.deadline).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}{" "}
            IST
          </p>
          {!admin &&
            !a &&
            p.status === "PUBLISHED" &&
            new Date(p.deadline) > new Date() && (
              <ActionForm
                action={mutate.bind(null, "apply")}
                label="Apply to this project"
              >
                <input type="hidden" name="target" value={id} />
                <label>
                  Tell us why you’re a good fit
                  <textarea
                    name="note"
                    required
                    minLength={10}
                    maxLength={2000}
                  />
                </label>
                <small>
                  By applying, you accept the brief and usage terms shown here.
                </small>
              </ActionForm>
            )}
          {a && (
            <>
              <span className="tag">Application: {a.status}</span>
              <p>{a.reason}</p>
            </>
          )}
        </article>
      </div>
      {!!media?.length && (
        <div className="grid two">
          {await Promise.all(
            media.map(async (m) => {
              const { data } = await client.storage
                .from("project-media")
                .createSignedUrl(m.storage_path, 300);
              return data ? (
                <article className="panel" key={m.id}>
                  {m.mime_type.startsWith("image/") ? (
                    <Image
                      src={data.signedUrl}
                      alt={m.caption || p.title}
                      width={800}
                      height={600}
                      unoptimized
                      style={{
                        width: "100%",
                        height: "auto",
                        borderRadius: 10,
                      }}
                    />
                  ) : m.mime_type.startsWith("audio/") ? (
                    <audio controls src={data.signedUrl} />
                  ) : (
                    <video controls preload="metadata" src={data.signedUrl} />
                  )}
                  <p>{m.caption}</p>
                </article>
              ) : null;
            }),
          )}
        </div>
      )}
      {admin && (
        <details className="panel">
          <summary>Manage project media</summary>
          <MediaUpload project={id} />
        </details>
      )}
      {admin && (
        <details className="panel">
          <summary>Edit project</summary>
          <ProjectForm project={p} script={script?.script || ""} />
        </details>
      )}
      {w && (
        <>
          <h2>
            Your assignment <span className="tag">{w.status}</span>
          </h2>
          {script?.script && (
            <article className="panel">
              <h3>Your assigned script</h3>
              <p className="pre">{script.script}</p>
            </article>
          )}
          {shipping && (
            <article className="panel">
              <h3>Shipping · {shipping.status}</h3>
              {["ADDRESS_REQUIRED", "READY"].includes(shipping.status) && (
                <ActionForm
                  action={mutate.bind(null, "address")}
                  label="Save delivery details"
                >
                  <input type="hidden" name="target" value={w.id} />
                  <label>
                    Recipient, phone and full delivery address
                    <textarea
                      name="address"
                      required
                      minLength={15}
                      maxLength={2000}
                      defaultValue={shipping.address}
                    />
                  </label>
                  <small>Visible only to you and the Admin.</small>
                </ActionForm>
              )}
              {shipping.courier && (
                <p>
                  {shipping.courier} · Tracking: {shipping.tracking}
                </p>
              )}
              {shipping.status === "DISPATCHED" && (
                <ActionForm
                  action={mutate.bind(null, "delivered")}
                  label="Confirm product received"
                >
                  <input type="hidden" name="target" value={w.id} />
                </ActionForm>
              )}
            </article>
          )}
          {["ACTIVE", "REVISION"].includes(w.status) && (
            <article className="panel">
              <h3>Submit your {p.kind === "VOICE" ? "recording" : "video"}</h3>
              <Upload assignment={w.id} kind={p.kind} />
            </article>
          )}
          {await Promise.all(
            (submissions || []).map(async (s) => {
              const { data } = await client.storage
                .from("submissions")
                .createSignedUrl(s.storage_path, 300);
              return (
                <article key={s.id} className="panel">
                  <span className="tag">{s.status}</span>
                  <p>{s.review || "Awaiting review"}</p>
                  {data &&
                    (p.kind === "VOICE" ? (
                      <audio controls src={data.signedUrl} />
                    ) : (
                      <video controls preload="metadata" src={data.signedUrl} />
                    ))}
                </article>
              );
            }),
          )}
        </>
      )}
    </>
  );
}
