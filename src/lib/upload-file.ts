export type UploadKind = "VOICE" | "PRODUCT" | "MEDIA";
const mimeByExtension: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
export function uploadMime(
  name: string,
  type: string,
  kind: UploadKind,
  size: number,
) {
  const ext = name.toLowerCase().split(".").pop() || "";
  const mime = mimeByExtension[ext];
  const max = kind === "MEDIA" ? 52428800 : 104857600;
  if (!mime || size <= 0 || size > max)
    throw Error(
      `Choose a supported file between 1 byte and ${kind === "MEDIA" ? 50 : 100} MiB.`,
    );
  if (
    (kind === "VOICE" && !["mp3", "wav", "m4a", "ogg"].includes(ext)) ||
    (kind === "PRODUCT" && !["mp4", "webm"].includes(ext))
  )
    throw Error("This file format does not match the project.");
  const aliases: Record<string, string> = {
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/x-m4a": "audio/mp4",
    "application/ogg": "audio/ogg",
    "audio/mp3": "audio/mpeg",
  };
  const supplied = aliases[type] || type;
  if (supplied && supplied !== "application/octet-stream" && supplied !== mime)
    throw Error("File extension and media type do not match.");
  return mime;
}
export function matchesSignature(bytes: Uint8Array, mime: string) {
  const text = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  switch (mime) {
    case "audio/mpeg":
      return (
        text(0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224)
      );
    case "audio/wav":
      return text(0, 4) === "RIFF" && text(8, 12) === "WAVE";
    case "audio/mp4":
    case "video/mp4":
      return text(4, 8) === "ftyp";
    case "audio/ogg":
      return text(0, 4) === "OggS";
    case "video/webm":
      return (
        bytes[0] === 26 &&
        bytes[1] === 69 &&
        bytes[2] === 223 &&
        bytes[3] === 163
      );
    case "image/jpeg":
      return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    case "image/png":
      return [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
    case "image/webp":
      return text(0, 4) === "RIFF" && text(8, 12) === "WEBP";
    default:
      return false;
  }
}
export async function inspectFile(file: File, kind: UploadKind) {
  const mime = uploadMime(file.name, file.type, kind, file.size);
  if (
    !matchesSignature(
      new Uint8Array(await file.slice(0, 16).arrayBuffer()),
      mime,
    )
  )
    throw Error(
      "The file contents do not match the selected media format. Export it again in a supported format.",
    );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return {
    mime,
    fingerprint: Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
  };
}
