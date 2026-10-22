import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, ADMIN, CREATOR, OTHER, type Session } from "./db-fixture";
test("all migrations: upload leases, cleanup false positives, both attachment/claim race orderings and failure recovery", async () => {
  const { db, as, control, workflow, setup } = await fixture();
  try {
    const { assignment, project } = await setup();
    const begin = (fingerprint: string) =>
      control<Session>("begin", null, {
        bucket: "submissions",
        target: assignment,
        fingerprint: fingerprint.repeat(64),
        mime: "audio/mpeg",
        size: 20,
      });
    const active = await begin("a");
    assert.equal(
      (await begin("a")).id,
      active.id,
      "same file/target reuses one intent",
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name) values('submissions','arbitrary')",
      ),
      /row-level security/,
    );
    async function put(s: Session) {
      return (
        await db.query<{ id: string }>(
          "insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3) returning id",
          [
            s.bucket,
            s.path,
            JSON.stringify({ size: 20, mimetype: "audio/mpeg" }),
          ],
        )
      ).rows[0].id;
    }
    const activeObject = await put(active);
    await as(OTHER);
    await assert.rejects(control("heartbeat", active.id), /unavailable/);
    assert.equal(
      (await db.query("select * from upload_sessions")).rows.length,
      0,
    );
    await assert.rejects(control("preview"), /Admin required/);
    await assert.rejects(control("claim", null, {}), /Admin required/);
    await as(ADMIN);
    assert.deepEqual(await control("preview"), []);
    // Age metadata as fixture owner; the active lease must still protect it.
    await db.exec("reset role");
    await db.exec(
      "update storage.objects set created_at=now()-interval '2 days',updated_at=now()-interval '2 days'",
    );
    await as(ADMIN);
    assert.deepEqual(await control("preview"), []);
    await as(CREATOR);
    await workflow("submit", assignment, { storage_path: active.path });
    await db.exec("reset role");
    await db.exec(
      "update upload_sessions set lease_until=now()-interval '2 days'",
    );
    await as(ADMIN);
    assert.deepEqual(
      await control("preview"),
      [],
      "referenced uploads never eligible",
    );
    await assert.rejects(
      control("claim", null, {
        bucket: active.bucket,
        path: active.path,
        object_id: activeObject,
        confirmation: "DELETE UNREFERENCED FILE",
      }),
      /no longer a cleanup candidate/,
    );
    // Reopen via real revision, then start a separate file that will be abandoned.
    const submission = (
      await db.query<{ id: string }>("select id from submissions")
    ).rows[0].id;
    await workflow("review", submission, {
      status: "REVISION",
      reason: "Isolated test revision",
    });
    await as(CREATOR);
    const old = await begin("b");
    const oldObject = await put(old);
    await db.exec("reset role");
    await db.query(
      "update storage.objects set created_at=now()-interval '2 days',updated_at=now()-interval '2 days' where id=$1",
      [oldObject],
    );
    await db.query(
      "update upload_sessions set lease_until=now()-interval '2 days' where id=$1",
      [old.id],
    );
    await as(ADMIN);
    assert.equal((await control<unknown[]>("preview")).length, 1);
    await assert.rejects(
      control("claim", null, {
        bucket: old.bucket,
        path: old.path,
        object_id: oldObject,
      }),
      /confirmation/,
    );
    const claim = await control<Session>("claim", null, {
      bucket: old.bucket,
      path: old.path,
      object_id: oldObject,
      confirmation: "DELETE UNREFERENCED FILE",
    });
    await as(CREATOR);
    await assert.rejects(
      workflow("submit", assignment, { storage_path: old.path }),
      /no longer available/,
    );
    await assert.rejects(control("heartbeat", old.id), /no longer active/);
    assert.equal(
      (
        await db.query("delete from storage.objects where id=$1 returning id", [
          oldObject,
        ])
      ).rows.length,
      0,
      "creator cannot delete even their own claimed object",
    );
    await as(ADMIN);
    assert.deepEqual(
      await control("cleanup_result", claim.id, { claim_id: claim.claim_id }),
      { deleted: false },
      "no false success before Storage API removes bytes",
    );
    // Simulates Storage API metadata deletion under the actual authenticated RLS policy.
    assert.equal(
      (
        await db.query("delete from storage.objects where id=$1 returning id", [
          oldObject,
        ])
      ).rows.length,
      1,
    );
    assert.deepEqual(
      await control("cleanup_result", claim.id, { claim_id: claim.claim_id }),
      { deleted: true },
    );
    await as(CREATOR);
    await assert.rejects(
      put(old),
      /row-level security/,
      "deleted paths cannot be reused",
    );
    // New files and active project media are never cleanup candidates.
    await as(ADMIN);
    const media = await control<Session>("begin", null, {
      bucket: "project-media",
      target: project,
      fingerprint: "c".repeat(64),
      mime: "image/png",
      size: 20,
    });
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)",
      [
        media.bucket,
        media.path,
        JSON.stringify({ size: 20, mimetype: "image/png" }),
      ],
    );
    await workflow("media", project, {
      storage_path: media.path,
      mime_type: "image/png",
    });
    await db.exec("reset role");
    await db.exec(
      "update storage.objects set created_at=now()-interval '2 days',updated_at=now()-interval '2 days';update upload_sessions set lease_until=now()-interval '2 days'",
    );
    await as(ADMIN);
    assert.deepEqual(await control("preview"), []);
    assert.equal(
      (await db.query("select * from audit_logs where action like 'cleanup_%'"))
        .rows.length,
      3,
    );
    await as("");
    await assert.rejects(control("preview"), /permission denied/);
  } finally {
    await db.close();
  }
});
