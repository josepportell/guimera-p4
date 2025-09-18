const cron = require('node-cron');

// Conditionally require RAG modules
let MultiDomainScraper, GuimeraRAGEngine;
try {
  MultiDomainScraper = require('../rag/multi-domain-scraper');
  GuimeraRAGEngine = require('../rag/rag-engine');
} catch (error) {
  console.warn('⚠️ RAG modules not available - scheduler will run in limited mode');
}

class RAGSystemScheduler {
  constructor() {
    this.jobs = new Map();
    this.isProcessing = false;
    this.lastUpdate = null;
    this.updateLog = [];
  }

  // Initialize scheduled tasks
  start() {
    if (!GuimeraRAGEngine || !MultiDomainScraper) {
      console.log('⚠️ RAG System Scheduler disabled - RAG modules not available');
      return;
    }

    console.log('🕐 Starting RAG System Scheduler...');

    // Daily health check (every day at 2 AM)
    this.scheduleJob('health-check', '0 2 * * *', async () => {
      console.log('🏥 Running daily health check...');
      await this.performHealthCheck();
    });

    // Weekly content update (every Sunday at 3 AM)
    this.scheduleJob('weekly-update', '0 3 * * 0', async () => {
      console.log('📚 Running weekly content update...');
      await this.performContentUpdate('weekly');
    });

    // Monthly full refresh (first day of month at 4 AM)
    this.scheduleJob('monthly-refresh', '0 4 1 * *', async () => {
      console.log('🔄 Running monthly full refresh...');
      await this.performFullRefresh();
    });

    // Performance monitoring (every hour)
    this.scheduleJob('performance-monitor', '0 * * * *', async () => {
      await this.monitorPerformance();
    });

    console.log('✅ RAG System Scheduler started with 4 scheduled tasks');
  }

  scheduleJob(name, cronExpression, task) {
    const job = cron.schedule(cronExpression, task, {
      scheduled: false, // Don't start immediately
      timezone: "Europe/Madrid" // Adjust to your timezone
    });

    this.jobs.set(name, {
      job,
      cronExpression,
      lastRun: null,
      nextRun: null,
      status: 'scheduled'
    });

    job.start();
    console.log(`📅 Scheduled '${name}': ${cronExpression}`);
  }

  // =============================================================================
  // SCHEDULED TASKS
  // =============================================================================

  async performHealthCheck() {
    try {
      const ragEngine = new GuimeraRAGEngine();
      await ragEngine.initialize();

      const health = {
        timestamp: new Date().toISOString(),
        vectorDB: await this.checkVectorDB(ragEngine),
        embedding: await this.checkEmbeddingService(),
        sources: await this.checkSources(),
        performance: await this.checkPerformanceMetrics()
      };

      const issues = this.detectIssues(health);

      if (issues.length > 0) {
        console.warn('⚠️ Health check found issues:', issues);
        await this.alertAdmins(issues);
      } else {
        console.log('✅ System health check passed');
      }

      this.updateLog.push({
        type: 'health-check',
        timestamp: new Date().toISOString(),
        status: issues.length > 0 ? 'issues-found' : 'healthy',
        details: health,
        issues
      });

    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      this.updateLog.push({
        type: 'health-check',
        timestamp: new Date().toISOString(),
        status: 'error',
        error: error.message
      });
    }
  }

  async performContentUpdate(type = 'incremental') {
    if (this.isProcessing) {
      console.log('⏳ Content update already in progress, skipping...');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      console.log(`🔄 Starting ${type} content update...`);

      const scraper = new MultiDomainScraper();

      // Scrape content (incremental only checks for updates)
      const content = type === 'incremental'
        ? await scraper.scrapeUpdatedContent()
        : await scraper.scrapeAllSources();

      if (content.length === 0) {
        console.log('📝 No new content found');
        return;
      }

      console.log(`📊 Found ${content.length} new/updated documents`);

      // Re-embed and store
      const ragEngine = new GuimeraRAGEngine();
      await ragEngine.initialize();
      await ragEngine.embedAndStore(content);

      const duration = Date.now() - startTime;
      this.lastUpdate = new Date().toISOString();

      console.log(`✅ Content update completed in ${duration}ms`);

      this.updateLog.push({
        type: 'content-update',
        timestamp: new Date().toISOString(),
        status: 'completed',
        documentsProcessed: content.length,
        duration,
        updateType: type
      });

    } catch (error) {
      console.error('❌ Content update failed:', error.message);

      this.updateLog.push({
        type: 'content-update',
        timestamp: new Date().toISOString(),
        status: 'failed',
        error: error.message,
        updateType: type
      });

      await this.alertAdmins([{
        type: 'content-update-failed',
        message: error.message,
        updateType: type
      }]);

    } finally {
      this.isProcessing = false;
    }
  }

