/**
 * Egypt Source Configuration
 * 
 * Controls which sources are trusted for market data aggregation
 */

export const EGYPT_TRUSTED_ONLY_MODE = true;
export const EGYPT_TRUSTED_SOURCE = "goldbullioneg" as const;

export function isTrustedEgyptSource(source: string): boolean {
  return !EGYPT_TRUSTED_ONLY_MODE || source === EGYPT_TRUSTED_SOURCE;
}



