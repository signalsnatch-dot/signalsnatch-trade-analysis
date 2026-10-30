import { TradeSignal } from '../types/trade.ts';

const LOCAL_STORAGE_KEY = 'signalsnatch_trade_notes_v1';

export function getTradeKey(trade: { instrument: string; timestamp: number; version?: string }): string {
  return `${trade.instrument}_${trade.timestamp}_${trade.version || 'v1'}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export class TradeNotesService {
  private static cachedNotes: Record<string, string> | null = null;
  private static listeners: Set<(notes: Record<string, string>) => void> = new Set();

  /**
   * Load notes from localStorage cache first, then sync with backend
   */
  static getNotes(): Record<string, string> {
    if (this.cachedNotes !== null) {
      return this.cachedNotes;
    }

    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      this.cachedNotes = raw ? JSON.parse(raw) : {};
    } catch {
      this.cachedNotes = {};
    }

    // Background fetch from server
    this.syncFromServer();
    return this.cachedNotes || {};
  }

  static async syncFromServer(): Promise<Record<string, string>> {
    try {
      const res = await fetch('/api/trade-notes');
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.notes === 'object') {
          // Merge with local storage
          const merged = { ...(this.cachedNotes || {}), ...data.notes };
          this.cachedNotes = merged;
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
          this.notifyListeners();
          return merged;
        }
      }
    } catch {
      // Offline fallback
    }
    return this.cachedNotes || {};
  }

  static getNoteForTrade(trade: { instrument: string; timestamp: number; version?: string }): string {
    const key = getTradeKey(trade);
    const notes = this.getNotes();
    return notes[key] || '';
  }

  static async saveNote(
    trade: { instrument: string; timestamp: number; version?: string },
    note: string
  ): Promise<boolean> {
    const key = getTradeKey(trade);
    const notes = { ...this.getNotes() };

    const trimmed = (note || '').trim();
    if (trimmed) {
      notes[key] = trimmed;
    } else {
      delete notes[key];
    }

    this.cachedNotes = notes;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(notes));
    } catch {
      // Ignore storage errors
    }

    this.notifyListeners();

    // Persist to server
    try {
      await fetch('/api/trade-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          note: trimmed,
          instrument: trade.instrument,
          timestamp: trade.timestamp,
          version: trade.version,
        }),
      });
      return true;
    } catch {
      return false;
    }
  }

  static subscribe(listener: (notes: Record<string, string>) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private static notifyListeners() {
    const current = this.cachedNotes || {};
    this.listeners.forEach((listener) => {
      try {
        listener(current);
      } catch {
        // Ignore listener error
      }
    });
  }
}
