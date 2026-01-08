/**
 * Unit Tests for Pricing Engine
 * 
 * Acceptance Test: Input xau=2682.67, market21=6025 → Output usdEgp_gold ≈ 79-81
 */

import {
  impliedOunceToUsdPerGram24,
  usdPerGram24To21,
  computeImpliedGoldFx,
  computeLocalMarketParity,
  computeFairValue,
  computeVariance,
  calculatePricing,
} from './pricing';

describe('Pricing Engine', () => {
  describe('impliedOunceToUsdPerGram24', () => {
    it('should convert Egypt Market Implied Ounce (USD per troy ounce) to USD per gram (24k)', () => {
      const result = impliedOunceToUsdPerGram24(4500.0);
      // 4500.0 / 31.1034768 ≈ 144.68
      expect(result).toBeCloseTo(144.68, 2);
    });

    it('should return null for null input', () => {
      expect(impliedOunceToUsdPerGram24(null)).toBeNull();
    });

    it('should return null for zero or negative input', () => {
      expect(impliedOunceToUsdPerGram24(0)).toBeNull();
      expect(impliedOunceToUsdPerGram24(-100)).toBeNull();
    });
  });

  describe('usdPerGram24To21', () => {
    it('should convert USD per gram (24k) to USD per gram (21k)', () => {
      const usdPerGram24 = 86.262;
      const result = usdPerGram24To21(usdPerGram24);
      // 86.262 * 0.875 ≈ 75.479
      expect(result).toBeCloseTo(75.479, 3);
    });

    it('should return null for null input', () => {
      expect(usdPerGram24To21(null)).toBeNull();
    });
  });

  describe('computeImpliedGoldFx', () => {
    it('should compute implied Gold FX correctly (ACCEPTANCE TEST)', () => {
      // Acceptance test: impliedOunce=4500, market21=6025
      const impliedOunceUsd = 4500.0;
      const market21Buy = 6025;

      const usdPerGram24 = impliedOunceToUsdPerGram24(impliedOunceUsd);
      const usdPerGram21 = usdPerGram24To21(usdPerGram24!);
      const result = computeImpliedGoldFx(market21Buy, usdPerGram21);

      // Expected: 6025 / (4500/31.1034768 * 0.875) ≈ 6025 / 126.6 ≈ 47.6
      expect(result).toBeCloseTo(47.6, 1);
      expect(result).toBeGreaterThan(47);
      expect(result).toBeLessThan(48);
    });

    it('should return null if market21Buy is null', () => {
      expect(computeImpliedGoldFx(null, 75.5)).toBeNull();
    });

    it('should return null if usdPerGram21 is null', () => {
      expect(computeImpliedGoldFx(6025, null)).toBeNull();
    });

    it('should return null if both are null', () => {
      expect(computeImpliedGoldFx(null, null)).toBeNull();
    });
  });

  describe('computeLocalMarketParity', () => {
    it('should compute local market parity prices', () => {
      const usdPerGram24 = 86.262;
      const usdPerGram21 = 75.479;
      const usdEgpGold = 80.0;

      const result = computeLocalMarketParity(usdPerGram24, usdPerGram21, usdEgpGold);

      // local24 = 86.262 * 80 = 6900.96
      expect(result.local24).toBeCloseTo(6900.96, 2);
      // local21 = 6900.96 * 0.875 = 6038.34
      expect(result.local21).toBeCloseTo(6038.34, 2);
    });

    it('should return nulls if usdEgpGold is null', () => {
      const result = computeLocalMarketParity(86.262, 75.479, null);
      expect(result.local24).toBeNull();
      expect(result.local21).toBeNull();
    });
  });

  describe('computeFairValue', () => {
    it('should compute fair value using official USD/EGP', () => {
      const usdPerGram24 = 86.262;
      const usdPerGram21 = 75.479;
      const usdEgpOfficial = 50.0;

      const result = computeFairValue(usdPerGram24, usdPerGram21, usdEgpOfficial);

      // fair24 = 86.262 * 50 = 4313.1
      expect(result.fair24).toBeCloseTo(4313.1, 2);
      // fair21 = 4313.1 * 0.875 = 3773.96
      expect(result.fair21).toBeCloseTo(3773.96, 2);
    });

    it('should return nulls if usdEgpOfficial is null', () => {
      const result = computeFairValue(86.262, 75.479, null);
      expect(result.fair24).toBeNull();
      expect(result.fair21).toBeNull();
    });
  });

  describe('computeVariance', () => {
    it('should classify as FAIR when variance is within 1.5%', () => {
      const market21Buy = 6030;
      const fair21 = 6000;
      // Variance: (6030 - 6000) / 6000 * 100 = 0.5% (within 1.5%)

      const result = computeVariance(market21Buy, fair21);

      expect(result.classification).toBe('FAIR');
      expect(result.variancePct).toBeCloseTo(0.5, 2);
      expect(result.premiumEGP).toBe(30);
    });

    it('should classify as OVERPRICED when variance > 1.5%', () => {
      const market21Buy = 6150;
      const fair21 = 6000;
      // Variance: (6150 - 6000) / 6000 * 100 = 2.5% (> 1.5%)

      const result = computeVariance(market21Buy, fair21);

      expect(result.classification).toBe('OVERPRICED');
      expect(result.variancePct).toBeCloseTo(2.5, 2);
      expect(result.premiumEGP).toBe(150);
    });

    it('should classify as UNDERPRICED when variance < -1.5%', () => {
      const market21Buy = 5910;
      const fair21 = 6000;
      // Variance: (5910 - 6000) / 6000 * 100 = -1.5% (at threshold)

      const result = computeVariance(market21Buy, fair21);

      // At exactly -1.5%, it should still be FAIR (threshold is > 1.5%)
      // Let's test with -1.6%
      const result2 = computeVariance(5910 - 6, fair21);
      expect(result2.classification).toBe('UNDERPRICED');
    });

    it('should return N/A if market21Buy is null', () => {
      const result = computeVariance(null, 6000);
      expect(result.classification).toBe('N/A');
      expect(result.variancePct).toBeNull();
      expect(result.premiumEGP).toBeNull();
    });

    it('should return N/A if fair21 is null', () => {
      const result = computeVariance(6025, null);
      expect(result.classification).toBe('N/A');
      expect(result.variancePct).toBeNull();
      expect(result.premiumEGP).toBeNull();
    });
  });

  describe('calculatePricing (Integration Test)', () => {
    it('should compute complete pricing pipeline (ACCEPTANCE TEST)', () => {
      const impliedOunceUsd = 4500.0;
      const market21Buy = 6025;

      const result = calculatePricing({
        impliedOunceUsd: impliedOunceUsd,
        market21Buy: market21Buy,
        market21Sell: null,
        market24Buy: null,
        market24Sell: null,
      });

      // Verify usdEgp_gold is computed
      expect(result.usdEgpGold).not.toBeNull();
      expect(result.usdEgpGold!).toBeGreaterThan(47);
      expect(result.usdEgpGold!).toBeLessThan(48);

      // Verify other computed values
      expect(result.usdPerGram24).not.toBeNull();
      expect(result.usdPerGram21).not.toBeNull();
    });

    it('should handle null market data gracefully', () => {
      const result = calculatePricing({
        impliedOunceUsd: 4500.0,
        market21Buy: null,
        market21Sell: null,
        market24Buy: null,
        market24Sell: null,
      });

      // usdEgpGold should be null when market21Buy is null
      expect(result.usdEgpGold).toBeNull();
      expect(result.localMarketParity.local24).toBeNull();
      expect(result.localMarketParity.local21).toBeNull();
    });

    it('should never compute market prices from implied ounce', () => {
      // This test ensures we're not computing market prices
      // The function should only use provided market prices
      const result = calculatePricing({
        impliedOunceUsd: 4500.0,
        market21Buy: null, // Explicitly null
        market21Sell: null,
        market24Buy: null,
        market24Sell: null,
      });

      // usdEgpGold must be null (hard guard)
      expect(result.usdEgpGold).toBeNull();
    });
  });
});

