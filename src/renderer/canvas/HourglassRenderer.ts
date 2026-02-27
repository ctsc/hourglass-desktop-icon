import { ParticleSystem } from './ParticleSystem';
import { ScreenShake, sandColor, sandColorVariant, glowColor, idleBreathValue, alarmPulse } from './effects';
import { TimerStatus } from '../../shared/types';

interface HourglassMetrics {
  cx: number;       // center x
  cy: number;       // center y
  topY: number;     // top of glass
  botY: number;     // bottom of glass
  maxW: number;     // max half-width of bulbs
  neckW: number;    // half-width of neck
  neckTopY: number; // where neck starts (top)
  neckBotY: number; // where neck ends (bottom)
}

export class HourglassRenderer {
  private _canvas: HTMLCanvasElement;
  private _ctx: CanvasRenderingContext2D;
  private _container: HTMLElement;
  private _dpr: number;
  private _w = 0;
  private _h = 0;
  private _metrics!: HourglassMetrics;
  private _particles: ParticleSystem;
  private _shake = new ScreenShake();
  private _rafId = 0;
  private _lastTime = 0;
  private _progress = 0;
  private _status: TimerStatus = 'idle';
  private _phase: string | undefined;
  private _totalMs = 0;
  private _alarmActive = false;
  private _alarmStartTime = 0;

  constructor(container: HTMLElement) {
    this._container = container;
    this._canvas = document.createElement('canvas');
    container.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d')!;
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._particles = new ParticleSystem();

    this._resize(container);
    window.addEventListener('resize', () => this._resize(this._container));
    this._watchDpr();
  }

  get particles(): ParticleSystem { return this._particles; }

  private _resize(container: HTMLElement): void {
    const rect = container.getBoundingClientRect();
    this._w = rect.width;
    this._h = rect.height;
    this._canvas.width = this._w * this._dpr;
    this._canvas.height = this._h * this._dpr;
    this._canvas.style.width = `${this._w}px`;
    this._canvas.style.height = `${this._h}px`;
    this._ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    this._computeMetrics();
  }

  /** Re-scale canvas when devicePixelRatio changes (e.g. moving between monitors) */
  private _watchDpr(): void {
    const mq = window.matchMedia(`(resolution: ${this._dpr}dppx)`);
    const onChange = () => {
      this._dpr = Math.min(window.devicePixelRatio || 1, 2);
      this._resize(this._container);
      // Re-watch for the new DPR value
      this._watchDpr();
    };
    mq.addEventListener('change', onChange, { once: true });
  }

  private _computeMetrics(): void {
    const cx = this._w / 2;
    const cy = this._h / 2;
    const glassH = Math.min(this._h * 0.88, 320);
    const topY = cy - glassH / 2;
    const botY = cy + glassH / 2;
    const maxW = Math.min(this._w * 0.35, 75);
    const neckW = 7;
    const neckH = glassH * 0.06;
    const neckTopY = cy - neckH / 2;
    const neckBotY = cy + neckH / 2;

    this._metrics = { cx, cy, topY, botY, maxW, neckW, neckTopY, neckBotY };

    // Build wall segments for particle collision
    const walls = this._buildWallSegments();
    this._particles.setGeometry({
      walls,
      neckLeft: cx - neckW,
      neckRight: cx + neckW,
      neckTopY,
      neckBottomY: neckBotY,
      bottomFloorY: botY - 8,
      topCeilingY: topY + 8,
    });
  }

  private _buildWallSegments(): { x1: number; y1: number; x2: number; y2: number }[] {
    const { cx, topY, botY, maxW, neckW, neckTopY, neckBotY } = this._metrics;
    const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const steps = 16;

    // Helper: hourglass outline X at given Y (right side)
    const outlineX = (y: number): number => {
      if (y <= neckTopY) {
        // Top bulb: wide at top, narrows to neck
        const t = (y - topY) / (neckTopY - topY); // 0 at top, 1 at neck
        // Use smooth curve (cosine ease)
        const curve = 0.5 - 0.5 * Math.cos(t * Math.PI);
        return cx + maxW - curve * (maxW - neckW);
      }
      if (y >= neckBotY) {
        // Bottom bulb: narrows from neck, widens at bottom
        const t = (y - neckBotY) / (botY - neckBotY); // 0 at neck, 1 at bottom
        const curve = 0.5 - 0.5 * Math.cos(t * Math.PI);
        return cx + neckW + curve * (maxW - neckW);
      }
      // Neck
      return cx + neckW;
    };

    // Right side wall segments (top to bottom)
    for (let i = 0; i < steps; i++) {
      const y1 = topY + (botY - topY) * (i / steps);
      const y2 = topY + (botY - topY) * ((i + 1) / steps);
      segments.push({ x1: outlineX(y1), y1, x2: outlineX(y2), y2 });
    }

    // Left side wall segments (mirror)
    for (let i = 0; i < steps; i++) {
      const y1 = topY + (botY - topY) * (i / steps);
      const y2 = topY + (botY - topY) * ((i + 1) / steps);
      segments.push({
        x1: 2 * cx - outlineX(y1), y1,
        x2: 2 * cx - outlineX(y2), y2,
      });
    }

    return segments;
  }

