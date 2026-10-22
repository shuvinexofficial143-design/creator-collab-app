/** Fixed allow-list of operational records suitable for authorized Admin export.
 * Use database column names as stable headers; don't interpolate request-supplied SQL. */
export const EXPORTS = {
  applications: {
    table: "applications",
    columns: ["id", "project_id", "creator_id", "status", "note", "reason", "created_at"],
    order: "created_at",
  },
  payments: {
    table: "payments",
    columns: ["id", "assignment_id", "creator_id", "amount_paise", "status", "reference", "paid_at"],
    order: "id",
  },
  shipping: {
    table: "shipping",
    columns: ["assignment_id", "status", "courier", "tracking"],
    order: "assignment_id",
  },
  audit: {
    table: "audit_logs",
    columns: ["id", "actor_id", "action", "target_id", "created_at"],
    order: "id",
  },
} as const;
export const MAX_EXPORT_ROWS = 5000;
export type ExportKind = keyof typeof EXPORTS;
export function isExportKind(value: string | null): value is ExportKind {
  return value !== null && Object.prototype.hasOwnProperty.call(EXPORTS, value);
}

/** Prefix dangerous spreadsheet-formula cells with an apostrophe.
 * Leading spaces, newlines and zero-width directional controls do not make
 * a formula safe. Quote every CSV field and escape embedded quotes. */
export function csvCell(input: unknown): string {
  let value = input == null ? "" : String(input);
  value = value.replace(/\u0000/g, "");
  if (/^[\u0000-\u0020\u007F\u00A0\u1680\u2000-\u200F\u2028-\u202E\u2060\uFEFF]*[=+\-@\uFF1D]/u.test(value)) {
    value = "'" + value;
  }
  return '"' + value.replace(/"/g, '""') + '"';
}

export function recordsToCsv(columns: readonly string[], rows: readonly Record<string, unknown>[]) {
  const header = columns.map(csvCell).join(",");
  const body = rows.map((record) => columns.map((column) => csvCell(record[column])).join(","));
  return "\uFEFF" + [header, ...body].join("\r\n") + "\r\n";
}
