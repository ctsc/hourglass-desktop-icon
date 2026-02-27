import './ui/theme.css';
import { TimerState } from './state/TimerState';
import { PomodoroState } from './state/PomodoroState';
import { HistoryStore } from './state/HistoryStore';
import { HourglassRenderer } from './canvas/HourglassRenderer';
import { AlarmSynth } from './audio/AlarmSynth';
import { TimerControls } from './ui/TimerControls';
import { PomodoroControls } from './ui/PomodoroControls';
import { HistoryPanel } from './ui/HistoryPanel';
import { SoundSettings } from './ui/SoundSettings';
import { TimerMode } from '../shared/types';

declare global {
  interface Window {
    electronAPI: {
      updateTimerState: (data: { remaining: string; status: string }) => void;
      minimize: () => void;
      close: () => void;
      togglePin: () => void;
      onPinStateChange: (callback: (pinned: boolean) => void) => void;
      notify: (data: { taskName: string; duration: string }) => void;
      onToggle: (callback: () => void) => void;
      onReset: (callback: () => void) => void;
    };
  }
}

// ── State ─────────────────────────────────────────
const timer = new TimerState();
const pomodoro = new PomodoroState(timer);
const history = new HistoryStore();
const synth = new AlarmSynth();

let mode: TimerMode = 'free';

// ── Canvas ────────────────────────────────────────
const canvasContainer = document.getElementById('canvas-container')!;
const renderer = new HourglassRenderer(canvasContainer);

// ── UI ────────────────────────────────────────────
const timerControls = new TimerControls(
  document.getElementById('app')!,
  {
    onStart: (taskName, durationMs) => {
      if (mode === 'pomodoro') {
        // In pomodoro mode, just start the already-configured timer
        timer.start();
        return;
      }
      timer.configure(taskName, durationMs);
      renderer.initTimer(durationMs);
      renderer.setPhase(undefined);
      timer.start();
    },
    onPause: () => timer.pause(),
    onResume: () => timer.start(),
    onReset: () => {
      synth.stop();
      renderer.stopAlarm();
      timer.reset();
      renderer.setProgress(0);
      renderer.setStatus('idle');
      if (mode === 'pomodoro') {
        // Reconfigure for current pomodoro phase so START works
        pomodoro.activate();
        renderer.initTimer(pomodoro.phaseDurationMs());
        renderer.setPhase(pomodoro.phase);
        pomodoroControls.updatePips(pomodoro.snapshot());
      } else {
        renderer.initTimer(0);
      }
    },
    onDurationChange: (durationMs) => {
      if (mode === 'pomodoro') {
        pomodoro.setWorkDuration(durationMs);
        // Update the hourglass display if timer hasn't started yet
        if (timer.status === 'idle') {
          renderer.initTimer(pomodoro.phaseDurationMs());
        }
      }
    },
  },
);

const pomodoroControls = new PomodoroControls({
  onActivate: () => {
    mode = 'pomodoro';
    synth.stop();
    renderer.stopAlarm();
    timerControls.setPomodoroMode(true);
    pomodoro.setWorkDuration(timerControls.selectedMs);
    pomodoro.activate();
    renderer.initTimer(pomodoro.phaseDurationMs());
    renderer.setPhase(pomodoro.phase);
    pomodoroControls.updatePips(pomodoro.snapshot());
  },
  onDeactivate: () => {
    mode = 'free';
    pomodoro.deactivate();
    timerControls.setPomodoroMode(false);
    renderer.stopAlarm();
    renderer.setProgress(0);
    renderer.setStatus('idle');
    renderer.setPhase(undefined);
    renderer.initTimer(0);
  },
  onDismissBreak: () => {
    synth.stop();
    renderer.stopAlarm();
    pomodoro.startNextPhase();
  },
});

const historyPanel = new HistoryPanel(history);
const soundSettings = new SoundSettings(synth);

// ── Panel mutual exclusion ───────────────────────
document.getElementById('btn-history')?.addEventListener('click', () => {
  soundSettings.close();
}, true);
document.getElementById('btn-sound')?.addEventListener('click', () => {
  historyPanel.close();
}, true);

// ── Timer Events ──────────────────────────────────
timer.on('tick', (snap) => {
  timerControls.updateFromSnapshot(snap);
  renderer.setProgress(snap.progress);

  // Update tray tooltip
  const mins = Math.floor(snap.remainingMs / 60000);
  const secs = Math.ceil((snap.remainingMs % 60000) / 1000);
  const remaining = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  window.electronAPI?.updateTimerState({ remaining, status: snap.status });
});

