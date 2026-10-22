import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A failed RPC response is not proof the transaction rolled back. Query the
 * private linked row before retrying or deleting an uploaded object.
 * Only unattached files may be deleted (enforced again by Storage RLS).
 */
export async function finalizeUploadedMedia(
  client: SupabaseClient,
  options: {
    bucket: "submissions" | "project-media";
    table: "submissions" | "project_media";
    op: "submit" | "media";
    target: string;
    path: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { bucket, table, op, target, path, payload } = options;
  async function isLinked() {
    const { data, error } = await client
      .from(table)
      .select("id")
      .eq("storage_path", path)
      .maybeSingle();
    if (error) throw new Error(
      "Upload status cannot be verified. Do not upload again; contact the Admin.",
    );
    return Boolean(data);
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await client.rpc("workflow", { op, target, payload });
      if (!error) return;
    } catch {
      // Network failure may happen after the database transaction commits.
    }
    if (await isLinked()) return;
  }
  const { error: cleanupError } = await client.storage.from(bucket).remove([path]);
  if (cleanupError) {
    if (await isLinked()) return;
    throw new Error(
      "Upload was not attached and cleanup could not be confirmed. Contact the Admin.",
    );
  }
  throw new Error("Submission could not be saved. The unused upload was removed; please retry.");
}
