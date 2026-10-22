import { z } from "zod";
export const credentials = z.object({
  email: z.email(),
  password: z.string().min(10).max(128),
});
export const projectSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(5000),
  kind: z.enum(["PRODUCT", "VOICE"]),
  payment_paise: z.coerce.number().int().min(0).max(100000000),
  instructions: z.string().max(10000),
  script: z.string().max(50000),
  language: z.string().max(80),
  usage_terms: z.string().min(5).max(5000),
  capacity: z.coerce.number().int().min(1).max(100),
  deadline: z.iso.datetime(),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"]),
});
export const uuid = z.uuid();
export function safeNext(value: string | null) {
  return value && /^\/(?!\/)/.test(value) && !/[\\\r\n]/.test(value)
    ? value
    : "/workspace";
}
export function validateUpload(type: string, size: number, kind: string) {
  return (
    size > 0 &&
    size <= 100 * 1024 * 1024 &&
    (kind === "VOICE"
      ? ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/ogg"]
      : ["video/mp4", "video/webm"]
    ).includes(type)
  );
}
export const detailsSchema = z.object({
  category: z.string().max(100),
  product_value: z.coerce.number().min(0).max(1000000),
  duration_seconds: z.coerce.number().int().min(1).max(36000),
  voice_tone: z.string().max(200),
  audio_format: z.enum(["MP3", "WAV", "M4A", "OGG"]),
  delivery_deadline: z.iso.datetime(),
  revision_limit: z.coerce.number().int().min(0).max(20),
  shipping_required: z.boolean(),
  reference_url: z.union([
    z.literal(""),
    z.url().refine((v) => /^https?:\/\//i.test(v), "Use an HTTP or HTTPS URL"),
  ]),
});
