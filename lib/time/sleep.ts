import 'server-only';

export async function sleepMs(ms: number): Promise<void> {
  const safe = Math.max(0, Math.floor(ms));
  if (safe <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, safe));
}

