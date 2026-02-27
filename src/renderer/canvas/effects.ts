/** Interpolate sand color based on timer progress (0 = start, 1 = done) */
export function sandColor(progress: number, phase?: string): string {
  if (phase === 'shortBreak') return 'rgba(0, 230, 118, 0.9)';   // green
  if (phase === 'longBreak') return 'rgba(179, 136, 255, 0.9)';  // purple

  if (progress < 0.6) {
    // Cyan → amber
    const t = progress / 0.6;
    const r = Math.round(0 + 255 * t);
    const g = Math.round(229 - 58 * t);
    const b = Math.round(255 - 255 * t);
    return `rgba(${r}, ${g}, ${b}, 0.9)`;
  }
  // Amber → red
  const t = (progress - 0.6) / 0.4;
  const r = 255;
  const g = Math.round(171 - 148 * t);
  const b = Math.round(0 + 68 * t);
  return `rgba(${r}, ${g}, ${b}, 0.9)`;
}

/** Apply per-grain brightness variation to the base sand color. offset is -1 to 1. */
export function sandColorVariant(progress: number, phase: string | undefined, offset: number): string {
  // Scale offset to +/- 10% RGB shift
  const shift = offset * 25; // max +/- 25 per channel

  if (phase === 'shortBreak') {
    return `rgba(${clamp(0 + shift)}, ${clamp(230 + shift)}, ${clamp(118 + shift)}, 0.9)`;
  }
  if (phase === 'longBreak') {
    return `rgba(${clamp(179 + shift)}, ${clamp(136 + shift)}, ${clamp(255 + shift)}, 0.9)`;
  }

  if (progress < 0.6) {
    const t = progress / 0.6;
    const r = Math.round(0 + 255 * t);
    const g = Math.round(229 - 58 * t);
    const b = Math.round(255 - 255 * t);
    return `rgba(${clamp(r + shift)}, ${clamp(g + shift)}, ${clamp(b + shift)}, 0.9)`;
  }
  const t = (progress - 0.6) / 0.4;
  const r = 255;
  const g = Math.round(171 - 148 * t);
  const b = Math.round(0 + 68 * t);
  return `rgba(${clamp(r + shift)}, ${clamp(g + shift)}, ${clamp(b + shift)}, 0.9)`;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Glow color matching sand color */
export function glowColor(progress: number, phase?: string): string {
  if (phase === 'shortBreak') return 'rgba(0, 230, 118, 0.3)';
  if (phase === 'longBreak') return 'rgba(179, 136, 255, 0.3)';

  if (progress < 0.6) {
    const t = progress / 0.6;
    return `rgba(${Math.round(0 + 255 * t)}, ${Math.round(229 - 58 * t)}, ${Math.round(255 - 255 * t)}, ${0.2 + 0.15 * t})`;
  }
  const t = (progress - 0.6) / 0.4;
  return `rgba(255, ${Math.round(171 - 148 * t)}, ${Math.round(0 + 68 * t)}, ${0.35 + 0.15 * t})`;
}

/** Screen-shake offset for alarm state */
export class ScreenShake {
  private _intensity = 0;
  private _decayRate = 4; // per second

  get offsetX(): number {
    if (this._intensity < 0.5) return 0;
    return (Math.random() - 0.5) * this._intensity;
  }

  get offsetY(): number {
    if (this._intensity < 0.5) return 0;
    return (Math.random() - 0.5) * this._intensity;
  }

  trigger(intensity = 8): void {
    this._intensity = intensity;
  }

  update(dt: number): void {
    this._intensity = Math.max(0, this._intensity - this._decayRate * dt);
  }

  get active(): boolean {
    return this._intensity > 0.5;
  }
}

/** Idle breathing glow (0..1 oscillation) */
export function idleBreathValue(time: number): number {
  return 0.5 + 0.5 * Math.sin(time * 0.002 * Math.PI);
}

/** Pulsing glow for alarm state */
export function alarmPulse(time: number): number {
  return 0.6 + 0.4 * Math.sin(time * 0.008 * Math.PI);
}
