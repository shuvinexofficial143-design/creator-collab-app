/** PostgREST relations can be an object (to-one) or an array (to-many).
 * Normalize both shapes before choosing a safe media renderer. */
export function projectKindFromSubmission(relation: unknown): "VOICE" | "PRODUCT" | null {
  const assignment = Array.isArray(relation) ? relation[0] : relation;
  if (!assignment || typeof assignment !== "object") return null;
  const raw = (assignment as Record<string, unknown>).projects;
  const project = Array.isArray(raw) ? raw[0] : raw;
  if (!project || typeof project !== "object") return null;
  const kind = (project as Record<string, unknown>).kind;
  return kind === "VOICE" || kind === "PRODUCT" ? kind : null;
}