  initTimer(totalMs: number): void {
    this._totalMs = totalMs;
    this._particles.init(totalMs);
    this._progress = 0;
    this._alarmActive = false;
  }

  setProgress(progress: number): void {
    this._progress = progress;
  }

  setStatus(status: TimerStatus): void {
    this._status = status;
    if (status === 'finished') {
      this._alarmActive = true;
      this._alarmStartTime = performance.now();
      this._shake.trigger(10);
      this._particles.explode();
    }
  }

  setPhase(phase: string | undefined): void {
    this._phase = phase;
  }

  stopAlarm(): void {
    this._alarmActive = false;
  }

  start(): void {
    this._lastTime = performance.now();
    this._loop();
  }

  stop(): void {
    cancelAnimationFrame(this._rafId);
  }

  private _loop = (): void => {
    const now = performance.now();
    const dt = Math.min((now - this._lastTime) / 1000, 0.05); // cap at 50ms
    this._lastTime = now;

    this._shake.update(dt);

    // Update particles only when running
    if (this._status === 'running') {
      this._particles.update(dt, this._progress * this._totalMs);
    }

    // If alarm is active, keep particles moving for explosion effect
    if (this._alarmActive) {
      this._particles.update(dt, this._totalMs);
      // Periodically re-shake
      if (Math.random() < 0.02) this._shake.trigger(6);
    }

    this._draw(now);
    this._rafId = requestAnimationFrame(this._loop);
  };

