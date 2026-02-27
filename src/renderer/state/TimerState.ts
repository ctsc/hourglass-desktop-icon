import { TimerStatus, TimerSnapshot } from '../../shared/types';

type TimerEventType = 'tick' | 'stateChange' | 'finished';
type TimerListener = (snapshot: TimerSnapshot) => void;

export class TimerState {
  private _status: TimerStatus = 'idle';
  private _taskName = '';
  private _totalMs = 0;
  private _remainingMs = 0;
  private _startTime = 0;     // performance.now() when started/resumed
  private _elapsedBefore = 0;  // ms elapsed before last pause
  private _rafId = 0;
  private _listeners = new Map<TimerEventType, Set<TimerListener>>();

  on(event: TimerEventType, fn: TimerListener): void {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(fn);
  }

  off(event: TimerEventType, fn: TimerListener): void {
    this._listeners.get(event)?.delete(fn);
  }

  private _emit(event: TimerEventType): void {
    const snap = this.snapshot();
    this._listeners.get(event)?.forEach(fn => fn(snap));
  }

  snapshot(): TimerSnapshot {
    return {
      status: this._status,
      taskName: this._taskName,
      totalMs: this._totalMs,
      remainingMs: this._remainingMs,
      progress: this._totalMs > 0 ? 1 - this._remainingMs / this._totalMs : 0,
    };
  }

  get status(): TimerStatus { return this._status; }
  get taskName(): string { return this._taskName; }
  get totalMs(): number { return this._totalMs; }
  get remainingMs(): number { return this._remainingMs; }

  configure(taskName: string, durationMs: number): void {
    cancelAnimationFrame(this._rafId);
    this._status = 'idle';
    this._elapsedBefore = 0;
    this._startTime = 0;
    this._taskName = taskName;
    this._totalMs = durationMs;
    this._remainingMs = durationMs;
    this._emit('stateChange');
  }

  start(): void {
    if (this._status === 'running' || this._totalMs <= 0) return;
    this._status = 'running';
    this._startTime = performance.now();
    this._emit('stateChange');
    this._tick();
  }

  pause(): void {
    if (this._status !== 'running') return;
    cancelAnimationFrame(this._rafId);
    this._elapsedBefore += performance.now() - this._startTime;
    this._status = 'paused';
    this._emit('stateChange');
  }

  reset(): void {
    cancelAnimationFrame(this._rafId);
    this._status = 'idle';
    this._taskName = '';
    this._totalMs = 0;
    this._remainingMs = 0;
    this._elapsedBefore = 0;
    this._startTime = 0;
    this._emit('stateChange');
  }

  /** Soft reset: keep taskName/totalMs but reset countdown */
  restart(durationMs?: number): void {
    cancelAnimationFrame(this._rafId);
    if (durationMs !== undefined) this._totalMs = durationMs;
    this._remainingMs = this._totalMs;
    this._elapsedBefore = 0;
    this._startTime = 0;
    this._status = 'idle';
    this._emit('stateChange');
  }

  private _tick = (): void => {
    if (this._status !== 'running') return;

    const now = performance.now();
    const totalElapsed = this._elapsedBefore + (now - this._startTime);
    this._remainingMs = Math.max(0, this._totalMs - totalElapsed);

    this._emit('tick');

    if (this._remainingMs <= 0) {
      this._remainingMs = 0;
      this._status = 'finished';
      this._emit('stateChange');
      this._emit('finished');
      return;
    }

    this._rafId = requestAnimationFrame(this._tick);
  };
}
