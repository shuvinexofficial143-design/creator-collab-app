import { db } from "@/lib/supabase";
import { configured } from "@/lib/config";
import { telegramCaption, telegramDeliveryMode } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: object, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function botCall(
  token: string,
  method: "sendVideo" | "sendDocument" | "sendMessage",
  body: FormData | Record<string, string | boolean>,
) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body: body instanceof FormData ? body : JSON.stringify(body),
    headers: body instanceof FormData ? {} : { "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });
  const result = await response.json().catch(() => null);
  return response.ok && result?.ok === true;
}

/**
 * Creator uploads bytes directly to private Supabase Storage. Only AFTER the
 * file is linked to an authorized submission does this server-only endpoint
 * deliver it to the owner's Telegram. Client cannot choose chat or bot token.
 *
 * This notification is best-effort, NOT exactly-once delivery. The app's
 * private submission record remains authoritative if Telegram fails.
 */
export async function POST(request: Request) {
  if (!configured()) return json({ error: "Service not configured." }, 503);
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const chat = process.env.TELEGRAM_CHAT_ID || "";
  if (!/^\d{6,15}:[A-Za-z0-9_-]{25,}$/.test(token) ||
      !/^(?:-?\d{5,20}|@[A-Za-z0-9_]{5,32})$/.test(chat))
    return json({ error: "Owner delivery is not configured." }, 503);

  let path: string;
  try {
    const input = await request.json();
    path = typeof input?.storage_path === "string" ? input.storage_path : "";
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (!path || path.length > 512 || !/^[a-zA-Z0-9/_.-]+$/.test(path) || path.includes(".."))
    return json({ error: "Invalid submission." }, 400);

  const client = await db();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return json({ error: "Sign in required." }, 401);

  const { data: profile } = await client
    .from("profiles")
    .select("active,role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.active || profile.role !== "CREATOR")
    return json({ error: "Not permitted." }, 403);

  const { data: submission } = await client
    .from("submissions")
    .select("id,assignment_id,storage_path")
    .eq("storage_path", path)
    .maybeSingle();
  if (!submission) return json({ error: "Submission unavailable." }, 404);

  const { data: assignment } = await client
    .from("assignments")
    .select("creator_id,project_id")
    .eq("id", submission.assignment_id)
    .maybeSingle();
  if (!assignment || assignment.creator_id !== user.id)
    return json({ error: "Not permitted." }, 403);

  const { data: project } = await client
    .from("projects")
    .select("title,kind")
    .eq("id", assignment.project_id)
    .maybeSingle();
  if (!project) return json({ error: "Project unavailable." }, 404);

  const { data: signed, error: signingError } = await client.storage
    .from("submissions")
    .createSignedUrl(submission.storage_path, 86400);
  if (signingError || !signed?.signedUrl)
    return json({ error: "Private file unavailable." }, 503);

  const { data: session } = await client.from("upload_sessions")
    .select("byte_size,mime_type").eq("path", path).eq("owner_id", user.id).maybeSingle();
  const mime = session?.mime_type || "application/octet-stream";

  const caption = telegramCaption(project.title, project.kind);
  let delivered = false;
  let delivery: "file" | "link" = "link";

  // For small files, upload the actual bytes into the owner's Telegram.
  if (telegramDeliveryMode(session?.byte_size ?? null, mime) === "file") {
    try {
      const response = await fetch(signed.signedUrl, {
        cache: "no-store", signal: AbortSignal.timeout(20000),
      });
      if (response.ok &&
        Number(response.headers.get("content-length") || session?.byte_size || Infinity) <=
          15 * 1024 * 1024) {
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength <= 15 * 1024 * 1024) {
          const isMp4 = mime === "video/mp4";
          const extension = ({ "video/mp4":"mp4", "video/webm":"webm", "audio/mpeg":"mp3", "audio/mp4":"m4a", "audio/wav":"wav", "audio/x-wav":"wav", "audio/ogg":"ogg" } as Record<string,string>)[mime] || "bin";
          const body = new FormData();
          body.append("chat_id", chat);
          body.append("caption", caption);
          body.append(isMp4 ? "video" : "document",
            new Blob([bytes], { type: mime }),
            `creator-submission.${extension}`);
          delivered = await botCall(token, isMp4 ? "sendVideo" : "sendDocument", body);
          if (delivered) delivery = "file";
        }
      }
    } catch {
      // Link fallback below; never invalidate an already saved submission.
    }
  }

  if (!delivered) {
    try {
      delivered = await botCall(token, "sendMessage", {
        chat_id: chat,
        text: `${caption}\nPrivate download (expires in 24 hours):\n${signed.signedUrl}`,
        disable_web_page_preview: true,
      });
    } catch {
      delivered = false;
    }
  }
  return delivered
    ? json({ ok: true, delivery })
    : json({ error: "Owner notification pending. Your submission is saved." }, 502);
}
