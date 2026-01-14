/**
 * Content Ready Helper
 * 
 * Determines if a page has sufficient content to show ads.
 * AdSense policy: ads should only render when meaningful content is visible.
 */

export interface ContentReadyOptions {
  hasPrimaryData: boolean;
  itemCount?: number;
  minItems?: number;
}

/**
 * Check if content is ready for ads to be displayed.
 * 
 * Rules:
 * - hasPrimaryData must be true
 * - if itemCount is provided: itemCount >= minItems (default minItems = 3)
 * - return false otherwise
 */
export function isContentReady({
  hasPrimaryData,
  itemCount,
  minItems = 3,
}: ContentReadyOptions): boolean {
  if (!hasPrimaryData) {
    return false;
  }

  if (itemCount !== undefined) {
    return itemCount >= minItems;
  }

  return true;
}
