import React, { useState } from 'react';
import { X, Key, Terminal, CheckCircle2, ShieldCheck, Database, HelpCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveToken: (token: string) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSaveToken,
}) => {
  const [tokenInput, setTokenInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [hasServerToken, setHasServerToken] = useState(false);
  const [tokenPreview, setTokenPreview] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      fetch('/api/config/token')
        .then((res) => res.json())
        .then((data) => {
          if (data.hasToken) {
            setHasServerToken(true);
            setTokenPreview(data.preview || null);
          } else {
            setHasServerToken(false);
            setTokenPreview(null);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    await onSaveToken(tokenInput);
    setIsSaving(false);
    setSavedSuccess(true);
    setHasServerToken(Boolean(tokenInput.trim()));
    setTokenPreview(tokenInput.trim() ? `${tokenInput.trim().slice(0, 10)}...` : null);
    setTokenInput('');
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleClear = async () => {
    setIsSaving(true);
    await onSaveToken('');
    setIsSaving(false);
    setHasServerToken(false);
    setTokenPreview(null);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Upstox API & Pipeline Configuration</h3>
              <p className="text-xs text-slate-400">Settings and Terminal CLI execution guide</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Upstox Access Token */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Upstox Access Token
              </label>
              {hasServerToken ? (
                <span className="text-[11px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60 font-mono">
                  Token Active ({tokenPreview || 'configured'})
                </span>
              ) : (
                <span className="text-[11px] text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/60">
                  Public Endpoints Active (No Auth Required)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Upstox historical and intraday 1-minute candle endpoints work without an access token. If you have an authenticated private account or want higher rate limits, paste your OAuth access token below.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder={hasServerToken ? 'Token configured (paste new token to overwrite)' : 'Paste Upstox access token (starts with ey...)'}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <button
                onClick={handleSave}
                disabled={isSaving || !tokenInput.trim()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold transition cursor-pointer"
              >
                {isSaving ? 'Saving...' : 'Save Token'}
              </button>
              {hasServerToken && (
                <button
                  onClick={handleClear}
                  disabled={isSaving}
                  className="px-3 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-semibold transition cursor-pointer"
                >
                  Clear Token
                </button>
              )}
            </div>
            {savedSuccess && (
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Token settings updated successfully.
              </p>
            )}
          </div>

          {/* Terminal CLI Execution Guide */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
              <Terminal className="w-4 h-4 text-indigo-400" />
              Terminal CLI Commands
            </div>
            <p className="text-xs text-slate-400">
              You can also execute both commands directly from your terminal or scripts:
            </p>

            <div className="space-y-2.5">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono">
                <div className="text-slate-500 mb-1"># Command 1: Accumulate instrument keys & fetch 1-min CSV</div>
                <div className="text-emerald-400">npm run command1</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono">
                <div className="text-slate-500 mb-1"># Command 2: Evaluate SL vs TP milestone resolution (Ultra / Uber default)</div>
                <div className="text-indigo-400">npm run command2</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono">
                <div className="text-slate-500 mb-1"># Run both Command 1 & Command 2 sequentially</div>
                <div className="text-cyan-400">npm run analyze</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono">
                <div className="text-slate-500 mb-1"># Command 2 with custom version filter or all versions</div>
                <div className="text-amber-400">npx tsx scripts/run_command2.ts --version ULTRA,UBER</div>
                <div className="text-amber-400">npx tsx scripts/run_command2.ts --all</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
