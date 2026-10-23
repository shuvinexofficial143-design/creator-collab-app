import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const response = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  page_size: z.number().int().min(1).max(50),
  items: z.array(z.object({
    id: z.uuid(), title: z.string(), description: z.string(),
    kind: z.enum(["VOICE","PRODUCT"]),
    status: z.enum(["DRAFT","PUBLISHED","CLOSED","ARCHIVED"]),
    payment_paise: z.number().nonnegative(),language: z.string(),
    capacity: z.number(), deadline:z.string(),created_at:z.string(),
  })),
});
export async function findProjects(client:SupabaseClient, options:{
  kind:string;status:string;search:string;page:number
}) {
  const {data,error}=await client.rpc("find_projects",{
    kind_filter:options.kind, status_filter:options.status,
    search_term:options.search,page_number:options.page,page_size:20,
  });
  if (error) throw Error("Unable to search projects.");
  const parsed=response.safeParse(data);
  if (!parsed.success) throw Error("Project search returned invalid records.");
  return parsed.data;
}
