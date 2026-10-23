import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, ADMIN, CREATOR, OTHER } from "./db-fixture";

type Result = {total:number;items:{title:string;kind:string;status:string}[]};
test("project discovery searches 1001+ rows with RLS and truthful status filters", async () => {
  const {db,as}=await fixture();
  try {
    await db.exec("reset role");
    await db.exec(`insert into public.projects(title,description,kind,payment_paise,usage_terms,deadline,status)
      select 'ISOLATED NEEDLE '||i,'SIMULATED project',case when i%2=0 then 'VOICE' else 'PRODUCT' end,
       1000,'Test terms','2099-12-30','PUBLISHED'
      from generate_series(1,1001) i`);
    await db.exec(`insert into public.projects(title,description,kind,payment_paise,usage_terms,deadline,status)
      values('PRIVATE DRAFT','SIMULATED only','VOICE',0,'Test terms','2099-12-30','DRAFT')`);
    async function query(kind='ALL',phrase='',status='ALL',page=1,size=50) {
      return (await db.query<{result:Result}>("select public.find_projects($1,$2,$3,$4,$5) as result",
        [kind,phrase,status,page,size])).rows[0].result;
    }
    await as(ADMIN);
    assert.equal((await query("ALL","needle")).total,1001);
    assert.equal((await query("ALL","needle","ALL",21)).items.length,1);
    assert.equal((await query("VOICE","needle")).total,500);
    assert.equal((await query("ALL","private draft","DRAFT")).total,1);
    assert.equal((await query("ALL","%_")).total,0,"wildcards are literal text");
    await assert.rejects(query("INVALID"),/Invalid project type/);
    await assert.rejects(query("ALL","","MISSING"),/Invalid project status/);
    await assert.rejects(query("ALL","", "ALL",0),/Invalid pagination/);
    await as(CREATOR);
    assert.equal((await query("ALL","needle")).total,1001);
    assert.equal((await query("ALL","private draft")).total,0);
    await as(OTHER);
    assert.equal((await query("ALL","private draft")).total,0);
    await as("");
    await assert.rejects(query(),/permission denied/);
    await db.exec("reset role");
    await db.query("update public.profiles set active=false where id=$1",[CREATOR]);
    await as(CREATOR);
    await assert.rejects(query(),/Account unavailable/);
  } finally {await db.close();}
});
