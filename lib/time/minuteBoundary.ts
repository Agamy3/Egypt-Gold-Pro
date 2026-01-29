import 'server-only';

/**
 * Floor to the current UTC minute boundary (seconds=0, ms=0) in UTC.
 */
export function floorToUtcMinute(d: Date): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  return new Date(Date.UTC(y, m, day, hh, mm, 0, 0));
}

/**
 * Next UTC minute boundary strictly after `d`.
 */
export function nextUtcMinuteBoundary(d: Date): Date {
  const floored = floorToUtcMinute(d);
  return new Date(floored.getTime() + 60_000);
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/**
 * UTC minute key string: "YYYY-MM-DDTHH:MM:00Z"
 */
export function toMinuteKeyUtc(d: Date): string {
  const f = floorToUtcMinute(d);
  return (
    `${f.getUTCFullYear()}-${pad2(f.getUTCMonth() + 1)}-${pad2(f.getUTCDate())}` +
    `T${pad2(f.getUTCHours())}:${pad2(f.getUTCMinutes())}:00Z`
  );
}

// Backward-compatible aliases used by older code in this repo.
export function currentMinuteBoundary(now: Date = new Date()): Date {
  return floorToUtcMinute(now);
}

export function nextMinuteBoundary(now: Date = new Date()): Date {
  return nextUtcMinuteBoundary(now);
}

