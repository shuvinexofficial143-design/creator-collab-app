import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { finalizeUploadedMedia } from "../src/lib/upload-finalize";

function mock(
  outcomes: Array<"error" | "ok">,
  linked = false,
  lookupError = false,
  removeError = false,
) {
  let rpcCalls = 0;
  let removeCalls = 0;
  const client = {
    rpc: async () => ({
      error: outcomes[rpcCalls++] === "ok" ? null : { message: "network" },
    }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: linked ? { id: "linked" } : null,
            error: lookupError ? { message: "blocked" } : null,
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        remove: async () => {
          removeCalls++;
          return { error: removeError ? { message: "RLS denied" } : null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { client, stats: () => ({ rpcCalls, removeCalls }) };
}
const options = {
  bucket: "submissions" as const,
  table: "submissions" as const,
  op: "submit" as const,
  target: "assignment-id",
  path: "creator/assignment/upload",
  payload: { storage_path: "creator/assignment/upload" },
};
test("upload finalize retries transient RPC failures without reupload", async () => {
  const { client, stats } = mock(["error", "ok"]);
  await finalizeUploadedMedia(client, options);
  assert.deepEqual(stats(), { rpcCalls: 2, removeCalls: 0 });
});
test("uncertain RPC result is accepted when the linked row exists", async () => {
  const { client, stats } = mock(["error"], true);
  await finalizeUploadedMedia(client, options);
  assert.deepEqual(stats(), { rpcCalls: 1, removeCalls: 0 });
});
test("failed attachments retain bytes for explicit recovery and authorized cleanup", async () => {
  const { client, stats } = mock(["error", "error"]);
  await assert.rejects(
    finalizeUploadedMedia(client, options),
    /not yet attached/,
  );
  assert.deepEqual(stats(), { rpcCalls: 2, removeCalls: 0 });
});
test("an unknown database state is not treated as safe for deletion", async () => {
  const { client, stats } = mock(["error"], false, true);
  await assert.rejects(
    finalizeUploadedMedia(client, options),
    /status cannot be verified/,
  );
  assert.deepEqual(stats(), { rpcCalls: 1, removeCalls: 0 });
});
test("finalize never invokes deletion even if Storage removal would fail", async () => {
  const { client, stats } = mock(["error", "error"], false, false, true);
  await assert.rejects(
    finalizeUploadedMedia(client, options),
    /not yet attached/,
  );
  assert.deepEqual(stats(), { rpcCalls: 2, removeCalls: 0 });
});
