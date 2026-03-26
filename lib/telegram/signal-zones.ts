import 'server-only';

export type ZoneDirection = 'buy' | 'sell' | 'neutral';

export interface GoldSignalZone {
  label: string;
  action: string;
  stars: string;
  direction: ZoneDirection;
  min: number;
  max: number;
}

const ZONES: GoldSignalZone[] = [
  { min: 3600, max: 4000, label: 'Strong Buy', action: 'Strong Buy', stars: '⭐⭐⭐', direction: 'buy' },
  { min: 4000, max: 4300, label: 'Buy', action: 'Buy', stars: '⭐⭐⭐⭐', direction: 'buy' },
  { min: 4300, max: 4500, label: 'Core Buy', action: 'Core Buy', stars: '⭐⭐⭐⭐⭐', direction: 'buy' },
  { min: 5200, max: 5500, label: 'Partial Sell', action: 'Partial Sell', stars: '⭐⭐⭐⭐', direction: 'sell' },
  { min: 5800, max: 6300, label: 'Strong Sell', action: 'Strong Sell', stars: '⭐⭐⭐⭐⭐', direction: 'sell' },
];

export function getGoldSignalZone(priceUsd: number): GoldSignalZone | null {
  if (!isFinite(priceUsd) || priceUsd <= 0) return null;
  for (const zone of ZONES) {
    if (priceUsd >= zone.min && priceUsd <= zone.max) return zone;
  }
  return null;
}

export function zoneWhyNow(zone: GoldSignalZone): string {
  if (zone.label === 'Core Buy') {
    return 'Price is currently inside the Core Buy zone, which historically represents a strong accumulation area relative to our strategy thresholds.';
  }
  if (zone.label === 'Strong Buy') {
    return 'Price is currently inside the Strong Buy zone, indicating deep discount conditions where accumulation may be attractive.';
  }
  if (zone.label === 'Buy') {
    return 'Price is in the Buy zone, meaning it is above deep-discount levels but still within an accumulation range.';
  }
  if (zone.label === 'Partial Sell') {
    return 'Price is in the Partial Sell zone, which may justify trimming exposure while keeping a core position.';
  }
  if (zone.label === 'Strong Sell') {
    return 'Price has moved into the Strong Sell zone, which suggests elevated levels where reducing exposure may be prudent.';
  }
  return 'Price is inside a strategy zone based on configured thresholds.';
}

export function zonePreview(priceUsd: number): {
  priceUsd: number;
  zone: GoldSignalZone | null;
  whyNow: string;
} {
  const zone = getGoldSignalZone(priceUsd);
  return {
    priceUsd,
    zone,
    whyNow: zone ? zoneWhyNow(zone) : 'Price is outside configured buy/sell zones, so no zone-based action is suggested.',
  };
}
