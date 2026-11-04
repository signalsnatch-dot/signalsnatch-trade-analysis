/**
 * Diagnostic logger and system health monitor for EC2 t3.small (2 vCPUs, 2GB RAM).
 * Tracks in-flight request capacity, event loop blocking/stuck threads, memory usage, and Upstox API failure counts.
 */
export class SystemDiagnostics {
  static activeRequests = 0;
  static totalBatchesProcessed = 0;
  static totalBatchesFailed = 0;
  static totalApiTimeMs = 0;

  static upstoxCallsTotal = 0;
  static upstoxCallsSuccess = 0;
  static upstoxCallsFailed = 0;
  static upstoxCallsTimeout = 0;
  static upstoxCalls429RateLimit = 0;

  static lastEventLoopLagMs = 0;

  private static lagTimer: ReturnType<typeof setInterval> | null = null;

  static startMonitoring(): void {
    if (this.lagTimer) return;
    let lastCheck = Date.now();
    this.lagTimer = setInterval(() => {
      const now = Date.now();
      const delta = now - lastCheck - 1000;
      this.lastEventLoopLagMs = Math.max(0, delta);
      lastCheck = now;

      if (delta > 300) {
        console.warn(
          `[SYSTEM DIAGNOSTIC STUCK THREAD WARNING] Node event loop blocked/delayed by ${delta}ms! (RAM Heap: ${this.getHeapUsedMb()} MB / RSS: ${this.getRssMb()} MB)`
        );
      }
    }, 1000);
  }

  static recordUpstoxCall(status: 'success' | 'failed' | 'timeout' | 'rate_limit'): void {
    this.upstoxCallsTotal++;
    if (status === 'success') {
      this.upstoxCallsSuccess++;
    } else if (status === 'timeout') {
      this.upstoxCallsFailed++;
      this.upstoxCallsTimeout++;
    } else if (status === 'rate_limit') {
      this.upstoxCallsFailed++;
      this.upstoxCalls429RateLimit++;
    } else {
      this.upstoxCallsFailed++;
    }
  }

  static getHeapUsedMb(): number {
    return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  }

  static getRssMb(): number {
    return Math.round(process.memoryUsage().rss / 1024 / 1024);
  }

  static getMetricsSummary() {
    const mem = process.memoryUsage();
    const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
    const rssMb = Math.round(mem.rss / 1024 / 1024);
    const ec2RamPct = ((rssMb / 2048) * 100).toFixed(1);

    return {
      activeRequests: this.activeRequests,
      totalBatchesProcessed: this.totalBatchesProcessed,
      totalBatchesFailed: this.totalBatchesFailed,
      avgBatchTimeMs:
        this.totalBatchesProcessed > 0
          ? Math.round(this.totalApiTimeMs / this.totalBatchesProcessed)
          : 0,
      upstoxApiStats: {
        total: this.upstoxCallsTotal,
        success: this.upstoxCallsSuccess,
        failed: this.upstoxCallsFailed,
        timeouts: this.upstoxCallsTimeout,
        rateLimits: this.upstoxCalls429RateLimit,
      },
      systemMemory: {
        heapUsedMb,
        heapTotalMb,
        rssMb,
        ec2RamBudget: '2048 MB (t3.small)',
        ec2RamUsedPct: `${ec2RamPct}%`,
      },
      eventLoopLagMs: this.lastEventLoopLagMs,
      threadCapacity: {
        vCPUs: 2,
        recommendedConcurrentWorkers: 4,
        maxHeapSetting: '--max-old-space-size=1536',
      },
    };
  }

  static logRequestHeader(endpoint: string, details?: string): void {
    const metrics = this.getMetricsSummary();
    console.log(
      `\n[REQ DIAGNOSTIC] ${endpoint} | ActiveReqs: ${metrics.activeRequests} | EventLoopLag: ${metrics.eventLoopLagMs}ms | RAM: ${metrics.systemMemory.heapUsedMb}MB / RSS: ${metrics.systemMemory.rssMb}MB (${metrics.systemMemory.ec2RamUsedPct}) | UpstoxApiFailures: ${metrics.upstoxApiStats.failed}/${metrics.upstoxApiStats.total} ${details ? '| ' + details : ''}`
    );
  }
}

SystemDiagnostics.startMonitoring();
