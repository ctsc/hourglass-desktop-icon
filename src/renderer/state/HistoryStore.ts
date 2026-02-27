import { HistoryEntry } from '../../shared/types';

const STORAGE_KEY = 'timerapp-history';
const MAX_ENTRIES = 500;

export class HistoryStore {
  private _entries: HistoryEntry[] = [];

  constructor() {
    this._load();
  }

  private _load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this._entries = JSON.parse(raw);
    } catch {
      this._entries = [];
    }
  }

  private _save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._entries));
  }

  log(entry: Omit<HistoryEntry, 'id'>): void {
    const newEntry: HistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
    };
    this._entries.push(newEntry);
    // FIFO eviction
    if (this._entries.length > MAX_ENTRIES) {
      this._entries = this._entries.slice(-MAX_ENTRIES);
    }
    this._save();
  }

  getAll(): HistoryEntry[] {
    return [...this._entries];
  }

  getByDate(dateStr: string): HistoryEntry[] {
    return this._entries.filter(e => e.completedAt.startsWith(dateStr));
  }

  getDailyTotal(dateStr: string): number {
    return this.getByDate(dateStr)
      .filter(e => e.phase !== 'shortBreak' && e.phase !== 'longBreak')
      .reduce((sum, e) => sum + e.durationMs, 0);
  }

  /** Get all entries grouped by date, most recent first */
  getGroupedByDate(): Map<string, HistoryEntry[]> {
    const groups = new Map<string, HistoryEntry[]>();
    // Iterate in reverse for most recent first
    for (let i = this._entries.length - 1; i >= 0; i--) {
      const entry = this._entries[i];
      const date = entry.completedAt.split('T')[0];
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date)!.push(entry);
    }
    return groups;
  }

  clear(): void {
    this._entries = [];
    this._save();
  }
}
