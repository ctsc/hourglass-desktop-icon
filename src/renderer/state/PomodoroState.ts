import { PomodoroPhase, PomodoroSnapshot } from '../../shared/types';
import { TimerState } from './TimerState';

const DEFAULT_WORK_MS = 25 * 60 * 1000;
const SHORT_BREAK_MS = 5 * 60 * 1000;
const LONG_BREAK_MS = 15 * 60 * 1000;
const CYCLES_BEFORE_LONG = 4;

type PomodoroEventType = 'phaseChange' | 'cycleComplete';
type PomodoroListener = (snapshot: PomodoroSnapshot) => void;

export class PomodoroState {
  private _phase: PomodoroPhase = 'work';
  private _cycleIndex = 1; // 1-4
  private _totalCyclesToday = 0;
  private _active = false;
  private _workMs = DEFAULT_WORK_MS;
  private _listeners = new Map<PomodoroEventType, Set<PomodoroListener>>();

  constructor(private timer: TimerState) {
    this.timer.on('finished', () => {
      if (!this._active) return;
      this._onPhaseComplete();
    });
  }

  on(event: PomodoroEventType, fn: PomodoroListener): void {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(fn);
  }

  off(event: PomodoroEventType, fn: PomodoroListener): void {
    this._listeners.get(event)?.delete(fn);
  }

  private _emit(event: PomodoroEventType): void {
    const snap = this.snapshot();
    this._listeners.get(event)?.forEach(fn => fn(snap));
  }

  snapshot(): PomodoroSnapshot {
    return {
      phase: this._phase,
      cycleIndex: this._cycleIndex,
      totalCyclesToday: this._totalCyclesToday,
    };
  }

  get active(): boolean { return this._active; }
  get phase(): PomodoroPhase { return this._phase; }
  get cycleIndex(): number { return this._cycleIndex; }

  activate(): void {
    this._active = true;
    this._phase = 'work';
    this._cycleIndex = 1;
    // Configure timer but don't emit phaseChange — avoids auto-start
    const taskName = `Pomodoro #${this._cycleIndex}`;
    this.timer.configure(taskName, this.phaseDurationMs());
  }

  deactivate(): void {
    this._active = false;
    this.timer.reset();
  }

  /** Set the work session duration (user-selected) */
  setWorkDuration(ms: number): void {
    this._workMs = ms;
    // If we're in a work phase and timer hasn't started, reconfigure
    if (this._active && this._phase === 'work' && this.timer.status === 'idle') {
      const taskName = `Pomodoro #${this._cycleIndex}`;
      this.timer.configure(taskName, this._workMs);
    }
  }

  /** Start the next phase (called after break overlay is dismissed) */
  startNextPhase(): void {
    this.timer.start();
  }

  /** Get duration for current phase */
  phaseDurationMs(): number {
    switch (this._phase) {
      case 'work': return this._workMs;
      case 'shortBreak': return SHORT_BREAK_MS;
      case 'longBreak': return LONG_BREAK_MS;
    }
  }

  private _setupPhase(): void {
    const taskName = this._phase === 'work'
      ? `Pomodoro #${this._cycleIndex}`
      : this._phase === 'shortBreak' ? 'Short Break' : 'Long Break';
    this.timer.configure(taskName, this.phaseDurationMs());
    this._emit('phaseChange');
  }

  private _onPhaseComplete(): void {
    if (this._phase === 'work') {
      this._totalCyclesToday++;
      if (this._cycleIndex >= CYCLES_BEFORE_LONG) {
        // After 4 work sessions, long break
        this._phase = 'longBreak';
        this._emit('cycleComplete');
      } else {
        this._phase = 'shortBreak';
      }
    } else {
      // Break finished — next work session
      if (this._phase === 'longBreak') {
        this._cycleIndex = 1;
      } else {
        this._cycleIndex++;
      }
      this._phase = 'work';
    }
    this._setupPhase();
  }
}
