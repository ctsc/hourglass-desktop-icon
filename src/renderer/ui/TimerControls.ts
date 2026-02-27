import { TimerSnapshot, TimerStatus } from '../../shared/types';

const PRESETS = [
  { label: '5m', ms: 5 * 60 * 1000 },
  { label: '15m', ms: 15 * 60 * 1000 },
  { label: '25m', ms: 25 * 60 * 1000 },
  { label: '45m', ms: 45 * 60 * 1000 },
  { label: '60m', ms: 60 * 60 * 1000 },
];

export interface TimerControlsCallbacks {
  onStart: (taskName: string, durationMs: number) => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onDurationChange?: (durationMs: number) => void;
}

export class TimerControls {
  private _taskInput: HTMLInputElement;
  private _durationBar: HTMLDivElement;
  private _controls: HTMLDivElement;
  private _countdown: HTMLDivElement;
  private _startBtn: HTMLButtonElement;
  private _pauseBtn: HTMLButtonElement;
  private _resetBtn: HTMLButtonElement;
  private _selectedMs = 25 * 60 * 1000;
  private _presetBtns: HTMLButtonElement[] = [];
  private _customInput: HTMLInputElement | null = null;
  private _pomodoroMode = false;

  get selectedMs(): number { return this._selectedMs; }

  constructor(
    private _container: HTMLElement,
    private _callbacks: TimerControlsCallbacks,
  ) {
    // Task input
    this._taskInput = document.getElementById('task-input') as HTMLInputElement;

    // Duration bar
    this._durationBar = document.getElementById('duration-bar') as HTMLDivElement;
    this._buildPresets();

    // Countdown
    this._countdown = document.getElementById('countdown') as HTMLDivElement;

    // Controls
    this._controls = document.getElementById('controls') as HTMLDivElement;
    this._startBtn = this._controls.querySelector('[data-action="start"]') as HTMLButtonElement;
    this._pauseBtn = this._controls.querySelector('[data-action="pause"]') as HTMLButtonElement;
    this._resetBtn = this._controls.querySelector('[data-action="reset"]') as HTMLButtonElement;

    this._startBtn.addEventListener('click', () => this._onStart());
    this._pauseBtn.addEventListener('click', () => this._onPause());
    this._resetBtn.addEventListener('click', () => this._callbacks.onReset());

    this._updateButtons('idle');
  }

  private _buildPresets(): void {
    this._durationBar.innerHTML = '';
    PRESETS.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.textContent = p.label;
      btn.addEventListener('click', () => this._selectPreset(i));
      this._durationBar.appendChild(btn);
      this._presetBtns.push(btn);
    });

    // Custom input (small inline)
    const custom = document.createElement('input');
    custom.type = 'number';
    custom.min = '1';
    custom.max = '180';
    custom.placeholder = '#m';
    custom.className = 'custom-duration';
    custom.addEventListener('change', () => {
      const mins = parseInt(custom.value);
      if (mins > 0 && mins <= 180) {
        this._selectedMs = mins * 60 * 1000;
        this._presetBtns.forEach(b => b.classList.remove('active'));
        this._callbacks.onDurationChange?.(this._selectedMs);
      }
    });
    custom.addEventListener('focus', () => {
      this._presetBtns.forEach(b => b.classList.remove('active'));
    });
    this._durationBar.appendChild(custom);
    this._customInput = custom;

    // Default selection
    this._selectPreset(2); // 25m
  }

  private _selectPreset(index: number): void {
    this._presetBtns.forEach(b => b.classList.remove('active'));
    this._presetBtns[index].classList.add('active');
    this._selectedMs = PRESETS[index].ms;
    if (this._customInput) this._customInput.value = '';
    this._callbacks.onDurationChange?.(this._selectedMs);
  }

  private _onStart(): void {
    const status = this._startBtn.dataset.status;
    if (status === 'paused') {
      this._callbacks.onResume();
    } else {
      const name = this._taskInput.value.trim() || 'Focus';
      this._callbacks.onStart(name, this._selectedMs);
    }
  }

  private _onPause(): void {
    this._callbacks.onPause();
  }

  updateFromSnapshot(snap: TimerSnapshot): void {
    // Update countdown display
    this._countdown.textContent = this._formatTime(snap.remainingMs);

    // Color classes based on progress
    this._countdown.classList.remove('warn', 'urgent');
    if (snap.progress > 0.8) {
      this._countdown.classList.add('urgent');
    } else if (snap.progress > 0.6) {
      this._countdown.classList.add('warn');
    }

    this._updateButtons(snap.status);
  }

  private _updateButtons(status: TimerStatus): void {
    switch (status) {
      case 'idle':
        this._startBtn.textContent = 'START';
        delete this._startBtn.dataset.status;
        this._startBtn.disabled = false;
        this._startBtn.classList.add('primary');
        this._pauseBtn.disabled = true;
        this._resetBtn.disabled = true;
        this._taskInput.disabled = this._pomodoroMode;
        this._setPresetsEnabled(true);
        break;
      case 'running':
        this._startBtn.textContent = 'START';
        this._startBtn.disabled = true;
        this._startBtn.classList.remove('primary');
        this._pauseBtn.disabled = false;
        this._resetBtn.disabled = false;
        this._taskInput.disabled = true;
        this._setPresetsEnabled(false);
        break;
      case 'paused':
        this._startBtn.textContent = 'RESUME';
        this._startBtn.dataset.status = 'paused';
        this._startBtn.disabled = false;
        this._startBtn.classList.add('primary');
        this._pauseBtn.disabled = true;
        this._resetBtn.disabled = false;
        this._taskInput.disabled = true;
        this._setPresetsEnabled(false);
        break;
      case 'finished':
        this._startBtn.textContent = 'START';
        delete this._startBtn.dataset.status;
        this._startBtn.disabled = true;
        this._startBtn.classList.remove('primary');
        this._pauseBtn.disabled = true;
        this._resetBtn.disabled = false;
        this._taskInput.disabled = this._pomodoroMode;
        this._setPresetsEnabled(true);
        break;
    }
  }

  private _setPresetsEnabled(enabled: boolean): void {
    this._presetBtns.forEach(b => b.disabled = !enabled);
    if (this._customInput) this._customInput.disabled = !enabled;
  }

  private _formatTime(ms: number): string {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /** Adjust controls when in pomodoro mode (presets stay enabled for work duration) */
  setPomodoroMode(active: boolean): void {
    this._pomodoroMode = active;
    this._taskInput.disabled = active;
    if (active) {
      this._taskInput.value = '';
      this._taskInput.placeholder = 'Pomodoro mode active';
    } else {
      this._taskInput.placeholder = 'What are you working on?';
    }
  }
}
