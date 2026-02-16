import { computeGoldAlgoSignal } from './goldAlgo';

describe('computeGoldAlgoSignal confidence calibration', () => {
  const baseVol = 0; // so threshold = base (0.0002)

  it('BUY at exactly threshold has confidence ≥ 0.55', () => {
    const { action, confidence, threshold } = computeGoldAlgoSignal({
      pctChange5m: 0.0002,
      volatilityProxy: baseVol,
    });
    expect(threshold).toBeGreaterThan(0);
    expect(action).toBe('BUY');
    expect(confidence).toBeGreaterThanOrEqual(0.55);
  });

  it('SELL at exactly threshold has confidence ≥ 0.55', () => {
    const { action, confidence, threshold } = computeGoldAlgoSignal({
      pctChange5m: -0.0002,
      volatilityProxy: baseVol,
    });
    expect(threshold).toBeGreaterThan(0);
    expect(action).toBe('SELL');
    expect(confidence).toBeGreaterThanOrEqual(0.55);
  });

  it('BUY at 1.2× threshold has confidence ≈ 0.67 (≥ 0.65)', () => {
    const { action, confidence, threshold } = computeGoldAlgoSignal({
      pctChange5m: 1.2 * 0.0002,
      volatilityProxy: baseVol,
    });
    expect(action).toBe('BUY');
    // With the specified S-curve (tanh with gain 1.4), this is approximately 0.67
    expect(confidence).toBeGreaterThanOrEqual(0.65);
  });

  it('BUY at 2× threshold has confidence ≥ 0.88', () => {
    const { action, confidence, threshold } = computeGoldAlgoSignal({
      pctChange5m: 2 * 0.0002,
      volatilityProxy: baseVol,
    });
    expect(action).toBe('BUY');
    expect(confidence).toBeGreaterThanOrEqual(0.88);
  });

  it('HOLD at zero move has very high confidence (≥ 0.95)', () => {
    const { action, confidence } = computeGoldAlgoSignal({
      pctChange5m: 0,
      volatilityProxy: baseVol,
    });
    expect(action).toBe('HOLD');
    expect(confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('HOLD near threshold (0.9×) has low confidence (≤ 0.45)', () => {
    const baseThreshold = 0.0002;
    const ratio = 0.9;
    const pct = baseThreshold * ratio;
    const { action, confidence, threshold } = computeGoldAlgoSignal({
      pctChange5m: pct,
      volatilityProxy: baseVol,
    });
    expect(threshold).toBeCloseTo(baseThreshold, 6);
    expect(action).toBe('HOLD');
    expect(confidence).toBeLessThanOrEqual(0.45);
  });
});

