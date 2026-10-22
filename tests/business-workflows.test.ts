import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, ADMIN, CREATOR, OTHER, type Session } from "./db-fixture";

async function stageMedia(
  db: Awaited<ReturnType<typeof fixture>>["db"],
  session: Session,
  mime: string,
) {
  await db.query(
    "insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)",
    [session.bucket, session.path, JSON.stringify({ size: 20, mimetype: mime })],
  );
}

test("isolated PRODUCT video: approval, shipping, private upload, revision and pending payout", async () => {
  const { db, as, workflow, control, setup } = await fixture();
  try {
    const { project, assignment } = await setup("PRODUCT");
    await as(OTHER);
    assert.equal((await db.query("select * from shipping")).rows.length, 0);
    await assert.rejects(
      control("begin", null, {
        bucket: "submissions", target: assignment,
        fingerprint: "1".repeat(64), mime: "video/mp4", size: 20,
      }),
      /not accepting|unavailable/,
    );
    await as(CREATOR);
    await assert.rejects(
      control("begin", null, {
        bucket: "submissions", target: assignment,
        fingerprint: "2".repeat(64), mime: "video/mp4", size: 20,
      }),
      /Confirm product delivery/,
    );
    await workflow("address", assignment, {
      address: "ISOLATED TEST RECIPIENT, TEST PHONE, TEST DELIVERY ADDRESS",
    });
    await as(ADMIN);
    await workflow("dispatch", assignment, { courier: "TEST COURIER", tracking: "TEST-123" });
    await as(CREATOR);
    await workflow("delivered", assignment);
    const first = await control<Session>("begin", null, {
      bucket: "submissions", target: assignment,
      fingerprint: "3".repeat(64), mime: "video/mp4", size: 20,
    });
    await stageMedia(db, first, "video/mp4");
    const s1 = await workflow("submit", assignment, { storage_path: first.path, note: "Isolated product take 1" });
    await assert.rejects(workflow("submit", assignment, { storage_path: first.path }), /not accepting/);
    await as(ADMIN);
    await workflow("review", s1, { status: "REVISION", reason: "Please shorten the video" });
    await as(CREATOR);
    const second = await control<Session>("begin", null, {
      bucket: "submissions", target: assignment,
      fingerprint: "4".repeat(64), mime: "video/mp4", size: 20,
    });
    await stageMedia(db, second, "video/mp4");
    const s2 = await workflow("submit", assignment, { storage_path: second.path, note: "Isolated product take 2" });
    await assert.rejects(workflow("review", s2, { status: "APPROVED" }), /Admin required/);
    await as(ADMIN);
    await assert.rejects(workflow("review", s2, { status: "REVISION", reason: "Try again" }), /Revision limit reached/);
    await workflow("review", s2, { status: "APPROVED" });
    const pay = await db.query<{ id: string; status: string; amount_paise: number }>(
      "select id,status,amount_paise from payments where assignment_id=$1", [assignment]
    );
    assert.equal(pay.rows[0].status, "PENDING", "No money was transferred in this isolated scenario");
    assert.equal(Number(pay.rows[0].amount_paise), 12345);
    await as(CREATOR);
    await assert.rejects(workflow("payment", pay.rows[0].id, { status: "PAID", reference: "FAKE" }), /Admin required/);
    await as(OTHER);
    assert.equal((await db.query("select * from payments")).rows.length, 0);
    assert.equal((await db.query("select * from storage.objects")).rows.length, 0);
    await as(ADMIN);
    assert.equal((await db.query("select * from project_scripts where project_id=$1", [project])).rows.length, 1);
    assert.equal((await db.query("select * from submissions where assignment_id=$1", [assignment])).rows.length, 2);
  } finally {
    await db.close();
  }
});

test("isolated VOICE OVER: assigned script, private audio, revision, creator isolation and no fabricated paid status", async () => {
  const { db, as, workflow, control, setup } = await fixture();
  try {
    const { project, assignment } = await setup("VOICE");
    await as(OTHER);
    assert.equal((await db.query("select * from project_scripts where project_id=$1", [project])).rows.length, 0);
    await as(CREATOR);
    const script = await db.query<{ script: string }>(
      "select script from project_scripts where project_id=$1", [project]
    );
    assert.equal(script.rows[0].script, "Private test script");
    await assert.rejects(workflow("review", assignment, { status: "APPROVED" }), /Admin required/);
    const audio = await control<Session>("begin", null, {
      bucket: "submissions", target: assignment,
      fingerprint: "5".repeat(64), mime: "audio/mpeg", size: 20,
    });
    await stageMedia(db, audio, "audio/mpeg");
    const first = await workflow("submit", assignment, {
      storage_path: audio.path, note: "Test Hindi voice over"
    });
    await as(OTHER);
    assert.equal((await db.query("select * from submissions")).rows.length, 0);
    await assert.rejects(
      workflow("submit", assignment, { storage_path: audio.path }),
      /Assignment unavailable/,
    );
    await as(ADMIN);
    await workflow("review", first, { status: "REVISION", reason: "Improve pacing" });
    await as(CREATOR);
    const revised = await control<Session>("begin", null, {
      bucket: "submissions", target: assignment,
      fingerprint: "6".repeat(64), mime: "audio/mpeg", size: 20,
    });
    await stageMedia(db, revised, "audio/mpeg");
    const second = await workflow("submit", assignment, {
      storage_path: revised.path, note: "Test revised voice over"
    });
    await as(ADMIN);
    await assert.rejects(
      workflow("review", second, { status: "REVISION", reason: "Try again" }),
      /Revision limit reached/,
    );
    await workflow("review", second, { status: "APPROVED" });
    const payment = (await db.query<{ id: string; status: string }>(
      "select id,status from payments where assignment_id=$1", [assignment]
    )).rows[0];
    assert.equal(payment.status, "PENDING");
    await assert.rejects(
      workflow("payment", payment.id, { status: "PAID", reference: "" }),
      /check constraint/,
    );
    await workflow("payment", payment.id, { status: "PROCESSING" });
    assert.equal(
      (await db.query<{ status: string }>("select status from payments where id=$1", [payment.id])).rows[0].status,
      "PROCESSING",
    );
  } finally {
    await db.close();
  }
});
