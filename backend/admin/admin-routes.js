const express = require('express');
const fs = require('fs').promises;
const path = require('path');

// Conditionally require RAG modules
let GuimeraRAGEngine, MultiDomainScraper;
try {
  GuimeraRAGEngine = require('../rag-engine');
  MultiDomainScraper = require('../multi-domain-scraper');
} catch (error) {
  console.warn('⚠️ RAG modules not available - admin will run in limited mode');
}

const router = express.Router();

// In-memory analytics store (in production, use Redis/MongoDB)
let analyticsData = {
  queries: [],
  performance: [],
  contentUpdates: [],
  systemHealth: []
};

// Middleware for admin authentication (basic for now)
const adminAuth = (req, res, next) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  const validToken = process.env.ADMIN_TOKEN || 'guimera-admin-2024';

  if (token !== validToken) {
    return res.status(401).json({ error: 'No autoritzat. Es requereix accés d\'administrador.' });
  }
  next();
};

// Apply auth to all admin routes
router.use(adminAuth);

// =============================================================================
// DASHBOARD OVERVIEW
// =============================================================================

router.get('/dashboard', async (req, res) => {
  try {
    let ragStats = null;

    if (GuimeraRAGEngine) {
      try {
        const ragEngine = new GuimeraRAGEngine();
        await ragEngine.initialize();
        ragStats = await ragEngine.getStats();
      } catch (error) {
        console.warn('⚠️ RAG engine initialization failed:', error.message);
      }
    }

    // Calculate performance metrics
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentQueries = analyticsData.queries.filter(q => new Date(q.timestamp) > last24h);

    const avgConfidence = recentQueries.length > 0
      ? recentQueries.reduce((sum, q) => sum + (q.confidence || 0), 0) / recentQueries.length
      : 0;

    const ragUsageRate = recentQueries.length > 0
      ? recentQueries.filter(q => q.mode === 'rag').length / recentQueries.length
      : 0;

    // Popular topics
    const topicCounts = {};
    recentQueries.forEach(query => {
      const topic = classifyTopic(query.question);
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    });

    const dashboard = {
      timestamp: new Date().toISOString(),

      // System Health
      system: {
        status: ragStats ? 'healthy' : 'degraded',
        ragEnabled: !!ragStats && !!GuimeraRAGEngine,
        totalVectors: ragStats?.totalVectors || 0,
        vectorDimensions: ragStats?.dimension || 0,
        uptime: process.uptime()
      },

      // Usage Statistics (Last 24h)
      usage: {
        totalQueries: recentQueries.length,
        ragQueries: recentQueries.filter(q => q.mode === 'rag').length,
        ragUsageRate: Math.round(ragUsageRate * 100),
        avgConfidence: Math.round(avgConfidence * 100),
        avgResponseTime: calculateAvgResponseTime(recentQueries)
      },

      // Content Analytics
      content: {
        lastUpdate: await getLastContentUpdate(),
        sourcesAvailable: getAvailableSources(),
        topSources: getTopSources(recentQueries),
        contentFreshness: await assessContentFreshness()
      },

      // Popular Topics
      topics: Object.entries(topicCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([topic, count]) => ({ topic, count })),

      // Recent Issues
      issues: await detectSystemIssues(ragStats, recentQueries)
    };

    res.json(dashboard);

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      error: 'Error generant el tauler',
      details: error.message
    });
  }
});

// =============================================================================
// ANALYTICS & PERFORMANCE
// =============================================================================

