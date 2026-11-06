import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { createServer as createViteServer } from 'vite';
import { UpstoxApiService } from './src/services/upstoxApi.ts';
import { Command1Service } from './src/services/command1Service.ts';
import { Command2Service } from './src/services/command2Service.ts';
import { augmentCandlesWithIndicators } from './src/services/indicators.ts';
import { TradeSignal } from './src/types/trade.ts';
import { parseBatchMarketData } from './src/services/marketDataParser.ts';
import { SystemDiagnostics } from './src/utils/systemDiagnostics.ts';

import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Support CLI --port argument or process.env.PORT in production/EC2, defaulting to port 3000 for AI Studio dev server
const portArgIdx = process.argv.indexOf('--port');
const portFromArg = portArgIdx !== -1 && process.argv[portArgIdx + 1] ? parseInt(process.argv[portArgIdx + 1], 10) : NaN;
const envPort = process.env.PORT ? parseInt(process.env.PORT, 10) : NaN;
const isProdOrEc2 = process.env.NODE_ENV === 'production' || process.env.PORT === '8080' || process.env.IS_EC2 === 'true';
const PORT = !isNaN(portFromArg) ? portFromArg : (isProdOrEc2 && !isNaN(envPort) ? envPort : 3000);
const SIGNALS_DIR = path.resolve(__dirname, 'signals');
const MARKET_DATA_DIR = path.resolve(__dirname, 'market_data');
const REPORTS_DIR = path.resolve(__dirname, 'reports');
const REMOTE_SIGNALS_BASE_URL = 'http://13.232.16.180:8000';

// Ensure necessary directories exist
function ensureDirectoriesExist(): void {
  [SIGNALS_DIR, MARKET_DATA_DIR, REPORTS_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}
ensureDirectoriesExist();

// Global crash-prevention handlers for EC2 and server stability
process.on('uncaughtException', (err) => {
  console.error('[SERVER UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[SERVER UNHANDLED REJECTION]', reason);
});

const TOKEN_FILE = path.resolve(__dirname, '.upstox_token');
let activeUpstoxToken: string | undefined = process.env.UPSTOX_ACCESS_TOKEN;
if (!activeUpstoxToken && fs.existsSync(TOKEN_FILE)) {
  try {
    const saved = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
    if (saved) activeUpstoxToken = saved;
  } catch {
    // Ignore error reading token file
  }
}

function getApiService(): UpstoxApiService {
  return new UpstoxApiService({ accessToken: activeUpstoxToken, cacheDir: MARKET_DATA_DIR });
}

// In-Memory Signals Cache to prevent blocking disk I/O and redundant JSON parsing on every request
let cachedSignalsData: {
  files: { filename: string; trades: TradeSignal[] }[];
  allTrades: TradeSignal[];
  versions: string[];
  instruments: string[];
  dates: string[];
} | null = null;

function invalidateSignalsCache(): void {
  console.log(`[SIGNALS CACHE] Invalidate in-memory cache due to file mutation`);
  cachedSignalsData = null;
}

function loadAllSignals(): { filename: string; trades: TradeSignal[] }[] {
  if (cachedSignalsData) {
    return cachedSignalsData.files;
  }

  ensureDirectoriesExist();
  const result: { filename: string; trades: TradeSignal[] }[] = [];
  if (!fs.existsSync(SIGNALS_DIR)) return result;

  const files = fs.readdirSync(SIGNALS_DIR).filter((f) => f.endsWith('.json'));
  const combinedTrades: TradeSignal[] = [];

  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(SIGNALS_DIR, f), 'utf-8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        const tradesWithIST = data.map((t: any) => ({
          ...t,
          ist: t.ist || UpstoxApiService.toISTString(t.timestamp),
        }));
        result.push({ filename: f, trades: tradesWithIST });
        combinedTrades.push(...tradesWithIST);
      }
    } catch {
      // Ignore invalid files
    }
  }

  const versions = Array.from(new Set(combinedTrades.map((t) => t.version))).sort();
  const instruments = Array.from(new Set(combinedTrades.map((t) => t.instrument))).sort();
  const dates = Array.from(new Set(combinedTrades.map((t) => UpstoxApiService.toISTDate(t.timestamp)))).sort();

  cachedSignalsData = {
    files: result,
    allTrades: combinedTrades,
    versions,
    instruments,
    dates,
  };

  console.log(`[SIGNALS CACHE] Rebuilt cache: ${result.length} files, ${combinedTrades.length} total trades`);
  return result;
}

