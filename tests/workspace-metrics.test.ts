import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, ADMIN, CREATOR, OTHER } from "./db-fixture";

test("RLS-invoker workspace totals are accurate beyond 1000 records", async () => {
  const { db, as } = await fixture();
  try {
    await db.exec("reset role");
    // These are disposable simulated records in the embedded test database only.
    const uuid = (prefix: string, i: number) =>
      `'${prefix}-0000-4000-8000-${i.toString(16).padStart(12, "0")}'::uuid`;
    const projectId = (i: number) => uuid("10000000", i);
    const appId = (i: number) => uuid("20000000", i);
    const assignmentId = (i: number) => uuid("30000000", i);
    const paymentId = (i: number) => uuid("40000000", i);
    const inserts: string[] = [], apps: string[] = [], assignments: string[] = [], payments: string[] = [];
    for (let i = 1; i <= 1001; i++) {
      inserts.push(`(${projectId(i)},'ISOLATED ${i}','Test project only','VOICE',101,'', 'Hindi','Test terms',1,'2099-01-01','PUBLISHED')`);
      apps.push(`(${appId(i)},${projectId(i)},'${CREATOR}','Test application only','APPROVED')`);
      assignments.push(`(${assignmentId(i)},${appId(i)},${projectId(i)},'${CREATOR}',101,'APPROVED')`);
      payments.push(`(${paymentId(i)},${assignmentId(i)},'${CREATOR}',101,'PAID','SIMULATED-TEST-${i}',now())`);
    }
    await db.exec(`insert into public.projects(id,title,description,kind,payment_paise,instructions,language,usage_terms,capacity,deadline,status) values ${inserts.join(",")};`);
    await db.exec(`insert into public.applications(id,project_id,creator_id,note,status) values ${apps.join(",")};`);
    await db.exec(`insert into public.assignments(id,application_id,project_id,creator_id,payment_paise,status) values ${assignments.join(",")};`);
    await db.exec(`insert into public.payments(id,assignment_id,creator_id,amount_paise,status,reference,paid_at) values ${payments.join(",")};`);
    async function read() {
      const result = await db.query<{ metrics: Record<string, number> }>(
        "select public.workspace_metrics() as metrics"
      );
      return result.rows[0].metrics;
    }
    await as(CREATOR);
    const creatorMetrics = await read();
    assert.equal(creatorMetrics.payable_count, 1001);
    assert.equal(creatorMetrics.paid_earnings_paise, 101101);
    assert.equal(creatorMetrics.approved_earnings_paise, 101101);
    assert.equal(creatorMetrics.pending_earnings_paise, 0);
    await as(OTHER);
    const otherMetrics = await read();
    assert.equal(otherMetrics.payable_count, 0);
    assert.equal(otherMetrics.paid_earnings_paise, 0);
    await as(ADMIN);
    const adminMetrics = await read();
    assert.equal(adminMetrics.payable_count, 1001);
    assert.equal(adminMetrics.paid_earnings_paise, 101101);
    await as("");
    await assert.rejects(read(), /permission denied/);
    await as(CREATOR);
    await db.exec("reset role");
    await db.query("update public.profiles set active=false where id=$1", [CREATOR]);
    await as(CREATOR);
    await assert.rejects(read(), /Account unavailable/);
  } finally {
    await db.close();
  }
});
