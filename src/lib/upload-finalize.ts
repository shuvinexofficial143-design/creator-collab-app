import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A failed RPC response is not proof the transaction rolled back. Query the
 * private linked row before retrying an uploaded object.
 * Deletion is now a separate Admin-confirmed, database-fenced operation.
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
  const { table, op, target, path, payload } = options;
  async function isLinked() {
    const { data, error } = await client
      .from(table)
      .select("id")
      .eq("storage_path", path)
      .maybeSingle();
    if (error)
      throw new Error(
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
  throw new Error(
    "The file is uploaded but not yet attached. Use Recover uploaded file; it will not be uploaded twice. Admin cleanup requires a separate preview and authorization.",
  );
}
