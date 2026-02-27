import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimerState } from '../TimerState';
import { PomodoroState } from '../PomodoroState';

describe('PomodoroState', () => {
  let timer: TimerState;
  let pomo: PomodoroState;

  beforeEach(() => {
    // Stub browser globals that TimerState uses
    vi.stubGlobal('performance', { now: vi.fn(() => 0) });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    timer = new TimerState();
    pomo = new PomodoroState(timer);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Simulate the timer completing its current phase by emitting 'finished' */
  function completeCurrentPhase() {
    // Trigger the finished listeners directly on the timer
    // PomodoroState registered a listener on timer's 'finished' event
    // We'll use configure + internal state to fire it
    const listeners: Array<(snap: any) => void> = [];
    const origOn = timer.on.bind(timer);

    // Instead, we can just trigger the timer's finished event by calling
    // the listener that PomodoroState attached.
    // The cleanest approach: fire finished event via the timer's _emit mechanism
    // by accessing the internal listener set.
    // Since _listeners is private, we'll use a workaround: configure, start, then
    // directly invoke the tick to completion.

    // Actually, the simplest approach: use the event system.
    // PomodoroState listens on timer's 'finished'. We need to fire that event.
    // We can do this by calling timer.configure with small duration, starting, and ticking.

    const perfNow = vi.fn(() => 0);
    vi.stubGlobal('performance', { now: perfNow });

    timer.configure(timer.taskName || 'test', 100);
    perfNow.mockReturnValue(0);
    timer.start();

    // Advance past end
    perfNow.mockReturnValue(200);
    // Manually invoke the tick by calling the rAF callback
    const rafMock = vi.mocked(requestAnimationFrame);
    const lastCall = rafMock.mock.calls[rafMock.mock.calls.length - 1];
    if (lastCall) {
      lastCall[0](200);
    }
  }

  describe('initial state', () => {
    it('starts inactive', () => {
      expect(pomo.active).toBe(false);
    });

    it('defaults to work phase', () => {
      expect(pomo.phase).toBe('work');
    });

    it('defaults to cycle index 1', () => {
      expect(pomo.cycleIndex).toBe(1);
    });
  });

  describe('activate', () => {
    it('sets active to true', () => {
      pomo.activate();
      expect(pomo.active).toBe(true);
    });

    it('starts at work phase, cycle 1', () => {
      pomo.activate();
      expect(pomo.phase).toBe('work');
      expect(pomo.cycleIndex).toBe(1);
    });

    it('configures timer with Pomodoro #1 and 25min', () => {
      pomo.activate();
      expect(timer.taskName).toBe('Pomodoro #1');
      expect(timer.totalMs).toBe(25 * 60 * 1000);
    });

    it('emits phaseChange event', () => {
      const listener = vi.fn();
      pomo.on('phaseChange', listener);
      pomo.activate();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        phase: 'work',
        cycleIndex: 1,
      }));
    });
  });

  describe('deactivate', () => {
    it('sets active to false', () => {
      pomo.activate();
      pomo.deactivate();
      expect(pomo.active).toBe(false);
    });

    it('resets the timer', () => {
      pomo.activate();
      pomo.deactivate();
      expect(timer.status).toBe('idle');
      expect(timer.totalMs).toBe(0);
    });
  });

  describe('phaseDurationMs', () => {
    it('returns 25min for work', () => {
      pomo.activate();
      expect(pomo.phaseDurationMs()).toBe(25 * 60 * 1000);
    });
  });

  describe('phase cycling', () => {
    it('transitions from work to shortBreak after first work session', () => {
      pomo.activate();
      completeCurrentPhase();
      expect(pomo.phase).toBe('shortBreak');
    });

    it('transitions from shortBreak back to work', () => {
      pomo.activate();
      completeCurrentPhase(); // work 1 -> shortBreak
      completeCurrentPhase(); // shortBreak -> work 2
      expect(pomo.phase).toBe('work');
      expect(pomo.cycleIndex).toBe(2);
    });

    it('increments cycle index after each shortBreak->work transition', () => {
      pomo.activate();
      // work 1 -> shortBreak -> work 2 -> shortBreak -> work 3
      completeCurrentPhase(); // work 1 done
      completeCurrentPhase(); // short break done -> work 2
      expect(pomo.cycleIndex).toBe(2);

      completeCurrentPhase(); // work 2 done
      completeCurrentPhase(); // short break done -> work 3
      expect(pomo.cycleIndex).toBe(3);
    });

    it('transitions to longBreak after 4th work session', () => {
      pomo.activate();
      // Complete 4 work sessions + 3 short breaks
      for (let i = 0; i < 3; i++) {
        completeCurrentPhase(); // work -> shortBreak
        completeCurrentPhase(); // shortBreak -> work
      }
      // Now on work 4
      expect(pomo.cycleIndex).toBe(4);
      completeCurrentPhase(); // work 4 -> longBreak
      expect(pomo.phase).toBe('longBreak');
    });

    it('emits cycleComplete when transitioning to longBreak', () => {
      const listener = vi.fn();
      pomo.on('cycleComplete', listener);

      pomo.activate();
      for (let i = 0; i < 3; i++) {
        completeCurrentPhase();
        completeCurrentPhase();
      }
      completeCurrentPhase(); // work 4 -> longBreak
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('resets cycle index to 1 after longBreak', () => {
      pomo.activate();
      for (let i = 0; i < 3; i++) {
        completeCurrentPhase();
        completeCurrentPhase();
      }
      completeCurrentPhase(); // work 4 -> longBreak
      completeCurrentPhase(); // longBreak -> work 1
      expect(pomo.phase).toBe('work');
      expect(pomo.cycleIndex).toBe(1);
    });

    it('configures timer with correct name for short break', () => {
      pomo.activate();
      completeCurrentPhase(); // -> shortBreak
      expect(timer.taskName).toBe('Short Break');
      expect(timer.totalMs).toBe(5 * 60 * 1000);
    });

    it('configures timer with correct name for long break', () => {
      pomo.activate();
      for (let i = 0; i < 3; i++) {
        completeCurrentPhase();
        completeCurrentPhase();
      }
      completeCurrentPhase(); // -> longBreak
      expect(timer.taskName).toBe('Long Break');
      expect(timer.totalMs).toBe(15 * 60 * 1000);
    });
  });

  describe('snapshot', () => {
    it('returns correct phase, cycleIndex, and totalCyclesToday', () => {
      pomo.activate();
      const snap = pomo.snapshot();
      expect(snap).toEqual({
        phase: 'work',
        cycleIndex: 1,
        totalCyclesToday: 0,
      });
    });

    it('increments totalCyclesToday after each work completion', () => {
      pomo.activate();
      completeCurrentPhase(); // work 1 done
      expect(pomo.snapshot().totalCyclesToday).toBe(1);

      completeCurrentPhase(); // short break done
      completeCurrentPhase(); // work 2 done
      expect(pomo.snapshot().totalCyclesToday).toBe(2);
    });
  });

  describe('totalCyclesToday counter (known issue: never resets)', () => {
    it('accumulates across multiple activate/deactivate sessions', () => {
      // First session: complete 2 work cycles
      pomo.activate();
      completeCurrentPhase(); // work 1 done -> shortBreak (totalCyclesToday = 1)
      completeCurrentPhase(); // shortBreak -> work 2
      completeCurrentPhase(); // work 2 done -> shortBreak (totalCyclesToday = 2)
      expect(pomo.snapshot().totalCyclesToday).toBe(2);

      // Deactivate and reactivate — simulating "starting a new session"
      pomo.deactivate();
      pomo.activate();

      // BUG: totalCyclesToday is NOT reset by activate() or deactivate()
      // It carries over from the previous session
      expect(pomo.snapshot().totalCyclesToday).toBe(2); // still 2, not 0

      // Complete another work cycle
      completeCurrentPhase(); // work 1 done (totalCyclesToday = 3)
      expect(pomo.snapshot().totalCyclesToday).toBe(3);
    });

    it('never resets even after completing a full 4-cycle set', () => {
      pomo.activate();
      // Complete all 4 work sessions + breaks in a full cycle
      for (let i = 0; i < 3; i++) {
        completeCurrentPhase(); // work -> break
        completeCurrentPhase(); // break -> work
      }
      completeCurrentPhase(); // work 4 -> longBreak
      completeCurrentPhase(); // longBreak -> work 1 (new set)
      expect(pomo.snapshot().totalCyclesToday).toBe(4);

      // Start a second full set
      completeCurrentPhase(); // work 1 done (totalCyclesToday = 5)
      expect(pomo.snapshot().totalCyclesToday).toBe(5);
    });

    it('documents that totalCyclesToday never resets across days (known bug)', () => {
      // Simulate 2 full pomodoro cycles = 8 work sessions total
      pomo.activate();

      // First full cycle: 4 work + 3 short breaks + 1 long break
      for (let i = 0; i < 3; i++) {
        completeCurrentPhase(); // work -> shortBreak
        completeCurrentPhase(); // shortBreak -> work
      }
      completeCurrentPhase(); // work 4 -> longBreak
      expect(pomo.snapshot().totalCyclesToday).toBe(4);
      completeCurrentPhase(); // longBreak -> work 1 (second set)

      // Second full cycle: 4 more work sessions
      for (let i = 0; i < 3; i++) {
        completeCurrentPhase(); // work -> shortBreak
        completeCurrentPhase(); // shortBreak -> work
      }
      completeCurrentPhase(); // work 4 -> longBreak
      expect(pomo.snapshot().totalCyclesToday).toBe(8);

      // BUG: totalCyclesToday is 8 and will never reset back to 0.
      // There is no date-based reset, no reset on activate/deactivate,
      // and no public method to reset it. It only resets when the
      // PomodoroState instance is garbage collected (app restart).
      pomo.deactivate();
      expect(pomo.snapshot().totalCyclesToday).toBe(8);
      pomo.activate();
      expect(pomo.snapshot().totalCyclesToday).toBe(8);
    });

    it('has no date awareness — counter persists indefinitely within instance lifetime', () => {
      // This documents the known issue: there is no mechanism to reset
      // totalCyclesToday at midnight or on a new day. The counter only
      // grows until the PomodoroState instance is garbage collected
      // (i.e., the app is restarted).
      pomo.activate();
      completeCurrentPhase();
      expect(pomo.snapshot().totalCyclesToday).toBe(1);

      // Even deactivate doesn't reset it
      pomo.deactivate();
      expect(pomo.snapshot().totalCyclesToday).toBe(1);
    });
  });

  describe('does not advance when inactive', () => {
    it('ignores timer finished events when not active', () => {
      // Don't activate pomodoro
      timer.configure('Manual Task', 1000);
      const perfNow = vi.fn(() => 0);
      vi.stubGlobal('performance', { now: perfNow });
      timer.start();

      perfNow.mockReturnValue(2000);
      const rafMock = vi.mocked(requestAnimationFrame);
      const lastCall = rafMock.mock.calls[rafMock.mock.calls.length - 1];
      if (lastCall) lastCall[0](2000);

      expect(pomo.phase).toBe('work');
      expect(pomo.cycleIndex).toBe(1);
    });
  });

  describe('event system', () => {
    it('on/off works correctly', () => {
      const listener = vi.fn();
      pomo.on('phaseChange', listener);
      pomo.activate();
      expect(listener).toHaveBeenCalledTimes(1);

      listener.mockClear();
      pomo.off('phaseChange', listener);
      completeCurrentPhase();
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
