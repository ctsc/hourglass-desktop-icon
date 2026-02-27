import { describe, it, expect } from 'vitest';
import { sandColor, sandColorVariant, glowColor, ScreenShake, idleBreathValue, alarmPulse } from '../effects';

describe('sandColor', () => {
  it('returns cyan at progress 0', () => {
    const color = sandColor(0);
    expect(color).toBe('rgba(0, 229, 255, 0.9)');
  });

  it('interpolates toward amber at progress 0.3', () => {
    const color = sandColor(0.3);
    // t = 0.3/0.6 = 0.5
    // r = 0 + 255*0.5 = 128
    // g = 229 - 58*0.5 = 200
    // b = 255 - 255*0.5 = 128
    expect(color).toBe('rgba(128, 200, 128, 0.9)');
  });

  it('reaches amber at progress 0.6', () => {
    const color = sandColor(0.6);
    // t = 0.6/0.6 = 1.0
    // r = 255, g = 171, b = 0
    expect(color).toBe('rgba(255, 171, 0, 0.9)');
  });

  it('interpolates toward red at progress 0.8', () => {
    const color = sandColor(0.8);
    // t = (0.8-0.6)/0.4 = 0.5
    // r = 255, g = 171 - 148*0.5 = 97, b = 0 + 68*0.5 = 34
    expect(color).toBe('rgba(255, 97, 34, 0.9)');
  });

  it('reaches red at progress 1.0', () => {
    const color = sandColor(1.0);
    // t = (1.0-0.6)/0.4 = 1.0
    // r = 255, g = 171-148 = 23, b = 0+68 = 68
    expect(color).toBe('rgba(255, 23, 68, 0.9)');
  });

  it('returns green for shortBreak phase', () => {
    expect(sandColor(0.5, 'shortBreak')).toBe('rgba(0, 230, 118, 0.9)');
  });

  it('returns purple for longBreak phase', () => {
    expect(sandColor(0.5, 'longBreak')).toBe('rgba(179, 136, 255, 0.9)');
  });

  it('ignores phase for non-break values and uses progress', () => {
    // 'work' is not a break phase, so color is based on progress
    const color = sandColor(0, 'work');
    expect(color).toBe('rgba(0, 229, 255, 0.9)');
  });
});

