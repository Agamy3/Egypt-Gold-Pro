import 'server-only';

export function normalizeTimestampMs(input: unknown): number | null {
  if (input == null) return null;

  // ISO string
  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return null;
    const parsed = Date.parse(s);
    if (isFinite(parsed) && parsed > 0) return parsed;
    const n = Number(s);
    if (isFinite(n) && n > 0) {
      return n < 1e12 ? Math.floor(n * 1000) : Math.floor(n);
    }
    return null;
  }

  const n = typeof input === 'number' ? input : Number(input);
  if (!isFinite(n) || n <= 0) return null;
  // Heuristic: seconds if < 1e12
  return n < 1e12 ? Math.floor(n * 1000) : Math.floor(n);
}

export function asFiniteNumber(input: unknown): number | null {
  const n = typeof input === 'number' ? input : Number(input);
  return isFinite(n) ? n : null;
}