  async performFullRefresh() {
    console.log('🔄 Starting full system refresh...');

    // Clear old vectors (optional - be careful!)
    // await this.clearOldVectors();

    // Full re-scrape and re-index
    await this.performContentUpdate('full');

    console.log('✅ Full refresh completed');
  }

  async monitorPerformance() {
    try {
      const metrics = await this.collectPerformanceMetrics();

      // Check for performance issues
      const issues = [];

      if (metrics.avgResponseTime > 5000) {
        issues.push({
          type: 'slow-response',
          value: metrics.avgResponseTime,
          threshold: 5000
        });
      }

      if (metrics.errorRate > 0.05) {
        issues.push({
          type: 'high-error-rate',
          value: metrics.errorRate,
          threshold: 0.05
        });
      }

      if (metrics.lowConfidenceRate > 0.3) {
        issues.push({
          type: 'low-confidence',
          value: metrics.lowConfidenceRate,
          threshold: 0.3
        });
      }

      if (issues.length > 0) {
        console.warn('📊 Performance issues detected:', issues);
      }

    } catch (error) {
      console.error('📊 Performance monitoring failed:', error.message);
    }
  }

  // =============================================================================
  // MONITORING & ALERTS
  // =============================================================================

  async checkVectorDB(ragEngine) {
    try {
      const stats = await ragEngine.getStats();
      return {
        status: 'healthy',
        vectorCount: stats.totalVectors,
        dimensions: stats.dimension
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  async checkEmbeddingService() {
    try {
      // Test embedding generation
      const testText = "Test embedding generation";
      const ragEngine = new GuimeraRAGEngine();
      await ragEngine.generateEmbeddings([testText]);

      return { status: 'healthy' };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  async checkSources() {
    const sources = [
      'https://www.guimera.info',
      'https://guimera.blog',
      // Add other sources
    ];

    const sourceChecks = await Promise.allSettled(
      sources.map(async (url) => {
        try {
          const response = await fetch(url, {
            method: 'HEAD',
            timeout: 5000
          });
          return { url, status: response.ok ? 'healthy' : 'error', code: response.status };
        } catch (error) {
          return { url, status: 'error', error: error.message };
        }
      })
    );

    return sourceChecks.map(result => result.value);
  }

  detectIssues(health) {
    const issues = [];

    if (health.vectorDB.status === 'error') {
      issues.push({
        type: 'vector-db-error',
        message: health.vectorDB.error
      });
    }

    if (health.embedding.status === 'error') {
      issues.push({
        type: 'embedding-service-error',
        message: health.embedding.error
      });
    }

    const failedSources = health.sources.filter(s => s.status === 'error');
    if (failedSources.length > 0) {
      issues.push({
        type: 'source-unavailable',
        message: `${failedSources.length} sources unavailable`,
        sources: failedSources
      });
    }

    return issues;
  }

  async alertAdmins(issues) {
    console.warn('🚨 ADMIN ALERT:', issues);

    // In production, send email/Slack/webhook
    // await this.sendEmailAlert(issues);
    // await this.sendSlackAlert(issues);

    // For now, just log prominently
    console.log('=' .repeat(80));
    console.log('🚨 SYSTEM ISSUES DETECTED');
    console.log('=' .repeat(80));
    issues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue.type}: ${issue.message}`);
    });
    console.log('=' .repeat(80));
  }

  // =============================================================================
  // MANUAL CONTROLS
  // =============================================================================

  async triggerUpdate(type = 'incremental') {
    console.log(`🔄 Manually triggering ${type} update...`);
    await this.performContentUpdate(type);
  }

  async getStatus() {
    return {
      isProcessing: this.isProcessing,
      lastUpdate: this.lastUpdate,
      scheduledJobs: Array.from(this.jobs.entries()).map(([name, job]) => ({
        name,
        cronExpression: job.cronExpression,
        status: job.status,
        lastRun: job.lastRun,
        nextRun: job.nextRun
      })),
      recentLogs: this.updateLog.slice(-10)
    };
  }

  stop() {
    console.log('🛑 Stopping RAG System Scheduler...');

    this.jobs.forEach((jobData, name) => {
      jobData.job.stop();
      console.log(`⏹️ Stopped job: ${name}`);
    });

    this.jobs.clear();
    console.log('✅ RAG System Scheduler stopped');
  }
}

module.exports = RAGSystemScheduler;