import 'server-only';

export function floorToUtcMinutes(d: Date, minutes: number): Date {
  const m = Math.max(1, Math.floor(minutes));
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const day = d.getUTCDate();
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  const flooredMin = Math.floor(mm / m) * m;
  return new Date(Date.UTC(y, mo, day, hh, flooredMin, 0, 0));
}

export function cycleKeyUtc(d: Date, minutes: number): { cycleKey: string; cycleStartedAt: Date } {
  const started = floorToUtcMinutes(d, minutes);
  return { cycleKey: started.toISOString().replace(/\.\d{3}Z$/, 'Z'), cycleStartedAt: started };
}

export function isAsiaSessionUtc(d: Date): boolean {
  // Rough session gate (UTC): 00:00–08:59.
  const h = d.getUTCHours();
  return h >= 0 && h <= 8;
}

