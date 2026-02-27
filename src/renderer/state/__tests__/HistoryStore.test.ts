import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HistoryStore } from '../HistoryStore';

describe('HistoryStore', () => {
  let store: HistoryStore;
  let storage: Record<string, string>;

  beforeEach(() => {
    // Mock localStorage
    storage = {};
    const localStorageMock = {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
      clear: vi.fn(() => { storage = {}; }),
      length: 0,
      key: vi.fn(() => null),
    };
    vi.stubGlobal('localStorage', localStorageMock);

    // Mock crypto.randomUUID
    let uuidCounter = 0;
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => `uuid-${++uuidCounter}`),
    });

    store = new HistoryStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('starts with empty entries when localStorage is empty', () => {
      expect(store.getAll()).toEqual([]);
    });

    it('loads existing entries from localStorage', () => {
      const existing = [
        { id: 'abc', taskName: 'Old Task', durationMs: 60000, mode: 'free' as const, completedAt: '2025-01-15T10:00:00.000Z' },
      ];
      storage['timerapp-history'] = JSON.stringify(existing);

      const loadedStore = new HistoryStore();
      expect(loadedStore.getAll()).toEqual(existing);
    });

    it('handles corrupted localStorage gracefully', () => {
      storage['timerapp-history'] = 'not-valid-json{{{';
      const loadedStore = new HistoryStore();
      expect(loadedStore.getAll()).toEqual([]);
    });
  });

  describe('log', () => {
    it('adds an entry with a generated UUID', () => {
      store.log({
        taskName: 'Test Task',
        durationMs: 1500000,
        mode: 'free',
        completedAt: '2025-02-20T14:30:00.000Z',
      });

      const entries = store.getAll();
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('uuid-1');
      expect(entries[0].taskName).toBe('Test Task');
      expect(entries[0].durationMs).toBe(1500000);
    });

    it('persists to localStorage', () => {
      store.log({
        taskName: 'Saved Task',
        durationMs: 60000,
        mode: 'free',
        completedAt: '2025-02-20T10:00:00.000Z',
      });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'timerapp-history',
        expect.any(String)
      );
      const saved = JSON.parse(storage['timerapp-history']);
      expect(saved).toHaveLength(1);
      expect(saved[0].taskName).toBe('Saved Task');
    });

    it('appends entries in order', () => {
      store.log({ taskName: 'First', durationMs: 1000, mode: 'free', completedAt: '2025-01-01T00:00:00Z' });
      store.log({ taskName: 'Second', durationMs: 2000, mode: 'free', completedAt: '2025-01-01T01:00:00Z' });
      store.log({ taskName: 'Third', durationMs: 3000, mode: 'free', completedAt: '2025-01-01T02:00:00Z' });

      const entries = store.getAll();
      expect(entries).toHaveLength(3);
      expect(entries[0].taskName).toBe('First');
      expect(entries[1].taskName).toBe('Second');
      expect(entries[2].taskName).toBe('Third');
    });

    it('evicts oldest entries when exceeding 500', () => {
      // Pre-populate with 500 entries
      for (let i = 0; i < 500; i++) {
        store.log({
          taskName: `Task ${i}`,
          durationMs: 1000,
          mode: 'free',
          completedAt: `2025-01-01T00:00:00Z`,
        });
      }
      expect(store.getAll()).toHaveLength(500);

      // Add one more — should evict the first
      store.log({
        taskName: 'Overflow Task',
        durationMs: 1000,
        mode: 'free',
        completedAt: '2025-01-02T00:00:00Z',
      });

      const entries = store.getAll();
      expect(entries).toHaveLength(500);
      // First entry should now be Task 1 (Task 0 evicted)
      expect(entries[0].taskName).toBe('Task 1');
      expect(entries[entries.length - 1].taskName).toBe('Overflow Task');
    });
  });

  describe('getAll', () => {
    it('returns a copy, not the internal array', () => {
      store.log({ taskName: 'Test', durationMs: 1000, mode: 'free', completedAt: '2025-01-01T00:00:00Z' });
      const entries1 = store.getAll();
      const entries2 = store.getAll();
      expect(entries1).not.toBe(entries2);
      expect(entries1).toEqual(entries2);
    });
  });

  describe('getByDate', () => {
    beforeEach(() => {
      store.log({ taskName: 'Morning', durationMs: 1000, mode: 'free', completedAt: '2025-02-20T08:00:00Z' });
      store.log({ taskName: 'Afternoon', durationMs: 2000, mode: 'free', completedAt: '2025-02-20T14:00:00Z' });
      store.log({ taskName: 'Next Day', durationMs: 3000, mode: 'free', completedAt: '2025-02-21T09:00:00Z' });
    });

    it('filters entries by date prefix', () => {
      const feb20 = store.getByDate('2025-02-20');
      expect(feb20).toHaveLength(2);
      expect(feb20[0].taskName).toBe('Morning');
      expect(feb20[1].taskName).toBe('Afternoon');
    });

    it('returns empty array for date with no entries', () => {
      expect(store.getByDate('2025-03-01')).toEqual([]);
    });
  });

  describe('getDailyTotal', () => {
    it('sums durationMs for work entries only', () => {
      store.log({ taskName: 'Work 1', durationMs: 1500000, mode: 'pomodoro', phase: 'work', completedAt: '2025-02-20T10:00:00Z' });
      store.log({ taskName: 'Break', durationMs: 300000, mode: 'pomodoro', phase: 'shortBreak', completedAt: '2025-02-20T10:30:00Z' });
      store.log({ taskName: 'Work 2', durationMs: 1500000, mode: 'pomodoro', phase: 'work', completedAt: '2025-02-20T11:00:00Z' });

      const total = store.getDailyTotal('2025-02-20');
      // Should exclude shortBreak: 1500000 + 1500000 = 3000000
      expect(total).toBe(3000000);
    });

    it('includes free-mode entries (no phase)', () => {
      store.log({ taskName: 'Free Task', durationMs: 600000, mode: 'free', completedAt: '2025-02-20T12:00:00Z' });
      expect(store.getDailyTotal('2025-02-20')).toBe(600000);
    });

    it('excludes longBreak entries', () => {
      store.log({ taskName: 'Long Break', durationMs: 900000, mode: 'pomodoro', phase: 'longBreak', completedAt: '2025-02-20T12:00:00Z' });
      expect(store.getDailyTotal('2025-02-20')).toBe(0);
    });
  });

  describe('getGroupedByDate', () => {
    it('groups entries by date, most recent date first', () => {
      store.log({ taskName: 'Day1', durationMs: 1000, mode: 'free', completedAt: '2025-02-18T10:00:00Z' });
      store.log({ taskName: 'Day2', durationMs: 1000, mode: 'free', completedAt: '2025-02-19T10:00:00Z' });
      store.log({ taskName: 'Day3', durationMs: 1000, mode: 'free', completedAt: '2025-02-20T10:00:00Z' });

      const grouped = store.getGroupedByDate();
      const dates = Array.from(grouped.keys());
      expect(dates).toEqual(['2025-02-20', '2025-02-19', '2025-02-18']);
    });

    it('groups multiple entries under same date', () => {
      store.log({ taskName: 'A', durationMs: 1000, mode: 'free', completedAt: '2025-02-20T08:00:00Z' });
      store.log({ taskName: 'B', durationMs: 2000, mode: 'free', completedAt: '2025-02-20T14:00:00Z' });

      const grouped = store.getGroupedByDate();
      const feb20 = grouped.get('2025-02-20')!;
      expect(feb20).toHaveLength(2);
    });

    it('returns empty map when no entries', () => {
      const grouped = store.getGroupedByDate();
      expect(grouped.size).toBe(0);
    });
  });

  describe('midnight UTC timezone edge cases', () => {
    it('groups entries near midnight UTC correctly by UTC date', () => {
      store.log({ taskName: 'Before midnight', durationMs: 1500000, mode: 'free', completedAt: '2024-01-01T23:59:00.000Z' });
      store.log({ taskName: 'After midnight', durationMs: 1500000, mode: 'free', completedAt: '2024-01-02T00:01:00.000Z' });

      const grouped = store.getGroupedByDate();

      // Entries 2 minutes apart are split into separate date groups
      // because grouping uses UTC date from ISO string split on 'T'
      expect(grouped.has('2024-01-01')).toBe(true);
      expect(grouped.has('2024-01-02')).toBe(true);
      expect(grouped.get('2024-01-01')).toHaveLength(1);
      expect(grouped.get('2024-01-02')).toHaveLength(1);
      expect(grouped.get('2024-01-01')![0].taskName).toBe('Before midnight');
      expect(grouped.get('2024-01-02')![0].taskName).toBe('After midnight');
    });

    it('splits entries around midnight UTC into different date groups', () => {
      // An entry just before midnight UTC and one just after
      store.log({ taskName: 'Late night', durationMs: 1500000, mode: 'free', completedAt: '2025-02-20T23:55:00Z' });
      store.log({ taskName: 'Past midnight', durationMs: 1500000, mode: 'free', completedAt: '2025-02-21T00:05:00Z' });

      const grouped = store.getGroupedByDate();
      const dates = Array.from(grouped.keys());

      // These are grouped by UTC date, which is correct for ISO strings
      // but may not match the user's local date
      expect(dates).toContain('2025-02-20');
      expect(dates).toContain('2025-02-21');
      expect(grouped.get('2025-02-20')).toHaveLength(1);
      expect(grouped.get('2025-02-21')).toHaveLength(1);
    });

    it('getByDate uses UTC date prefix, not local time', () => {
      // A user in UTC-5 completes a task at 11:30 PM local (04:30 UTC next day)
      // The ISO string reflects UTC, so it groups under the UTC date
      store.log({ taskName: 'Local evening', durationMs: 1500000, mode: 'free', completedAt: '2025-02-21T04:30:00Z' });

      // From the user's perspective this was Feb 20, but it groups as Feb 21 in UTC
      expect(store.getByDate('2025-02-20')).toHaveLength(0);
      expect(store.getByDate('2025-02-21')).toHaveLength(1);
    });

    it('getDailyTotal is affected by the same UTC grouping', () => {
      // Two work sessions: one at 23:50 UTC and one at 00:10 UTC
      store.log({ taskName: 'W1', durationMs: 1500000, mode: 'pomodoro', phase: 'work', completedAt: '2025-02-20T23:50:00Z' });
      store.log({ taskName: 'W2', durationMs: 1500000, mode: 'pomodoro', phase: 'work', completedAt: '2025-02-21T00:10:00Z' });

      // Each day only gets one session's total, even though a local-time user
      // might consider both as the same evening
      expect(store.getDailyTotal('2025-02-20')).toBe(1500000);
      expect(store.getDailyTotal('2025-02-21')).toBe(1500000);
    });

    it('getGroupedByDate splits by T delimiter — entries without T are ungroupable', () => {
      // Edge case: a non-ISO date string without T separator
      // completedAt.split('T')[0] would return the entire string
      store.log({ taskName: 'Weird date', durationMs: 1000, mode: 'free', completedAt: '2025-02-20 10:00:00' });

      const grouped = store.getGroupedByDate();
      // The split('T') returns the full string as key since there's no 'T'
      expect(grouped.has('2025-02-20 10:00:00')).toBe(true);
      expect(grouped.has('2025-02-20')).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      store.log({ taskName: 'Test', durationMs: 1000, mode: 'free', completedAt: '2025-01-01T00:00:00Z' });
      store.clear();
      expect(store.getAll()).toEqual([]);
    });

    it('persists the cleared state', () => {
      store.log({ taskName: 'Test', durationMs: 1000, mode: 'free', completedAt: '2025-01-01T00:00:00Z' });
      store.clear();
      const saved = JSON.parse(storage['timerapp-history']);
      expect(saved).toEqual([]);
    });
  });
});
