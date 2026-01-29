/**
 * AdSense policy gating (default-deny).
 *
 * Goal: ensure NO ad slots ever render on thin/utility screens or routes that
 * don't contain substantial publisher content.
 *
 * IMPORTANT: ad slots must be client-only and mounted only after content is ready
 * and the slot becomes viewable (IntersectionObserver).
 */

export const MIN_TEXT_LENGTH = 800;

const ALLOWLIST_PREFIXES = ['/news', '/articles', '/learn'];
// Allowlist is explicit and small. We can expand safely by adding routes here.
const ALLOWLIST_EXACT = ['/', '/news'];

const HARD_DENY_PREFIXES = [
  '/admin',
  '/account',
  '/portfolio',
  '/forecast',
  '/premium',
  '/notifications',
  '/login',
  '/signup',
  '/auth',
  '/api',
];

const HARD_DENY_EXACT = ['/ads-debug'];

function normalizePath(pathname: string) {
  if (!pathname) return '/';
  const p = pathname.split('?')[0].split('#')[0];
  return p.startsWith('/') ? p : `/${p}`;
}

export function isRouteAdEligible(pathname: string): boolean {
  const p = normalizePath(pathname);

  // Hard deny always wins.
  if (HARD_DENY_EXACT.includes(p)) return false;
  if (HARD_DENY_PREFIXES.some((pre) => p === pre || p.startsWith(`${pre}/`))) return false;

  // Default deny; allow only allowlist.
  if (ALLOWLIST_EXACT.includes(p)) return true;
  if (ALLOWLIST_PREFIXES.some((pre) => p === pre || p.startsWith(`${pre}/`))) return true;

  return false;
}

export function isPageContentEligible(args: { textLength: number; hasMeaningfulContent: boolean }): boolean {
  if (!args.hasMeaningfulContent) return false;
  if (!isFinite(args.textLength) || args.textLength < MIN_TEXT_LENGTH) return false;
  return true;
}

export function shouldRenderAdUnit(args: {
  pathname: string;
  textLength: number;
  hasMeaningfulContent: boolean;
  isClient: boolean;
  hasUserConsented?: boolean;
}): boolean {
  if (!args.isClient) return false;
  if (args.hasUserConsented === false) return false;
  if (!isRouteAdEligible(args.pathname)) return false;
  if (!isPageContentEligible({ textLength: args.textLength, hasMeaningfulContent: args.hasMeaningfulContent })) return false;
  return true;
}

