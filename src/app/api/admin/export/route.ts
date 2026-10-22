import { NextRequest } from "next/server";
import { db } from "@/lib/supabase";
import { configured } from "@/lib/config";
import { EXPORTS, MAX_EXPORT_ROWS, isExportKind, recordsToCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";
const deny = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });

/** Admin-only, bounded CSV export. Uses the signed-in user's RLS identity,
 * never a service-role token. A changing/oversize dataset is rejected rather
 * than silently shipping a truncated or misleading report. */
export async function GET(request: NextRequest) {
  if (!configured()) return deny(503, "Creator Collab backend is not configured.");
  const kind = request.nextUrl.searchParams.get("kind");
  if (!isExportKind(kind)) return deny(400, "Unknown export dataset.");
  const client = await db();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return deny(401, "Sign in required.");
  const { data: profile, error: profileError } = await client
    .from("profiles").select("role,active").eq("id", user.id).maybeSingle();
  if (profileError) return deny(503, "Unable to verify export permission.");
  if (!profile?.active || profile.role !== "ADMIN") return deny(403, "Admin access required.");

  const spec = EXPORTS[kind];
  const columns = [...spec.columns];
  const fields = columns.join(",");
  const countResult = await client
    .from(spec.table)
    .select(spec.table === "shipping" ? "assignment_id" : "id", { head: true, count: "exact" });
  if (countResult.error) return deny(503, "Unable to count export records.");
  const expected = countResult.count;
  if (expected === null || expected === undefined) return deny(503, "Export row count unavailable.");
  if (expected > MAX_EXPORT_ROWS)
    return deny(422, `Export refused: ${expected} rows exceed the 5,000-record safety limit. Filter or archive records before exporting.`);

  const rows: Record<string, unknown>[] = [];
  const batchSize = 500;
  for (let offset = 0; offset < expected; offset += batchSize) {
    const last = Math.min(offset + batchSize, expected) - 1;
    const result = await client
      .from(spec.table)
      .select(fields)
      .order(spec.order, { ascending: false })
      .range(offset, last);
    if (result.error || !result.data)
      return deny(503, "Export data could not be read. No partial CSV was generated.");
    if (!Array.isArray(result.data) ||
      result.data.some((row) => row === null || typeof row !== "object" || Array.isArray(row))) {
      return deny(503, "Export returned unexpected records.");
    }
    rows.push(...(result.data as unknown as Record<string, unknown>[]));
    if (rows.length > MAX_EXPORT_ROWS)
      return deny(422, "Export safety limit exceeded.");
  }
  if (rows.length !== expected)
    return deny(409, "Records changed during export. Retry to obtain a complete report.");

  return new Response(recordsToCsv(columns, rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="creator-collab-${kind}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