router.get('/analytics', async (req, res) => {
  const { timeframe = '7d', metric = 'all' } = req.query;

  const timeframeDays = timeframe === '24h' ? 1 : timeframe === '7d' ? 7 : 30;
  const since = new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000);

  const filteredQueries = analyticsData.queries.filter(q =>
    new Date(q.timestamp) > since
  );

  const analytics = {
    timeframe,
    totalQueries: filteredQueries.length,

    // Query Distribution
    queryDistribution: {
      ragQueries: filteredQueries.filter(q => q.mode === 'rag').length,
      standardQueries: filteredQueries.filter(q => q.mode === 'standard').length,
      failedQueries: filteredQueries.filter(q => q.error).length
    },

    // Performance Metrics
    performance: {
      avgResponseTime: calculateAvgResponseTime(filteredQueries),
      avgConfidence: calculateAvgConfidence(filteredQueries),
      responseTimeDistribution: getResponseTimeDistribution(filteredQueries)
    },

    // Content Performance
    contentMetrics: {
      sourcesUsed: getSourcesUsage(filteredQueries),
      topPerformingSources: getTopPerformingSources(filteredQueries),
      lowPerformingSources: getLowPerformingSources(filteredQueries)
    },

    // User Behavior
    userBehavior: {
      mostAskedQuestions: getMostAskedQuestions(filteredQueries),
      questionTypes: getQuestionTypes(filteredQueries),
      sessionLengths: getSessionLengths(filteredQueries)
    },

    // Trends (daily breakdown)
    trends: generateTrends(filteredQueries, timeframeDays)
  };

  res.json(analytics);
});

// =============================================================================
// CONTENT MANAGEMENT
// =============================================================================

router.get('/content/status', async (req, res) => {
  try {
    const contentStatus = {
      sources: await getContentSourcesStatus(),
      lastScrapeResults: await getLastScrapeResults(),
      contentStats: await getContentStatistics(),
      pendingUpdates: await getPendingUpdates()
    };

    res.json(contentStatus);
  } catch (error) {
    res.status(500).json({ error: 'Error obtenint l\'estat del contingut', details: error.message });
  }
});

router.post('/content/refresh', async (req, res) => {
  const { sources = 'all', priority = 'normal' } = req.body;

  if (!GuimeraRAGEngine || !MultiDomainScraper) {
    return res.status(503).json({
      error: 'Sistema RAG no disponible',
      details: 'Els mòduls RAG no estan instal·lats'
    });
  }

  const updateId = Date.now().toString();
  try {
    // Log content update start
    analyticsData.contentUpdates.push({
      id: updateId,
      startTime: new Date().toISOString(),
      sources,
      priority,
      status: 'running'
    });

    // Use SimpleScraper for reliable scraping (no Playwright dependency)
    console.log('Using SimpleScraper for content refresh (reliable HTTP scraper)');
    const SimpleScraper = require('../simple-scraper');
    const scraper = new SimpleScraper();

    // SimpleScraper only supports scrapeAllSources for now
    const content = await scraper.scrapeAllSources();

    // Re-embed and store
    const ragEngine = new GuimeraRAGEngine();
    await ragEngine.initialize();
    await ragEngine.embedAndStore(content);

    // Update completion status
    const updateRecord = analyticsData.contentUpdates.find(u => u.id === updateId);
    if (updateRecord) {
      updateRecord.status = 'completed';
      updateRecord.endTime = new Date().toISOString();
      updateRecord.documentsProcessed = content.length;
    }

    res.json({
      success: true,
      updateId,
      documentsProcessed: content.length,
      message: 'Actualització de contingut completada correctament'
    });

  } catch (error) {
    console.error('Content refresh error:', error);

    // Update error status
    const updateRecord = analyticsData.contentUpdates.find(u => u.id === updateId);
    if (updateRecord) {
      updateRecord.status = 'failed';
      updateRecord.error = error.message;
      updateRecord.endTime = new Date().toISOString();
    }

    res.status(500).json({
      error: 'Error actualitzant el contingut',
      details: error.message
    });
  }
});

