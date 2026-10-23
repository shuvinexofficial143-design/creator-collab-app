import type { SupabaseClient } from "@supabase/supabase-js";
export type CleanupCandidate = {
  object_id: string;
  bucket: "submissions" | "project-media";
  path: string;
  created_at: string;
  session_id: string | null;
  state: string | null;
  last_error: string | null;
  attempts: number | null;
};
/** Claim fences attachment before the network call; a crash leaves a retryable
 * tombstone, never a path that may be silently reused. No service key needed. */
export async function cleanupCandidate(
  client: SupabaseClient,
  candidate: Pick<CleanupCandidate, "object_id" | "bucket" | "path">,
  confirmation: string,
) {
  const { data: claim, error } = await client.rpc("upload_control", {
    op: "claim",
    payload: { ...candidate, confirmation },
  });
  if (error || !claim)
    throw Error(
      "This file is no longer eligible, or cleanup was not authorized. Refresh the preview.",
    );
  try {
    await client.storage.from(candidate.bucket).remove([candidate.path]);
  } catch {
    /* Reconcile ambiguous network results using database metadata below. */
  }
  const result = await client.rpc("upload_control", {
    op: "cleanup_result",
    session_id: claim.id,
    payload: { claim_id: claim.claim_id },
  });
  if (result.error)
    throw Error(
      "Cleanup outcome is unknown. The path remains fenced; retry from the Admin preview.",
    );
  if (!result.data?.deleted)
    throw Error(
      "Storage removal was not confirmed. The file remains protected against reuse; retry cleanup.",
    );
  return { deleted: true };
}
