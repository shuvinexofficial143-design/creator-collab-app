import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
export const ADMIN = "00000000-0000-4000-8000-000000000001",
  CREATOR = "00000000-0000-4000-8000-000000000002",
  OTHER = "00000000-0000-4000-8000-000000000003";
export const bootstrapSql = `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,created_at timestamptz default now(),updated_at timestamptz default now(),metadata jsonb default '{}',unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`;
export async function fixture() {
  const db = new PGlite();
  await db.exec(bootstrapSql);
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await db.query("insert into auth.users(id) values($1),($2),($3)", [
    ADMIN,
    CREATOR,
    OTHER,
  ]);
  await db.query("update profiles set role='ADMIN' where id=$1", [ADMIN]);
  async function as(id: string) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec(id ? "set role authenticated" : "set role anon");
  }
  async function workflow(
    op: string,
    target: string | null,
    payload: object = {},
  ) {
    return (
      await db.query<{ value: string }>(
        "select workflow($1,$2,$3::jsonb) as value",
        [op, target, JSON.stringify(payload)],
      )
    ).rows[0].value;
  }
  async function control<T = Record<string, unknown>>(
    op: string,
    session: string | null = null,
    payload: object = {},
  ): Promise<T> {
    return (
      await db.query<{ value: T }>(
        "select upload_control($1,$2,$3::jsonb) as value",
        [op, session, JSON.stringify(payload)],
      )
    ).rows[0].value;
  }
  async function setup(kind = "VOICE") {
    await as(ADMIN);
    const project = await workflow("project", null, {
      title: "ISOLATED TEST " + kind,
      description: "Isolated test fixture only",
      kind,
      payment_paise: 12345,
      instructions: "Read clearly",
      language: "Hindi",
      usage_terms: "TEST terms",
      capacity: 2,
      deadline: "2099-01-01",
      status: "PUBLISHED",
      script: "Private test script",
      details: {
        duration_seconds: 30,
        revision_limit: 1,
        delivery_deadline: "2099-02-01",
        shipping_required: kind === "PRODUCT",
      },
    });
    await as(CREATOR);
    const app = await workflow("apply", project, {
      note: "Isolated test application",
    });
    await as(ADMIN);
    const assignment = await workflow("decision", app, { status: "APPROVED" });
    await as(CREATOR);
    return { project, assignment };
  }
  return { db, as, workflow, control, setup };
}
export type Session = {
  id: string;
  path: string;
  bucket: string;
  claim_id: string;
  state: string;
};