router.post('/content/progressive-index', async (req, res) => {
  const { maxPages = 500, source = 'guimera.info', priority = 'normal' } = req.body;

  const indexingId = Date.now().toString();

  try {
    // Log progressive indexing start
    analyticsData.contentUpdates.push({
      id: indexingId,
      startTime: new Date().toISOString(),
      sources: source,
      priority,
      status: 'running',
      type: 'progressive-indexing',
      maxPages
    });

    // Return immediately with indexing ID (process runs in background)
    res.json({
      success: true,
      indexingId,
      message: `Indexació progressiva iniciada: ${maxPages} pàgines de ${source}`,
      estimatedDuration: `${Math.ceil(maxPages / 4)} minuts`,
      status: 'running'
    });

    // Run progressive indexing in background
    setImmediate(async () => {
      try {
        console.log(`🚀 Starting progressive indexing: ${maxPages} pages from ${source}`);

        const { spawn } = require('child_process');
        const path = require('path');

        // Backend root directory (one level up from admin)
        const backendRoot = path.join(__dirname, '..');
        const indexerScript = path.join(backendRoot, 'progressive-indexer.js');

        console.log(`📁 Working directory: ${backendRoot}`);
        console.log(`📄 Running script: ${indexerScript}`);

        const indexingProcess = spawn('node', [indexerScript], {
          cwd: backendRoot,
          env: {
            ...process.env,
            MAX_PAGES: maxPages.toString(),
            SOURCE_URL: source
          },
          stdio: 'pipe'
        });

        let output = '';
        let errorOutput = '';

        indexingProcess.stdout.on('data', (data) => {
          output += data.toString();
          console.log(`Progressive Indexer: ${data}`);
        });

        indexingProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
          console.error(`Progressive Indexer Error: ${data}`);
        });

        indexingProcess.on('close', (code) => {
          const updateRecord = analyticsData.contentUpdates.find(u => u.id === indexingId);
          if (updateRecord) {
            updateRecord.endTime = new Date().toISOString();
            updateRecord.status = code === 0 ? 'completed' : 'failed';
            updateRecord.output = output;
            updateRecord.error = code !== 0 ? errorOutput : null;

            // Try to extract document count from output
            const docMatch = output.match(/(\d+)\s+documents?\s+(processed|indexed|stored)/i);
            updateRecord.documentsProcessed = docMatch ? parseInt(docMatch[1]) : 0;
          }

          console.log(`Progressive indexing completed with code: ${code}`);
        });

      } catch (error) {
        console.error('Progressive indexing error:', error);

        const updateRecord = analyticsData.contentUpdates.find(u => u.id === indexingId);
        if (updateRecord) {
          updateRecord.status = 'failed';
          updateRecord.error = error.message;
          updateRecord.endTime = new Date().toISOString();
        }
      }
    });

  } catch (error) {
    console.error('Progressive indexing startup error:', error);

    const updateRecord = analyticsData.contentUpdates.find(u => u.id === indexingId);
    if (updateRecord) {
      updateRecord.status = 'failed';
      updateRecord.error = error.message;
      updateRecord.endTime = new Date().toISOString();
    }

    res.status(500).json({
      error: 'Error iniciant la indexació progressiva',
      details: error.message
    });
  }
});

// =============================================================================
// SYSTEM HEALTH & MONITORING
// =============================================================================

router.get('/health/detailed', async (req, res) => {
  try {
    const health = {
      timestamp: new Date().toISOString(),

      // RAG System Health
      rag: await checkRAGHealth(),

      // Database Health
      database: await checkDatabaseHealth(),

      // External Services Health
      external: await checkExternalServices(),

      // Content Freshness
      content: await checkContentHealth(),

      // Performance Health
      performance: await checkPerformanceHealth(),

      // System Resources
      resources: getSystemResources()
    };

    const overallStatus = determineOverallHealth(health);

    res.json({
      status: overallStatus,
      ...health
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: 'Error en la comprovació de salut',
      details: error.message
    });
  }
});

// =============================================================================
// AI COST MANAGEMENT
// =============================================================================

router.get('/costs/analytics', (req, res) => {
  const { timeframe = '30d' } = req.query;
  const costTracker = req.app.locals.costTracker;

  if (!costTracker) {
    return res.status(503).json({
      error: 'Seguiment de costos no disponible',
      details: 'El sistema de seguiment de costos no està inicialitzat'
    });
  }

  try {
    const analytics = costTracker.getCostAnalytics(timeframe);
    res.json(analytics);
  } catch (error) {
    res.status(500).json({
      error: 'Error obtenint analítiques de costos',
      details: error.message
    });
  }
});

router.get('/costs/budget', (req, res) => {
  const costTracker = req.app.locals.costTracker;

  if (!costTracker) {
    return res.status(503).json({
      error: 'Seguiment de costos no disponible'
    });
  }

  try {
    const budgetStatus = costTracker.getBudgetStatus();
    const alerts = costTracker.checkBudgetAlerts();

    res.json({
      budget: budgetStatus,
      alerts,
      limits: costTracker.budgetAlerts
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error obtenint estat del pressupost',
      details: error.message
    });
  }
});

