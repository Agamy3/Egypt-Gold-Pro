import { deriveFinalSignal, type FinalAction } from './deriveFinalSignal';

describe('deriveFinalSignal (stateful risk-first machine with hysteresis)', () => {
  it('HOLD → BUY with 2-cycle confirmation at confidence 0.72 and 0.75', () => {
    const out = deriveFinalSignal({
      prevFinalAction: 'HOLD',
      prevFinalChangedAt: null,
      rawActionNow: 'BUY',
      rawConfidenceNow: 0.72,
      regimeNow: 'trending',
      chopDetectedNow: false,
      varianceConflictNow: false,
      ai: null,
      historyRaw: [{ rawAction: 'BUY', rawConfidence: 0.75, cycle_key: 'k1' }],
    });
    expect(out.finalAction).toBe('BUY');
    expect(out.changed).toBe(true);
    expect(out.changeReason).toBe('confirm_2x_same_direction');
    expect(out.finalConfidence0to1).toBeCloseTo(0.72, 5);
    expect(out.guards).toContain('confirm_2x_same_direction');
  });

  it('HOLD → SELL fast-track with confidence 0.86 single cycle', () => {
    const out = deriveFinalSignal({
      prevFinalAction: 'HOLD',
      prevFinalChangedAt: null,
      rawActionNow: 'SELL',
      rawConfidenceNow: 0.86,
      regimeNow: 'trending',
      chopDetectedNow: false,
      varianceConflictNow: false,
      ai: null,
      historyRaw: [],
    });
    expect(out.finalAction).toBe('SELL');
    expect(out.changed).toBe(true);
    expect(out.changeReason).toBe('fast_track_strong_signal');
    expect(out.finalConfidence0to1).toBeCloseTo(0.86, 5);
    expect(out.guards).toContain('fast_track_strong_signal');
  });

  it('BUY does not flip directly to SELL unless very strong and breakout_3cycle', () => {
    const out = deriveFinalSignal({
      prevFinalAction: 'BUY',
      prevFinalChangedAt: '2026-02-12T10:00:00Z',
      rawActionNow: 'SELL',
      rawConfidenceNow: 0.88,
      regimeNow: 'trending',
      chopDetectedNow: false,
      varianceConflictNow: false,
      ai: null,
      historyRaw: [
        { rawAction: 'SELL', rawConfidence: 0.7, cycle_key: 'k1' },
        { rawAction: 'BUY', rawConfidence: 0.9, cycle_key: 'k0' },
      ],
    });
    expect(out.finalAction).toBe('HOLD');
    expect(out.changed).toBe(true);
    expect(out.changeReason).toBe('flip_blocked_go_through_hold');
    expect(out.guards).toContain('flip_blocked_go_through_hold');
  });

  it('BUY persists when raw weakens but no reversal confirmation', () => {
    const out = deriveFinalSignal({
      prevFinalAction: 'BUY',
      prevFinalChangedAt: '2026-02-12T10:00:00Z',
      rawActionNow: 'HOLD',
      rawConfidenceNow: 0.4,
      regimeNow: 'calm',
      chopDetectedNow: false,
      varianceConflictNow: false,
      ai: null,
      historyRaw: [{ rawAction: 'BUY', rawConfidence: 0.8, cycle_key: 'k1' }],
    });
    expect(out.finalAction).toBe('BUY');
    expect(out.changed).toBe(false);
    expect(out.changeReason).toBe('unchanged');
  });

  it('risk_brake forces HOLD in choppy regime when confidence < 0.85', () => {
    const out = deriveFinalSignal({
      prevFinalAction: 'BUY',
      prevFinalChangedAt: '2026-02-12T10:00:00Z',
      rawActionNow: 'BUY',
      rawConfidenceNow: 0.8,
      regimeNow: 'choppy',
      chopDetectedNow: true,
      varianceConflictNow: false,
      ai: null,
      historyRaw: [{ rawAction: 'BUY', rawConfidence: 0.8, cycle_key: 'k1' }],
    });
    expect(out.finalAction).toBe('HOLD');
    expect(out.changed).toBe(true);
    expect(out.changeReason).toBe('risk_brake_regime_choppy');
    expect(out.guards).toContain('risk_brake_regime_choppy');
    expect(out.finalConfidence0to1).toBeGreaterThanOrEqual(0.4);
  });

  it('AI high confidence can override final action', () => {
    const out = deriveFinalSignal({
      prevFinalAction: 'HOLD',
      prevFinalChangedAt: null,
      rawActionNow: 'HOLD',
      rawConfidenceNow: 0.4,
      regimeNow: 'calm',
      chopDetectedNow: false,
      varianceConflictNow: false,
      ai: { enabled: true, action: 'BUY', confidence0to1: 0.85 },
      historyRaw: [],
    });
    expect(out.finalAction).toBe('BUY');
    expect(out.changeReason).toBe('ai_override_high_conf');
    expect(out.guards).toContain('ai_override_high_conf');
  });

  it('Sanity: a 60-minute mixed stream yields at least one BUY/SELL final action', () => {
    const actions: FinalAction[] = [];
    let final: FinalAction = 'HOLD';
    let changedAt: string | null = null;
    const history: { rawAction: FinalAction; rawConfidence: number; cycle_key: string }[] = [];

    const rawStream: Array<{ a: FinalAction; c: number }> = [
      { a: 'HOLD', c: 0.5 },
      { a: 'HOLD', c: 0.6 },
      // Two-cycle BUY confirmation
      { a: 'BUY', c: 0.72 },
      { a: 'BUY', c: 0.75 },
      // Weak noise
      { a: 'HOLD', c: 0.4 },
      { a: 'HOLD', c: 0.5 },
      // Build into SELL reversal
      { a: 'SELL', c: 0.8 },
      { a: 'SELL', c: 0.78 },
      { a: 'SELL', c: 0.92 },
      { a: 'HOLD', c: 0.5 },
      { a: 'BUY', c: 0.6 },
      { a: 'HOLD', c: 0.5 },
    ];

    rawStream.forEach((r, idx) => {
      const out = deriveFinalSignal({
        prevFinalAction: final,
        prevFinalChangedAt: changedAt,
        rawActionNow: r.a,
        rawConfidenceNow: r.c,
        regimeNow: 'trending',
        chopDetectedNow: false,
        varianceConflictNow: false,
        ai: null,
        historyRaw: history,
      });
      final = out.finalAction;
      if (out.changed) {
        changedAt = `t${idx}`;
      }
      actions.push(final);
      history.unshift({ rawAction: r.a, rawConfidence: r.c, cycle_key: `k${idx}` });
    });

    expect(actions.some((a) => a === 'BUY' || a === 'SELL')).toBe(true);
  });
});

