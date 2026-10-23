import type { Project } from "@/components/project-form";
export function sampleProject(
  kind: "birthday" | "unboxing" | "voice",
): Project {
  const voice = kind === "voice";
  const day = 86400000;
  return {
    id: "",
    title: `[SAMPLE] ${kind === "birthday" ? "Birthday Gift Promotional Video" : kind === "unboxing" ? "Product Unboxing Video" : "Hindi Promotional Voice Over"}`,
    description:
      "SAMPLE brief for demonstrating the workflow. Replace these instructions and terms before using it for actual work.",
    kind: voice ? "VOICE" : "PRODUCT",
    payment_paise: 0,
    instructions: voice
      ? "Read in a warm, clear voice. This is a sample recording task."
      : "Show the sample product clearly, then describe its features. Replace with a real product before publishing.",
    language: "Hindi",
    usage_terms:
      "SAMPLE terms only. Agree actual compensation and commercial usage rights before publication.",
    capacity: 1,
    deadline: new Date(Date.now() + 7 * day).toISOString(),
    status: "DRAFT",
    details: {
      category: "SAMPLE",
      product_value: 0,
      duration_seconds: 30,
      voice_tone: "Warm and conversational",
      audio_format: "MP3",
      delivery_deadline: new Date(Date.now() + 14 * day).toISOString(),
      revision_limit: 1,
      shipping_required: !voice,
      reference_url: "",
    },
  };
}
