import { account } from "@/lib/auth";
import { ActionForm, type Result } from "./action-form";
import { cleanupCandidate, type CleanupCandidate } from "@/lib/cleanup";
import { revalidatePath } from "next/cache";
import { z } from "zod";
const cleanupInput = z.object({
  object_id: z.uuid(),
  bucket: z.enum(["submissions", "project-media"]),
  path: z.string().min(1).max(1024),
  confirmation: z.literal("DELETE UNREFERENCED FILE"),
});
async function removeCandidate(_: Result, form: FormData): Promise<Result> {
  "use server";
  const { client } = await account(true);
  const parsed = cleanupInput.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      error: "Tick the confirmation before deleting this unreferenced file.",
    };
  try {
    await cleanupCandidate(client, parsed.data, parsed.data.confirmation);
    revalidatePath("/workspace/cleanup");
    return { success: "Storage deletion confirmed and audited." };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Cleanup could not be confirmed.",
    };
  }
}
export async function CleanupPanel() {
  const { client } = await account(true);
  const { data, error } = await client.rpc("upload_control", { op: "preview" });
  if (error) throw Error("Cleanup preview unavailable");
  const candidates = (data || []) as CleanupCandidate[];
  const history = await client
    .from("upload_sessions")
    .select("id,state,updated_at,last_error,attempts")
    .in("state", ["CLEANUP", "DELETED"])
    .order("updated_at", { ascending: false })
    .limit(25);
  if (history.error) throw Error("Cleanup history unavailable");
  return (
    <>
      <p>
        Preview only. Files must be unreferenced, unchanged for at least 24
        hours, and have no recently active upload lease. Each deletion is
        rechecked in the database and recorded in the audit trail.
      </p>
      <p>
        Up to 100 candidates are listed per preview. Refresh after deleting a
        batch. There is no automatic scheduled deletion.
      </p>
      {!candidates.length && (
        <div className="empty">No abandoned files eligible for cleanup.</div>
      )}
      {candidates.map((c) => (
        <article className="panel" key={c.object_id}>
          <span className="tag">{c.bucket}</span>
          <p className="pre">{c.path}</p>
          <p>
            Created{" "}
            {new Date(c.created_at).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}{" "}
            IST · Attempts: {c.attempts || 0}
          </p>
          {c.last_error && <p role="alert">{c.last_error}</p>}
          <ActionForm
            action={removeCandidate}
            label="Delete this unreferenced file"
          >
            <input type="hidden" name="object_id" value={c.object_id} />
            <input type="hidden" name="bucket" value={c.bucket} />
            <input type="hidden" name="path" value={c.path} />
            <label className="check">
              <input
                type="checkbox"
                name="confirmation"
                value="DELETE UNREFERENCED FILE"
                required
              />
              I reviewed this candidate and authorize permanent deletion.
            </label>
          </ActionForm>
        </article>
      ))}
      <h2>Recent cleanup attempts</h2>
      {history.data.map((row) => (
        <article key={row.id} className="panel">
          <span className="tag">{row.state}</span>
          <p>
            {row.last_error || "Storage removal confirmed"} · Attempts:{" "}
            {row.attempts}
          </p>
        </article>
      ))}
    </>
  );
}
