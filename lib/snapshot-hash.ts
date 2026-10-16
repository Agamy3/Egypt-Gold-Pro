/** Hash the observation identity, not a truncated prefix of its JSON encoding.
 * Unchanged prices in a later observation must still create historical samples.
 * Retrying the same observation keeps its identity stable.
 */
export async function createSnapshotHash(
  country: string,
  source: string,
  observedAt: number,
  payload: unknown,
): Promise<string> {
  const input = JSON.stringify([country, source, observedAt, payload]);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
