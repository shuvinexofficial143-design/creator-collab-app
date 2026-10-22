import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("database RLS and complete revision/payment workflow", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`,
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261022060834_creator_workflow.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261022061654_brief_details_and_operations.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261022121100_agreed_terms_and_deadlines.sql",
      "utf8",
    ),
  );
  const admin = "00000000-0000-4000-8000-000000000001",
    one = "00000000-0000-4000-8000-000000000002",
    two = "00000000-0000-4000-8000-000000000003";
  await db.query(`insert into auth.users(id) values($1),($2),($3)`, [
    admin,
    one,
    two,
  ]);
  await db.query(`update profiles set role='ADMIN' where id=$1`, [admin]);
  async function as(id: string) {
    await db.exec("reset role");
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id]);
    await db.exec("set role authenticated");
  }
  async function op(
    action: string,
    target: string | null,
    payload: object = {},
  ) {
    const r = await db.query<{ workflow: string }>(
      "select public.workflow($1,$2,$3::jsonb)",
      [action, target, JSON.stringify(payload)],
    );
    return r.rows[0].workflow;
  }
  await as(admin);
  const voiceBrief = {
    title: "Hindi voice over",
    description: "Read this promotional script",
    kind: "VOICE",
    payment_paise: 50000,
    instructions: "Warm voice",
    language: "Hindi",
    usage_terms: "One revision",
    capacity: 1,
    deadline: "2099-01-01",
    status: "PUBLISHED",
    script: "Confidential script",
    details: {
      duration_seconds: 60,
      revision_limit: 1,
      delivery_deadline: "2099-01-02T00:00:00.000Z",
    },
  };
  const project = await op("project", null, voiceBrief);

  await as(one);
  assert.equal(
    (await db.query("select * from project_scripts")).rows.length,
    0,
  );
  await assert.rejects(op("project", null, {}), /Admin required/);
  await assert.rejects(
    db.query(`update profiles set role='ADMIN' where id=$1`, [one]),
    /permission denied/,
  );
  const application = await op("apply", project, {
    note: "I can record a warm Hindi voice.",
  });
  await assert.rejects(
    op("apply", project, { note: "Another application attempt" }),
    /unique/,
  );
  await as(two);
  const second = await op("apply", project, {
    note: "I can also record this voice.",
  });
  assert.equal((await db.query("select * from applications")).rows.length, 1);
  await as(admin);
  const assignment = await op("decision", application, { status: "APPROVED" });
  const agreed = (await db.query<{ agreed_brief: { title: string; details: { revision_limit: number } }; agreed_script: string; delivery_deadline: string }>("select agreed_brief,agreed_script,delivery_deadline from assignments where id=$1", [assignment])).rows[0];
  assert.equal(agreed.agreed_brief.title, "Hindi voice over");
  assert.equal(agreed.agreed_brief.details.revision_limit, 1);
  assert.equal(agreed.agreed_script, "Confidential script");
  assert.ok(agreed.delivery_deadline);
  await assert.rejects(op("project", project, { ...voiceBrief, title: "Changed agreed title" }), /Accepted brief terms are locked/);
  await db.query("update assignments set delivery_deadline=now()-interval '1 day' where id=$1", [assignment]);
  await as(one);
  await assert.rejects(op("submit", assignment, { storage_path: "missing" }), /Delivery deadline passed/);
  await assert.rejects(op("extend_deadline", assignment, { deadline: "2099-02-01T00:00:00Z" }), /Admin required/);
  await as(admin);
  await op("extend_deadline", assignment, { deadline: "2099-02-01T00:00:00Z" });
  assert.equal((await db.query<{ delivery_deadline: string }>("select delivery_deadline from assignments where id=$1", [assignment])).rows.length, 1);
  await assert.rejects(op("decision", second, { status: "APPROVED" }), /full/);
  await assert.rejects(
    op("decision", application, { status: "APPROVED" }),
    /not pending/,
  );
  await as(one);
  assert.equal(
    (await db.query("select * from project_scripts")).rows.length,
    1,
  );
  await assert.rejects(
    op("submit", assignment, { storage_path: `${one}/${assignment}/missing` }),
    /Upload the file first/,
  );
  await as(two);
  assert.equal((await db.query("select * from assignments")).rows.length, 0);
  assert.equal(
    (await db.query("select * from project_scripts")).rows.length,
    0,
  );
  await assert.rejects(
    op("submit", assignment, { storage_path: `${two}/${assignment}/bad` }),
    /unavailable/,
  );
  await as(one);
  let path = `${one}/${assignment}/first`;
  await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
    "submissions",
    path,
  ]);
  const submission = await op("submit", assignment, { storage_path: path });
  await assert.rejects(
    op("submit", assignment, { storage_path: path }),
    /not accepting/,
  );
  await as(admin);
  await assert.rejects(
    op("review", submission, { status: "REVISION", reason: "" }),
    /instructions required/,
  );
  await op("review", submission, {
    status: "REVISION",
    reason: "Please slow down.",
  });
  assert.equal((await db.query("select * from payments")).rows.length, 0);
  await as(one);
  path = `${one}/${assignment}/second`;
  await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
    "submissions",
    path,
  ]);
  const revised = await op("submit", assignment, { storage_path: path });
  await as(admin);
  await assert.rejects(
    op("review", revised, { status: "REVISION", reason: "Another revision" }),
    /Revision limit reached/,
  );
  await op("review", revised, { status: "APPROVED" });
  const payment = (await db.query<{ id: string }>("select id from payments"))
    .rows[0].id;
  await assert.rejects(
    op("payment", payment, { status: "PAID", reference: "" }),
    /check constraint/,
  );
  await assert.rejects(
    op("payment", payment, { status: "PAID" }),
    /check constraint/,
  );
  await op("payment", payment, { status: "PROCESSING" });
  await op("payment", payment, {
    status: "PAID",
    reference: "UPI-VERIFIED-123",
  });
  await assert.rejects(
    op("payment", payment, { status: "PAID", reference: "duplicate" }),
    /already paid/,
  );
  await as(two);
  assert.equal((await db.query("select * from payments")).rows.length, 0);
  assert.equal((await db.query("select * from submissions")).rows.length, 0);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
  assert.equal((await db.query("select * from audit_logs")).rows.length, 0);
  await as(one);
  assert.equal(
    (await db.query<{ status: string }>("select status from payments")).rows[0]
      .status,
    "PAID",
  );
  assert.equal((await db.query("select * from notifications")).rows.length, 6);
  const notice = (
    await db.query<{ id: string }>("select id from notifications limit 1")
  ).rows[0].id;
  await op("read_notification", notice);
  assert.ok(
    (await db.query("select * from notifications where read_at is not null"))
      .rows.length === 1,
  );
  await assert.rejects(
    op("creator_status", two, { active: false }),
    /Admin required/,
  );
  await as(admin);
  await assert.rejects(
    op("creator_status", admin, { active: false }),
    /Creator unavailable/,
  );
  await op("creator_status", one, { active: false });
  await as(one);
  assert.equal((await db.query("select * from assignments")).rows.length, 0);
  await assert.rejects(
    op("profile", null, { full_name: "Changed" }),
    /Account unavailable/,
  );
  await as(admin);
  await op("creator_status", one, { active: true });
  const product = await op("project", null, {
    title: "Sample product",
    description: "Real product video brief",
    kind: "PRODUCT",
    payment_paise: 25000,
    instructions: "Unbox it",
    language: "Hindi",
    usage_terms: "One revision",
    capacity: 1,
    deadline: "2099-01-01",
    status: "PUBLISHED",
    script: "",
  });
  const mediaPath = product + "/image";
  await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
    "project-media",
    mediaPath,
  ]);
  await op("media", product, {
    storage_path: mediaPath,
    mime_type: "image/png",
    caption: "Product",
  });
  await as(one);
  assert.equal((await db.query("select * from project_media")).rows.length, 1);
  await assert.rejects(
    op("media", product, { storage_path: mediaPath, mime_type: "image/png" }),
    /Admin required/,
  );
  const productApplication = await op("apply", product, {
    note: "I will make an unboxing video.",
  });
  await as(admin);
  const productAssignment = await op("decision", productApplication, {
    status: "APPROVED",
  });
  await assert.rejects(
    op("dispatch", productAssignment, {
      courier: "Courier",
      tracking: "TRACK-1",
    }),
    /address required/,
  );
  await as(one);
  await op("address", productAssignment, {
    address: "Test recipient, test phone, complete test address",
  });
  await as(two);
  assert.equal((await db.query("select * from shipping")).rows.length, 0);
  await assert.rejects(
    op("address", productAssignment, {
      address: "Trying to overwrite the private address",
    }),
    /unavailable/,
  );
  await as(admin);
  await op("dispatch", productAssignment, {
    courier: "Courier",
    tracking: "TRACK-1",
  });
  await as(one);
  await assert.rejects(
    op("address", productAssignment, {
      address: "A changed address after dispatch",
    }),
    /cannot be changed/,
  );
  await op("delivered", productAssignment);
  await assert.rejects(
    op("delivered", productAssignment),
    /not been dispatched/,
  );
  await db.close();
});
