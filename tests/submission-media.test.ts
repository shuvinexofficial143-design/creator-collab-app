import { test } from "node:test";
import assert from "node:assert/strict";
import { projectKindFromSubmission } from "../src/lib/submission-media";
test("PostgREST relation shapes select audio and video rendering deterministically", () => {
  assert.equal(projectKindFromSubmission({ projects: { kind: "VOICE" } }), "VOICE");
  assert.equal(projectKindFromSubmission([{ projects: [{ kind: "PRODUCT" }] }]), "PRODUCT");
  assert.equal(projectKindFromSubmission([{ projects: { kind: "VOICE" } }]), "VOICE");
  for (const value of [null, [], {}, { projects: null }, { projects: { kind: "UNKNOWN" } }]) {
    assert.equal(projectKindFromSubmission(value), null);
  }
});
