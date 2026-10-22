import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const metricsSchema = z.object({
  pending_applications: z.number().int().nonnegative(),
  active_assignments: z.number().int().nonnegative(),
  awaiting_review: z.number().int().nonnegative(),
  outstanding_payments: z.number().int().nonnegative(),
  payable_count: z.number().int().nonnegative(),
  approved_earnings_paise: z.number().int().nonnegative().safe(),
  pending_earnings_paise: z.number().int().nonnegative().safe(),
  paid_earnings_paise: z.number().int().nonnegative().safe(),
});
export type WorkspaceMetrics = z.infer<typeof metricsSchema>;

/** The RPC uses SECURITY INVOKER and existing Postgres RLS for per-user isolation.
 * It returns database aggregates rather than a truncated API page. */
export async function readWorkspaceMetrics(
  client: SupabaseClient,
): Promise<WorkspaceMetrics> {
  const { data, error } = await client.rpc("workspace_metrics");
  if (error) throw new Error("Dashboard totals unavailable.");
  const parsed = metricsSchema.safeParse(data);
  if (!parsed.success) throw new Error("Dashboard returned invalid totals.");
  return parsed.data;
}