router.post('/costs/budget', (req, res) => {
  const { daily, monthly } = req.body;
  const costTracker = req.app.locals.costTracker;

  if (!costTracker) {
    return res.status(503).json({
      error: 'Seguiment de costos no disponible'
    });
  }

  try {
    const updatedLimits = costTracker.updateBudgetLimits(daily, monthly);
    res.json({
      message: 'Límits de pressupost actualitzats',
      limits: updatedLimits
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error actualitzant límits de pressupost',
      details: error.message
    });
  }
});

router.get('/costs/expensive', (req, res) => {
  const { limit = 10 } = req.query;
  const costTracker = req.app.locals.costTracker;

  if (!costTracker) {
    return res.status(503).json({
      error: 'Seguiment de costos no disponible'
    });
  }

  try {
    const expensiveRequests = costTracker.getExpensiveRequests(parseInt(limit));
    res.json({ expensiveRequests });
  } catch (error) {
    res.status(500).json({
      error: 'Error obtenint sol·licituds més cares',
      details: error.message
    });
  }
});

router.get('/costs/pricing', (req, res) => {
  const costTracker = req.app.locals.costTracker;

  if (!costTracker) {
    return res.status(503).json({
      error: 'Seguiment de costos no disponible'
    });
  }

  try {
    const pricing = costTracker.getPricingInfo();
    res.json({ pricing });
  } catch (error) {
    res.status(500).json({
      error: 'Error obtenint informació de preus',
      details: error.message
    });
  }
});

router.post('/costs/estimate', (req, res) => {
  const { model, inputTokens, outputTokens = 0 } = req.body;
  const costTracker = req.app.locals.costTracker;

  if (!costTracker) {
    return res.status(503).json({
      error: 'Seguiment de costos no disponible'
    });
  }

  if (!model || !inputTokens) {
    return res.status(400).json({
      error: 'Model i inputTokens són requerits'
    });
  }

  try {
    const estimate = costTracker.estimateCost(model, inputTokens, outputTokens);
    res.json(estimate);
  } catch (error) {
    res.status(500).json({
      error: 'Error calculant estimació de cost',
      details: error.message
    });
  }
});

// =============================================================================
// CONFIGURATION MANAGEMENT
// =============================================================================

router.get('/config', (req, res) => {
  const config = {
    rag: {
      enabled: !!process.env.PINECONE_API_KEY,
      vectorDimensions: 3072,
      chunkSize: 1000,
      chunkOverlap: 200,
      maxRetrieval: 20,
      reranking: true
    },

    scraping: {
      sources: Object.keys(require('../rag/config').sources.blogs).length + 1,
      respectfulDelay: 1000,
      maxPagesPerSource: 50,
      autoRefresh: false
    },

    performance: {
      caching: false,
      rateLimiting: false,
      monitoring: true
    }
  };

  res.json(config);
});

