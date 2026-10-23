import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3199"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let output = "";
server.stdout.on("data", (d) => (output += d));
server.stderr.on("data", (d) => (output += d));
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      await fetch("http://127.0.0.1:3199");
      ready = true;
      break;
    } catch {
      await setTimeout(100);
    }
  }
  assert.ok(ready, output);
  for (const [path, text, final] of [
    ["/", "Your creativity.", "/"],
    ["/auth/login", "Welcome back", "/auth/login"],
    ["/workspace", "Your workspace is almost ready.", "/setup"],
    ["/workspace/admin", "Your workspace is almost ready.", "/setup"],
  ]) {
    const response = await fetch("http://127.0.0.1:3199" + path);
    assert.equal(response.status, 200);
    assert.equal(new URL(response.url).pathname, final);
    assert.ok((await response.text()).includes(text));
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    console.log("PASS", path, "→", final);
  }
  for (const path of ["/auth/register", "/auth/forgot", "/auth/reset"]) {
    const response = await fetch("http://127.0.0.1:3199" + path);
    assert.equal(response.status, 404, `${path} must remain invitation-only`);
    console.log("PASS public access removed", path);
  }
  const exportResponse = await fetch("http://127.0.0.1:3199/api/admin/export?kind=payments");
  assert.equal(exportResponse.status, 503, "Unconfigured private CSV must fail closed");
  assert.match(exportResponse.headers.get("cache-control") || "", /no-store/);
  assert.equal(exportResponse.headers.get("x-content-type-options"), "nosniff");
  assert.match(await exportResponse.text(), /not configured/);

  const owner = await fetch("http://127.0.0.1:3199/api/owner-delivery", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ storage_path: "fake/file.mp4" }),
  });
  assert.equal(owner.status, 503, "Owner relay must fail closed without configured Supabase");
  assert.match(owner.headers.get("cache-control") || "", /no-store/);
  console.log("PASS private APIs fail closed without backend");
} finally {
  server.kill("SIGTERM");
}
