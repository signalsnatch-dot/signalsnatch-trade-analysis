import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Upload,
  Download,
  Database,
  FileSpreadsheet,
  FileCode,
  CheckCircle2,
  AlertCircle,
  FolderArchive,
  RefreshCw,
  Calendar,
  Layers,
  Sparkles,
  Folder,
  FolderUp,
} from 'lucide-react';
import { UpstoxApiService } from '../services/upstoxApi.ts';
import { parseBatchMarketData, ProcessedMarketItem } from '../services/marketDataParser.ts';

interface MarketDataFile {
  date: string;
  filename: string;
  relativePath: string;
  size: number;
  lines: number;
}

interface StagedFileEntry {
  filename: string;
  content: string;
  size: number;
  format: 'JSON' | 'CSV';
  parsedItems: ProcessedMarketItem[];
}

interface MarketDataManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
}

export const MarketDataManagerModal: React.FC<MarketDataManagerModalProps> = ({
  isOpen,
  onClose,
  onDataChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'files'>('upload');
  const [selectedDate, setSelectedDate] = useState<string>(UpstoxApiService.toISTDate(Date.now()));
  const [stagedFiles, setStagedFiles] = useState<StagedFileEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Existing files list
  const [filesList, setFilesList] = useState<MarketDataFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dirInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch files list
  const fetchMarketDataFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const res = await fetch('/api/market-data/files');
      const data = await res.json();
      if (Array.isArray(data.files)) {
        setFilesList(data.files);
      }
    } catch (e) {
      console.error('Failed to load market data files:', e);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMarketDataFiles();
      setUploadMessage(null);
    }
  }, [isOpen]);

  // Aggregate mapped items across all staged files
  const allMappedItems = useMemo(() => {
    const list: ProcessedMarketItem[] = [];
    stagedFiles.forEach((f) => list.push(...f.parsedItems));
    return list;
  }, [stagedFiles]);

  const uniqueMappedDates = useMemo(() => {
    return Array.from(new Set(allMappedItems.map((item) => item.date)));
  }, [allMappedItems]);

  const uniqueMappedInstruments = useMemo(() => {
    return Array.from(new Set(allMappedItems.map((item) => item.safeInstrument)));
  }, [allMappedItems]);

  if (!isOpen) return null;

  // Read file/directory entries recursively
  const readEntryRecursively = async (
    entry: any,
    pathPrefix = ''
  ): Promise<{ file: File; relativePath: string }[]> => {
    if (!entry) return [];
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file(
          (f: File) => {
            const relPath = pathPrefix ? `${pathPrefix}/${f.name}` : f.name;
            resolve([{ file: f, relativePath: relPath }]);
          },
          () => resolve([])
        );
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const allEntries: any[] = [];
      const readBatch = (): Promise<any[]> => {
        return new Promise((resolve) => {
          dirReader.readEntries(
            (results: any[]) => {
              if (!results || results.length === 0) {
                resolve(allEntries);
              } else {
                allEntries.push(...results);
                readBatch().then(resolve);
              }
            },
            () => resolve(allEntries)
          );
        });
      };
      const childEntries = await readBatch();
      const newPrefix = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
      const nested = await Promise.all(
        childEntries.map((c) => readEntryRecursively(c, newPrefix))
      );
      return nested.flat();
    }
    return [];
  };

  // Process list of files with preserved relative paths
  const processFiles = async (
    items: { file: File; relativePath: string }[]
  ) => {
    if (!items || items.length === 0) return;

    // Filter only CSV or JSON files (ignoring hidden / system files like .DS_Store)
    const validFiles = items.filter(({ file }) => {
      const name = file.name.toLowerCase();
      return (
        name.endsWith('.csv') ||
        name.endsWith('.json') ||
        file.type === 'application/json' ||
        file.type === 'text/csv'
      );
    });

    if (validFiles.length === 0) {
      setUploadMessage({
        type: 'error',
        text: 'No CSV or JSON files found in the selected folder/files.',
      });
      return;
    }

    for (const { file, relativePath } of validFiles) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = String(evt.target?.result || '');
        const isJson =
          file.name.toLowerCase().endsWith('.json') ||
          text.trim().startsWith('{') ||
          text.trim().startsWith('[');

        // Run smart batch parser with the relative path so folder dates are detected
        const parsed = parseBatchMarketData([
          {
            filename: relativePath || file.name,
            content: text,
            defaultDate: selectedDate,
          },
        ]);

        setStagedFiles((prev) => [
          ...prev.filter((f) => f.filename !== (relativePath || file.name)),
          {
            filename: relativePath || file.name,
            content: text,
            size: file.size,
            format: isJson ? 'JSON' : 'CSV',
            parsedItems: parsed.items,
          },
        ]);
      };
      reader.readAsText(file);
    }
  };

  // Individual or multiple file selection handler
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const items: { file: File; relativePath: string }[] = Array.from(files).map((f) => ({
      file: f,
      relativePath: (f as any).webkitRelativePath || f.name,
    }));

    processFiles(items);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (dirInputRef.current) dirInputRef.current.value = '';
  };

  // Drag and drop handler with recursive directory support
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const items = e.dataTransfer.items;
    const fileEntries: { file: File; relativePath: string }[] = [];

    if (items && items.length > 0) {
      const scanPromises: Promise<{ file: File; relativePath: string }[]>[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (typeof item.webkitGetAsEntry === 'function') {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            scanPromises.push(readEntryRecursively(entry));
          }
        }
      }
      const scanned = await Promise.all(scanPromises);
      fileEntries.push(...scanned.flat());
    }

    // Fallback if webkitGetAsEntry didn't yield anything
    if (fileEntries.length === 0 && e.dataTransfer.files?.length > 0) {
      Array.from(e.dataTransfer.files).forEach((f) => {
        fileEntries.push({
          file: f,
          relativePath: (f as any).webkitRelativePath || f.name,
        });
      });
    }

    if (fileEntries.length > 0) {
      processFiles(fileEntries);
    }
  };

  // Perform upload to server
  const handleUploadStaged = async () => {
    if (stagedFiles.length === 0) return;
    setIsUploading(true);
    setUploadMessage(null);

    try {
      const payloadFiles = stagedFiles.map((f) => ({
        filename: f.filename,
        content: f.content,
        defaultDate: selectedDate,
      }));

      const res = await fetch('/api/market-data/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: payloadFiles }),
      });

      const data = await res.json();
      if (data.success) {
        const datesCount = uniqueMappedDates.length;
        const instCount = uniqueMappedInstruments.length;
        const datesLabel = uniqueMappedDates.slice(0, 3).join(', ') + (uniqueMappedDates.length > 3 ? ` +${uniqueMappedDates.length - 3} more` : '');

        setUploadMessage({
          type: 'success',
          text: `Successfully mapped and saved ${data.savedCount} CSV files across ${datesCount} date(s) (${datesLabel}) and ${instCount} instrument(s) into ./market_data/! Available for Command 1 and Command 2.`,
        });
        setStagedFiles([]);
        fetchMarketDataFiles();
        onDataChanged?.();
      } else {
        setUploadMessage({
          type: 'error',
          text: data.error || 'Failed to upload and map files',
        });
      }
    } catch (err: unknown) {
      setUploadMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Network error during upload',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const filteredFiles = filesList.filter((f) => {
    const q = searchQuery.toLowerCase();
    return f.date.includes(q) || f.filename.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Market Data CSV Manager</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                  Expired Contracts Support
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Upload historical 1-minute OHLCV CSVs directly into <code className="text-cyan-300">./market_data/&lt;date&gt;/</code> or download all archived CSVs.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/download-directory?type=market"
              download="market_data_export.tar.gz"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            >
              <FolderArchive className="w-4 h-4 text-emerald-400" />
              <span>Download All (.tar.gz)</span>
            </a>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="px-5 pt-3 pb-0 border-b border-slate-800 bg-slate-950/40 flex items-center gap-3">
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition cursor-pointer ${
              activeTab === 'upload'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload JSON / CSV Data</span>
            {stagedFiles.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-600 text-white font-mono">
                {stagedFiles.length}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('files');
              fetchMarketDataFiles();
            }}
            className={`pb-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition cursor-pointer ${
              activeTab === 'files'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Stored CSV Files ({filesList.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {uploadMessage && (
            <div
              className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2.5 ${
                uploadMessage.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-800 text-emerald-200'
                  : 'bg-rose-950/50 border-rose-800 text-rose-200'
              }`}
            >
              {uploadMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{uploadMessage.text}</span>
            </div>
          )}

          {activeTab === 'upload' ? (
            <div className="space-y-4">
              {/* Target Date Picker (Used as fallback for files without explicit candle timestamps) */}
              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Calendar className="w-4 h-4 text-indigo-400" />
                  <div>
                    <label className="block text-xs font-bold text-white">Default / Fallback Date Folder</label>
                    <span className="text-[11px] text-slate-400">
                      Files with embedded candle timestamps are <strong className="text-cyan-300">automatically mapped to their real dates</strong>. Fallback: <code className="text-cyan-300">./market_data/{selectedDate}/</code>
                    </span>
                  </div>
                </div>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Upload Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragOver(false);
                }}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition flex flex-col items-center justify-center space-y-3 ${
                  isDragOver
                    ? 'border-indigo-400 bg-indigo-950/40 shadow-lg shadow-indigo-500/20 scale-[1.005]'
                    : 'border-slate-700 hover:border-indigo-500/80 bg-slate-950/40 hover:bg-slate-950/70'
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-indigo-600/15 text-indigo-400 border border-indigo-500/20 flex items-center justify-center mb-1">
                  {isDragOver ? <FolderUp className="w-7 h-7 animate-bounce text-indigo-300" /> : <Upload className="w-7 h-7" />}
                </div>

                <div className="text-sm font-bold text-white">
                  {isDragOver ? 'Drop Folders or Files to Process' : 'Drag & Drop Directory / Folder or Files Here'}
                </div>

                <p className="text-xs text-slate-400 max-w-lg leading-relaxed">
                  Recursively traverses nested folders (e.g.{' '}
                  <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded text-[11px]">
                    archive/2026-10-27/NSE_FO_61471.csv
                  </code>
                  ). Automatically detects dates from folder names or candle timestamps and maps instruments to{' '}
                  <code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded text-[11px]">
                    ./market_data/&lt;date&gt;/
                  </code>
                  .
                </p>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => dirInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition cursor-pointer shadow-md shadow-indigo-600/20"
                  >
                    <Folder className="w-4 h-4" />
                    <span>Choose Directory / Folder</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                    <span>Choose Files</span>
                  </button>
                </div>

                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".json,.csv,application/json,text/csv"
                  onChange={handleFilesSelected}
                  className="hidden"
                />

                {/* Hidden Directory Input (Recursively scans whole directory tree) */}
                <input
                  ref={dirInputRef}
                  type="file"
                  multiple
                  {...({ webkitdirectory: '', directory: '' } as any)}
                  onChange={handleFilesSelected}
                  className="hidden"
                />
              </div>

              {/* Staged files preview */}
              {stagedFiles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-300">
                        Staged Files ({stagedFiles.length})
                      </h4>
                      <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-mono">
                        {allMappedItems.length} mapped file(s) • {uniqueMappedDates.length} date(s) • {uniqueMappedInstruments.length} instrument(s)
                      </span>
                    </div>
                    <button
                      onClick={() => setStagedFiles([])}
                      className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>

                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-2xl bg-slate-950/60 font-mono text-xs">
                    {stagedFiles.map((f, i) => (
                      <div key={i} className="p-3 text-slate-300 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 truncate">
                            {f.format === 'JSON' ? (
                              <FileCode className="w-4 h-4 text-amber-400 shrink-0" />
                            ) : (
                              <FileSpreadsheet className="w-4 h-4 text-cyan-400 shrink-0" />
                            )}
                            <span className="truncate font-semibold text-white">{f.filename}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                f.format === 'JSON'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                              }`}
                            >
                              {f.format}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-slate-400 shrink-0 text-[11px]">
                            <span>{(f.size / 1024).toFixed(1)} KB</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setStagedFiles((prev) => prev.filter((_, idx) => idx !== i));
                              }}
                              className="text-rose-400 hover:text-rose-300 ml-1 cursor-pointer font-bold text-sm"
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        {/* Mapped targets preview */}
                        {f.parsedItems.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 pl-6">
                            {f.parsedItems.map((item, itIdx) => (
                              <span
                                key={itIdx}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-slate-300"
                              >
                                <span className="text-indigo-400 font-bold">{item.date}</span>
                                <span className="text-slate-500">/</span>
                                <span className="text-cyan-300">{item.safeInstrument}.csv</span>
                                <span className="text-emerald-400">({item.candlesCount.toLocaleString()} candles)</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="pl-6 text-[11px] text-amber-400">
                            No valid candles could be extracted from this file.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleUploadStaged}
                      disabled={isUploading || allMappedItems.length === 0}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition cursor-pointer"
                    >
                      {isUploading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Mapping & Saving Candle Data...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Save & Map {allMappedItems.length} File(s) across {uniqueMappedDates.length} Date(s)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <input
                  type="text"
                  placeholder="Filter by date or instrument name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-full sm:w-64"
                />
                <button
                  onClick={fetchMarketDataFiles}
                  disabled={isLoadingFiles}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer border border-slate-700"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin text-cyan-400' : ''}`} />
                  <span>Refresh List</span>
                </button>
              </div>

              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60 max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Date Folder</th>
                      <th className="py-2.5 px-3">Instrument File</th>
                      <th className="py-2.5 px-3 text-right">Candles</th>
                      <th className="py-2.5 px-3 text-right">Size</th>
                      <th className="py-2.5 px-3 text-right">Download</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {filteredFiles.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                          {isLoadingFiles ? 'Loading market data files...' : 'No market data files found.'}
                        </td>
                      </tr>
                    ) : (
                      filteredFiles.map((file, idx) => (
                        <tr key={`${file.relativePath}_${idx}`} className="hover:bg-slate-850/50 transition">
                          <td className="py-2 px-3 text-indigo-400 font-semibold">{file.date}</td>
                          <td className="py-2 px-3 text-slate-200">{file.filename}</td>
                          <td className="py-2 px-3 text-right text-emerald-400">{file.lines.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-slate-400">{(file.size / 1024).toFixed(1)} KB</td>
                          <td className="py-2 px-3 text-right">
                            <a
                              href={`/api/download-csv?type=market&file=${encodeURIComponent(file.relativePath)}`}
                              download={file.filename}
                              className="text-cyan-400 hover:text-cyan-300 font-semibold text-xs"
                            >
                              Download
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
