import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { bootstrapSql, ADMIN, CREATOR } from "./db-fixture";
test(
  "real PostgreSQL connections serialize cleanup against attachment in both race orders",
  { skip: !process.env.TEST_DATABASE_URL, timeout: 30000 },
  async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    assert.ok(
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
        url.pathname === "/creator_test",
      "Only a disposable local creator_test database is allowed",
    );
    const root = new Client({ connectionString: url.href }),
      a = new Client({ connectionString: url.href }),
      b = new Client({ connectionString: url.href });
    await root.connect();
    await a.connect();
    await b.connect();
    async function as(c: Client, id: string) {
      await c.query("reset role");
      await c.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await c.query("set role authenticated");
    }
    async function control(c: Client, op: string, payload: object) {
      return (
        await c.query("select upload_control($1,null,$2::jsonb) as value", [
          op,
          JSON.stringify(payload),
        ])
      ).rows[0].value;
    }
    async function waitForLock(c: Client) {
      const pid = (await c.query("select pg_backend_pid() pid")).rows[0].pid;
      return pid;
    }
    const bpid = await waitForLock(b);
    async function blocked() {
      for (let i = 0; i < 40; i++) {
        const r = await root.query(
          "select wait_event_type from pg_stat_activity where pid=$1",
          [bpid],
        );
        if (r.rows[0]?.wait_event_type === "Lock") return;
        await setTimeout(25);
      }
      assert.fail(
        "Expected the competing transaction to wait on the advisory lock",
      );
    }
    try {
      await root.query(bootstrapSql);
      for (const f of readdirSync("supabase/migrations")
        .filter((f) => f.endsWith(".sql"))
        .sort())
        await root.query(readFileSync("supabase/migrations/" + f, "utf8"));
      await root.query("insert into auth.users(id) values($1),($2)", [
        ADMIN,
        CREATOR,
      ]);
      await root.query("update profiles set role='ADMIN' where id=$1", [ADMIN]);
      await as(a, ADMIN);
      const project = (
        await a.query("select workflow('project',null,$1::jsonb) id", [
          JSON.stringify({
            title: "ISOLATED RACE TEST",
            description: "Disposable concurrency fixture",
            kind: "VOICE",
            payment_paise: 0,
            instructions: "Test",
            language: "Hindi",
            usage_terms: "Test only",
            capacity: 1,
            deadline: "2099-01-01",
            status: "PUBLISHED",
            script: "",
          }),
        ])
      ).rows[0].id;
      const make = async (fingerprint: string) => {
        await as(a, ADMIN);
        const session = await control(a, "begin", {
          bucket: "project-media",
          target: project,
          fingerprint: fingerprint.repeat(64),
          mime: "audio/mpeg",
          size: 20,
        });
        const object = (
          await a.query(
            "insert into storage.objects(bucket_id,name,metadata) values('project-media',$1,$2) returning id",
            [
              session.path,
              JSON.stringify({ size: 20, mimetype: "audio/mpeg" }),
            ],
          )
        ).rows[0].id;
        await root.query(
          "update storage.objects set created_at=now()-interval '2 days',updated_at=now()-interval '2 days' where id=$1",
          [object],
        );
        await root.query(
          "update upload_sessions set lease_until=now()-interval '2 days' where id=$1",
          [session.id],
        );
        return { session, object };
      };
      // Cleanup claims first; competing attachment must block, then fail, not create a broken reference.
      const first = await make("a");
      await as(b, ADMIN);
      await a.query("begin");
      await control(a, "claim", {
        bucket: "project-media",
        path: first.session.path,
        object_id: first.object,
        confirmation: "DELETE UNREFERENCED FILE",
      });
      const attachment = b
        .query("select workflow('media',$1,$2::jsonb)", [
          project,
          JSON.stringify({
            storage_path: first.session.path,
            mime_type: "audio/mpeg",
          }),
        ])
        .then(
          () => null,
          (e) => e as Error,
        );
      await blocked();
      await a.query("commit");
      assert.match((await attachment)!.message, /no longer available/);
      assert.equal(
        (
          await root.query(
            "select * from project_media where storage_path=$1",
            [first.session.path],
          )
        ).rowCount,
        0,
      );
      // Attachment commits first; candidate preview may be stale, but claim must wait and reject it.
      const second = await make("b");
      await a.query("begin");
      await a.query("select workflow('media',$1,$2::jsonb)", [
        project,
        JSON.stringify({
          storage_path: second.session.path,
          mime_type: "audio/mpeg",
        }),
      ]);
      const claim = control(b, "claim", {
        bucket: "project-media",
        path: second.session.path,
        object_id: second.object,
        confirmation: "DELETE UNREFERENCED FILE",
      }).then(
        () => null,
        (e) => e as Error,
      );
      await blocked();
      await a.query("commit");
      assert.match((await claim)!.message, /no longer a cleanup candidate/);
      assert.equal(
        (
          await root.query("select * from storage.objects where id=$1", [
            second.object,
          ])
        ).rowCount,
        1,
      );
    } finally {
      await a.query("rollback").catch(() => {});
      await b.query("rollback").catch(() => {});
      await Promise.all([a.end(), b.end(), root.end()]);
    }
  },
);
