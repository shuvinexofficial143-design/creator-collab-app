/**
 * Embed only well-formed YouTube videos. Other links are never loaded into
 * an iframe; the project page may still expose an ordinary reference link.
 */
export function youtubeEmbedUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    const normalHosts = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com"];
    let id: string | null = null;
    if (host === "youtu.be" || host === "www.youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (normalHosts.includes(host)) {
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments[0] === "watch") id = url.searchParams.get("v");
      else if (["shorts", "live", "embed"].includes(segments[0])) id = segments[1] ?? null;
    } else return null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id)
      ? `https://www.youtube-nocookie.com/embed/${id}`
      : null;
  } catch {
    return null;
  }
}