  private _draw(now: number): void {
    const ctx = this._ctx;
    const { cx, cy, topY, botY, maxW, neckW, neckTopY, neckBotY } = this._metrics;

    // Clear with shake offset
    ctx.save();
    ctx.translate(this._shake.offsetX, this._shake.offsetY);
    ctx.clearRect(-10, -10, this._w + 20, this._h + 20);

    const color = sandColor(this._progress, this._phase);
    const glow = glowColor(this._progress, this._phase);

    // ── Draw glow behind hourglass ──
    let glowIntensity = 0.5;
    if (this._status === 'idle') {
      glowIntensity = idleBreathValue(now) * 0.4;
    } else if (this._alarmActive) {
      glowIntensity = alarmPulse(now);
    } else if (this._progress > 0.8) {
      glowIntensity = 0.5 + 0.3 * Math.sin(now * 0.006);
    }

    const glowGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, maxW * 2.5);
    const glowBase = glow.replace(/[\d.]+\)$/, `${glowIntensity * 0.6})`);
    glowGrad.addColorStop(0, glowBase);
    glowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, this._w, this._h);

    // ── Draw hourglass frame (stand) ──
    this._drawFrame(ctx, cx, topY, botY, maxW);

    // ── Draw glass body ──
    this._drawGlass(ctx, cx, topY, botY, maxW, neckW, neckTopY, neckBotY, glow);

    // ── Draw sand level in top bulb (unactivated grains) ──
    this._drawTopSand(ctx, cx, topY, neckTopY, maxW, neckW, color);

    // ── Draw particles ──
    for (const grain of this._particles.grains) {
      if (!grain.active) continue;
      ctx.beginPath();
      ctx.arc(grain.x, grain.y, grain.radius, 0, Math.PI * 2);
      ctx.fillStyle = sandColorVariant(this._progress, this._phase, grain.colorOffset);
      ctx.fill();
    }

    // ── Glass highlight (specular) ──
    this._drawHighlight(ctx, cx, topY, botY, maxW);

    ctx.restore();
  }

  private _drawFrame(ctx: CanvasRenderingContext2D, cx: number, topY: number, botY: number, maxW: number): void {
    const frameW = maxW + 15;
    const capH = 6;

    // Metallic gradient
    const metalGrad = ctx.createLinearGradient(cx - frameW, 0, cx + frameW, 0);
    metalGrad.addColorStop(0, '#2a2a35');
    metalGrad.addColorStop(0.3, '#4a4a58');
    metalGrad.addColorStop(0.5, '#5a5a6a');
    metalGrad.addColorStop(0.7, '#4a4a58');
    metalGrad.addColorStop(1, '#2a2a35');

    ctx.fillStyle = metalGrad;

    // Top cap
    ctx.beginPath();
    ctx.roundRect(cx - frameW, topY - capH - 2, frameW * 2, capH, 3);
    ctx.fill();

    // Bottom cap
    ctx.beginPath();
    ctx.roundRect(cx - frameW, botY + 2, frameW * 2, capH, 3);
    ctx.fill();

    // Side posts
    const postW = 3;
    ctx.fillRect(cx - frameW + 4, topY + capH - 4, postW, botY - topY - capH + 4);
    ctx.fillRect(cx + frameW - 4 - postW, topY + capH - 4, postW, botY - topY - capH + 4);
  }

  private _drawGlass(
    ctx: CanvasRenderingContext2D,
    cx: number, topY: number, botY: number,
    maxW: number, neckW: number,
    neckTopY: number, neckBotY: number,
    glow: string,
  ): void {
    ctx.save();

    // Glass fill
    const glassFill = ctx.createLinearGradient(cx - maxW, topY, cx + maxW, botY);
    glassFill.addColorStop(0, 'rgba(20, 20, 35, 0.6)');
    glassFill.addColorStop(0.5, 'rgba(25, 25, 40, 0.4)');
    glassFill.addColorStop(1, 'rgba(20, 20, 35, 0.6)');

    // Build glass shape path
    ctx.beginPath();
    this._glassPath(ctx, cx, topY, botY, maxW, neckW, neckTopY, neckBotY);
    ctx.fillStyle = glassFill;
    ctx.fill();

    // Glass edge stroke with glow
    ctx.strokeStyle = glow.replace(/[\d.]+\)$/, '0.6)');
    ctx.lineWidth = 1.5;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    this._glassPath(ctx, cx, topY, botY, maxW, neckW, neckTopY, neckBotY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  private _glassPath(
    ctx: CanvasRenderingContext2D,
    cx: number, topY: number, botY: number,
    maxW: number, neckW: number,
    neckTopY: number, neckBotY: number,
  ): void {
    // Right side: top → neck → bottom
    ctx.moveTo(cx - maxW, topY);
    ctx.lineTo(cx + maxW, topY);
    // Top right bulb curves down to neck
    ctx.bezierCurveTo(
      cx + maxW, topY + (neckTopY - topY) * 0.6,
      cx + neckW + 10, neckTopY - 15,
      cx + neckW, neckTopY,
    );
    // Neck
    ctx.lineTo(cx + neckW, neckBotY);
    // Bottom right bulb curves out
    ctx.bezierCurveTo(
      cx + neckW + 10, neckBotY + 15,
      cx + maxW, neckBotY + (botY - neckBotY) * 0.4,
      cx + maxW, botY,
    );
    // Bottom edge
    ctx.lineTo(cx - maxW, botY);
    // Bottom left bulb curves up to neck
    ctx.bezierCurveTo(
      cx - maxW, neckBotY + (botY - neckBotY) * 0.4,
      cx - neckW - 10, neckBotY + 15,
      cx - neckW, neckBotY,
    );
    // Neck
    ctx.lineTo(cx - neckW, neckTopY);
    // Top left bulb curves out
    ctx.bezierCurveTo(
      cx - neckW - 10, neckTopY - 15,
      cx - maxW, topY + (neckTopY - topY) * 0.6,
      cx - maxW, topY,
    );
    ctx.closePath();
  }

  private _drawTopSand(
    ctx: CanvasRenderingContext2D,
    cx: number, topY: number, neckTopY: number,
    maxW: number, neckW: number,
    color: string,
  ): void {
    // Calculate how many grains are still in top (not active)
    const total = this._particles.totalGrains;
    const released = this._particles.releasedCount;
    const remaining = total - released;
    if (remaining <= 0 || total <= 0) return;

    const fraction = remaining / total;
    const bulbH = neckTopY - topY - 16;
    const sandH = bulbH * fraction;
    const sandTopY = neckTopY - 8 - sandH;

    // Draw sand as a filled shape that follows the glass curvature
    ctx.save();
    ctx.beginPath();

    // Clip to glass shape
    const getWidth = (y: number): number => {
      const t = (y - topY) / (neckTopY - topY);
      const curve = 0.5 - 0.5 * Math.cos(t * Math.PI);
      return maxW - curve * (maxW - neckW);
    };

    const sandBotY = neckTopY - 8;
    const w1 = getWidth(sandTopY) - 4;
    const w2 = getWidth(sandBotY) - 4;

    ctx.moveTo(cx - w1, sandTopY);
    ctx.lineTo(cx + w1, sandTopY);
    // Slight curve down to bottom
    ctx.quadraticCurveTo(cx + w2 + 2, sandBotY - sandH * 0.3, cx + w2, sandBotY);
    // Funnel shape toward neck
    ctx.quadraticCurveTo(cx + neckW + 3, sandBotY + 3, cx, sandBotY + 6);
    ctx.quadraticCurveTo(cx - neckW - 3, sandBotY + 3, cx - w2, sandBotY);
    ctx.quadraticCurveTo(cx - w2 - 2, sandBotY - sandH * 0.3, cx - w1, sandTopY);
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.7;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private _drawHighlight(ctx: CanvasRenderingContext2D, cx: number, topY: number, botY: number, maxW: number): void {
    // Specular highlight on left side of glass
    const hlGrad = ctx.createLinearGradient(cx - maxW - 5, topY, cx - maxW + 15, topY);
    hlGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    hlGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
    hlGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - maxW, topY, 20, botY - topY);
    ctx.fillStyle = hlGrad;
    ctx.fill();
    ctx.restore();
  }
}