async function startServer() {
  const app = express();
  
  // Enable Gzip compression if installed; fallback gracefully if package is not present
  try {
    const compMod = await import('compression');
    const compFn = (compMod as any).default || compMod;
    if (typeof compFn === 'function') {
      app.use(compFn());
      console.log(`[SERVER] Gzip HTTP response compression enabled.`);
    }
  } catch {
    console.log(`[SERVER] Note: 'compression' package not installed in node_modules; continuing without response compression.`);
  }

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // --- API Endpoints ---

  // 1. Remote Signals: List available JSON files on http://13.232.16.180:8000
  app.get('/api/remote-signals/list', async (req: Request, res: Response) => {
    const existingLocalFiles = new Set(fs.existsSync(SIGNALS_DIR) ? fs.readdirSync(SIGNALS_DIR) : []);
    try {
      const baseUrl = (req.query.baseUrl as string) || REMOTE_SIGNALS_BASE_URL;
      const response = await axios.get(baseUrl, { timeout: 6000 });
      const html = String(response.data);

      const regex = /href="([^"]+\.json)"/g;
      let match;
      const files: { filename: string; url: string; date?: string; isDownloaded: boolean }[] = [];

      while ((match = regex.exec(html)) !== null) {
        const fname = match[1];
        const dateMatch = fname.match(/\d{4}-\d{2}-\d{2}/);
        const cleanName = fname.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const isDownloaded = existingLocalFiles.has(fname) || existingLocalFiles.has(cleanName) || existingLocalFiles.has(`signals_${fname}`) || existingLocalFiles.has(`signals_${cleanName}`);
        
        files.push({
          filename: fname,
          url: `${baseUrl.replace(/\/+$/, '')}/${fname}`,
          date: dateMatch ? dateMatch[0] : undefined,
          isDownloaded,
        });
      }

      // Sort recent first
      files.reverse();
      res.json({
        success: true,
        baseUrl,
        files,
        total: files.length,
        localFiles: Array.from(existingLocalFiles),
      });
    } catch (err: unknown) {
      // If remote server is offline, return local files so user can still proceed!
      res.json({
        success: false,
        offline: true,
        error: err instanceof Error ? err.message : String(err),
        message: 'Remote signals server is offline or unreachable. Existing local files and data are retained.',
        files: [],
        localFiles: Array.from(existingLocalFiles),
      });
    }
  });

  // 2. Remote Signals: Download a selected JSON file from remote link to ./signals/
  app.post('/api/remote-signals/download', async (req: Request, res: Response) => {
    try {
      const { filename, url } = req.body;
      const targetUrl = url || `${REMOTE_SIGNALS_BASE_URL}/${filename}`;

      const response = await axios.get(targetUrl, { timeout: 10000 });
      const trades = response.data;

      if (!Array.isArray(trades)) {
        return res.status(400).json({ error: 'Downloaded file is not a JSON array of trade signals' });
      }

      const saveName = (filename || path.basename(targetUrl)).replace(/[^a-zA-Z0-9_.-]/g, '_');
      const targetPath = path.join(SIGNALS_DIR, saveName);
      fs.writeFileSync(targetPath, JSON.stringify(trades, null, 2), 'utf-8');
      invalidateSignalsCache();

      res.json({
        success: true,
        filename: saveName,
        savedPath: targetPath,
        tradesCount: trades.length,
        trades,
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 2b. Batch Download Remote Signals
  app.post('/api/remote-signals/batch-download', async (req: Request, res: Response) => {
    try {
      const { files } = req.body; // Array of { filename: string, url: string }
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'No files provided for batch download' });
      }

      const allMergedTrades: TradeSignal[] = [];
      const downloadedFiles: string[] = [];

      for (const item of files) {
        try {
          const targetUrl = item.url || `${REMOTE_SIGNALS_BASE_URL}/${item.filename}`;
          const response = await axios.get(targetUrl, { timeout: 10000 });
          const trades = response.data;
          if (Array.isArray(trades)) {
            const saveName = (item.filename || path.basename(targetUrl)).replace(/[^a-zA-Z0-9_.-]/g, '_');
            const targetPath = path.join(SIGNALS_DIR, saveName);
            fs.writeFileSync(targetPath, JSON.stringify(trades, null, 2), 'utf-8');
            downloadedFiles.push(saveName);
            allMergedTrades.push(...trades);
          }
        } catch (e) {
          console.error(`Failed to download ${item.filename}:`, e);
        }
      }

      invalidateSignalsCache();

      res.json({
        success: true,
        downloadedFiles,
        tradesCount: allMergedTrades.length,
        trades: allMergedTrades,
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 2c. Live Tracker Polling Endpoint (Polls current date JSON link every 5s)
  app.get('/api/live/poll', async (req: Request, res: Response) => {
    const targetUrl = (req.query.url as string) || `${REMOTE_SIGNALS_BASE_URL}/signals_today_${UpstoxApiService.toISTDate(Date.now())}.json`;
    try {
      const response = await axios.get(targetUrl, { timeout: 4000 });
      const trades = response.data;

      if (!Array.isArray(trades)) {
        return res.json({
          success: false,
          offline: false,
          error: 'Remote response is not a JSON array',
          polledAt: Date.now(),
          polledAtIST: UpstoxApiService.toISTString(Date.now()),
        });
      }

      // Quick filter for Ultra/Uber completed trades
      const ultraUberTrades = trades.filter(
        (t: any) =>
          t &&
          t.bar_type !== 'price' &&
          t.status === 'completed' &&
          ['ULTRA', 'UBER'].includes(String(t.version || '').toUpperCase())
      );

      res.json({
        success: true,
        offline: false,
        url: targetUrl,
        polledAt: Date.now(),
        polledAtIST: UpstoxApiService.toISTString(Date.now()),
        totalTrades: trades.length,
        ultraUberCount: ultraUberTrades.length,
        trades,
      });
    } catch (err: unknown) {
      res.json({
        success: false,
        offline: true,
        error: err instanceof Error ? err.message : String(err),
        polledAt: Date.now(),
        polledAtIST: UpstoxApiService.toISTString(Date.now()),
      });
    }
  });

  // 3. Local Signals: Get list of local signals files
  app.get('/api/signals', (req: Request, res: Response) => {
    try {
      const all = loadAllSignals();
      const filesInfo = all.map((item) => {
        const dates = new Set(item.trades.map((t) => UpstoxApiService.toISTDate(t.timestamp)));
        const versions = new Set(item.trades.map((t) => t.version));
        const instruments = new Set(item.trades.map((t) => t.instrument));
        return {
          filename: item.filename,
          tradesCount: item.trades.length,
          dates: Array.from(dates),
          versions: Array.from(versions),
          instrumentsCount: instruments.size,
        };
      });
      res.json({ files: filesInfo, totalFiles: filesInfo.length });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 4. Load trades data (Cached, fast, compressed)
  app.get('/api/signals/data', (req: Request, res: Response) => {
    try {
      const filename = req.query.filename as string | undefined;
      loadAllSignals(); // ensures cache is populated

      if (!cachedSignalsData) {
        return res.json({ trades: [], total: 0, versions: [], instruments: [], dates: [] });
      }

      let combinedTrades: TradeSignal[] = [];

      if (filename) {
        const found = cachedSignalsData.files.find((item) => item.filename === filename);
        if (found) combinedTrades = found.trades;
      } else {
        combinedTrades = cachedSignalsData.allTrades;
      }

      res.json({
        trades: combinedTrades,
        total: combinedTrades.length,
        versions: cachedSignalsData.versions,
        instruments: cachedSignalsData.instruments,
        dates: cachedSignalsData.dates,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 5. Upload/paste trades
  app.post('/api/signals/upload', (req: Request, res: Response) => {
    const uploadStartMs = Date.now();
    try {
      const { filename, trades } = req.body;
      console.log(`[SIGNALS UPLOAD START] ${new Date().toISOString()} | Filename: '${filename || 'custom'}'`);

      if (!Array.isArray(trades)) {
        console.error(`[SIGNALS UPLOAD ERROR] Expected trades to be a JSON array`);
        return res.status(400).json({ error: 'Expected trades to be a JSON array' });
      }

      const safeName = (filename || `trades_${Date.now()}.json`).replace(/[^a-zA-Z0-9_.-]/g, '_');
      const target = path.join(SIGNALS_DIR, safeName);
      const jsonContent = JSON.stringify(trades, null, 2);
      fs.writeFileSync(target, jsonContent, 'utf-8');

      invalidateSignalsCache();

      const elapsedMs = Date.now() - uploadStartMs;
      const sizeKb = (Buffer.byteLength(jsonContent, 'utf-8') / 1024).toFixed(1);
      console.log(`[SIGNALS UPLOAD SUCCESS] Saved '${safeName}' (${sizeKb} KB, ${trades.length} trades) in ${elapsedMs}ms`);

      res.json({ success: true, filename: safeName, count: trades.length });
    } catch (err: unknown) {
      const elapsedMs = Date.now() - uploadStartMs;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[SIGNALS UPLOAD FAILED] (${elapsedMs}ms): ${errMsg}`);
      res.status(500).json({ error: errMsg });
    }
  });

  // 6. Run Command 1
  app.post('/api/command1/run', async (req: Request, res: Response) => {
    const reqStartMs = Date.now();
    try {
      ensureDirectoriesExist();
      const { filename, trades: customTrades, selectedDates } = req.body;
      console.log(`[API /command1/run START] ${new Date().toISOString()} | Source: ${filename ? `'${filename}'` : customTrades ? 'custom input' : 'all cached files'} | SelectedDates: ${Array.isArray(selectedDates) ? selectedDates.join(',') : 'all'}`);

      let tradesToProcess: TradeSignal[] = [];

      if (Array.isArray(customTrades) && customTrades.length > 0) {
        tradesToProcess = customTrades;
      } else {
        loadAllSignals();
        if (cachedSignalsData) {
          if (filename) {
            const found = cachedSignalsData.files.find((item) => item.filename === filename);
            if (found) tradesToProcess = found.trades;
          } else {
            tradesToProcess = cachedSignalsData.allTrades;
          }
        }
      }

      if (Array.isArray(selectedDates) && selectedDates.length > 0) {
        const dateSet = new Set(selectedDates);
        tradesToProcess = tradesToProcess.filter((t) => dateSet.has(UpstoxApiService.toISTDate(t.timestamp)));
      }

      if (tradesToProcess.length === 0) {
        console.warn(`[API /command1/run WARN] No trades available to process for selected filter`);
        return res.status(400).json({ error: 'No trades available to process for selected filter' });
      }

      const apiService = getApiService();
      const cmd1 = new Command1Service({ apiService, outputDir: MARKET_DATA_DIR });
      const result = await cmd1.execute(tradesToProcess);

      const elapsedMs = Date.now() - reqStartMs;
      console.log(`[API /command1/run SUCCESS] Completed in ${elapsedMs}ms`);

      res.json({ success: true, result });
    } catch (err: unknown) {
      const elapsedMs = Date.now() - reqStartMs;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[API /command1/run ERROR] (${elapsedMs}ms): ${errMsg}`);
      res.status(500).json({ error: errMsg });
    }
  });

  // 7. Run Command 2
  app.post('/api/command2/run', async (req: Request, res: Response) => {
    const reqStartMs = Date.now();
    SystemDiagnostics.activeRequests++;
    SystemDiagnostics.logRequestHeader('/api/command2/run', 'Full Batch Execution');

    try {
      const { filename, trades: customTrades, selectedDates, versionFilters, useAllVersions, volumeTradesOnly, skipCache, isLive } = req.body;

      let tradesToProcess: TradeSignal[] = [];

      if (Array.isArray(customTrades) && customTrades.length > 0) {
        tradesToProcess = customTrades;
      } else {
        loadAllSignals();
        if (cachedSignalsData) {
          if (filename) {
            const found = cachedSignalsData.files.find((item) => item.filename === filename);
            if (found) tradesToProcess = found.trades;
          } else {
            tradesToProcess = cachedSignalsData.allTrades;
          }
        }
      }

      if (Array.isArray(selectedDates) && selectedDates.length > 0) {
        const dateSet = new Set(selectedDates);
        tradesToProcess = tradesToProcess.filter((t) => dateSet.has(UpstoxApiService.toISTDate(t.timestamp)));
      }

      const rawCount = tradesToProcess.length;
      tradesToProcess = Command2Service.deduplicateTrades(tradesToProcess);

      if (tradesToProcess.length === 0) {
        console.warn(`[API /command2/run WARN] No trades available to process`);
        return res.status(400).json({ error: 'No trades available to process' });
      }

      const apiService = getApiService();
      const cmd2 = new Command2Service({
        apiService,
        marketDataDir: MARKET_DATA_DIR,
        reportsDir: REPORTS_DIR,
      });

      const result = await cmd2.execute(tradesToProcess, {
        versionFilters: Array.isArray(versionFilters) ? versionFilters : ['ULTRA', 'UBER'],
        useAllVersions: Boolean(useAllVersions),
        volumeTradesOnly: volumeTradesOnly !== false,
        skipCache: Boolean(skipCache || isLive),
        isLive: Boolean(isLive),
        marketDataDir: MARKET_DATA_DIR,
        outputReportsDir: REPORTS_DIR,
      });

      const elapsedMs = Date.now() - reqStartMs;
      SystemDiagnostics.totalApiTimeMs += elapsedMs;
      SystemDiagnostics.totalBatchesProcessed++;

      const diag = SystemDiagnostics.getMetricsSummary();
      console.log(
        `[API /command2/run SUCCESS] ${elapsedMs}ms | Trades: ${result.summary.totalTradesAnalyzed} | RAM: ${diag.systemMemory.heapUsedMb}MB (RSS ${diag.systemMemory.rssMb}MB / ${diag.systemMemory.ec2RamUsedPct}) | UpstoxFailures: ${diag.upstoxApiStats.failed}/${diag.upstoxApiStats.total}\n`
      );

      res.json({ success: true, result, diagnostics: diag });
    } catch (err: unknown) {
      const elapsedMs = Date.now() - reqStartMs;
      SystemDiagnostics.totalBatchesFailed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[API /command2/run ERROR] (${elapsedMs}ms): ${errMsg}\n`);
      res.status(500).json({ error: errMsg });
    } finally {
      SystemDiagnostics.activeRequests = Math.max(0, SystemDiagnostics.activeRequests - 1);
    }
  });

  // 7b. Run Command 2 Batch (Fast incremental evaluation for frontend streaming batches)
  app.post('/api/command2/run-batch', async (req: Request, res: Response) => {
    const reqStartMs = Date.now();
    SystemDiagnostics.activeRequests++;

    try {
      const { tradesChunk, batchIndex, totalBatches, versionFilters, useAllVersions, volumeTradesOnly, skipCache, isLive } = req.body;

      if (!Array.isArray(tradesChunk) || tradesChunk.length === 0) {
        return res.status(400).json({ error: 'No trades in chunk to evaluate' });
      }

      const bIdx = (batchIndex || 0) + 1;
      const tBatches = totalBatches || 1;

      SystemDiagnostics.logRequestHeader(
        `/api/command2/run-batch`,
        `Batch ${bIdx}/${tBatches} (${tradesChunk.length} trades)`
      );

      const apiService = getApiService();
      const cmd2 = new Command2Service({
        apiService,
        marketDataDir: MARKET_DATA_DIR,
        reportsDir: REPORTS_DIR,
      });

      const evaluatedAnalyses = await cmd2.evaluateTradesBatch(tradesChunk, {
        versionFilters: Array.isArray(versionFilters) ? versionFilters : ['ULTRA', 'UBER'],
        useAllVersions: Boolean(useAllVersions),
        volumeTradesOnly: volumeTradesOnly !== false,
        skipCache: Boolean(skipCache || isLive),
        isLive: Boolean(isLive),
      });

      const elapsedMs = Date.now() - reqStartMs;
      SystemDiagnostics.totalApiTimeMs += elapsedMs;
      SystemDiagnostics.totalBatchesProcessed++;

      const diag = SystemDiagnostics.getMetricsSummary();

      console.log(
        `[API /command2/run-batch SUCCESS] Batch ${bIdx}/${tBatches} completed (${tradesChunk.length} trades) in ${elapsedMs}ms | ActiveReqs: ${diag.activeRequests} | RAM Heap: ${diag.systemMemory.heapUsedMb}MB / RSS: ${diag.systemMemory.rssMb}MB | UpstoxFailures: ${diag.upstoxApiStats.failed}/${diag.upstoxApiStats.total}`
      );

      res.json({
        success: true,
        batchIndex,
        totalBatches,
        evaluatedAnalyses,
        count: evaluatedAnalyses.length,
        executionTimeMs: elapsedMs,
        diagnostics: diag,
      });
    } catch (err: unknown) {
      const elapsedMs = Date.now() - reqStartMs;
      SystemDiagnostics.totalBatchesFailed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[API /command2/run-batch ERROR] (${elapsedMs}ms): ${errMsg}`);
      res.status(500).json({ error: errMsg });
    } finally {
      SystemDiagnostics.activeRequests = Math.max(0, SystemDiagnostics.activeRequests - 1);
    }
  });

  // 7c. Health & System Diagnostics Endpoint (Monitor EC2 Memory, Event Loop Lag, Upstox API Health)
  app.get('/api/system/diagnostics', (_req: Request, res: Response) => {
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      timestampIST: UpstoxApiService.toISTString(Date.now()),
      metrics: SystemDiagnostics.getMetricsSummary(),
    });
  });

  // 8. Candles with Indicators for Charting
  app.get('/api/candles', async (req: Request, res: Response) => {
    try {
      const instrument = req.query.instrument as string;
      const date = req.query.date as string;
      const endDate = (req.query.endDate as string) || date;

      if (!instrument || !date) {
        return res.status(400).json({ error: 'Missing instrument or date parameter' });
      }

      const apiService = getApiService();
      let candles: any[] = [];

      if (endDate && endDate !== date) {
        candles = await apiService.fetchCandleRange(instrument, date, endDate);
      } else {
        const safeName = Command1Service.safeFilename(instrument);
        const csvPath = path.join(MARKET_DATA_DIR, date, `${safeName}.csv`);

        // Re-use cached copy first for expired contracts!
        if (fs.existsSync(csvPath)) {
          candles = UpstoxApiService.loadCandlesFromCsv(csvPath);
        }

        if (candles.length === 0) {
          candles = await apiService.fetch1MinCandles(instrument, date);
          if (candles.length > 0) {
            UpstoxApiService.saveCandlesToCsv(candles, csvPath);
          }
        }
      }

      // Ensure indicators are calculated
      const augmented = augmentCandlesWithIndicators(candles);

      res.json({
        instrument,
        date,
        endDate,
        isMultiDay: Boolean(endDate && endDate !== date),
        count: augmented.length,
        candles: augmented,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 9. Clear Market Data & Evaluation Caches
  app.post('/api/market-data/clear-cache', (req: Request, res: Response) => {
    try {
      const clearDiskCSVs = Boolean(req.body?.clearDiskCSVs || req.query?.clearDiskCSVs);
      Command2Service.clearAllCaches({ clearDiskCSVs });
      UpstoxApiService.clearFailedCache();
      invalidateSignalsCache();
      console.log(`[CACHE CLEAR] Cleared evaluation and candle memory caches (clearDiskCSVs: ${clearDiskCSVs})`);
      res.json({
        success: true,
        message: clearDiskCSVs
          ? 'Cleared evaluation cache, in-memory candle caches, and deleted downloaded market data CSVs.'
          : 'Cleared evaluation cache and in-memory candle caches.',
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 9b. List Market Data Files
  app.get('/api/market-data/files', (req: Request, res: Response) => {
    try {
      const results: { date: string; filename: string; relativePath: string; size: number; lines: number }[] = [];
      if (fs.existsSync(MARKET_DATA_DIR)) {
        const dateDirs = fs.readdirSync(MARKET_DATA_DIR);
        for (const d of dateDirs) {
          const fullDateDir = path.join(MARKET_DATA_DIR, d);
          if (fs.statSync(fullDateDir).isDirectory()) {
            const files = fs.readdirSync(fullDateDir).filter((f) => f.endsWith('.csv'));
            for (const f of files) {
              const filePath = path.join(fullDateDir, f);
              const stat = fs.statSync(filePath);
              const content = fs.readFileSync(filePath, 'utf-8');
              const lines = content.trim().split('\n').length - 1;
              results.push({
                date: d,
                filename: f,
                relativePath: `${d}/${f}`,
                size: stat.size,
                lines: Math.max(0, lines),
              });
            }
          }
        }
      }
      res.json({ files: results });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 9b. Upload CSV / JSON into Market Data Directory
  app.post('/api/market-data/upload', (req: Request, res: Response) => {
    try {
      const { date, filename, content, csvList, files } = req.body;
      const rawFiles: { filename: string; content: string; defaultDate?: string }[] = [];

      if (Array.isArray(files) && files.length > 0) {
        rawFiles.push(...files);
      } else if (Array.isArray(csvList) && csvList.length > 0) {
        rawFiles.push(
          ...csvList.map((item: any) => ({
            filename: item.filename,
            content: item.content,
            defaultDate: item.date || date,
          }))
        );
      } else if (filename && content) {
        rawFiles.push({ filename, content, defaultDate: date });
      } else {
        return res.status(400).json({ error: 'Missing file content or filename' });
      }

      const parseResult = parseBatchMarketData(rawFiles);
      const savedFiles: string[] = [];

      for (const item of parseResult.items) {
        const dateDir = path.join(MARKET_DATA_DIR, item.date);
        if (!fs.existsSync(dateDir)) {
          fs.mkdirSync(dateDir, { recursive: true });
        }
        const finalPath = path.join(dateDir, `${item.safeInstrument}.csv`);
        fs.writeFileSync(finalPath, item.csvContent, 'utf-8');
        savedFiles.push(`${item.date}/${item.safeInstrument}.csv`);
      }

      res.json({
        success: true,
        savedCount: savedFiles.length,
        files: savedFiles,
        mappedItems: parseResult.items.map((it) => ({
          instrument: it.instrument,
          safeInstrument: it.safeInstrument,
          date: it.date,
          relativePath: it.relativePath,
          candlesCount: it.candlesCount,
          sourceFile: it.sourceFile,
          format: it.format,
        })),
        errors: parseResult.errors,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 10. Download CSV File
  app.get('/api/download-csv', (req: Request, res: Response) => {
    try {
      const type = req.query.type as string;
      const file = req.query.file as string;

      if (!file) return res.status(400).send('File parameter required');

      let target = '';
      if (type === 'report') {
        target = path.resolve(REPORTS_DIR, path.basename(file));
      } else {
        target = path.resolve(MARKET_DATA_DIR, file);
      }

      if (!fs.existsSync(target)) {
        return res.status(404).send('File not found');
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(target)}"`);
      fs.createReadStream(target).pipe(res);
    } catch (err: unknown) {
      res.status(500).send(err instanceof Error ? err.message : String(err));
    }
  });

  // 10b. Download Entire CSV Directory as TAR.GZ
  app.get('/api/download-directory', (req: Request, res: Response) => {
    try {
      const type = req.query.type as string; // 'report' or 'market'
      
      const targetDir = type === 'report' ? REPORTS_DIR : MARKET_DATA_DIR;
      const folderName = type === 'report' ? 'reports_export' : 'market_data_export';

      if (!fs.existsSync(targetDir)) {
        return res.status(404).send('Directory not found');
      }

      const archiveName = `${folderName}.tar.gz`;
      const tempArchivePath = path.resolve(__dirname, `export_${Date.now()}_${archiveName}`);
      const parentDir = path.dirname(targetDir);
      const folderBase = path.basename(targetDir);

      exec(`tar -czf "${tempArchivePath}" -C "${parentDir}" "${folderBase}"`, (err: any) => {
        if (err) {
          return res.status(500).send(`Archiving failed: ${err.message}`);
        }

        res.download(tempArchivePath, archiveName, (downloadErr) => {
          if (fs.existsSync(tempArchivePath)) {
            try {
              fs.unlinkSync(tempArchivePath);
            } catch {
              // ignore
            }
          }
        });
      });
    } catch (err: unknown) {
      res.status(500).send(err instanceof Error ? err.message : String(err));
    }
  });

  // 10c. Batch Refresh 1-Minute Candles for Live Instruments
  app.post('/api/live/batch-refresh-candles', async (req: Request, res: Response) => {
    const syncStartMs = Date.now();
    try {
      const { instrumentKeys, date } = req.body;
      const targetDate = date || UpstoxApiService.toISTDate(Date.now());
      const api = getApiService();
      const rawKeys: string[] = Array.isArray(instrumentKeys) ? instrumentKeys : [];
      const keys = Array.from(new Set(rawKeys.filter(Boolean)));
      let refreshedCount = 0;

      // Process in concurrent chunks of 5 for speed and non-blocking I/O
      const CHUNK_SIZE = 5;
      for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
        const chunk = keys.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (key) => {
            try {
              const candles = await api.fetch1MinCandles(key, targetDate, true);
              if (candles.length > 0) {
                const safeName = Command1Service.safeFilename(key);
                const targetSubdir = path.join(MARKET_DATA_DIR, targetDate);
                const csvPath = path.join(targetSubdir, `${safeName}.csv`);
                UpstoxApiService.saveCandlesToCsv(candles, csvPath);
                Command2Service.updateCandleMemoryCache(key, targetDate, candles);
                refreshedCount++;
              }
            } catch {
              // Continue with remaining instruments
            }
          })
        );
      }

      const elapsedMs = Date.now() - syncStartMs;
      console.log(`[LIVE 1M CANDLES SYNC] ${targetDate}: ${refreshedCount}/${keys.length} instruments refreshed in ${elapsedMs}ms`);

      res.json({
        success: true,
        refreshedCount,
        totalRequested: keys.length,
        targetDate,
        hasToken: Boolean(activeUpstoxToken),
      });
    } catch (err: unknown) {
      res.status(500).send(err instanceof Error ? err.message : String(err));
    }
  });

  // 11. Upstox Token Configuration (Get and Post with Disk Persistence)
  app.get('/api/config/token', (_req: Request, res: Response) => {
    res.json({
      success: true,
      hasToken: Boolean(activeUpstoxToken),
      preview: activeUpstoxToken ? `${activeUpstoxToken.slice(0, 10)}...` : null,
    });
  });

  app.post('/api/config/token', (req: Request, res: Response) => {
    const { token } = req.body;
    activeUpstoxToken = token ? String(token).trim() : undefined;
    try {
      if (activeUpstoxToken) {
        fs.writeFileSync(TOKEN_FILE, activeUpstoxToken, 'utf-8');
      } else if (fs.existsSync(TOKEN_FILE)) {
        fs.unlinkSync(TOKEN_FILE);
      }
    } catch (e) {
      console.warn('Failed to persist token file:', e);
    }
    res.json({ success: true, tokenSet: Boolean(activeUpstoxToken) });
  });

  // 12. Trade Notes Persistence
  const TRADE_NOTES_FILE = path.resolve(__dirname, 'trade_notes.json');
  function loadTradeNotes(): Record<string, string> {
    try {
      if (fs.existsSync(TRADE_NOTES_FILE)) {
        const raw = fs.readFileSync(TRADE_NOTES_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch {
      // Ignore
    }
    return {};
  }

  app.get('/api/trade-notes', (_req: Request, res: Response) => {
    try {
      const notes = loadTradeNotes();
      res.json({ success: true, notes });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/trade-notes', (req: Request, res: Response) => {
    try {
      const noteKey = req.body.key || req.body.tradeKey;
      const { note } = req.body;
      if (!noteKey) {
        return res.status(400).json({ error: 'Missing note key' });
      }
      const notes = loadTradeNotes();
      const trimmed = (note || '').trim();
      if (trimmed) {
        notes[noteKey] = trimmed;
      } else {
        delete notes[noteKey];
      }
      fs.writeFileSync(TRADE_NOTES_FILE, JSON.stringify(notes, null, 2), 'utf-8');
      res.json({ success: true, notesCount: Object.keys(notes).length });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Global API error handler (catches aborted requests and client disconnects cleanly)
  app.use((err: any, _req: Request, res: Response, next: any) => {
    if (err) {
      if (err.type === 'request.aborted' || err.message === 'request aborted' || err.code === 'ECONNABORTED') {
        // Client aborted/disconnected in flight; handle gracefully without crash or unhandled stderr
        if (!res.headersSent) {
          res.status(400).end();
        }
        return;
      }
      console.error('[EXPRESS ERROR]', err);
      if (!res.headersSent) {
        res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
      }
      return;
    }
    next();
  });

  // Mount Vite middleware in dev or static files in production / build
  const distPath = path.resolve(__dirname, 'dist');
  if (process.env.NODE_ENV === 'production' || fs.existsSync(distPath)) {
    console.log(`[SERVER] Serving static assets from '${distPath}'`);
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    console.log(`[SERVER] Initializing Vite dev middleware`);
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Upstox Trade Milestone Analyzer running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);

