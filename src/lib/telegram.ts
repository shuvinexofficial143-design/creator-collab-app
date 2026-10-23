export const TELEGRAM_DIRECT_LIMIT = 15 * 1024 * 1024;

/**
 * Vercel-forwarded media uses a deliberately conservative maximum. Telegram's
 * Bot API allows larger files, but downloading and relaying huge buffers inside
 * a serverless request is not a reliable delivery strategy.
 */
export function telegramDeliveryMode(size: number | null, mime: string): "file" | "link" {
  if (!Number.isFinite(size) || size === null || size <= 0 || size > TELEGRAM_DIRECT_LIMIT) return "link";
  return /^(video\/(mp4|webm)|audio\/(mpeg|mp4|wav|x-wav|ogg))$/.test(mime)
    ? "file"
    : "link";
}

export function telegramCaption(project: string, kind: string) {
  const clean = project.replace(/[\r\n\t]/g, " ").slice(0, 120);
  return `New creator submission\nProject: ${clean}\nType: ${kind === "VOICE" ? "Voice over" : "Product video"}\nReview it in Creator Collaboration.`;
}
