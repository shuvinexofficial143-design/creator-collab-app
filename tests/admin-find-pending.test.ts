import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, ADMIN, CREATOR, OTHER } from "./db-fixture";

type Match = { total: number; items: { id: string; note: string; media_kind?: string }[]; page: number; page_size: number };
test("admin search scans entire authorized database with exact counts and independent pagination", async () => {
  const { db, as, setup } = await fixture();
  try {
    const { project, assignment } = await setup("VOICE");
    await db.exec("reset role");
    // Isolated test users created only in disposable PGlite; never hosted Auth.
    await db.exec(`insert into auth.users(id)
      select ('70000000-0000-4000-8000-' || lpad(to_hex(i),12,'0'))::uuid
      from generate_series(1,65) i`);
    await db.query(`insert into public.applications(project_id,creator_id,note,status)
      select $1,id,'SPECIALNEEDLE product creator test ' || id,'PENDING'
      from auth.users where id::text like '70000000-%'`,[project]);
    await db.query(`insert into public.submissions(assignment_id,storage_path,note,status)
      select $1,'isolated/' || i,case when i%2=0 then 'Mango test review' else 'Orange test review' end,'SUBMITTED'
      from generate_series(1,55) i`,[assignment]);
    async function search(kind: string, phrase: string, page=1, size=25) {
      const result=await db.query<{result: Match}>(
        "select public.admin_find_pending($1,$2,$3,$4) as result",
        [kind,phrase,page,size],
      );
      return result.rows[0].result;
    }
    await as(CREATOR);
    await assert.rejects(search("applications",""),/Admin required/);
    await as(OTHER);
    await assert.rejects(search("submissions",""),/Admin required/);
    await as("");
    await assert.rejects(search("applications",""),/permission denied/);
    await as(ADMIN);
    const first=await search("applications","specialneedle",1);
    const third=await search("applications","specialneedle",3);
    assert.equal(first.total,65);
    assert.equal(first.items.length,25);
    assert.equal(third.total,65);
    assert.equal(third.items.length,15);
    assert.equal(new Set([...first.items,...third.items].map(x=>x.id)).size,40);
    assert.equal((await search("applications","%_")).total,0,"wildcards must be literal");
    assert.equal((await search("applications","no such application")).total,0);
    const reviews=await search("submissions","mango",1);
    assert.equal(reviews.total,27);
    assert.equal(reviews.items.length,25);
    assert.equal((await search("submissions","mango",2)).items.length,2);
    const byTitle=await search("submissions","isolated test voice",1,50);
    assert.equal(byTitle.total,55);
    assert.equal(byTitle.items[0].media_kind,"VOICE");
    assert.equal(byTitle.items.length,50);
    await assert.rejects(search("applications","",0),/Invalid pagination/);
    await assert.rejects(search("applications","",1,51),/Invalid pagination/);
    await assert.rejects(search("unsupported",""),/Invalid queue/);
    await assert.rejects(search("applications","x".repeat(81)),/Search too long/);
    await db.exec("reset role");
    await db.query("update public.profiles set active=false where id=$1",[ADMIN]);
    await as(ADMIN);
    await assert.rejects(search("applications",""),/Admin required/);
  } finally { await db.close(); }
});
