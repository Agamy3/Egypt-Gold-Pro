import 'server-only';

/**
 * Floor to the current minute boundary (seconds=0, ms=0).
 */
export function currentMinuteBoundary(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setSeconds(0, 0);
  return d;
}

/**
 * Next minute boundary (seconds=0, ms=0) strictly after `now`.
 */
export function nextMinuteBoundary(now: Date = new Date()): Date {
  const d = currentMinuteBoundary(now);
  d.setMinutes(d.getMinutes() + 1);
  return d;
}

