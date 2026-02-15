import { deriveFinalSignal } from './deriveFinalSignal';

describe('deriveFinalSignal (risk-first state machine)', () => {
  test('BUY -> HOLD fast interrupt on volatile', () => {
    const out = deriveFinalSignal({
      prevFinalAction: 'BUY',
      prevFinalChangedAt: '2026-02-12T10:00:00Z',
      rawActionNow: 'BUY',
      rawConfidenceNow: 0.7,
      regimeNow: 'volatile',
      chopDetectedNow: false,
      varianceConflictNow: false,
      ai: null,
      historyRaw: [{ rawAction: 'BUY', rawConfidence: 0.7, cycle_key: 'k1' }],
    });
    expect(out.finalAction).toBe('HOLD');
    expect(out.changed).toBe(true);
    expect(out.changeReason).toBe('risk_first_interrupt_to_hold');
  });

  test('HOLD -> BUY requires 2 consecutive BUY + conf>=0.65 and clean regime', () => {
    const out = deriveFinalSignal({
      prevFinalAction: 'HOLD',
      prevFinalChangedAt: null,
      rawActionNow: 'BUY',
      rawConfidenceNow: 0.66,
      regimeNow: 'trending',
      chopDetectedNow: false,
      varianceConflictNow: false,
      ai: null,
      historyRaw: [{ rawAction: 'BUY', rawConfidence: 0.67, cycle_key: 'k1' }],
    });
    expect(out.finalAction).toBe('BUY');
    expect(out.changed).toBe(true);
    expect(out.changeReason).toBe('confirmed_entry_from_hold');
  });

  test('AI high confidence can override final action', () => {
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
  });

  test('AI low confidence can only force HOLD (risk brake)', () => {
    const out = deriveFinalSignal({
      prevFinalAction: 'BUY',
      prevFinalChangedAt: '2026-02-12T10:00:00Z',
      rawActionNow: 'BUY',
      rawConfidenceNow: 0.75,
      regimeNow: 'trending',
      chopDetectedNow: false,
      varianceConflictNow: false,
      ai: { enabled: true, action: 'HOLD', confidence0to1: 0.6 },
      historyRaw: [{ rawAction: 'BUY', rawConfidence: 0.75, cycle_key: 'k1' }],
    });
    expect(out.finalAction).toBe('HOLD');
    expect(out.changeReason).toBe('ai_risk_brake_hold');
  });
});

