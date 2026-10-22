import { Upload } from "tus-js-client";
import type { SupabaseClient } from "@supabase/supabase-js";
export type UploadSession = {
  id: string;
  owner_id: string;
  bucket: "submissions" | "project-media";
  path: string;
  target_id: string;
  mime_type: string;
  byte_size: number;
  state: "OPEN" | "LINKED" | "CLEANUP" | "DELETED";
  payload: { note?: string; caption?: string };
  object_exists?: boolean;
  linked?: boolean;
};
export function storageEndpoint(projectUrl: string) {
  const url = new URL(projectUrl);
  if (
    url.hostname.endsWith(".supabase.co") &&
    !url.hostname.endsWith(".storage.supabase.co")
  )
    url.hostname = url.hostname.replace(".supabase.co", ".storage.supabase.co");
  return new URL("/storage/v1/upload/resumable", url).toString();
}
/** Injecting the TUS constructor makes interruption and credential handling
 * testable without claiming that a fake transport is a hosted Storage test. */
export function transferFile(
  client: SupabaseClient,
  file: File,
  session: UploadSession,
  options: {
    projectUrl: string;
    signal: AbortSignal;
    onProgress: (sent: number, total: number) => void;
  },
  Transport: typeof Upload = Upload,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let heartbeatAt = 0;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      options.signal.removeEventListener("abort", cancel);
      if (error) reject(error);
      else resolve();
    };
    const cancel = () => {
      void upload.abort(false).then(
        () =>
          finish(
            new Error(
              "Upload paused. Select the same file to resume; no new submission was created.",
            ),
          ),
        () =>
          finish(
            new Error(
              "Upload interruption could not be confirmed. Check recovery before starting another file.",
            ),
          ),
      );
    };
    const upload = new Transport(file, {
      endpoint: storageEndpoint(options.projectUrl),
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      storeFingerprintForResuming: true,
      headers: { "x-upsert": "false" },
      metadata: {
        bucketName: session.bucket,
        objectName: session.path,
        contentType: session.mime_type,
        cacheControl: "3600",
      },
      fingerprint: async () =>
        `creator:${new URL(options.projectUrl).origin}:${session.owner_id}:${session.id}`,
      onBeforeRequest: async (request) => {
        if (options.signal.aborted) throw Error("Upload paused");
        const expected = new URL(storageEndpoint(options.projectUrl));
        const destination = new URL(request.getURL());
        if (
          destination.origin !== expected.origin ||
          !destination.pathname.startsWith("/storage/v1/upload/resumable")
        )
          throw Error("Unsafe upload destination");
        const {
          data: { session: auth },
          error,
        } = await client.auth.getSession();
        if (error || !auth)
          throw Error(
            "Session expired. Sign in again, then resume the same file.",
          );
        request.setHeader("authorization", `Bearer ${auth.access_token}`);
        if (Date.now() - heartbeatAt > 60000) {
          const lease = await client.rpc("upload_control", {
            op: "heartbeat",
            session_id: session.id,
          });
          if (lease.error)
            throw Error(
              "Upload lease expired or access changed. Check recovery.",
            );
          heartbeatAt = Date.now();
        }
      },
      onShouldRetry: (error) => {
        const status = error.originalResponse?.getStatus() || 0;
        return (
          !options.signal.aborted &&
          (status === 0 || status === 408 || status === 429 || status >= 500)
        );
      },
      onProgress: options.onProgress,
      onSuccess: () => finish(),
      onError: () =>
        finish(
          new Error(
            "Upload interrupted or rejected. Check your connection and sign-in, then select the same file to resume.",
          ),
        ),
    });
    options.signal.addEventListener("abort", cancel, { once: true });
    if (options.signal.aborted) {
      cancel();
      return;
    }
    void upload
      .findPreviousUploads()
      .then((previous) => {
        if (settled || options.signal.aborted) return;
        const endpoint = new URL(storageEndpoint(options.projectUrl));
        const safe = previous.find((p) => {
          if (!p.uploadUrl) return false;
          try {
            const url = new URL(p.uploadUrl);
            return (
              url.origin === endpoint.origin &&
              url.pathname.startsWith(endpoint.pathname) &&
              p.metadata.objectName === session.path &&
              p.size === file.size
            );
          } catch {
            return false;
          }
        });
        if (safe) upload.resumeFromPreviousUpload(safe);
        upload.start();
      })
      .catch(() =>
        finish(
          new Error(
            "Upload recovery storage is unavailable. Enable browser storage and retry.",
          ),
        ),
      );
  });
}
