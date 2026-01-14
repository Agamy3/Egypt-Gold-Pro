/**
 * Content gate helper for AdSense.
 *
 * Ensures we only render ads on pages that have meaningful content.
 */

export type AdPageType =
  | 'dashboard'
  | 'news'
  | 'portfolio'
  | 'auth'
  | 'account'
  | 'admin'
  | 'premium'
  | 'other';

export interface ContentGateInput {
  page: AdPageType;
  hasPrimaryData: boolean;
  itemCount?: number;
  /**
   * Optional minimum items threshold.
   * If not provided, sensible defaults are used per page type.
   */
  minItems?: number;
}

export function shouldRenderAdsOnThisPage({
  page,
  hasPrimaryData,
  itemCount,
  minItems,
}: ContentGateInput): boolean {
  // Hard disallow on certain page types regardless of content
  if (page === 'auth' || page === 'account' || page === 'admin' || page === 'premium') {
    return false;
  }

  // Require primary data (no loading / empty skeleton)
  if (!hasPrimaryData) {
    return false;
  }

  // Derive a default minItems if not explicitly provided
  const effectiveMin =
    typeof minItems === 'number'
      ? minItems
      : page === 'news'
      ? 3
      : page === 'portfolio'
      ? 1
      : 1;

  if (typeof itemCount === 'number' && itemCount < effectiveMin) {
    return false;
  }

  return true;
}