router.post('/config', (req, res) => {
  // Configuration updates (implement as needed)
  res.json({ message: 'Configuració actualitzada', config: req.body });
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function classifyTopic(question) {
  const keywords = {
    'Museu': ['museu', 'museum', 'horari', 'entrada', 'preu', 'visita', 'exposici'],
    'Història': ['història', 'history', 'medieval', 'castell', 'origen', 'passat'],
    'Turisme': ['arribar', 'transport', 'hotel', 'restaurant', 'allotjament'],
    'Natura': ['natura', 'paisatge', 'senderisme', 'ruta', 'mirador'],
    'Cultura': ['festa', 'tradició', 'gastronomia', 'cultura', 'esdeveniment'],
    'General': []
  };

  const lowerQuestion = question.toLowerCase();

  for (const [topic, words] of Object.entries(keywords)) {
    if (words.some(word => lowerQuestion.includes(word))) {
      return topic;
    }
  }

  return 'General';
}

function calculateAvgResponseTime(queries) {
  if (queries.length === 0) return 0;
  return Math.round(
    queries.reduce((sum, q) => sum + (q.responseTime || 0), 0) / queries.length
  );
}

function calculateAvgConfidence(queries) {
  const ragQueries = queries.filter(q => q.mode === 'rag' && q.confidence);
  if (ragQueries.length === 0) return 0;
  return Math.round(
    ragQueries.reduce((sum, q) => sum + q.confidence, 0) / ragQueries.length * 100
  );
}

// Add middleware to capture analytics
router.captureAnalytics = (req, res, next) => {
  const originalJson = res.json;
  res.json = function(data) {
    // Capture query analytics
    if (req.body && req.body.message) {
      analyticsData.queries.push({
        timestamp: new Date().toISOString(),
        question: req.body.message,
        mode: data.mode || 'standard',
        confidence: data.ragMetadata?.confidence || null,
        responseTime: Date.now() - req.startTime,
        sessionId: data.sessionId,
        sources: data.ragMetadata?.totalSources || 0,
        error: data.error || null
      });

      // Keep only last 10000 queries
      if (analyticsData.queries.length > 10000) {
        analyticsData.queries = analyticsData.queries.slice(-10000);
      }
    }

    return originalJson.call(this, data);
  };

  req.startTime = Date.now();
  next();
};

// =============================================================================
// ANALYTICS HELPER FUNCTIONS
// =============================================================================

function getTopSources(queries) {
  const sourceCounts = {};
  queries.forEach(q => {
    if (q.sources) {
      q.sources.forEach(source => {
        sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      });
    }
  });

  return Object.entries(sourceCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([source, count]) => ({ source, count }));
}

function getResponseTimeDistribution(queries) {
  const buckets = { fast: 0, medium: 0, slow: 0 };

  queries.forEach(q => {
    if (q.responseTime < 2000) buckets.fast++;
    else if (q.responseTime < 5000) buckets.medium++;
    else buckets.slow++;
  });

  return buckets;
}

function getSourcesUsage(queries) {
  const ragQueries = queries.filter(q => q.mode === 'rag');
  return ragQueries.map(q => q.sources || []).flat();
}

function getTopPerformingSources(queries) {
  const sourcePerformance = {};

  queries.filter(q => q.mode === 'rag' && q.confidence && q.sources).forEach(q => {
    q.sources.forEach(source => {
      if (!sourcePerformance[source]) {
        sourcePerformance[source] = { total: 0, confidenceSum: 0 };
      }
      sourcePerformance[source].total++;
      sourcePerformance[source].confidenceSum += q.confidence;
    });
  });

  return Object.entries(sourcePerformance)
    .map(([source, data]) => ({
      source,
      avgConfidence: data.confidenceSum / data.total,
      usageCount: data.total
    }))
    .sort((a, b) => b.avgConfidence - a.avgConfidence)
    .slice(0, 5);
}

function getLowPerformingSources(queries) {
  return getTopPerformingSources(queries).reverse();
}

function getMostAskedQuestions(queries) {
  const questionCounts = {};

  queries.forEach(q => {
    const normalized = q.question.toLowerCase().trim();
    questionCounts[normalized] = (questionCounts[normalized] || 0) + 1;
  });

  return Object.entries(questionCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([question, count]) => ({ question, count }));
}

function getQuestionTypes(queries) {
  const types = { factual: 0, procedural: 0, exploratory: 0 };

  queries.forEach(q => {
    const question = q.question.toLowerCase();
    if (question.includes('què') || question.includes('qui') || question.includes('quan')) {
      types.factual++;
    } else if (question.includes('com') || question.includes('on')) {
      types.procedural++;
    } else {
      types.exploratory++;
    }
  });

  return types;
}

function getSessionLengths(queries) {
  const sessions = {};

  queries.forEach(q => {
    if (q.sessionId) {
      sessions[q.sessionId] = (sessions[q.sessionId] || 0) + 1;
    }
  });

  const lengths = Object.values(sessions);
  return {
    average: lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0,
    median: lengths.length > 0 ? lengths.sort()[Math.floor(lengths.length / 2)] : 0,
    longest: Math.max(...lengths, 0)
  };
}

function generateTrends(queries, days) {
  const trends = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const dayQueries = queries.filter(q => {
      const qDate = new Date(q.timestamp);
      return qDate >= dayStart && qDate < dayEnd;
    });

    trends.push({
      date: dayStart.toISOString().split('T')[0],
      totalQueries: dayQueries.length,
      ragQueries: dayQueries.filter(q => q.mode === 'rag').length,
      avgConfidence: dayQueries.length > 0 ?
        dayQueries.filter(q => q.confidence).reduce((sum, q) => sum + q.confidence, 0) / dayQueries.length : 0,
      avgResponseTime: dayQueries.length > 0 ?
        dayQueries.reduce((sum, q) => sum + (q.responseTime || 0), 0) / dayQueries.length : 0
    });
  }

  return trends;
}

// =============================================================================
// CONTENT MANAGEMENT HELPERS
// =============================================================================

async function getContentSourcesStatus() {
  const sources = getAvailableSources();
  const statusChecks = await Promise.allSettled(
    sources.map(async (source) => {
      try {
        const url = source.includes('http') ? source : `https://${source}`;
        const response = await fetch(url, { method: 'HEAD', timeout: 5000 });
        return {
          source,
          status: response.ok ? 'online' : 'error',
          lastCheck: new Date().toISOString(),
          responseCode: response.status
        };
      } catch (error) {
        return {
          source,
          status: 'error',
          lastCheck: new Date().toISOString(),
          error: error.message
        };
      }
    })
  );

  return statusChecks.map(result => result.value);
}

async function getLastScrapeResults() {
  // Return last few content updates from analytics data
  return analyticsData.contentUpdates.slice(-5).map(update => ({
    id: update.id,
    timestamp: update.startTime,
    status: update.status,
    documentsProcessed: update.documentsProcessed || 0,
    duration: update.endTime ?
      new Date(update.endTime) - new Date(update.startTime) : null,
    error: update.error
  }));
}

async function getContentStatistics() {
  if (!GuimeraRAGEngine) {
    return {
      totalVectors: 0,
      vectorDimensions: 0,
      indexSize: 'no disponible',
      lastUpdate: await getLastContentUpdate(),
      error: 'Sistema RAG no disponible'
    };
  }

  try {
    const ragEngine = new GuimeraRAGEngine();
    await ragEngine.initialize();
    const stats = await ragEngine.getStats();

    return {
      totalVectors: stats?.totalVectors || 0,
      vectorDimensions: stats?.dimension || 0,
      indexSize: stats?.indexSize || 'unknown',
      lastUpdate: await getLastContentUpdate()
    };
  } catch (error) {
    return {
      totalVectors: 0,
      vectorDimensions: 0,
      indexSize: 'error',
      lastUpdate: null,
      error: error.message
    };
  }
}

async function getPendingUpdates() {
  // Check for running updates
  const runningUpdates = analyticsData.contentUpdates.filter(u => u.status === 'running');

  return runningUpdates.map(update => ({
    id: update.id,
    startTime: update.startTime,
    sources: update.sources,
    priority: update.priority,
    estimatedCompletion: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 min estimate
  }));
}

// =============================================================================
// HEALTH CHECK HELPERS
// =============================================================================

async function checkDatabaseHealth() {
  if (!GuimeraRAGEngine) {
    return { status: 'disabled', connection: 'no disponible' };
  }

  try {
    const ragEngine = new GuimeraRAGEngine();
    await ragEngine.initialize();
    return { status: 'healthy', connection: 'active' };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}

async function checkExternalServices() {
  const services = [
    { name: 'OpenAI API', endpoint: 'https://api.openai.com/v1/models' },
    { name: 'Pinecone', endpoint: 'https://api.pinecone.io/stats' }
  ];

  const checks = await Promise.allSettled(
    services.map(async (service) => {
      try {
        const response = await fetch(service.endpoint, {
          method: 'HEAD',
          timeout: 5000,
          headers: service.name === 'OpenAI API' ? {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          } : {}
        });

        return {
          service: service.name,
          status: response.ok ? 'healthy' : 'degraded',
          responseTime: Date.now()
        };
      } catch (error) {
        return {
          service: service.name,
          status: 'error',
          error: error.message
        };
      }
    })
  );

  return checks.map(result => result.value);
}

async function checkContentHealth() {
  const lastUpdate = await getLastContentUpdate();
  const updateAge = Date.now() - new Date(lastUpdate).getTime();
  const daysSinceUpdate = updateAge / (24 * 60 * 60 * 1000);

  return {
    lastUpdate,
    daysSinceUpdate: Math.round(daysSinceUpdate),
    freshness: daysSinceUpdate < 7 ? 'fresh' : daysSinceUpdate < 30 ? 'aging' : 'stale'
  };
}

async function checkPerformanceHealth() {
  const recentQueries = analyticsData.queries.filter(q =>
    new Date(q.timestamp) > new Date(Date.now() - 60 * 60 * 1000) // Last hour
  );

  const avgResponseTime = calculateAvgResponseTime(recentQueries);
  const errorRate = recentQueries.filter(q => q.error).length / recentQueries.length;

  return {
    avgResponseTime,
    errorRate: errorRate || 0,
    status: avgResponseTime < 3000 && errorRate < 0.05 ? 'healthy' : 'degraded',
    recentQueries: recentQueries.length
  };
}

function getSystemResources() {
  return {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    platform: process.platform,
    nodeVersion: process.version
  };
}

function determineOverallHealth(health) {
  const components = [health.rag, health.database, health.performance];
  const hasErrors = components.some(c => c.status === 'error');
  const hasDegraded = components.some(c => c.status === 'degraded');

  if (hasErrors) return 'error';
  if (hasDegraded) return 'degraded';
  return 'healthy';
}

async function detectSystemIssues(ragStats, recentQueries) {
  const issues = [];

  // Check RAG system
  if (!ragStats || ragStats.totalVectors === 0) {
    issues.push({
      type: 'no-content',
      severity: 'high',
      message: 'No vectors in RAG system - content needs to be indexed'
    });
  }

  // Check performance
  const avgResponseTime = calculateAvgResponseTime(recentQueries);
  if (avgResponseTime > 5000) {
    issues.push({
      type: 'slow-performance',
      severity: 'medium',
      message: `Average response time is ${avgResponseTime}ms (>5s threshold)`
    });
  }

  // Check error rate
  const errorRate = recentQueries.filter(q => q.error).length / (recentQueries.length || 1);
  if (errorRate > 0.1) {
    issues.push({
      type: 'high-error-rate',
      severity: 'high',
      message: `Error rate is ${Math.round(errorRate * 100)}% (>10% threshold)`
    });
  }

  // Check content freshness
  const contentHealth = await assessContentFreshness();
  if (contentHealth.daysSinceUpdate > 7) {
    issues.push({
      type: 'stale-content',
      severity: 'low',
      message: `Content not updated for ${contentHealth.daysSinceUpdate} days`
    });
  }

  return issues;
}

async function assessContentFreshness() {
  const lastUpdate = await getLastContentUpdate();
  const daysSinceUpdate = (Date.now() - new Date(lastUpdate).getTime()) / (24 * 60 * 60 * 1000);

  return {
    lastUpdate,
    daysSinceUpdate: Math.round(daysSinceUpdate),
    status: daysSinceUpdate < 3 ? 'fresh' : daysSinceUpdate < 7 ? 'good' : 'stale'
  };
}

// =============================================================================
// STUB FUNCTIONS
// =============================================================================

async function getLastContentUpdate() {
  // Check for recent content updates in analytics
  const recentUpdates = analyticsData.contentUpdates
    .filter(u => u.status === 'completed')
    .sort((a, b) => new Date(b.endTime) - new Date(a.endTime));

  return recentUpdates.length > 0
    ? recentUpdates[0].endTime
    : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function getAvailableSources() {
  return ['guimera.info', 'guimera.blog', 'agora.xtec.cat', 'miradesalvent.blogspot.com'];
}

async function checkRAGHealth() {
  if (!GuimeraRAGEngine) {
    return {
      status: 'disabled',
      vectorCount: 0,
      lastUpdate: null,
      message: 'Sistema RAG no disponible'
    };
  }

  try {
    const ragEngine = new GuimeraRAGEngine();
    await ragEngine.initialize();
    const stats = await ragEngine.getStats();
    return {
      status: stats ? 'healthy' : 'degraded',
      vectorCount: stats?.totalVectors || 0,
      lastUpdate: await getLastContentUpdate()
    };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}

module.exports = router;