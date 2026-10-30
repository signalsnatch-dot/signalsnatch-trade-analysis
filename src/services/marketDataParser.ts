import { Candle } from '../types/trade.ts';
import { UpstoxApiService } from './upstoxApi.ts';
import { augmentCandlesWithIndicators } from './indicators.ts';

export interface ProcessedMarketItem {
  instrument: string;
  safeInstrument: string;
  date: string;
  relativePath: string;
  candlesCount: number;
  candles: Candle[];
  csvContent: string;
  sourceFile: string;
  format: string;
}

export interface ParseMarketDataResult {
  items: ProcessedMarketItem[];
  errors: string[];
}

/**
 * Infer instrument identifier from filename or key.
 * Normalizes delimiters to standard safe names (e.g. "NSE_FO_61471").
 */
export function inferInstrument(rawName: string): string {
  // Strip any parent directory paths (e.g. "my_data/2026-10-27/NSE_FO_61471.csv" -> "NSE_FO_61471.csv")
  const baseName = rawName.split(/[/\\]/).pop() || rawName;
  let clean = baseName.trim();
  // Strip extensions
  clean = clean.replace(/\.(json|csv)$/i, '');
  // Strip prefixes
  clean = clean.replace(/^(candles_|1m_|market_data_|market_|data_)/i, '');
  // Strip trailing date YYYY-MM-DD
  clean = clean.replace(/_\d{4}-\d{2}-\d{2}$/i, '');
  // Replace pipe and special characters
  return clean.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Normalizes raw candle array or object into a typed Candle
 */
export function normalizeRawCandle(raw: unknown): Candle | null {
  if (!raw) return null;

  try {
    // Array format: [timestamp, open, high, low, close, volume, openInterest?]
    if (Array.isArray(raw) && raw.length >= 5) {
      const timeVal = raw[0];
      const timeMs = typeof timeVal === 'number' ? timeVal : new Date(String(timeVal)).getTime();
      if (isNaN(timeMs)) return null;

      const timeIso = typeof timeVal === 'string' ? timeVal : UpstoxApiService.toISTString(timeMs);
      return {
        timestamp: timeIso,
        timeMs,
        open: parseFloat(String(raw[1])) || 0,
        high: parseFloat(String(raw[2])) || 0,
        low: parseFloat(String(raw[3])) || 0,
        close: parseFloat(String(raw[4])) || 0,
        volume: parseFloat(String(raw[5] || '0')) || 0,
        openInterest: raw[6] !== undefined ? parseFloat(String(raw[6])) || 0 : 0,
      };
    }

    // Object format: { timestamp, open, high, low, close, volume, open_interest? }
    if (typeof raw === 'object' && raw !== null) {
      const obj = raw as Record<string, unknown>;
      const timeVal = obj.timestamp ?? obj.time ?? obj.date ?? obj.datetime;
      if (!timeVal) return null;

      const timeMs = typeof timeVal === 'number' ? timeVal : new Date(String(timeVal)).getTime();
      if (isNaN(timeMs)) return null;

      const timeIso = typeof timeVal === 'string' ? timeVal : UpstoxApiService.toISTString(timeMs);
      return {
        timestamp: timeIso,
        timeMs,
        open: parseFloat(String(obj.open ?? obj.o ?? 0)) || 0,
        high: parseFloat(String(obj.high ?? obj.h ?? 0)) || 0,
        low: parseFloat(String(obj.low ?? obj.l ?? 0)) || 0,
        close: parseFloat(String(obj.close ?? obj.c ?? 0)) || 0,
        volume: parseFloat(String(obj.volume ?? obj.v ?? obj.vol ?? 0)) || 0,
        openInterest: parseFloat(String(obj.openInterest ?? obj.open_interest ?? obj.oi ?? 0)) || 0,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Convert parsed Candle array into standard augmented CSV format
 */
export function candlesToCsv(candles: Candle[]): string {
  const header = 'timestamp,open,high,low,close,volume,open_interest,ema20,sma_fast,sma_slow,crossover';
  const rows = candles.map((c) =>
    [
      c.timestamp,
      c.open,
      c.high,
      c.low,
      c.close,
      c.volume,
      c.openInterest ?? 0,
      c.ema20 !== undefined ? c.ema20 : '',
      c.smaFast !== undefined ? c.smaFast : '',
      c.smaSlow !== undefined ? c.smaSlow : '',
      c.crossover || '',
    ].join(',')
  );
  return [header, ...rows].join('\n') + '\n';
}

/**
 * Parses a batch of JSON or CSV files into date- and instrument-mapped candle files
 */
export function parseBatchMarketData(
  files: { filename: string; content: string; defaultDate?: string }[]
): ParseMarketDataResult {
  const items: ProcessedMarketItem[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const { filename, content, defaultDate } = file;
    const pathDateMatch = filename.match(/(20\d{2}-\d{2}-\d{2})/);
    const fallbackDate = pathDateMatch ? pathDateMatch[1] : (defaultDate || UpstoxApiService.toISTDate(Date.now()));
    const fallbackInstrument = inferInstrument(filename);

    if (!content || !content.trim()) {
      errors.push(`File ${filename} is empty`);
      continue;
    }

    const trimmed = content.trim();
    let isJson = false;
    let parsedJson: unknown = null;

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        parsedJson = JSON.parse(trimmed);
        isJson = true;
      } catch {
        isJson = false;
      }
    }

    if (isJson && parsedJson) {
      try {
        // Collect candles grouped by (instrument, date)
        const instrumentDateMap = new Map<string, Candle[]>();

        const addCandles = (inst: string, rawList: unknown[]) => {
          const cleanInst = inferInstrument(inst || fallbackInstrument);
          for (const raw of rawList) {
            const candle = normalizeRawCandle(raw);
            if (candle) {
              const candleDate = UpstoxApiService.toISTDate(candle.timeMs) || fallbackDate;
              const key = `${cleanInst}:::${candleDate}`;
              if (!instrumentDateMap.has(key)) {
                instrumentDateMap.set(key, []);
              }
              instrumentDateMap.get(key)!.push(candle);
            }
          }
        };

        if (Array.isArray(parsedJson)) {
          // Direct array of candles: [ [...], [...] ] or [ {...}, {...} ]
          addCandles(fallbackInstrument, parsedJson);
        } else if (typeof parsedJson === 'object' && parsedJson !== null) {
          const rootObj = parsedJson as Record<string, unknown>;

          // Format 1: Upstox API Response: { data: { candles: [...] } } or { candles: [...] }
          const directCandles =
            (rootObj.data && typeof rootObj.data === 'object' && Array.isArray((rootObj.data as any).candles))
              ? (rootObj.data as any).candles
              : Array.isArray(rootObj.candles)
              ? rootObj.candles
              : null;

          if (directCandles) {
            const inst =
              String(rootObj.instrument || rootObj.instrument_key || rootObj.symbol || (rootObj.data as any)?.instrument || '') ||
              fallbackInstrument;
            addCandles(inst, directCandles);
          } else {
            // Format 2: Dictionary of instruments: { "NSE_FO|61471": [ ... ], "MCX_FO|574319": [ ... ] }
            let foundInstrumentDict = false;
            for (const [key, value] of Object.entries(rootObj)) {
              if (Array.isArray(value) && value.length > 0) {
                // Key could be an instrument or a date YYYY-MM-DD
                if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
                  // Key is date: { "2026-10-28": [ ...candles... ] }
                  for (const raw of value) {
                    const candle = normalizeRawCandle(raw);
                    if (candle) {
                      const mapKey = `${fallbackInstrument}:::${key}`;
                      if (!instrumentDateMap.has(mapKey)) instrumentDateMap.set(mapKey, []);
                      instrumentDateMap.get(mapKey)!.push(candle);
                    }
                  }
                  foundInstrumentDict = true;
                } else {
                  // Key is an instrument!
                  addCandles(key, value);
                  foundInstrumentDict = true;
                }
              } else if (typeof value === 'object' && value !== null) {
                // Nested format: { "2026-10-28": { "NSE_FO|61471": [ ... ] } }
                if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
                  const dateStr = key;
                  for (const [subInst, subVal] of Object.entries(value as Record<string, unknown>)) {
                    if (Array.isArray(subVal)) {
                      const cleanInst = inferInstrument(subInst);
                      for (const raw of subVal) {
                        const candle = normalizeRawCandle(raw);
                        if (candle) {
                          const mapKey = `${cleanInst}:::${dateStr}`;
                          if (!instrumentDateMap.has(mapKey)) instrumentDateMap.set(mapKey, []);
                          instrumentDateMap.get(mapKey)!.push(candle);
                        }
                      }
                      foundInstrumentDict = true;
                    }
                  }
                }
              }
            }

            if (!foundInstrumentDict) {
              errors.push(`Could not identify candle arrays in JSON file ${filename}`);
              continue;
            }
          }
        }

        // Build ProcessedMarketItem for each (instrument, date) pair
        for (const [key, candles] of instrumentDateMap.entries()) {
          const [inst, date] = key.split(':::');
          // Sort candles chronologically
          candles.sort((a, b) => a.timeMs - b.timeMs);

          // Deduplicate by timeMs
          const uniqueCandles: Candle[] = [];
          const seen = new Set<number>();
          for (const c of candles) {
            if (!seen.has(c.timeMs)) {
              seen.add(c.timeMs);
              uniqueCandles.push(c);
            }
          }

          // Augment with moving average indicators
          const augmented = augmentCandlesWithIndicators(uniqueCandles);
          const safeInst = inferInstrument(inst);
          const csvText = candlesToCsv(augmented);

          items.push({
            instrument: inst,
            safeInstrument: safeInst,
            date,
            relativePath: `${date}/${safeInst}.csv`,
            candlesCount: augmented.length,
            candles: augmented,
            csvContent: csvText,
            sourceFile: filename,
            format: 'JSON',
          });
        }
      } catch (err: unknown) {
        errors.push(`Error parsing JSON in ${filename}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      // It's a CSV file
      try {
        const lines = trimmed.split('\n');
        if (lines.length <= 1) {
          errors.push(`CSV file ${filename} has no data rows`);
          continue;
        }

        const dateCandlesMap = new Map<string, Candle[]>();
        const headerParts = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const timeColIdx = headerParts.findIndex((h) => h.includes('time') || h.includes('date'));
        const effectiveTimeIdx = timeColIdx >= 0 ? timeColIdx : 0;

        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',');
          if (parts.length >= 5) {
            const timeIso = parts[effectiveTimeIdx]?.trim();
            const timeMs = new Date(timeIso).getTime();
            if (isNaN(timeMs)) continue;

            const cDate = UpstoxApiService.toISTDate(timeMs) || fallbackDate;
            const candle: Candle = {
              timestamp: timeIso,
              timeMs,
              open: parseFloat(parts[1]) || 0,
              high: parseFloat(parts[2]) || 0,
              low: parseFloat(parts[3]) || 0,
              close: parseFloat(parts[4]) || 0,
              volume: parseFloat(parts[5] || '0') || 0,
              openInterest: parts[6] ? parseFloat(parts[6]) || 0 : 0,
            };

            if (!dateCandlesMap.has(cDate)) dateCandlesMap.set(cDate, []);
            dateCandlesMap.get(cDate)!.push(candle);
          }
        }

        for (const [date, candles] of dateCandlesMap.entries()) {
          candles.sort((a, b) => a.timeMs - b.timeMs);
          const uniqueCandles: Candle[] = [];
          const seen = new Set<number>();
          for (const c of candles) {
            if (!seen.has(c.timeMs)) {
              seen.add(c.timeMs);
              uniqueCandles.push(c);
            }
          }

          const augmented = augmentCandlesWithIndicators(uniqueCandles);
          const safeInst = inferInstrument(filename);
          const csvText = candlesToCsv(augmented);

          items.push({
            instrument: safeInst,
            safeInstrument: safeInst,
            date,
            relativePath: `${date}/${safeInst}.csv`,
            candlesCount: augmented.length,
            candles: augmented,
            csvContent: csvText,
            sourceFile: filename,
            format: 'CSV',
          });
        }
      } catch (err: unknown) {
        errors.push(`Error parsing CSV in ${filename}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { items, errors };
}
