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

export function getGoldZone(priceUsd: number): {
  zone: string;
  action: string;
  strength: string;
  direction: ZoneDirection;
} | null {
  const z = getGoldSignalZone(priceUsd);
  if (!z) return null;
  return { zone: z.label, action: z.action, strength: z.stars, direction: z.direction };
}

export function zoneWhyNow(zone: GoldSignalZone, lang: 'en' | 'ar' = 'en'): string {
  if (lang === 'ar') {
    if (zone.label === 'Core Buy') return 'الذهب في منطقة تجميع قوية طويلة المدى.';
    if (zone.label === 'Strong Buy') return 'الذهب في منطقة تجميع قوية وبيعتبر أقل من قيمته حسب التحليل.';
    if (zone.label === 'Buy') return 'الذهب داخل نطاق مناسب للتجميع التدريجي.';
    if (zone.label === 'Partial Sell') return 'الذهب وصل لمنطقة مناسبة لجني الأرباح جزئياً.';
    if (zone.label === 'Strong Sell') return 'الذهب في منطقة مرتفعة وخطر نسبي مقارنة بالتحليل.';
    return 'السعر داخل نطاق استراتيجي حسب الحدود المعرّفة.';
  }
  if (zone.label === 'Core Buy') {
    return 'Gold is in a strong long-term accumulation zone, indicating high confidence for positioning.';
  }
  if (zone.label === 'Strong Buy') {
    return 'Gold is in a deep accumulation zone, historically considered undervalued relative to our strategy.';
  }
  if (zone.label === 'Buy') {
    return 'Gold remains in an accumulation range where gradual buying is favorable.';
  }
  if (zone.label === 'Partial Sell') {
    return 'Gold has entered a profit-taking zone where reducing exposure may be reasonable.';
  }
  if (zone.label === 'Strong Sell') {
    return 'Gold is in a high-risk distribution zone where prices are elevated relative to strategy thresholds.';
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
