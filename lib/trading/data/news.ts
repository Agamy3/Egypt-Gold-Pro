import 'server-only';

/**
 * MVP sentiment stub.
 * This is intentionally neutral and safe; later we can integrate a real provider
 * or reuse the existing news ingestion system with symbol tagging.
 */
export async function getNewsSentimentForSymbol(_symbol: string): Promise<{
  sentiment: number; // -1..+1
  headlines: string[];
}> {
  return { sentiment: 0, headlines: [] };
}