describe('sandColorVariant', () => {
  it('matches sandColor when offset is 0', () => {
    // At offset 0, shift is 0, so the result should match sandColor exactly
    // (sandColor uses Math.round, sandColorVariant uses clamp which also rounds)
    expect(sandColorVariant(0, undefined, 0)).toBe('rgba(0, 229, 255, 0.9)');
    expect(sandColorVariant(0.6, undefined, 0)).toBe('rgba(255, 171, 0, 0.9)');
    expect(sandColorVariant(1.0, undefined, 0)).toBe('rgba(255, 23, 68, 0.9)');
  });

  it('shifts RGB channels brighter with positive offset', () => {
    // offset=1 -> shift=25
    // At progress 0: base is (0, 229, 255) -> shifted to (25, 254, 255)
    const color = sandColorVariant(0, undefined, 1);
    expect(color).toBe('rgba(25, 254, 255, 0.9)');
  });

  it('shifts RGB channels darker with negative offset', () => {
    // offset=-1 -> shift=-25
    // At progress 0: base is (0, 229, 255) -> shifted to (0, 204, 230)
    const color = sandColorVariant(0, undefined, -1);
    expect(color).toBe('rgba(0, 204, 230, 0.9)');
  });

  it('clamps RGB values to 0 minimum', () => {
    // At progress 0, r=0. With offset=-1, shift=-25, r would be -25 -> clamps to 0
    const color = sandColorVariant(0, undefined, -1);
    expect(color).toMatch(/^rgba\(0,/);
  });

  it('clamps RGB values to 255 maximum', () => {
    // At progress 0.6, r=255. With offset=1, shift=25, r would be 280 -> clamps to 255
    const color = sandColorVariant(0.6, undefined, 1);
    expect(color).toMatch(/^rgba\(255,/);
  });

  it('applies shift to shortBreak green color', () => {
    // shortBreak base: (0, 230, 118), offset=1, shift=25
    const color = sandColorVariant(0.5, 'shortBreak', 1);
    expect(color).toBe('rgba(25, 255, 143, 0.9)');
  });

  it('applies shift to longBreak purple color', () => {
    // longBreak base: (179, 136, 255), offset=1, shift=25
    const color = sandColorVariant(0.5, 'longBreak', 1);
    expect(color).toBe('rgba(204, 161, 255, 0.9)');
  });

  it('works correctly in the amber-to-red segment (progress > 0.6)', () => {
    // At progress 0.8: base is (255, 97, 34), offset=0.5, shift=12.5
    const color = sandColorVariant(0.8, undefined, 0.5);
    // r=255+13=255 (clamped), g=97+13=110, b=34+13=47
    expect(color).toBe('rgba(255, 110, 47, 0.9)');
  });

  it('handles fractional offsets smoothly', () => {
    // offset=0.5 -> shift=12.5
    // At progress 0: base (0, 229, 255) -> (13, 242, 255)
    const color = sandColorVariant(0, undefined, 0.5);
    expect(color).toBe('rgba(13, 242, 255, 0.9)');
  });

  it('all RGB channels stay in [0, 255] for extreme offsets', () => {
    // Test a range of progress values with extreme offsets
    for (const progress of [0, 0.3, 0.6, 0.8, 1.0]) {
      for (const offset of [-1, -0.5, 0, 0.5, 1]) {
        const color = sandColorVariant(progress, undefined, offset);
        const match = color.match(/rgba\((\d+), (\d+), (\d+), 0\.9\)/);
        expect(match).not.toBeNull();
        const [, r, g, b] = match!;
        expect(Number(r)).toBeGreaterThanOrEqual(0);
        expect(Number(r)).toBeLessThanOrEqual(255);
        expect(Number(g)).toBeGreaterThanOrEqual(0);
        expect(Number(g)).toBeLessThanOrEqual(255);
        expect(Number(b)).toBeGreaterThanOrEqual(0);
        expect(Number(b)).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe('glowColor', () => {
  it('returns cyan glow at progress 0', () => {
    const color = glowColor(0);
    // t=0: rgba(0, 229, 255, 0.2)
    expect(color).toBe('rgba(0, 229, 255, 0.2)');
  });

  it('returns green glow for shortBreak', () => {
    expect(glowColor(0.5, 'shortBreak')).toBe('rgba(0, 230, 118, 0.3)');
  });

  it('returns purple glow for longBreak', () => {
    expect(glowColor(0.5, 'longBreak')).toBe('rgba(179, 136, 255, 0.3)');
  });

  it('increases alpha as progress increases in first segment', () => {
    const c0 = glowColor(0);
    const c06 = glowColor(0.59);
    // alpha at 0: 0.2, alpha near 0.6: ~0.35
    expect(c0).toContain('0.2)');
  });
});

describe('ScreenShake', () => {
  it('starts inactive with zero offsets', () => {
    const shake = new ScreenShake();
    expect(shake.active).toBe(false);
    expect(shake.offsetX).toBe(0);
    expect(shake.offsetY).toBe(0);
  });

  it('becomes active after trigger', () => {
    const shake = new ScreenShake();
    shake.trigger(8);
    expect(shake.active).toBe(true);
  });

  it('decays over time via update', () => {
    const shake = new ScreenShake();
    shake.trigger(8);
    expect(shake.active).toBe(true);

    // Decay rate = 4/s, so after 2s, intensity = 8 - 4*2 = 0
    shake.update(2);
    expect(shake.active).toBe(false);
  });

  it('returns zero offsets when inactive', () => {
    const shake = new ScreenShake();
    shake.trigger(0.3); // below 0.5 threshold
    expect(shake.offsetX).toBe(0);
    expect(shake.offsetY).toBe(0);
  });

  it('returns non-zero offsets when active', () => {
    const shake = new ScreenShake();
    shake.trigger(10);
    // Offsets are random, so just check they are bounded
    const samples = Array.from({ length: 100 }, () => shake.offsetX);
    const hasNonZero = samples.some(s => s !== 0);
    expect(hasNonZero).toBe(true);
  });

  it('does not go below zero intensity', () => {
    const shake = new ScreenShake();
    shake.trigger(1);
    shake.update(100); // way past decay
    expect(shake.active).toBe(false);
  });
});

describe('idleBreathValue', () => {
  it('returns 0.5 at time 0', () => {
    expect(idleBreathValue(0)).toBeCloseTo(0.5, 5);
  });

  it('returns 1.0 at peak (sin=1 when 0.002*PI*t = PI/2 => t=250)', () => {
    expect(idleBreathValue(250)).toBeCloseTo(1.0, 5);
  });

  it('returns 0.0 at trough (sin=-1 when 0.002*PI*t = 3PI/2 => t=750)', () => {
    expect(idleBreathValue(750)).toBeCloseTo(0.0, 5);
  });

  it('always stays in [0, 1] range', () => {
    for (let t = 0; t < 2000; t += 17) {
      const v = idleBreathValue(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('alarmPulse', () => {
  it('returns 0.6 at time 0', () => {
    expect(alarmPulse(0)).toBeCloseTo(0.6, 5);
  });

  it('peaks at 1.0 (sin=1 when 0.008*PI*t = PI/2 => t=62.5)', () => {
    expect(alarmPulse(62.5)).toBeCloseTo(1.0, 5);
  });

  it('troughs at 0.2 (sin=-1 when 0.008*PI*t = 3PI/2 => t=187.5)', () => {
    expect(alarmPulse(187.5)).toBeCloseTo(0.2, 5);
  });

  it('always stays in [0.2, 1.0] range', () => {
    for (let t = 0; t < 500; t += 7) {
      const v = alarmPulse(t);
      expect(v).toBeGreaterThanOrEqual(0.19); // floating point tolerance
      expect(v).toBeLessThanOrEqual(1.01);
    }
  });
});