timer.on('stateChange', (snap) => {
  timerControls.updateFromSnapshot(snap);
  renderer.setStatus(snap.status);

  if (snap.status === 'idle') {
    window.electronAPI?.updateTimerState({ remaining: 'Idle', status: 'idle' });
  }
});

timer.on('finished', (snap) => {
  // Log to history
  history.log({
    taskName: snap.taskName,
    durationMs: snap.totalMs,
    mode,
    phase: mode === 'pomodoro' ? pomodoro.phase : undefined,
    completedAt: new Date().toISOString(),
  });
  historyPanel.refresh();

  // Sound + visual alarm
  const isBreak = mode === 'pomodoro' && pomodoro.phase !== 'work';
  synth.play(soundSettings.preset, isBreak);
  renderer.setStatus('finished');

  window.electronAPI?.updateTimerState({ remaining: 'Done!', status: 'finished' });

  // Native OS notification
  const totalMins = Math.round(snap.totalMs / 60000);
  const duration = totalMins >= 60
    ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`
    : `${totalMins}m`;
  window.electronAPI?.notify({ taskName: snap.taskName, duration });
});

// ── Pomodoro Events ───────────────────────────────
pomodoro.on('phaseChange', (snap) => {
  pomodoroControls.updatePips(snap);
  renderer.setPhase(snap.phase);
  renderer.initTimer(pomodoro.phaseDurationMs());

  if (snap.phase === 'shortBreak' || snap.phase === 'longBreak') {
    pomodoroControls.showBreakOverlay(snap.phase);
  } else {
    pomodoroControls.hideOverlay();
    // Auto-start work phases
    pomodoro.startNextPhase();
  }
});

// ── Window Controls ───────────────────────────────
document.getElementById('btn-minimize')?.addEventListener('click', () => {
  window.electronAPI?.minimize();
});

document.getElementById('btn-close')?.addEventListener('click', () => {
  window.electronAPI?.close();
});

const pinBtn = document.getElementById('btn-pin');
pinBtn?.addEventListener('click', () => {
  window.electronAPI?.togglePin();
});

window.electronAPI?.onPinStateChange((pinned: boolean) => {
  if (pinBtn) {
    pinBtn.textContent = pinned ? '\u25C9' : '\u25CB';
    pinBtn.title = pinned ? 'Unpin window' : 'Pin on top';
  }
});

// ── Keyboard Shortcuts ───────────────────────────
function toggleTimer(): void {
  const status = timer.status;
  if (status === 'idle' || status === 'finished') {
    const taskInput = document.getElementById('task-input') as HTMLInputElement;
    const name = taskInput?.value.trim() || 'Focus';
    if (status === 'finished') {
      // Reset first, then start fresh
      resetTimer();
    }
    if (mode === 'pomodoro') {
      timer.start();
    } else {
      timer.configure(name, timerControls.selectedMs);
      renderer.initTimer(timerControls.selectedMs);
      renderer.setPhase(undefined);
      timer.start();
    }
  } else if (status === 'running') {
    timer.pause();
  } else if (status === 'paused') {
    timer.start();
  }
}

function resetTimer(): void {
  synth.stop();
  renderer.stopAlarm();
  timer.reset();
  renderer.setProgress(0);
  renderer.setStatus('idle');
  if (mode === 'pomodoro') {
    pomodoro.activate();
    renderer.initTimer(pomodoro.phaseDurationMs());
    renderer.setPhase(pomodoro.phase);
    pomodoroControls.updatePips(pomodoro.snapshot());
  } else {
    renderer.initTimer(0);
  }
}

document.addEventListener('keydown', (e) => {
  // Don't intercept when typing in an input field
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if (e.code === 'Space') {
    e.preventDefault();
    toggleTimer();
  }

  if (e.code === 'Escape') {
    e.preventDefault();
    resetTimer();
  }
});

// IPC-based shortcuts from main process
window.electronAPI?.onToggle(() => {
  // Skip if user is typing in an input field
  if (document.activeElement?.tagName === 'INPUT') return;
  toggleTimer();
});
window.electronAPI?.onReset(() => resetTimer());

// ── Start render loop ─────────────────────────────
renderer.start();

// Initialize countdown display
timerControls.updateFromSnapshot(timer.snapshot());
