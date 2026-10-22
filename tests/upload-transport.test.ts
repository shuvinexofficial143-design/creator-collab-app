import { test } from "node:test";
import assert from "node:assert/strict";
import { Upload, type HttpRequest } from "tus-js-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  transferFile,
  storageEndpoint,
  type UploadSession,
} from "../src/lib/resumable-upload";
import {
  uploadMime,
  matchesSignature,
  inspectFile,
} from "../src/lib/upload-file";
const session: UploadSession = {
  id: "upload-id",
  owner_id: "owner",
  bucket: "submissions",
  path: "owner/assignment/upload",
  target_id: "assignment",
  mime_type: "audio/mpeg",
  byte_size: 20,
  state: "OPEN",
  payload: {},
};
function client(auth = true, lease = true) {
  return {
    auth: {
      getSession: async () => ({
        data: {
          session: auth ? { access_token: "isolated-test-token" } : null,
        },
        error: null,
      }),
    },
    rpc: async () => ({
      data: {},
      error: lease ? null : { message: "denied" },
    }),
  } as unknown as SupabaseClient;
}
test("mobile MIME aliases, size limits and file magic reject misleading extensions", async () => {
  assert.equal(
    uploadMime("record.M4A", "audio/x-m4a", "VOICE", 12),
    "audio/mp4",
  );
  assert.equal(uploadMime("record.wav", "", "VOICE", 12), "audio/wav");
  assert.throws(() => uploadMime("bad.html", "text/html", "VOICE", 20));
  assert.throws(() => uploadMime("fake.mp3", "video/mp4", "VOICE", 20));
  assert.throws(() => uploadMime("big.mp4", "video/mp4", "PRODUCT", 104857601));
  assert.ok(
    matchesSignature(new TextEncoder().encode("RIFFxxxxWAVE"), "audio/wav"),
  );
  assert.ok(
    !matchesSignature(new TextEncoder().encode("<script>"), "audio/mpeg"),
  );
  await assert.rejects(
    inspectFile(
      new File(["not audio"], "fake.mp3", { type: "audio/mpeg" }),
      "VOICE",
    ),
    /contents/,
  );
});
test("resumable transport reports actual byte progress, refreshes credentials and respects no-overwrite", async () => {
  const progress: number[] = [];
  let token = "";
  let retry = false;
  class Fake extends Upload {
    override findPreviousUploads() {
      return Promise.resolve([]);
    }
    override start() {
      const request = {
        getURL: () => storageEndpoint("https://test.supabase.co"),
        setHeader: (key: string, value: string) => {
          if (key === "authorization") token = value;
        },
      } as HttpRequest;
      void Promise.resolve(this.options.onBeforeRequest?.(request)).then(() => {
        assert.equal(this.options.chunkSize, 6291456);
        assert.equal(this.options.headers?.["x-upsert"], "false");
        this.options.onProgress?.(5, 10);
        this.options.onProgress?.(10, 10);
        retry = Boolean(
          this.options.onShouldRetry?.(
            { originalResponse: { getStatus: () => 503 } } as never,
            1,
            this.options,
          ),
        );
        this.options.onSuccess?.({ lastResponse: {} as never });
      });
    }
  }
  await transferFile(
    client(),
    new File(["ID3"], "a.mp3"),
    session,
    {
      projectUrl: "https://test.supabase.co",
      signal: new AbortController().signal,
      onProgress: (n) => progress.push(n),
    },
    Fake,
  );
  assert.deepEqual(progress, [5, 10]);
  assert.equal(token, "Bearer isolated-test-token");
  assert.ok(retry);
});
test("cancel pauses transport without terminating bytes or claiming completion", async () => {
  let aborted = false;
  class Paused extends Upload {
    override findPreviousUploads() {
      return Promise.resolve([]);
    }
    override start() {}
    override async abort(terminate?: boolean) {
      assert.equal(terminate, false);
      aborted = true;
    }
  }
  const controller = new AbortController();
  const task = transferFile(
    client(),
    new File(["ID3"], "a.mp3"),
    session,
    {
      projectUrl: "https://test.supabase.co",
      signal: controller.signal,
      onProgress: () => {},
    },
    Paused,
  );
  controller.abort();
  await assert.rejects(task, /paused/);
  assert.ok(aborted);
});
test("expired sessions and unsafe request URLs never send authorization", async () => {
  for (const unsafe of [false, true]) {
    let sent = false;
    class Rejected extends Upload {
      override findPreviousUploads() {
        return Promise.resolve([]);
      }
      override start() {
        void Promise.resolve(
          this.options.onBeforeRequest?.({
            getURL: () =>
              unsafe
                ? "https://untrusted.example/upload"
                : storageEndpoint("https://test.supabase.co"),
            setHeader: () => {
              sent = true;
            },
          } as unknown as HttpRequest),
        ).then(
          () => assert.fail("request should be rejected"),
          () => this.options.onError?.(new Error("rejected")),
        );
      }
    }
    await assert.rejects(
      transferFile(
        client(false),
        new File(["ID3"], "a.mp3"),
        session,
        {
          projectUrl: "https://test.supabase.co",
          signal: new AbortController().signal,
          onProgress: () => {},
        },
        Rejected,
      ),
      /interrupted or rejected/,
    );
    assert.equal(sent, false);
  }
});
