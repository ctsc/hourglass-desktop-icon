export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished';

export type PomodoroPhase = 'work' | 'shortBreak' | 'longBreak';

export type TimerMode = 'free' | 'pomodoro';

export type AlarmPreset = 'classic' | 'chime' | 'arcade' | 'pulse';

export interface TimerSnapshot {
  status: TimerStatus;
  taskName: string;
  totalMs: number;
  remainingMs: number;
  progress: number; // 0..1, fraction elapsed
}

export interface HistoryEntry {
  id: string;
  taskName: string;
  durationMs: number;
  mode: TimerMode;
  phase?: PomodoroPhase;
  completedAt: string; // ISO string
}

export interface PomodoroSnapshot {
  phase: PomodoroPhase;
  cycleIndex: number; // 1-4
  totalCyclesToday: number;
}

export interface SoundPrefs {
  preset: AlarmPreset;
  volume: number; // 0..1
}
