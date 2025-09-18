const fs = require('fs').promises;
const path = require('path');

class SimpleIndexingReporter {
  constructor() {
    this.reportsDir = path.join(__dirname, 'reports');
    this.data = {
      sessions: [],
      urls: [],
      errors: [],
      summary: null
    };
  }

  async initialize() {
    await fs.mkdir(this.reportsDir, { recursive: true });
  }

  // ====== DATA COLLECTION ======

  async recordSession(sessionData) {
    this.data.sessions.push({
      sessionId: sessionData.sessionId,
      source: sessionData.source,
      startTime: sessionData.startTime,
      endTime: sessionData.endTime || null,
      status: sessionData.status,
      pagesDiscovered: sessionData.stats?.pagesDiscovered || 0,
      pagesIndexed: sessionData.stats?.pagesIndexed || 0,
      pagesFailed: sessionData.stats?.pagesFailed || 0,
      chunksCreated: sessionData.stats?.chunksCreated || 0,
      cost: sessionData.costs?.totalCost || 0
    });
  }

  async recordUrl(urlData) {
    this.data.urls.push({
      sessionId: urlData.sessionId,
      url: urlData.url,
      status: urlData.status, // discovered, queued, processing, indexed, failed, skipped
      title: urlData.title || '',
      chunks: urlData.chunks || 0,
      tokens: urlData.tokens || 0,
      processingTime: urlData.processingTimeMs || 0,
      error: urlData.error || '',
      timestamp: urlData.timestamp || new Date().toISOString(),
      cost: urlData.cost || 0,
      quality: urlData.quality || ''
    });
  }

  async recordError(errorData) {
    this.data.errors.push({
      sessionId: errorData.sessionId,
      url: errorData.url,
      error: errorData.error,
      errorType: this.categorizeError(errorData.error),
      timestamp: errorData.timestamp || new Date().toISOString(),
      attempt: errorData.attempt || 1
    });
  }

  // ====== REPORT GENERATION ======

