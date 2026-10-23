/** Business deadlines use India Standard Time (+05:30) all year.
 * datetime-local input has no timezone; never interpret it in the server timezone. */
const IST_OFFSET_MS = 330 * 60 * 1000;

export function formatISTInput(value?: string | null): string {
  if (!value) return "";
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return "";
  return new Date(milliseconds + IST_OFFSET_MS).toISOString().slice(0, 16);
}

export function parseISTInput(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yy, mm, dd, hh, min] = match;
  const instant = Date.UTC(+yy, +mm - 1, +dd, +hh, +min) - IST_OFFSET_MS;
  if (!Number.isFinite(instant)) return null;
  const iso = new Date(instant).toISOString();
  return formatISTInput(iso) === value ? iso : null;
}
