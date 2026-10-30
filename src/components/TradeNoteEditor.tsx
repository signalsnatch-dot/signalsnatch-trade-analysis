import React, { useState, useEffect, useRef } from 'react';
import { StickyNote, Check, X, Edit3, Trash2 } from 'lucide-react';
import { TradeNotesService, getTradeKey } from '../services/tradeNotesService.ts';

interface TradeNoteEditorProps {
  trade: {
    instrument: string;
    timestamp: number;
    version?: string;
  };
  compact?: boolean;
}

export const TradeNoteEditor: React.FC<TradeNoteEditorProps> = ({ trade, compact = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [currentSavedNote, setCurrentSavedNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Sync current note
  useEffect(() => {
    const key = getTradeKey(trade);
    const existing = TradeNotesService.getNoteForTrade(trade);
    setCurrentSavedNote(existing);
    setNoteText(existing);

    const unsubscribe = TradeNotesService.subscribe((notes) => {
      const updated = notes[key] || '';
      setCurrentSavedNote(updated);
    });

    return unsubscribe;
  }, [trade.instrument, trade.timestamp, trade.version]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    await TradeNotesService.saveNote(trade, noteText);
    setCurrentSavedNote(noteText.trim());
    setIsSaving(false);
    setIsOpen(false);
  };

  const handleDelete = async () => {
    setIsSaving(true);
    await TradeNotesService.saveNote(trade, '');
    setNoteText('');
    setCurrentSavedNote('');
    setIsSaving(false);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left" ref={popoverRef}>
      {/* Trigger Button */}
      {compact ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className={`p-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
            currentSavedNote
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
          }`}
          title={currentSavedNote ? `Note: ${currentSavedNote}` : 'Add custom trade note'}
        >
          <StickyNote className="w-3.5 h-3.5" />
          {currentSavedNote && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
          )}
        </button>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-sans font-medium transition cursor-pointer ${
            currentSavedNote
              ? 'bg-amber-950/80 text-amber-300 border border-amber-800 hover:bg-amber-900/60'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <StickyNote className="w-3 h-3 text-amber-400" />
          {currentSavedNote ? (
            <span className="truncate max-w-[120px] font-mono text-[10px]">{currentSavedNote}</span>
          ) : (
            <span>+ Note</span>
          )}
        </button>
      )}

      {/* Popover Editor */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-50 right-0 mt-1 w-72 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <StickyNote className="w-3.5 h-3.5 text-amber-400" />
              <span>User Trade Note</span>
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Type observations, setup notes, execution nuances..."
            rows={3}
            autoFocus
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-sans resize-none"
          />

          <div className="flex items-center justify-between mt-2 pt-1">
            {currentSavedNote ? (
              <button
                onClick={handleDelete}
                disabled={isSaving}
                className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            ) : (
              <span className="text-[10px] text-slate-500">Auto-saved for future</span>
            )}

            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={() => setIsOpen(false)}
                className="px-2 py-1 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold flex items-center gap-1 shadow cursor-pointer disabled:opacity-50"
              >
                <Check className="w-3 h-3" />
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