  async generateProgressReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(),
      sessions: this.generateSessionsTable(),
      currentQueue: this.generateQueueTable(),
      recentActivity: this.generateActivityTable(),
      errors: this.generateErrorsTable(),
      performance: this.generatePerformanceTable()
    };

    return report;
  }

  generateSummary() {
    const totalSessions = this.data.sessions.length;
    const activeSessions = this.data.sessions.filter(s => s.status === 'running').length;
    const totalIndexed = this.data.urls.filter(u => u.status === 'indexed').length;
    const totalFailed = this.data.urls.filter(u => u.status === 'failed').length;
    const totalQueued = this.data.urls.filter(u => u.status === 'queued').length;
    const totalChunks = this.data.urls.reduce((sum, u) => sum + (u.chunks || 0), 0);
    const totalCost = this.data.sessions.reduce((sum, s) => sum + (s.cost || 0), 0);

    return {
      totalSessions,
      activeSessions,
      totalIndexed,
      totalFailed,
      totalQueued,
      totalChunks,
      totalCost: totalCost.toFixed(4),
      successRate: totalIndexed + totalFailed > 0 ?
        ((totalIndexed / (totalIndexed + totalFailed)) * 100).toFixed(1) + '%' : '0%'
    };
  }

  generateSessionsTable() {
    return this.data.sessions.map(session => ({
      sessionId: session.sessionId.substring(0, 12) + '...',
      source: session.source,
      status: session.status,
      duration: session.endTime ?
        this.formatDuration(new Date(session.endTime) - new Date(session.startTime)) :
        this.formatDuration(new Date() - new Date(session.startTime)) + ' (ongoing)',
      discovered: session.pagesDiscovered,
      indexed: session.pagesIndexed,
      failed: session.pagesFailed,
      chunks: session.chunksCreated,
      cost: '$' + (session.cost || 0).toFixed(4),
      successRate: session.pagesIndexed + session.pagesFailed > 0 ?
        ((session.pagesIndexed / (session.pagesIndexed + session.pagesFailed)) * 100).toFixed(1) + '%' : '0%'
    }));
  }

  generateQueueTable() {
    const queuedUrls = this.data.urls.filter(u => u.status === 'queued');
    const processingUrls = this.data.urls.filter(u => u.status === 'processing');

    return {
      queued: queuedUrls.map(url => ({
        url: this.truncateUrl(url.url),
        queuedSince: this.formatTimeAgo(url.timestamp),
        session: this.getSessionSource(url.sessionId)
      })).slice(0, 20), // Show first 20

      processing: processingUrls.map(url => ({
        url: this.truncateUrl(url.url),
        startedAt: this.formatTimeAgo(url.timestamp),
        duration: this.formatDuration(new Date() - new Date(url.timestamp)),
        session: this.getSessionSource(url.sessionId)
      }))
    };
  }

  generateActivityTable() {
    const recentUrls = this.data.urls
      .filter(u => ['indexed', 'failed', 'skipped'].includes(u.status))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 50);

    return recentUrls.map(url => ({
      url: this.truncateUrl(url.url),
      status: url.status,
      title: this.truncateText(url.title, 40),
      chunks: url.chunks || 0,
      processingTime: url.processingTime ? (url.processingTime / 1000).toFixed(1) + 's' : '',
      cost: url.cost ? '$' + url.cost.toFixed(4) : '',
      timestamp: this.formatTimeAgo(url.timestamp),
      session: this.getSessionSource(url.sessionId),
      error: url.status === 'failed' ? this.truncateText(url.error, 50) : ''
    }));
  }

  generateErrorsTable() {
    const recentErrors = this.data.errors
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 30);

    const errorSummary = this.groupBy(this.data.errors, 'errorType');
    const errorStats = Object.entries(errorSummary).map(([type, errors]) => ({
      errorType: type,
      count: errors.length,
      lastOccurrence: this.formatTimeAgo(Math.max(...errors.map(e => new Date(e.timestamp)))),
      affectedUrls: new Set(errors.map(e => e.url)).size,
      examples: errors.slice(0, 3).map(e => this.truncateUrl(e.url))
    }));

    return {
      summary: errorStats,
      recent: recentErrors.map(error => ({
        url: this.truncateUrl(error.url),
        errorType: error.errorType,
        error: this.truncateText(error.error, 60),
        timestamp: this.formatTimeAgo(error.timestamp),
        attempt: error.attempt,
        session: this.getSessionSource(error.sessionId)
      }))
    };
  }

  generatePerformanceTable() {
    const indexedUrls = this.data.urls.filter(u => u.status === 'indexed');
    const processingTimes = indexedUrls
      .filter(u => u.processingTime > 0)
      .map(u => u.processingTime);

    const costs = indexedUrls
      .filter(u => u.cost > 0)
      .map(u => u.cost);

    const chunkDistribution = indexedUrls
      .filter(u => u.chunks > 0)
      .map(u => u.chunks);

    return {
      overview: {
        totalProcessed: indexedUrls.length,
        avgProcessingTime: processingTimes.length > 0 ?
          (processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length / 1000).toFixed(1) + 's' : 'N/A',
        avgCostPerPage: costs.length > 0 ?
          '$' + (costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(4) : 'N/A',
        avgChunksPerPage: chunkDistribution.length > 0 ?
          (chunkDistribution.reduce((a, b) => a + b, 0) / chunkDistribution.length).toFixed(1) : 'N/A'
      },
      bySource: this.analyzeBySource(),
      slowestPages: indexedUrls
        .filter(u => u.processingTime > 0)
        .sort((a, b) => b.processingTime - a.processingTime)
        .slice(0, 10)
        .map(u => ({
          url: this.truncateUrl(u.url),
          processingTime: (u.processingTime / 1000).toFixed(1) + 's',
          chunks: u.chunks || 0,
          session: this.getSessionSource(u.sessionId)
        })),
      costliestPages: indexedUrls
        .filter(u => u.cost > 0)
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 10)
        .map(u => ({
          url: this.truncateUrl(u.url),
          cost: '$' + u.cost.toFixed(4),
          chunks: u.chunks || 0,
          session: this.getSessionSource(u.sessionId)
        }))
    };
  }

  analyzeBySource() {
    const sessions = this.groupBy(this.data.sessions, 'source');

    return Object.entries(sessions).map(([source, sessionList]) => {
      const sourceUrls = this.data.urls.filter(u =>
        sessionList.some(s => s.sessionId === u.sessionId)
      );

      const indexed = sourceUrls.filter(u => u.status === 'indexed');
      const failed = sourceUrls.filter(u => u.status === 'failed');
      const totalCost = sessionList.reduce((sum, s) => sum + (s.cost || 0), 0);
      const totalChunks = indexed.reduce((sum, u) => sum + (u.chunks || 0), 0);

      return {
        source,
        sessions: sessionList.length,
        indexed: indexed.length,
        failed: failed.length,
        successRate: indexed.length + failed.length > 0 ?
          ((indexed.length / (indexed.length + failed.length)) * 100).toFixed(1) + '%' : '0%',
        totalChunks,
        totalCost: '$' + totalCost.toFixed(4),
        avgCostPerPage: indexed.length > 0 ?
          '$' + (totalCost / indexed.length).toFixed(4) : 'N/A'
      };
    });
  }

  // ====== EXPORT METHODS ======

  async exportToCSV() {
    const reports = await this.generateProgressReport();
    const timestamp = new Date().toISOString().split('T')[0];

    // Export URLs table
    const urlsCSV = this.arrayToCSV(reports.recentActivity);
    await fs.writeFile(
      path.join(this.reportsDir, `urls-${timestamp}.csv`),
      urlsCSV
    );

    // Export errors table
    const errorsCSV = this.arrayToCSV(reports.errors.recent);
    await fs.writeFile(
      path.join(this.reportsDir, `errors-${timestamp}.csv`),
      errorsCSV
    );

    // Export sessions table
    const sessionsCSV = this.arrayToCSV(reports.sessions);
    await fs.writeFile(
      path.join(this.reportsDir, `sessions-${timestamp}.csv`),
      sessionsCSV
    );

    return {
      urls: `urls-${timestamp}.csv`,
      errors: `errors-${timestamp}.csv`,
      sessions: `sessions-${timestamp}.csv`
    };
  }

  async exportToJSON() {
    const report = await this.generateProgressReport();
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `full-report-${timestamp}.json`;

    await fs.writeFile(
      path.join(this.reportsDir, filename),
      JSON.stringify(report, null, 2)
    );

    return filename;
  }

  async exportToHTML() {
    const report = await this.generateProgressReport();
    const html = this.generateHTMLReport(report);
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `report-${timestamp}.html`;

    await fs.writeFile(
      path.join(this.reportsDir, filename),
      html
    );

    return filename;
  }

  generateHTMLReport(report) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Guimerà Indexing Progress Report</title>
    <meta charset="UTF-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; }
        .summary { background: #f0f9ff; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .metric { display: inline-block; margin-right: 30px; }
        .metric-value { font-size: 24px; font-weight: bold; color: #0369a1; }
        .metric-label { font-size: 14px; color: #64748b; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; font-weight: 600; }
        .status-indexed { color: #059669; }
        .status-failed { color: #dc2626; }
        .status-queued { color: #d97706; }
        .status-processing { color: #7c3aed; }
        .url { max-width: 300px; word-break: break-all; font-family: monospace; font-size: 12px; }
        .error { color: #dc2626; font-size: 12px; }
        h2 { color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
        .timestamp { color: #64748b; font-size: 12px; }
    </style>
</head>
<body>
    <h1>🔍 Guimerà Indexing Progress Report</h1>
    <p class="timestamp">Generated: ${report.timestamp}</p>

    <div class="summary">
        <h2>📊 Summary</h2>
        <div class="metric">
            <div class="metric-value">${report.summary.totalIndexed}</div>
            <div class="metric-label">Pages Indexed</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.summary.totalQueued}</div>
            <div class="metric-label">In Queue</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.summary.totalFailed}</div>
            <div class="metric-label">Failed</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.summary.totalChunks}</div>
            <div class="metric-label">Total Chunks</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.summary.successRate}</div>
            <div class="metric-label">Success Rate</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.summary.totalCost}</div>
            <div class="metric-label">Total Cost</div>
        </div>
    </div>

    <h2>📋 Active Sessions</h2>
    ${this.tableToHTML(report.sessions, [
      'sessionId', 'source', 'status', 'duration', 'discovered', 'indexed', 'failed', 'chunks', 'cost', 'successRate'
    ])}

    <h2>⏳ Current Queue (${report.currentQueue.queued.length} queued, ${report.currentQueue.processing.length} processing)</h2>
    ${this.tableToHTML(report.currentQueue.queued.slice(0, 10), ['url', 'queuedSince', 'session'])}

    <h2>📊 Recent Activity (Last 50)</h2>
    ${this.tableToHTML(report.recentActivity, [
      'url', 'status', 'title', 'chunks', 'processingTime', 'cost', 'timestamp', 'session', 'error'
    ])}

    <h2>❌ Error Summary</h2>
    ${this.tableToHTML(report.errors.summary, ['errorType', 'count', 'lastOccurrence', 'affectedUrls'])}

    <h2>🔍 Recent Errors</h2>
    ${this.tableToHTML(report.errors.recent.slice(0, 20), [
      'url', 'errorType', 'error', 'timestamp', 'attempt', 'session'
    ])}

    <h2>⚡ Performance by Source</h2>
    ${this.tableToHTML(report.performance.bySource, [
      'source', 'sessions', 'indexed', 'failed', 'successRate', 'totalChunks', 'totalCost', 'avgCostPerPage'
    ])}

</body>
</html>`;
  }

  // ====== UTILITY METHODS ======

  categorizeError(error) {
    const message = error.toLowerCase();
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('404') || message.includes('not found')) return 'not_found';
    if (message.includes('403') || message.includes('forbidden')) return 'forbidden';
    if (message.includes('robots')) return 'robots_blocked';
    if (message.includes('duplicate')) return 'duplicate';
    if (message.includes('quality')) return 'low_quality';
    if (message.includes('network')) return 'network';
    if (message.includes('parse')) return 'parsing';
    return 'unknown';
  }

  truncateUrl(url, maxLength = 60) {
    if (!url) return '';
    return url.length > maxLength ? url.substring(0, maxLength) + '...' : url;
  }

  truncateText(text, maxLength = 50) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  formatTimeAgo(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  getSessionSource(sessionId) {
    const session = this.data.sessions.find(s => s.sessionId === sessionId);
    return session ? session.source : 'unknown';
  }

  groupBy(array, key) {
    return array.reduce((result, item) => {
      const group = item[key];
      if (!result[group]) result[group] = [];
      result[group].push(item);
      return result;
    }, {});
  }

  arrayToCSV(array) {
    if (array.length === 0) return '';

    const headers = Object.keys(array[0]);
    const csvContent = [
      headers.join(','),
      ...array.map(row =>
        headers.map(header => {
          const value = row[header] || '';
          return `"${value.toString().replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');

    return csvContent;
  }

  tableToHTML(array, columns = null) {
    if (array.length === 0) return '<p>No data available</p>';

    const cols = columns || Object.keys(array[0]);

    const headerRow = cols.map(col => `<th>${col}</th>`).join('');
    const dataRows = array.map(row =>
      cols.map(col => {
        const value = row[col] || '';
        let cellClass = '';

        if (col === 'status') {
          cellClass = `class="status-${value}"`;
        } else if (col === 'url') {
          cellClass = 'class="url"';
        } else if (col === 'error' && value) {
          cellClass = 'class="error"';
        }

        return `<td ${cellClass}>${value}</td>`;
      }).join('')
    ).map(row => `<tr>${row}</tr>`).join('');

    return `<table><thead><tr>${headerRow}</tr></thead><tbody>${dataRows}</tbody></table>`;
  }
}

module.exports = SimpleIndexingReporter;