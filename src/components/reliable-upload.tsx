"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { inspectFile, type UploadKind } from "@/lib/upload-file";
import { transferFile, type UploadSession } from "@/lib/resumable-upload";
import { finalizeUploadedMedia } from "@/lib/upload-finalize";
export function ReliableUpload({
  target,
  kind,
}: {
  target: string;
  kind: UploadKind;
}) {
  const media = kind === "MEDIA";
  const bucket = media ? "project-media" : "submissions";
  const router = useRouter();
  const client = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      ),
    [],
  );
  const [message, setMessage] = useState("");
  const [stage, setStage] = useState<
    "idle" | "checking" | "uploading" | "confirming"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState<UploadSession[]>([]);
  const [recoveryError, setRecoveryError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const queryPending = useCallback(async () => {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) {
      return {
        rows: [] as UploadSession[],
        error: "Sign in again to check pending uploads.",
      };
    }
    const { data, error } = await client
      .from("upload_sessions")
      .select("*")
      .eq("owner_id", user.id)
      .eq("bucket", bucket)
      .eq("target_id", target)
      .eq("state", "OPEN")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      return {
        rows: [] as UploadSession[],
        error:
          "Could not check pending uploads. Refresh before starting another file.",
      };
    }
    return { rows: (data || []) as UploadSession[], error: "" };
  }, [client, bucket, target]);
  async function loadPending() {
    try {
      const result = await queryPending();
      setRecoveryError(result.error);
      setPending(result.rows);
    } catch {
      setRecoveryError(
        "Recovery check failed. Check your connection and refresh.",
      );
    }
  }
  useEffect(() => {
    let active = true;
    void queryPending()
      .then((result) => {
        if (active) {
          setRecoveryError(result.error);
          setPending(result.rows);
        }
      })
      .catch(() => {
        if (active)
          setRecoveryError(
            "Recovery check failed. Check your connection and refresh.",
          );
      });
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, [queryPending]);
  async function confirm(session: UploadSession) {
    setStage("confirming");
    setMessage("File uploaded. Confirming its project record…");
    await finalizeUploadedMedia(client, {
      bucket,
      table: media ? "project_media" : "submissions",
      op: media ? "media" : "submit",
      target,
      path: session.path,
      payload: {
        storage_path: session.path,
        mime_type: session.mime_type,
        ...session.payload,
      },
    });
    if (media) {
      setMessage("Media attached successfully.");
    } else {
      // The submission is saved before the owner is notified. Telegram failure
      // must never erase the Creator's completed work.
      try {
        const response = await fetch("/api/owner-delivery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storage_path: session.path }),
        });
        setMessage(
          response.ok
            ? "Submitted and privately delivered to the owner for review."
            : "Submitted successfully. Owner delivery is pending; please contact the owner.",
        );
      } catch {
        setMessage("Submitted successfully. Owner delivery is pending; please contact the owner.");
      }
    }
    router.refresh();
  }
  async function status(id: string) {
    const { data, error } = await client.rpc("upload_control", {
      op: "status",
      session_id: id,
    });
    if (error || !data)
      throw Error(
        "Upload state could not be verified. Sign in again or contact the Admin before starting another file.",
      );
    return data as UploadSession;
  }
  async function recover(id: string) {
    if (locked.current) return;
    locked.current = true;
    setStage("checking");
    try {
      const saved = await status(id);
      if (saved.linked) {
        setMessage("This file is already attached.");
        router.refresh();
      } else if (saved.object_exists) await confirm(saved);
      else
        setMessage(
          "This upload is incomplete. Select the exact same file below to resume from saved chunks.",
        );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recovery failed.");
    } finally {
      locked.current = false;
      setStage("idle");
      await loadPending();
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File)) return;
    locked.current = true;
    setStage("checking");
    setProgress(0);
    setMessage("Checking file format and recovery identity…");
    controller.current = new AbortController();
    try {
      const { mime, fingerprint } = await inspectFile(file, kind);
      const { data, error } = await client.rpc("upload_control", {
        op: "begin",
        payload: {
          bucket,
          target,
          mime,
          size: file.size,
          fingerprint,
          note: form.get("note") || "",
          caption: form.get("caption") || "",
        },
      });
      if (error || !data) {
        const known = [
          "Delivery deadline passed",
          "Confirm product delivery before submitting",
          "Assignment is not accepting submissions",
          "Too many unfinished uploads",
        ];
        throw Error(
          known.find((s) => error?.message.includes(s)) ||
            "Could not register upload. Check sign-in, assignment status and file limits.",
        );
      }
      const session = data as UploadSession;
      const saved = await status(session.id);
      if (saved.linked) {
        setMessage("This file is already attached.");
        router.refresh();
        return;
      }
      if (!saved.object_exists) {
        setStage("uploading");
        setMessage(
          "Uploading securely. You can pause and resume the same file.",
        );
        await transferFile(client, file, session, {
          projectUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
          signal: controller.current.signal,
          onProgress: (sent, total) =>
            setProgress(
              total ? Math.min(100, Math.floor((sent * 100) / total)) : 0,
            ),
        });
      }
      await confirm(session);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Upload could not be completed. Check recovery before trying again.",
      );
    } finally {
      controller.current = null;
      locked.current = false;
      setStage("idle");
      await loadPending();
    }
  }
  return (
    <div className="upload-widget">
      {recoveryError && <p role="alert">{recoveryError}</p>}
      {pending.length > 0 && (
        <details open className="recovery">
          <summary>{pending.length} unfinished upload(s)</summary>
          <p>
            Select Recover to attach an already uploaded file. For partial
            uploads, reselect the same file below. Browser recovery links expire
            after 24 hours; completed files remain available until reviewed
            cleanup.
          </p>
          {pending.map((s) => (
            <div className="row" key={s.id}>
              <span>
                {s.mime_type} · {(s.byte_size / 1048576).toFixed(1)} MiB
              </span>
              <button
                type="button"
                className="secondary"
                disabled={stage !== "idle"}
                onClick={() => void recover(s.id)}
              >
                Recover uploaded file
              </button>
            </div>
          ))}
        </details>
      )}
      <form onSubmit={submit}>
        <label>
          {media
            ? "Product image / reference file"
            : kind === "VOICE"
              ? "Audio recording"
              : "Product video"}
          <input
            type="file"
            name="file"
            required
            disabled={stage !== "idle"}
            accept={
              media
                ? ".jpg,.jpeg,.png,.webp,.mp4,.webm,.mp3,.wav,.m4a,.ogg"
                : kind === "VOICE"
                  ? ".mp3,.wav,.m4a,.ogg"
                  : ".mp4,.webm"
            }
          />
        </label>
        {!media && (
          <small>
            Your submitted audio/video is shared privately with the business owner
            through Telegram for review. Larger files may be delivered as an
            expiring private download link.
          </small>
        )}
        <small>
          Maximum {media ? "50" : "100"} MiB · private storage ·{" "}
          {kind === "VOICE"
            ? "MP3, WAV, M4A or OGG"
            : kind === "PRODUCT"
              ? "MP4 or WebM"
              : "JPG, PNG, WebP, MP4, WebM, MP3, WAV, M4A or OGG"}
        </small>
        <label>
          {media ? "Caption" : "Submission note"}
          <textarea
            name={media ? "caption" : "note"}
            maxLength={media ? 200 : 2000}
            disabled={stage !== "idle"}
          />
        </label>
        {stage === "uploading" && (
          <>
            <label>
              Upload progress: {progress}%
              <progress value={progress} max={100} />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() => controller.current?.abort()}
            >
              Cancel upload · resume later
            </button>
          </>
        )}
        <button disabled={stage !== "idle" || Boolean(recoveryError)}>
          {stage === "checking"
            ? "Checking…"
            : stage === "confirming"
              ? "Confirming…"
              : stage === "uploading"
                ? "Uploading…"
                : media
                  ? "Upload media"
                  : "Submit work"}
        </button>
        <p role="status" aria-live="polite">
          {message}
        </p>
      </form>
    </div>
  );
}
