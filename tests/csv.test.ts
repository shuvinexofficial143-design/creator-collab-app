import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, recordsToCsv, isExportKind, EXPORTS, MAX_EXPORT_ROWS } from "../src/lib/csv";

test("CSV escaping blocks spreadsheet formula injection, whitespace tricks and quote breaks", () => {
  const bad = [
    "=HYPERLINK(\"https://example.org\")",
    "+SUM(1,1)", "-1+3", "@SUM(1,1)",
    "  =2+2", "\t@danger", "\r\n=1+1",
    "\uFEFF=cmd", "\u200B+cmd", "\u202E@code", "\uFF1D1+2",
  ];
  for (const value of bad) {
    const encoded = csvCell(value);
    assert.ok(encoded.startsWith("\"'"), `dangerous value not neutralized: ${JSON.stringify(value)}`);
  }
  assert.equal(csvCell("Hello, \"world\"\r\nnext"), "\"Hello, \"\"world\"\"\r\nnext\"");
  assert.equal(csvCell(null), "\"\"");
  assert.equal(csvCell("Normal value"), "\"Normal value\"");
});
test("CSV never turns a malicious cell into a new column", () => {
  const csv = recordsToCsv(["id", "note"], [
    { id: "1", note: "=1+2" },
    { id: "2", note: "hello,\"friend\"\r\nnext" },
  ]);
  assert.ok(csv.startsWith("\uFEFF\"id\",\"note\"\r\n"));
  assert.ok(csv.includes("\"'=1+2\""));
  assert.ok(csv.includes("\"hello,\"\"friend\"\"\r\nnext\""));
  assert.ok(csv.endsWith("\r\n"));
});
test("admin export datasets are explicitly limited and static", () => {
  assert.equal(MAX_EXPORT_ROWS, 5000);
  for (const value of ["applications", "payments", "shipping", "audit"]) {
    assert.equal(isExportKind(value), true);
    assert.ok(EXPORTS[value as keyof typeof EXPORTS].columns.length > 0);
  }
  for (const value of ["", "../payments", "__proto__", "profiles", "upload_sessions"]) {
    assert.equal(isExportKind(value), false);
  }
});
