"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { validateUpload } from "@/lib/validation";
import { finalizeUploadedMedia } from "@/lib/upload-finalize";
export function Upload({
  assignment,
  kind,
}: {
  assignment: string;
  kind: string;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !validateUpload(file.type, file.size, kind)
    ) {
      setMessage("Choose a supported file, up to 100 MB.");
      return;
    }
    setBusy(true);
    setMessage("Uploading…");
    try {
      const client = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      );
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) throw Error("Sign in again.");
      const path = `${user.id}/${assignment}/${crypto.randomUUID()}`;
      const { error } = await client.storage
        .from("submissions")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw Error("Upload failed. Try again.");
      setMessage("Upload complete. Confirming your submission…");
      await finalizeUploadedMedia(client, {
        bucket: "submissions",
        table: "submissions",
        op: "submit",
        target: assignment,
        path,
        payload: { storage_path: path, note: form.get("note") },
      });
      setMessage("Submitted for review.");
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
        {kind === "VOICE" ? "Audio recording" : "Product video"}
        <input
          type="file"
          name="file"
          required
          accept={kind === "VOICE" ? ".mp3,.wav,.m4a,.ogg" : ".mp4,.webm"}
        />
      </label>
      <small>Maximum 100 MB · files are private</small>
      <label>
        Submission note
        <textarea name="note" maxLength={2000} />
      </label>
      <button disabled={busy}>{busy ? "Uploading…" : "Submit work"}</button>
      <p role="status">{message}</p>
    </form>
  );
}
