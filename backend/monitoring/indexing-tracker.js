const fs = require('fs').promises;
const path = require('path');

class IndexingTracker {
  constructor() {
    this.logDir = path.join(__dirname, 'logs');
    this.dbFile = path.join(this.logDir, 'indexing-db.json');
    this.reportsDir = path.join(this.logDir, 'reports');

    this.state = {
      sessions: new Map(),
      globalStats: {
        totalPagesDiscovered: 0,
        totalPagesIndexed: 0,
        totalPagesFailed: 0,
        totalChunksCreated: 0,
        sourcesProgress: {},
        lastUpdate: null
      },
      currentSession: null
    };

    this.initializeDirectories();
  }

  async initializeDirectories() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      await fs.mkdir(this.reportsDir, { recursive: true });
      await this.loadState();
    } catch (error) {
      console.error('Failed to initialize indexing tracker:', error);
    }
  }

  // ====== SESSION MANAGEMENT ======

  async startIndexingSession(sourceKey, config = {}) {
    const sessionId = `${sourceKey}_${Date.now()}`;
    const session = {
      sessionId,
      sourceKey,
      startTime: new Date().toISOString(),
      endTime: null,
      status: 'running', // running, completed, failed, paused
      config,

      // Discovery tracking
      discoveredUrls: new Set(),
      queuedUrls: new Set(),
      processedUrls: new Set(),
      failedUrls: new Map(), // URL -> {error, attempts, lastAttempt}
      skippedUrls: new Map(), // URL -> reason

      // Content tracking
      indexedPages: new Map(), // URL -> {chunks, tokens, timestamp}
      duplicatePages: new Set(),
      lowQualityPages: new Set(),

      // Progress metrics
      stats: {
        pagesDiscovered: 0,
        pagesProcessed: 0,
        pagesIndexed: 0,
        pagesFailed: 0,
        pagesSkipped: 0,
        chunksCreated: 0,
        tokensProcessed: 0,
        avgProcessingTime: 0,
        errorsEncountered: 0
      },

      // Error tracking
      errors: [],
      warnings: [],

      // Cost tracking
      costs: {
        embeddingTokens: 0,
        embeddingCost: 0,
        apiCalls: 0,
        totalCost: 0
      }
    };

    this.state.sessions.set(sessionId, session);
    this.state.currentSession = sessionId;

    await this.saveState();
    await this.logEvent('session_started', { sessionId, sourceKey });

    return sessionId;
  }

  async endIndexingSession(sessionId, status = 'completed') {
    const session = this.state.sessions.get(sessionId);
    if (!session) return;

    session.endTime = new Date().toISOString();
    session.status = status;

    // Update global stats
    this.updateGlobalStats(session);

    if (this.state.currentSession === sessionId) {
      this.state.currentSession = null;
    }

    await this.saveState();
    await this.generateSessionReport(sessionId);
    await this.logEvent('session_ended', { sessionId, status, stats: session.stats });
  }

  // ====== URL DISCOVERY & TRACKING ======

  async recordDiscoveredUrls(sessionId, urls, source = 'crawler') {
    const session = this.state.sessions.get(sessionId);
    if (!session) return;

    const newUrls = [];
    for (const url of urls) {
      if (!session.discoveredUrls.has(url)) {
        session.discoveredUrls.add(url);
        session.queuedUrls.add(url);
        newUrls.push(url);
      }
    }

    session.stats.pagesDiscovered += newUrls.length;

    await this.logEvent('urls_discovered', {
      sessionId,
      source,
      count: newUrls.length,
      urls: newUrls.slice(0, 10) // Log first 10 for debugging
    });

    return newUrls.length;
  }

  async recordProcessingStart(sessionId, url) {
    const session = this.state.sessions.get(sessionId);
    if (!session) return;

    session.queuedUrls.delete(url);
    // Don't add to processedUrls yet - wait for success/failure

    await this.logEvent('processing_started', { sessionId, url });
  }

  async recordProcessingSuccess(sessionId, url, result) {
    const session = this.state.sessions.get(sessionId);
    if (!session) return;

    session.processedUrls.add(url);
    session.indexedPages.set(url, {
      chunks: result.chunks || 0,
      tokens: result.tokens || 0,
      timestamp: new Date().toISOString(),
      title: result.title || '',
      contentLength: result.contentLength || 0,
      quality: result.quality || 'unknown'
    });

    // Update stats
    session.stats.pagesProcessed++;
    session.stats.pagesIndexed++;
    session.stats.chunksCreated += result.chunks || 0;
    session.stats.tokensProcessed += result.tokens || 0;

    // Update costs
    if (result.embeddingCost) {
      session.costs.embeddingTokens += result.embeddingTokens || 0;
      session.costs.embeddingCost += result.embeddingCost;
      session.costs.apiCalls += result.apiCalls || 1;
      session.costs.totalCost += result.embeddingCost;
    }

    await this.logEvent('processing_success', {
      sessionId,
      url,
      chunks: result.chunks,
      tokens: result.tokens,
      cost: result.embeddingCost
    });
  }

  async recordProcessingFailure(sessionId, url, error, attempt = 1) {
    const session = this.state.sessions.get(sessionId);
    if (!session) return;

    session.processedUrls.add(url);
    session.failedUrls.set(url, {
      error: error.message || error,
      attempts: attempt,
      lastAttempt: new Date().toISOString(),
      errorType: this.categorizeError(error)
    });

    session.stats.pagesProcessed++;
    session.stats.pagesFailed++;
    session.stats.errorsEncountered++;

    // Track error
    session.errors.push({
      url,
      error: error.message || error,
      timestamp: new Date().toISOString(),
      attempt
    });

    await this.logEvent('processing_failure', {
      sessionId,
      url,
      error: error.message || error,
      attempt
    });
  }

  async recordSkippedUrl(sessionId, url, reason) {
    const session = this.state.sessions.get(sessionId);
    if (!session) return;

    session.queuedUrls.delete(url);
    session.skippedUrls.set(url, reason);
    session.stats.pagesSkipped++;

    await this.logEvent('url_skipped', { sessionId, url, reason });
  }

  // ====== CONTENT QUALITY TRACKING ======

  async recordDuplicateContent(sessionId, url, similarUrl) {
    const session = this.state.sessions.get(sessionId);
    if (!session) return;

    session.duplicatePages.add(url);

    await this.logEvent('duplicate_detected', {
      sessionId,
      url,
      similarUrl
    });
  }

  async recordLowQualityContent(sessionId, url, reason, score = 0) {
    const session = this.state.sessions.get(sessionId);
    if (!session) return;

    session.lowQualityPages.add(url);
    session.warnings.push({
      url,
      type: 'low_quality',
      reason,
      score,
      timestamp: new Date().toISOString()
    });

    await this.logEvent('low_quality_detected', {
      sessionId,
      url,
      reason,
      score
    });
  }

  // ====== REPORTING & ANALYTICS ======

  async generateProgressReport(sessionId = null) {
    const targetSession = sessionId ?
      this.state.sessions.get(sessionId) :
      this.state.sessions.get(this.state.currentSession);

    if (!targetSession) {
      return this.generateGlobalReport();
    }

    const session = targetSession;
    const now = new Date();
    const duration = session.endTime ?
      new Date(session.endTime) - new Date(session.startTime) :
      now - new Date(session.startTime);

    const report = {
      session: {
        id: session.sessionId,
        source: session.sourceKey,
        status: session.status,
        duration: Math.round(duration / 1000), // seconds
        startTime: session.startTime,
        endTime: session.endTime
      },

      discovery: {
        totalDiscovered: session.stats.pagesDiscovered,
        inQueue: session.queuedUrls.size,
        processed: session.stats.pagesProcessed,
        remaining: session.queuedUrls.size
      },

      processing: {
        successful: session.stats.pagesIndexed,
        failed: session.stats.pagesFailed,
        skipped: session.stats.pagesSkipped,
        successRate: session.stats.pagesProcessed > 0 ?
          (session.stats.pagesIndexed / session.stats.pagesProcessed * 100).toFixed(2) : 0
      },

      content: {
        totalChunks: session.stats.chunksCreated,
        totalTokens: session.stats.tokensProcessed,
        duplicates: session.duplicatePages.size,
        lowQuality: session.lowQualityPages.size,
        avgChunksPerPage: session.stats.pagesIndexed > 0 ?
          (session.stats.chunksCreated / session.stats.pagesIndexed).toFixed(2) : 0
      },

      performance: {
        pagesPerMinute: duration > 0 ?
          (session.stats.pagesProcessed / (duration / 60000)).toFixed(2) : 0,
        avgProcessingTime: session.stats.avgProcessingTime || 0,
        errorRate: session.stats.pagesProcessed > 0 ?
          (session.stats.errorsEncountered / session.stats.pagesProcessed * 100).toFixed(2) : 0
      },

      costs: {
        embeddingTokens: session.costs.embeddingTokens,
        embeddingCost: session.costs.embeddingCost.toFixed(4),
        apiCalls: session.costs.apiCalls,
        totalCost: session.costs.totalCost.toFixed(4),
        costPerPage: session.stats.pagesIndexed > 0 ?
          (session.costs.totalCost / session.stats.pagesIndexed).toFixed(4) : 0
      },

      issues: {
        errors: session.errors.length,
        warnings: session.warnings.length,
        recentErrors: session.errors.slice(-5),
        errorsByType: this.groupErrorsByType(session.errors)
      }
    };

    return report;
  }

  async generateDetailedReport(sessionId) {
    const session = this.state.sessions.get(sessionId);
    if (!session) return null;

    const progressReport = await this.generateProgressReport(sessionId);

    const detailedReport = {
      ...progressReport,

      // Detailed URL tracking
      urls: {
        discovered: Array.from(session.discoveredUrls).slice(0, 100),
        queued: Array.from(session.queuedUrls).slice(0, 50),
        successful: Array.from(session.indexedPages.entries()).slice(0, 50),
        failed: Array.from(session.failedUrls.entries()).slice(0, 50),
        skipped: Array.from(session.skippedUrls.entries()).slice(0, 50),
        duplicates: Array.from(session.duplicatePages).slice(0, 20),
        lowQuality: Array.from(session.lowQualityPages).slice(0, 20)
      },

      // Error analysis
      errorAnalysis: {
        byType: this.groupErrorsByType(session.errors),
        byUrl: this.groupErrorsByUrl(session.errors),
        timeline: this.createErrorTimeline(session.errors)
      },

      // Quality metrics
      qualityMetrics: {
        avgContentLength: this.calculateAvgContentLength(session),
        contentDistribution: this.analyzeContentDistribution(session),
        qualityScores: this.analyzeQualityScores(session)
      },

      // Performance analysis
      performanceAnalysis: {
        processingTimeline: this.createProcessingTimeline(session),
        throughputAnalysis: this.analyzeThroughput(session),
        bottlenecks: this.identifyBottlenecks(session)
      }
    };

    return detailedReport;
  }

  async generateGlobalReport() {
    const allSessions = Array.from(this.state.sessions.values());
    const completedSessions = allSessions.filter(s => s.status === 'completed');

    const report = {
      overview: {
        totalSessions: allSessions.length,
        completedSessions: completedSessions.length,
        activeSessions: allSessions.filter(s => s.status === 'running').length,
        totalPagesIndexed: this.state.globalStats.totalPagesIndexed,
        totalChunksCreated: this.state.globalStats.totalChunksCreated
      },

      bySource: {},

      timeline: this.createGlobalTimeline(allSessions),

      aggregateStats: this.calculateAggregateStats(completedSessions)
    };

    // Group by source
    for (const session of allSessions) {
      if (!report.bySource[session.sourceKey]) {
        report.bySource[session.sourceKey] = {
          sessions: 0,
          totalPages: 0,
          totalChunks: 0,
          totalCost: 0,
          lastUpdate: null
        };
      }

      const sourceStats = report.bySource[session.sourceKey];
      sourceStats.sessions++;
      sourceStats.totalPages += session.stats.pagesIndexed;
      sourceStats.totalChunks += session.stats.chunksCreated;
      sourceStats.totalCost += session.costs.totalCost;
      sourceStats.lastUpdate = session.endTime || session.startTime;
    }

    return report;
  }

  // ====== UTILITY METHODS ======

  categorizeError(error) {
    const message = error.message || error.toString();

    if (message.includes('timeout')) return 'timeout';
    if (message.includes('404') || message.includes('not found')) return 'not_found';
    if (message.includes('403') || message.includes('forbidden')) return 'forbidden';
    if (message.includes('robots.txt')) return 'robots_blocked';
    if (message.includes('content too short')) return 'low_quality';
    if (message.includes('duplicate')) return 'duplicate';
    if (message.includes('network') || message.includes('ENOTFOUND')) return 'network';
    if (message.includes('parse') || message.includes('selector')) return 'parsing';

    return 'unknown';
  }

  groupErrorsByType(errors) {
    const grouped = {};
    for (const error of errors) {
      const type = this.categorizeError(error.error);
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(error);
    }
    return grouped;
  }

  groupErrorsByUrl(errors) {
    const grouped = {};
    for (const error of errors) {
      if (!grouped[error.url]) grouped[error.url] = [];
      grouped[error.url].push(error);
    }
    return grouped;
  }

  createErrorTimeline(errors) {
    return errors.slice(-20).map(error => ({
      timestamp: error.timestamp,
      url: error.url,
      type: this.categorizeError(error.error),
      message: error.error.substring(0, 100)
    }));
  }

  calculateAvgContentLength(session) {
    const pages = Array.from(session.indexedPages.values());
    if (pages.length === 0) return 0;

    const totalLength = pages.reduce((sum, page) => sum + (page.contentLength || 0), 0);
    return Math.round(totalLength / pages.length);
  }

  analyzeContentDistribution(session) {
    const pages = Array.from(session.indexedPages.values());
    const chunkCounts = pages.map(p => p.chunks || 0);

    chunkCounts.sort((a, b) => a - b);

    return {
      min: chunkCounts[0] || 0,
      max: chunkCounts[chunkCounts.length - 1] || 0,
      median: chunkCounts[Math.floor(chunkCounts.length / 2)] || 0,
      avg: chunkCounts.length > 0 ?
        (chunkCounts.reduce((a, b) => a + b, 0) / chunkCounts.length).toFixed(2) : 0
    };
  }

  analyzeQualityScores(session) {
    const pages = Array.from(session.indexedPages.values());
    const scores = pages.map(p => p.quality).filter(q => typeof q === 'number');

    if (scores.length === 0) return { avg: 0, distribution: {} };

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const distribution = {
      high: scores.filter(s => s >= 0.8).length,
      medium: scores.filter(s => s >= 0.5 && s < 0.8).length,
      low: scores.filter(s => s < 0.5).length
    };

    return { avg: avg.toFixed(2), distribution };
  }

  // ====== PERSISTENCE ======

  async loadState() {
    try {
      const data = await fs.readFile(this.dbFile, 'utf8');
      const parsed = JSON.parse(data);

      // Convert Maps back from objects
      this.state.sessions = new Map(Object.entries(parsed.sessions || {}));
      this.state.globalStats = parsed.globalStats || this.state.globalStats;
      this.state.currentSession = parsed.currentSession;

      // Convert Sets back from arrays in sessions
      for (const [sessionId, session] of this.state.sessions) {
        session.discoveredUrls = new Set(session.discoveredUrls || []);
        session.queuedUrls = new Set(session.queuedUrls || []);
        session.processedUrls = new Set(session.processedUrls || []);
        session.duplicatePages = new Set(session.duplicatePages || []);
        session.lowQualityPages = new Set(session.lowQualityPages || []);
        session.failedUrls = new Map(Object.entries(session.failedUrls || {}));
        session.skippedUrls = new Map(Object.entries(session.skippedUrls || {}));
        session.indexedPages = new Map(Object.entries(session.indexedPages || {}));
      }
    } catch (error) {
      console.log('No existing state found, starting fresh');
    }
  }

  async saveState() {
    try {
      // Convert Maps and Sets to serializable objects
      const serializable = {
        sessions: {},
        globalStats: this.state.globalStats,
        currentSession: this.state.currentSession
      };

      for (const [sessionId, session] of this.state.sessions) {
        serializable.sessions[sessionId] = {
          ...session,
          discoveredUrls: Array.from(session.discoveredUrls),
          queuedUrls: Array.from(session.queuedUrls),
          processedUrls: Array.from(session.processedUrls),
          duplicatePages: Array.from(session.duplicatePages),
          lowQualityPages: Array.from(session.lowQualityPages),
          failedUrls: Object.fromEntries(session.failedUrls),
          skippedUrls: Object.fromEntries(session.skippedUrls),
          indexedPages: Object.fromEntries(session.indexedPages)
        };
      }

      await fs.writeFile(this.dbFile, JSON.stringify(serializable, null, 2));
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  }

  async logEvent(eventType, data) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: eventType,
      ...data
    };

    const logFile = path.join(this.logDir, `events-${new Date().toISOString().split('T')[0]}.jsonl`);

    try {
      await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error('Failed to log event:', error);
    }
  }

  async generateSessionReport(sessionId) {
    const report = await this.generateDetailedReport(sessionId);
    if (!report) return;

    const reportFile = path.join(this.reportsDir, `session-${sessionId}-${Date.now()}.json`);

    try {
      await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
      console.log(`📊 Session report generated: ${reportFile}`);
    } catch (error) {
      console.error('Failed to generate session report:', error);
    }
  }

  updateGlobalStats(session) {
    this.state.globalStats.totalPagesIndexed += session.stats.pagesIndexed;
    this.state.globalStats.totalPagesFailed += session.stats.pagesFailed;
    this.state.globalStats.totalChunksCreated += session.stats.chunksCreated;
    this.state.globalStats.lastUpdate = new Date().toISOString();

    if (!this.state.globalStats.sourcesProgress[session.sourceKey]) {
      this.state.globalStats.sourcesProgress[session.sourceKey] = {
        sessions: 0,
        totalPages: 0,
        lastUpdate: null
      };
    }

    const sourceProgress = this.state.globalStats.sourcesProgress[session.sourceKey];
    sourceProgress.sessions++;
    sourceProgress.totalPages += session.stats.pagesIndexed;
    sourceProgress.lastUpdate = session.endTime || session.startTime;
  }

  // ====== PUBLIC API METHODS ======

  async getCurrentStatus() {
    if (!this.state.currentSession) {
      return { status: 'idle', globalStats: this.state.globalStats };
    }

    const report = await this.generateProgressReport(this.state.currentSession);
    return {
      status: 'running',
      currentSession: report,
      globalStats: this.state.globalStats
    };
  }

  async getSessionReport(sessionId) {
    return await this.generateProgressReport(sessionId);
  }

  async getDetailedSessionReport(sessionId) {
    return await this.generateDetailedReport(sessionId);
  }

  async getGlobalReport() {
    return await this.generateGlobalReport();
  }

  async getRecentErrors(limit = 10) {
    const currentSession = this.state.sessions.get(this.state.currentSession);
    if (!currentSession) return [];

    return currentSession.errors.slice(-limit);
  }

  async getFailedUrls(sessionId = null) {
    const session = sessionId ?
      this.state.sessions.get(sessionId) :
      this.state.sessions.get(this.state.currentSession);

    if (!session) return [];

    return Array.from(session.failedUrls.entries()).map(([url, data]) => ({
      url,
      ...data
    }));
  }

  async getQueueStatus(sessionId = null) {
    const session = sessionId ?
      this.state.sessions.get(sessionId) :
      this.state.sessions.get(this.state.currentSession);

    if (!session) return { queued: 0, processed: 0, remaining: 0 };

    return {
      queued: session.queuedUrls.size,
      processed: session.processedUrls.size,
      remaining: session.queuedUrls.size,
      discovered: session.discoveredUrls.size
    };
  }
}

module.exports = IndexingTracker;