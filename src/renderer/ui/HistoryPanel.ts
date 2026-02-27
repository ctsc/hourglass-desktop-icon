import { HistoryStore } from '../state/HistoryStore';

export class HistoryPanel {
  private _panel: HTMLDivElement;
  private _list: HTMLDivElement;
  private _store: HistoryStore;
  private _open = false;

  constructor(store: HistoryStore) {
    this._store = store;
    this._panel = document.getElementById('history-panel') as HTMLDivElement;
    this._list = document.getElementById('history-list') as HTMLDivElement;

    // Close button
    const closeBtn = this._panel.querySelector('.panel-close') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => this.toggle());

    // Clear button
    const clearBtn = this._panel.querySelector('.history-clear') as HTMLButtonElement;
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this._confirmClear());
    }

    // History toggle button in bottom bar
    const historyBtn = document.getElementById('btn-history');
    if (historyBtn) {
      historyBtn.addEventListener('click', () => this.toggle());
    }
  }

  toggle(): void {
    this._open = !this._open;
    this._panel.classList.toggle('open', this._open);
    if (this._open) this._render();
  }

  close(): void {
    this._open = false;
    this._panel.classList.remove('open');
  }

  refresh(): void {
    if (this._open) this._render();
  }

  private _render(): void {
    const grouped = this._store.getGroupedByDate();
    this._list.innerHTML = '';

    if (grouped.size === 0) {
      this._list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-dim);font-size:12px;">No history yet</div>';
      return;
    }

    for (const [date, entries] of grouped) {
      const group = document.createElement('div');
      group.className = 'history-date-group';

      const dailyTotal = this._store.getDailyTotal(date);
      const header = document.createElement('div');
      header.className = 'date-header';
      header.innerHTML = `
        <span>${this._formatDate(date)}</span>
        <span class="daily-total">${this._formatDuration(dailyTotal)}</span>
      `;
      group.appendChild(header);

      for (const entry of entries) {
        const row = document.createElement('div');
        row.className = 'history-entry';
        row.innerHTML = `
          <span class="entry-name">${this._escapeHtml(entry.taskName)}</span>
          <span class="entry-meta">
            <span>${this._formatDuration(entry.durationMs)}</span>
            <span>${this._formatTimeOfDay(entry.completedAt)}</span>
          </span>
        `;
        group.appendChild(row);
      }

      this._list.appendChild(group);
    }
  }

  private _confirmClear(): void {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <p>Clear all history?</p>
        <div class="btn-row">
          <button class="cancel">Cancel</button>
          <button class="danger">Clear</button>
        </div>
      </div>
    `;

    overlay.querySelector('.cancel')!.addEventListener('click', () => overlay.remove());
    overlay.querySelector('.danger')!.addEventListener('click', () => {
      this._store.clear();
      this._render();
      overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  private _formatDate(dateStr: string): string {
    const today = new Date().toISOString().split('T')[0];
    if (dateStr === today) return 'Today';

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (dateStr === yesterday) return 'Yesterday';

    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private _formatDuration(ms: number): string {
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 60) return `${totalMin}m`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  private _formatTimeOfDay(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  private _escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
