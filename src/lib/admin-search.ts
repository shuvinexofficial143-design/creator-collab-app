import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const base = { id:z.uuid(),note:z.string(),status:z.string(),
  project_title:z.string(),creator_name:z.string(),created_at:z.string() };
const response = <T extends z.ZodTypeAny>(item:T) => z.object({
  total:z.number().int().nonnegative(),page:z.number().int().min(1),
  page_size:z.number().int().min(1).max(50),items:z.array(item),
});
const app = response(z.object({ ...base, project_id:z.uuid(),creator_id:z.uuid(),
  status:z.literal("PENDING") }));
const review = response(z.object({ ...base,assignment_id:z.uuid(),
  storage_path:z.string(),media_kind:z.enum(["VOICE","PRODUCT"]),
  status:z.literal("SUBMITTED") }));
async function read(client:SupabaseClient,kind:"applications"|"submissions",search:string,page:number) {
  const {data,error}=await client.rpc("admin_find_pending",{
    queue_kind:kind, search_term:search,page_number:page,page_size:25,
  });
  if (error) throw Error("Unable to search Admin queue.");
  return data;
}
export async function pendingApplications(client:SupabaseClient,search:string,page:number) {
  return app.parse(await read(client,"applications",search,page));
}
export async function pendingSubmissions(client:SupabaseClient,search:string,page:number) {
  return review.parse(await read(client,"submissions",search,page));
}
