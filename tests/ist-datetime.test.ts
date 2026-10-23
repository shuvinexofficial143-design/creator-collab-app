import { test } from "node:test";
import assert from "node:assert/strict";
import { formatISTInput, parseISTInput } from "../src/lib/ist-datetime";
test("datetime-local values consistently round-trip between IST and UTC", () => {
  assert.equal(parseISTInput("2026-10-23T09:30"), "2026-10-23T04:00:00.000Z");
  assert.equal(formatISTInput("2026-10-23T04:00:00.000Z"), "2026-10-23T09:30");
  assert.equal(parseISTInput("2026-01-01T00:15"), "2025-12-31T18:45:00.000Z");
  assert.equal(formatISTInput("2025-12-31T18:45:00.000Z"), "2026-01-01T00:15");
  assert.equal(parseISTInput("2028-02-29T23:59"), "2028-02-29T18:29:00.000Z");
});
test("impossible and ambiguous datetime-local inputs are rejected", () => {
  for(const value of ["", "2026-02-29T09:30", "2026-13-01T10:00", "2026-04-31T10:00",
    "2026-10-23T25:00", "2026-10-23T10:60", "2026-10-23", "2026-10-23T09:30Z",
    "2026-10-23T09:30+05:30", "2026-10-23T09:30:00"]) {
    assert.equal(parseISTInput(value), null, value);
  }
  assert.equal(formatISTInput("invalid"), "");
  assert.equal(formatISTInput(), "");
});
