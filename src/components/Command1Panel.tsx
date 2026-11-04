import React, { useState } from 'react';
import { Database, Download, CheckCircle, AlertTriangle, RefreshCw, Search, FileText, ArrowRight, Layers } from 'lucide-react';
import { DayInstrumentAccumulation } from '../types/trade.ts';
import { Command1Result } from '../services/command1Service.ts';

interface Command1PanelProps {
  dayAccumulations: DayInstrumentAccumulation[];
  onRunCommand1: (selectedDates?: string[]) => Promise<void>;
  onRunCommand2ForDates?: (dates: string[]) => void;
  isRunning: boolean;
  lastResult: Command1Result | null;
  onSelectInstrumentToView?: (instrument: string, date: string) => void;
  onOpenMarketDataModal?: () => void;
}

export const Command1Panel: React.FC<Command1PanelProps> = ({
  dayAccumulations,
  onRunCommand1,
  onRunCommand2ForDates,
  isRunning,
  lastResult,
  onSelectInstrumentToView,
  onOpenMarketDataModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(
    dayAccumulations[0]?.date || ''
  );
  const [selectedDatesForCmd2, setSelectedDatesForCmd2] = useState<string[]>([]);

  const activeDay = dayAccumulations.find((d) => d.date === selectedDate) || dayAccumulations[0];

  const filteredInstruments = (activeDay?.instruments || []).filter((inst) => {
    const s = searchTerm.toLowerCase();
    return (
      inst.instrumentKey.toLowerCase().includes(s) ||
      inst.names.some((n) => n.toLowerCase().includes(s))
    );
  });

  const allDates = dayAccumulations.map((d) => d.date);
  const effectiveSelectedDates = selectedDatesForCmd2.length > 0 ? selectedDatesForCmd2 : [activeDay?.date || dayAccumulations[0]?.date || ''];
  const totalTradesInSelectedDates = dayAccumulations
    .filter((d) => effectiveSelectedDates.includes(d.date))
    .reduce((sum, d) => sum + d.totalTrades, 0);

  const toggleDateSelection = (date: string) => {
    setSelectedDatesForCmd2((prev) => {
      if (prev.includes(date)) {
        return prev.filter((d) => d !== date);
      } else {
        return [...prev, date];
      }
    });
  };

  const handleSelectAllDates = () => {
    setSelectedDatesForCmd2(allDates);
  };

  const handleClearAllDates = () => {
    setSelectedDatesForCmd2([]);
  };

  const handleRunCommand1Click = () => {
    const dates = selectedDatesForCmd2.length > 0 ? selectedDatesForCmd2 : (activeDay?.date ? [activeDay.date] : []);
    onRunCommand1(dates);
  };

  const handleRunCommand1AllClick = () => {
    onRunCommand1(allDates);
  };

  const handleRunCommand2Click = () => {
    if (!onRunCommand2ForDates) return;
    const datesToRun = selectedDatesForCmd2.length > 0 ? selectedDatesForCmd2 : [activeDay?.date || ''];
    onRunCommand2ForDates(datesToRun.filter(Boolean));
  };

  const getMarketSegmentBadge = (key: string) => {
    if (key.startsWith('NSE_EQ')) {
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-950 text-blue-400 border border-blue-800">NSE EQ</span>;
    }
    if (key.startsWith('NSE_FO')) {
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-950 text-purple-400 border border-purple-800">NSE FO</span>;
    }
    if (key.startsWith('MCX_FO')) {
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-400 border border-amber-800">MCX FO</span>;
    }
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300">{key.split('|')[0]}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-6 h-6 rounded-md bg-indigo-600/30 text-indigo-400 flex items-center justify-center font-bold text-xs">
              1
            </span>
            <h2 className="text-lg font-bold text-white">Command 1: Instrument Accumulation & 1-Minute CSV Fetcher</h2>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Extracts unique instrument keys per trading day, calls Upstox 1-minute historical/intraday API, and exports clean OHLCV CSVs to{' '}
            <code className="text-cyan-400 font-mono text-[11px] bg-slate-950 px-1 py-0.5 rounded">./market_data/YYYY-MM-DD/</code>.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onOpenMarketDataModal && (
            <button
              onClick={onOpenMarketDataModal}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer"
              title="Upload or download 1-min CSV market data to support expired contracts"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              <span>Upload / Export CSVs</span>
            </button>
          )}

          <button
            onClick={handleRunCommand1Click}
            disabled={isRunning || !dayAccumulations.length}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
            title={`Download candles strictly for ${selectedDatesForCmd2.length > 0 ? selectedDatesForCmd2.join(', ') : (activeDay?.date || 'active date')}`}
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Fetching 1-Min CSVs...</span>
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                <span>Run Command 1 ({selectedDatesForCmd2.length > 0 ? `${selectedDatesForCmd2.length} Selected` : (activeDay?.date || 'Active Date')})</span>
              </>
            )}
          </button>

          {allDates.length > 1 && (
            <button
              onClick={handleRunCommand1AllClick}
              disabled={isRunning || !dayAccumulations.length}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-semibold text-xs border border-slate-700 transition cursor-pointer"
              title="Download candles for all available dates"
            >
              <span>Fetch All {allDates.length} Dates</span>
            </button>
          )}
        </div>
      </div>

      {/* Date Filter & Multi-Date Selection for Command 2 Execution */}
      <div className="bg-slate-900 border border-indigo-900/40 rounded-2xl p-4 shadow-sm space-y-3 bg-gradient-to-r from-slate-900 via-slate-900/90 to-indigo-950/20">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider font-mono">
              <Layers className="w-4 h-4 text-indigo-400" />
              Select Dates for Command 2 Evaluation:
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
              {selectedDatesForCmd2.length > 0 ? `${selectedDatesForCmd2.length} Selected` : `Viewing ${activeDay?.date || 'Date'}`}
              {' '}({totalTradesInSelectedDates} trades)
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSelectAllDates}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              Select All Dates
            </button>
            <button
              onClick={handleClearAllDates}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              Clear Selection
            </button>
            {onRunCommand2ForDates && (
              <button
                onClick={handleRunCommand2Click}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 transition cursor-pointer"
                title="Run Command 2 analysis only on selected dates"
              >
                <span>Run Command 2 on Selected Dates</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Date Chips with Checkboxes */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-wrap">
          {dayAccumulations.map((d) => {
            const isChecked = selectedDatesForCmd2.includes(d.date);
            const isCurrentView = (selectedDate || dayAccumulations[0]?.date) === d.date;

            return (
              <div
                key={d.date}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition border ${
                  isChecked
                    ? 'bg-indigo-950/80 border-indigo-500/60 text-white'
                    : isCurrentView
                    ? 'bg-slate-800 border-slate-600 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleDateSelection(d.date)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                  title={`Include ${d.date} in Command 2 execution`}
                />
                <button
                  type="button"
                  onClick={() => setSelectedDate(d.date)}
                  className="cursor-pointer hover:underline"
                  title="View accumulated instruments for this day below"
                >
                  {d.date} <span className="text-[10px] text-slate-400">({d.totalTrades}t)</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Date Switcher & Search Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <span className="text-xs text-slate-400 font-medium whitespace-nowrap flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            Active Day Table:
          </span>
          <span className="text-xs font-bold text-white font-mono bg-slate-800 px-2.5 py-1 rounded-lg">
            {activeDay?.date || 'Date'} ({filteredInstruments.length} instruments, {activeDay?.totalTrades || 0} trades)
          </span>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search instrument or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Instruments Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div>
            <h3 className="text-sm font-bold text-white">
              Accumulated Instruments for {activeDay?.date || 'Date'}
            </h3>
            <p className="text-xs text-slate-400">
              {filteredInstruments.length} unique instrument keys identified across {activeDay?.totalTrades || 0} trades
            </p>
          </div>
          <div className="text-xs text-slate-400">
            CSV Path: <span className="font-mono text-cyan-400">./market_data/{activeDay?.date || 'YYYY-MM-DD'}/</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Segment</th>
                <th className="py-3 px-4">Instrument Key</th>
                <th className="py-3 px-4">Asset / Contract Name</th>
                <th className="py-3 px-4 text-center">Trades Ref</th>
                <th className="py-3 px-4 text-center">1-Min CSV Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {filteredInstruments.map((inst, idx) => {
                const safeName = inst.instrumentKey.replace(/[^a-zA-Z0-9_-]/g, '_');
                const csvRelPath = `${activeDay?.date}/${safeName}.csv`;

                return (
                  <tr key={`${inst.instrumentKey}_${idx}`} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getMarketSegmentBadge(inst.instrumentKey)}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-cyan-300">
                      {inst.instrumentKey}
                    </td>
                    <td className="py-3 px-4 text-white font-medium">
                      {inst.names.join(', ') || 'Instrument'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300">
                        {inst.tradeCount} trades
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                        <CheckCircle className="w-3 h-3" />
                        Available on Upstox
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {onSelectInstrumentToView && (
                          <button
                            onClick={() => onSelectInstrumentToView(inst.instrumentKey, activeDay?.date || '')}
                            className="px-2.5 py-1 rounded bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/60 text-xs font-medium transition cursor-pointer"
                          >
                            View Candles
                          </button>
                        )}
                        <a
                          href={`/api/download-csv?type=market_data&file=${encodeURIComponent(csvRelPath)}`}
                          download
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition"
                          title="Download 1-min CSV"
                        >
                          <Download className="w-3 h-3 text-cyan-400" />
                          <span>CSV</span>
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredInstruments.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No instruments match the search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
