"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { finalizeUploadedMedia } from "@/lib/upload-finalize";
export function MediaUpload({ project }: { project: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "video/mp4",
        "video/webm",
        "audio/mpeg",
        "audio/wav",
      ].includes(file.type) ||
      file.size === 0 ||
      file.size > 52428800
    ) {
      setMessage("Choose a supported image, audio or video file up to 50 MB.");
      return;
    }
    setBusy(true);
    try {
      const client = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      );
      const path = `${project}/${crypto.randomUUID()}`;
      const { error } = await client.storage
        .from("project-media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw Error("Upload failed.");
      setMessage("Upload complete. Linking media…");
      await finalizeUploadedMedia(client, {
        bucket: "project-media",
        table: "project_media",
        op: "media",
        target: project,
        path,
        payload: {
          storage_path: path,
          mime_type: file.type,
          caption: form.get("caption"),
        },
      });
      setMessage("Media added.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <label>
        Product image / reference file
        <input
          type="file"
          name="file"
          required
          accept=".jpg,.jpeg,.png,.webp,.mp4,.webm,.mp3,.wav"
        />
      </label>
      <label>
        Caption
        <input name="caption" maxLength={200} />
      </label>
      <small>Maximum 50 MB. Visible to people who can access this brief.</small>
      <button disabled={busy}>{busy ? "Uploading…" : "Add media"}</button>
      <p role="status">{message}</p>
    </form>
  );
}
