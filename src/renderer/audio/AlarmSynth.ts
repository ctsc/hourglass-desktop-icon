import { AlarmPreset } from '../../shared/types';

export class AlarmSynth {
  private _ctx: AudioContext | null = null;
  private _masterGain: GainNode | null = null;
  private _activeNodes: AudioNode[] = [];
  private _loopTimer = 0;
  private _volume = 0.7;

  private _getCtx(): AudioContext {
    if (!this._ctx) {
      this._ctx = new AudioContext();
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = this._volume;
      this._masterGain.connect(this._ctx.destination);
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  private _getMaster(): GainNode {
    this._getCtx();
    return this._masterGain!;
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    if (this._masterGain) {
      this._masterGain.gain.value = this._volume;
    }
  }

  getVolume(): number { return this._volume; }

  /** Play a 2-second preview of a preset */
  preview(preset: AlarmPreset): void {
    this.stop();
    this._playOnce(preset, 2);
  }

  /** Start looping alarm */
  play(preset: AlarmPreset, isBreak = false): void {
    this.stop();
    const playLoop = () => {
      this._playOnce(preset, 1.8, isBreak);
      this._loopTimer = window.setTimeout(playLoop, 2200);
    };
    playLoop();
  }

  stop(): void {
    clearTimeout(this._loopTimer);
    this._activeNodes.forEach(n => {
      try { (n as OscillatorNode).stop?.(); } catch { /* already stopped */ }
      try { n.disconnect(); } catch { /* ok */ }
    });
    this._activeNodes = [];
  }

  private _playOnce(preset: AlarmPreset, duration: number, softer = false): void {
    const ctx = this._getCtx();
    const master = this._getMaster();
    const now = ctx.currentTime;
    const pitchMult = softer ? 2 : 1;   // octave up for break tones
    const volMult = softer ? 0.5 : 1;

    const envelope = ctx.createGain();
    envelope.gain.value = 0;
    envelope.connect(master);

    switch (preset) {
      case 'classic':
        this._classic(ctx, envelope, now, duration, pitchMult, volMult);
        break;
      case 'chime':
        this._chime(ctx, envelope, now, duration, pitchMult, volMult);
        break;
      case 'arcade':
        this._arcade(ctx, envelope, now, duration, pitchMult, volMult);
        break;
      case 'pulse':
        this._pulse(ctx, envelope, now, duration, pitchMult, volMult);
        break;
    }
  }

  private _classic(ctx: AudioContext, dest: GainNode, t: number, dur: number, pm: number, vm: number): void {
    // Two-tone square wave beep
    const beepDur = 0.15;
    const gap = 0.1;
    const reps = Math.floor(dur / (beepDur * 2 + gap * 2));

    for (let i = 0; i < reps; i++) {
      const offset = i * (beepDur * 2 + gap * 2);
      for (let j = 0; j < 2; j++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = (j === 0 ? 880 : 660) * pm;
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, t + offset + j * (beepDur + gap));
        gain.gain.linearRampToValueAtTime(0.3 * vm, t + offset + j * (beepDur + gap) + 0.01);
        gain.gain.setValueAtTime(0.3 * vm, t + offset + j * (beepDur + gap) + beepDur - 0.01);
        gain.gain.linearRampToValueAtTime(0, t + offset + j * (beepDur + gap) + beepDur);
        osc.connect(gain);
        gain.connect(dest);
        dest.gain.value = 1;
        osc.start(t + offset + j * (beepDur + gap));
        osc.stop(t + offset + j * (beepDur + gap) + beepDur);
        this._activeNodes.push(osc);
      }
    }
  }

  private _chime(ctx: AudioContext, dest: GainNode, t: number, dur: number, pm: number, vm: number): void {
    // Bell-like sine with harmonics
    dest.gain.value = 1;
    const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * pm;
      gain.gain.setValueAtTime(0, t + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.25 * vm, t + i * 0.15 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + Math.min(dur - i * 0.15, 1.5));
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t + i * 0.15);
      osc.stop(t + dur);
      this._activeNodes.push(osc);

      // Harmonic overtone
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2 * pm;
      gain2.gain.setValueAtTime(0, t + i * 0.15);
      gain2.gain.linearRampToValueAtTime(0.08 * vm, t + i * 0.15 + 0.03);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + Math.min(dur - i * 0.15, 1.0));
      osc2.connect(gain2);
      gain2.connect(dest);
      osc2.start(t + i * 0.15);
      osc2.stop(t + dur);
      this._activeNodes.push(osc2);
    });
  }

  private _arcade(ctx: AudioContext, dest: GainNode, t: number, dur: number, pm: number, vm: number): void {
    // 8-bit ascending arpeggio
    dest.gain.value = 1;
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    const noteLen = 0.12;
    const reps = Math.floor(dur / (notes.length * noteLen + 0.1));

    for (let r = 0; r < reps; r++) {
      const base = r * (notes.length * noteLen + 0.1);
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq * pm;
        gain.gain.setValueAtTime(0, t + base + i * noteLen);
        gain.gain.linearRampToValueAtTime(0.2 * vm, t + base + i * noteLen + 0.01);
        gain.gain.setValueAtTime(0.2 * vm, t + base + i * noteLen + noteLen - 0.02);
        gain.gain.linearRampToValueAtTime(0, t + base + i * noteLen + noteLen);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t + base + i * noteLen);
        osc.stop(t + base + i * noteLen + noteLen);
        this._activeNodes.push(osc);
      });
    }
  }

  private _pulse(ctx: AudioContext, dest: GainNode, t: number, dur: number, pm: number, vm: number): void {
    // Deep pulsing bass rumble
    dest.gain.value = 1;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.value = 80 * pm;

    lfo.type = 'sine';
    lfo.frequency.value = 4;
    lfoGain.gain.value = 0.3 * vm;

    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.4 * vm, t + dur * 0.6);
    gain.gain.linearRampToValueAtTime(0, t + dur);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(t);
    osc.stop(t + dur);
    lfo.start(t);
    lfo.stop(t + dur);

    this._activeNodes.push(osc, lfo);
  }
}
