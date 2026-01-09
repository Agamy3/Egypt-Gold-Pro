/**
 * Gold Ingestion Utilities
 * 
 * Validation, parsing, and confidence calculation functions
 */

import { ABS_MIN, ABS_MAX, JS_PLACEHOLDER_PATTERNS, MIN_HTML_SIZE, Karat } from './gold-ingestion-config';

/**
 * Robust numeric parsing
 * Handles currency symbols, non-breaking spaces, commas, dots
 */
export function toFloat(value: unknown): number {
  if (value === null || value === undefined) {
    throw new Error('Value is null or undefined');
  }

  let s = String(value).trim();

  // Remove common currency symbols and words
  const currencyPatterns = [
    /ج\.?م\.?/g,
    /ج/g,
    /EGP/gi,
    /£/g,
    /\$/g,
    /جنيه/g,
    /LE\b/g,
    /L\.E\./g,
  ];
  
  for (const pattern of currencyPatterns) {
    s = s.replace(pattern, '');
  }

  // Replace non-breaking spaces and other whitespace
  s = s.replace(/\u00A0/g, ' '); // Non-breaking space
  s = s.replace(/\u2009/g, ' '); // Thin space
  s = s.replace(/\s+/g, ''); // Remove all whitespace

  // Remove commas (thousand separators)
  s = s.replace(/,/g, '');

  const parsed = parseFloat(s);
  if (isNaN(parsed)) {
    throw new Error(`Cannot parse '${value}' as float after cleaning`);
  }

  return parsed;
}

/**
 * Detect if HTML is likely JS-rendered or placeholder
 */
export function detectJsPage(html: string): boolean {
  // Check size
  if (html.length < MIN_HTML_SIZE) {
    return true;
  }

  const htmlLower = html.toLowerCase();

  // Check for JS placeholder patterns
  for (const pattern of JS_PLACEHOLDER_PATTERNS) {
    if (pattern.test(htmlLower)) {
      return true;
    }
  }

  return false;
}

/**
 * Validate price against absolute bounds
 */
export function validatePrice(karat: Karat, price: number): boolean {
  const min = ABS_MIN[karat];
  const max = ABS_MAX[karat];
  
  if (min === undefined || max === undefined) {
    return false;
  }

  return price >= min && price <= max;
}

/**
 * Compute confidence level and coefficient of variation
 */
export function computeConfidence(
  validPrices: number[],
  weightSum: number,
  numSources: number
): { level: 'LOW' | 'MED' | 'HIGH'; cv: number; stddev: number } {
  if (numSources < 2 || validPrices.length < 2) {
    return { level: 'LOW', cv: 0.0, stddev: 0.0 };
  }

  const mean = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
  if (mean === 0) {
    return { level: 'LOW', cv: 0.0, stddev: 0.0 };
  }

  const variance = validPrices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / validPrices.length;
  const stddev = Math.sqrt(variance);
  const cv = stddev / mean; // Coefficient of variation

  // Determine confidence level
  let level: 'LOW' | 'MED' | 'HIGH';
  if (numSources >= 3 && cv < 0.01) {
    level = 'HIGH';
  } else if (numSources >= 2 && cv < 0.02) {
    level = 'MED';
  } else {
    level = 'LOW';
  }

  return { level, cv, stddev };
}



