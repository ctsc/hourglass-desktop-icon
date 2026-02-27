import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimerState } from '../TimerState';

describe('TimerState', () => {
  let timer: TimerState;
  let perfNowMock: ReturnType<typeof vi.fn>;
  let rafMock: ReturnType<typeof vi.fn>;
  let cafMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    timer = new TimerState();

    // Mock performance.now
    let currentTime = 0;
    perfNowMock = vi.fn(() => currentTime);
    vi.stubGlobal('performance', { now: perfNowMock });

    // Mock requestAnimationFrame — capture callback but don't auto-invoke
    rafMock = vi.fn((cb: FrameRequestCallback) => {
      return 1; // return a fake ID
    });
    vi.stubGlobal('requestAnimationFrame', rafMock);

    cafMock = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cafMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setTime(ms: number) {
    perfNowMock.mockReturnValue(ms);
  }

  function drainRaf() {
    // Execute the last registered rAF callback
    if (rafMock.mock.calls.length > 0) {
      const lastCall = rafMock.mock.calls[rafMock.mock.calls.length - 1];
      lastCall[0](performance.now());
    }
  }

  describe('initial state', () => {
    it('starts in idle status', () => {
      expect(timer.status).toBe('idle');
    });

    it('has zero duration', () => {
      expect(timer.totalMs).toBe(0);
      expect(timer.remainingMs).toBe(0);
    });

    it('has empty task name', () => {
      expect(timer.taskName).toBe('');
    });

    it('snapshot reflects initial state', () => {
      const snap = timer.snapshot();
      expect(snap).toEqual({
        status: 'idle',
        taskName: '',
        totalMs: 0,
        remainingMs: 0,
        progress: 0,
      });
    });
  });

  describe('configure', () => {
    it('sets task name and duration', () => {
      timer.configure('Test Task', 60000);
      expect(timer.taskName).toBe('Test Task');
      expect(timer.totalMs).toBe(60000);
      expect(timer.remainingMs).toBe(60000);
    });

    it('emits stateChange event', () => {
      const listener = vi.fn();
      timer.on('stateChange', listener);
      timer.configure('Test', 30000);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        status: 'idle',
        taskName: 'Test',
        totalMs: 30000,
      }));
    });

    it('resets status to idle if called while running', () => {
      timer.configure('Task1', 60000);
      setTime(0);
      timer.start();
      expect(timer.status).toBe('running');

      timer.configure('Task2', 30000);
      expect(timer.status).toBe('idle');
      expect(timer.taskName).toBe('Task2');
      expect(timer.totalMs).toBe(30000);
    });
  });

  describe('start', () => {
    it('transitions from idle to running', () => {
      timer.configure('Test', 60000);
      setTime(0);
      timer.start();
      expect(timer.status).toBe('running');
    });

    it('does nothing if already running', () => {
      timer.configure('Test', 60000);
      setTime(0);
      timer.start();

      const listener = vi.fn();
      timer.on('stateChange', listener);
      timer.start();
      expect(listener).not.toHaveBeenCalled();
    });

    it('does nothing if totalMs is 0', () => {
      timer.configure('Test', 0);
      timer.start();
      expect(timer.status).toBe('idle');
    });

    it('emits stateChange on start', () => {
      const listener = vi.fn();
      timer.on('stateChange', listener);
      timer.configure('Test', 60000);
      listener.mockClear();

      setTime(0);
      timer.start();
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        status: 'running',
      }));
    });

    it('starts requestAnimationFrame loop', () => {
      timer.configure('Test', 60000);
      setTime(0);
      timer.start();
      expect(rafMock).toHaveBeenCalled();
    });
  });

  describe('tick and countdown', () => {
    it('decreases remainingMs as time passes', () => {
      timer.configure('Test', 60000);
      setTime(0);
      timer.start();

      setTime(10000); // 10s elapsed
      drainRaf();
      expect(timer.remainingMs).toBe(50000);
    });

    it('emits tick events on each frame', () => {
      const tickListener = vi.fn();
      timer.on('tick', tickListener);

      timer.configure('Test', 60000);
      setTime(0);
      timer.start();
      tickListener.mockClear();

      setTime(1000);
      drainRaf();
      expect(tickListener).toHaveBeenCalledTimes(1);
    });

    it('finishes when remaining hits zero', () => {
      const finishedListener = vi.fn();
      const stateListener = vi.fn();
      timer.on('finished', finishedListener);
      timer.on('stateChange', stateListener);

      timer.configure('Test', 5000);
      setTime(0);
      timer.start();
      stateListener.mockClear();

      setTime(5000); // exactly done
      drainRaf();
      expect(timer.status).toBe('finished');
      expect(timer.remainingMs).toBe(0);
      expect(finishedListener).toHaveBeenCalledTimes(1);
      expect(stateListener).toHaveBeenCalledWith(expect.objectContaining({
        status: 'finished',
      }));
    });

    it('clamps remainingMs to 0 (never negative)', () => {
      timer.configure('Test', 5000);
      setTime(0);
      timer.start();

      setTime(10000); // way past end
      drainRaf();
      expect(timer.remainingMs).toBe(0);
    });

    it('does not tick after finishing', () => {
      timer.configure('Test', 1000);
      setTime(0);
      timer.start();

      setTime(2000);
      drainRaf();
      expect(timer.status).toBe('finished');

      // rAF should not have been called again after finishing
      const rafCallsAfterFinish = rafMock.mock.calls.length;
      // If we try to drain again, tick should early-return
      if (rafMock.mock.calls.length > 0) {
        const lastCb = rafMock.mock.calls[rafMock.mock.calls.length - 1][0];
        setTime(3000);
        lastCb(3000);
      }
      expect(timer.status).toBe('finished');
    });
  });

  describe('pause', () => {
    it('transitions from running to paused', () => {
      timer.configure('Test', 60000);
      setTime(0);
      timer.start();

      setTime(5000);
      timer.pause();
      expect(timer.status).toBe('paused');
    });

    it('does nothing if not running', () => {
      timer.configure('Test', 60000);
      const listener = vi.fn();
      timer.on('stateChange', listener);
      listener.mockClear();

      timer.pause();
      expect(listener).not.toHaveBeenCalled();
      expect(timer.status).toBe('idle');
    });

    it('cancels animation frame', () => {
      timer.configure('Test', 60000);
      setTime(0);
      timer.start();
      cafMock.mockClear();

      setTime(5000);
      timer.pause();
      expect(cafMock).toHaveBeenCalled();
    });

    it('preserves elapsed time for resume', () => {
      timer.configure('Test', 60000);
      setTime(0);
      timer.start();

      // Run for 10s
      setTime(10000);
      drainRaf();
      expect(timer.remainingMs).toBe(50000);

      // Pause at 10s
      timer.pause();

      // Resume at 20s (10s of wall time passed while paused)
      setTime(20000);
      timer.start();

      // After 5 more seconds of running (25s wall time)
      setTime(25000);
      drainRaf();
      // Should have 60000 - 10000 - 5000 = 45000 remaining
      expect(timer.remainingMs).toBe(45000);
    });
  });

  describe('reset', () => {
    it('returns to idle with zeros', () => {
      timer.configure('Test', 60000);
      setTime(0);
      timer.start();

      timer.reset();
      expect(timer.status).toBe('idle');
      expect(timer.taskName).toBe('');
      expect(timer.totalMs).toBe(0);
      expect(timer.remainingMs).toBe(0);
    });

    it('emits stateChange', () => {
      timer.configure('Test', 60000);
      const listener = vi.fn();
      timer.on('stateChange', listener);
      listener.mockClear();

      timer.reset();
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        status: 'idle',
      }));
    });
  });

  describe('restart', () => {
    it('resets countdown but keeps task name', () => {
      timer.configure('Test', 60000);
      setTime(0);
      timer.start();
      setTime(30000);
      drainRaf();

      timer.restart();
      expect(timer.status).toBe('idle');
      expect(timer.taskName).toBe('Test');
      expect(timer.totalMs).toBe(60000);
      expect(timer.remainingMs).toBe(60000);
    });

    it('can override duration', () => {
      timer.configure('Test', 60000);
      timer.restart(30000);
      expect(timer.totalMs).toBe(30000);
      expect(timer.remainingMs).toBe(30000);
    });
  });

  describe('snapshot', () => {
    it('calculates progress correctly', () => {
      timer.configure('Test', 10000);
      setTime(0);
      timer.start();

      setTime(2500);
      drainRaf();
      const snap = timer.snapshot();
      expect(snap.progress).toBeCloseTo(0.25);
    });

    it('progress is 0 when totalMs is 0', () => {
      const snap = timer.snapshot();
      expect(snap.progress).toBe(0);
    });

    it('progress is 1 when finished', () => {
      timer.configure('Test', 1000);
      setTime(0);
      timer.start();
      setTime(1000);
      drainRaf();
      expect(timer.snapshot().progress).toBe(1);
    });
  });

  describe('event system', () => {
    it('on/off correctly adds and removes listeners', () => {
      const listener = vi.fn();
      timer.on('stateChange', listener);
      timer.configure('Test', 1000);
      expect(listener).toHaveBeenCalledTimes(1);

      listener.mockClear();
      timer.off('stateChange', listener);
      timer.configure('Test2', 2000);
      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple listeners on same event', () => {
      const l1 = vi.fn();
      const l2 = vi.fn();
      timer.on('stateChange', l1);
      timer.on('stateChange', l2);

      timer.configure('Test', 1000);
      expect(l1).toHaveBeenCalledTimes(1);
      expect(l2).toHaveBeenCalledTimes(1);
    });
  });
});
