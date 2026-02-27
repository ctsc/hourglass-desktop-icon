import { PomodoroPhase, PomodoroSnapshot } from '../../shared/types';

export interface PomodoroControlsCallbacks {
  onActivate: () => void;
  onDeactivate: () => void;
  onDismissBreak: () => void;
}

export class PomodoroControls {
  private _freeBtn: HTMLButtonElement;
  private _pomBtn: HTMLButtonElement;
  private _pips: HTMLDivElement;
  private _overlay: HTMLDivElement;
  private _active = false;

  constructor(
    private _callbacks: PomodoroControlsCallbacks,
  ) {
    const toggle = document.getElementById('mode-toggle')!;
    this._freeBtn = toggle.querySelector('[data-mode="free"]') as HTMLButtonElement;
    this._pomBtn = toggle.querySelector('[data-mode="pomodoro"]') as HTMLButtonElement;
    this._pips = document.getElementById('pomodoro-pips') as HTMLDivElement;
    this._overlay = document.getElementById('break-overlay') as HTMLDivElement;

    this._freeBtn.addEventListener('click', () => this._setMode(false));
    this._pomBtn.addEventListener('click', () => this._setMode(true));

    // Break overlay dismiss
    const dismissBtn = this._overlay.querySelector('button');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        this._overlay.classList.remove('visible');
        this._callbacks.onDismissBreak();
      });
    }

    this._setMode(false);
  }

  private _setMode(pomodoro: boolean): void {
    this._active = pomodoro;
    this._freeBtn.classList.toggle('active', !pomodoro);
    this._pomBtn.classList.toggle('active', pomodoro);
    this._pips.style.display = pomodoro ? 'flex' : 'none';

    if (pomodoro) {
      this._callbacks.onActivate();
    } else {
      this._callbacks.onDeactivate();
      this._overlay.classList.remove('visible');
    }
  }

  get active(): boolean { return this._active; }

  updatePips(snapshot: PomodoroSnapshot): void {
    this._pips.innerHTML = '';
    const isBreak = snapshot.phase === 'shortBreak' || snapshot.phase === 'longBreak';
    for (let i = 1; i <= 4; i++) {
      const pip = document.createElement('div');
      pip.className = 'pip';
      if (i < snapshot.cycleIndex) {
        pip.classList.add('filled');
      } else if (i === snapshot.cycleIndex && isBreak) {
        // Work session just completed, show pip as filled during break
        pip.classList.add('filled');
      } else if (i === snapshot.cycleIndex && snapshot.phase === 'work') {
        pip.classList.add('active');
      }
      this._pips.appendChild(pip);
    }
  }

  showBreakOverlay(phase: PomodoroPhase): void {
    const h2 = this._overlay.querySelector('h2')!;
    const p = this._overlay.querySelector('p')!;

    if (phase === 'shortBreak') {
      h2.textContent = 'TAKE A BREAK';
      p.textContent = '5 minute short break';
    } else {
      h2.textContent = 'LONG BREAK';
      p.textContent = '15 minute long break — you earned it!';
    }

    this._overlay.classList.add('visible');
  }

  hideOverlay(): void {
    this._overlay.classList.remove('visible');
  }
}
