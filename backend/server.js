const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const GuimeraRAGEngine = require('./rag-engine');
const MCPGuimeraRAGEngine = require('./mcp-rag-engine');
const CostTracker = require('./admin/cost-tracker');
const adminRoutes = require('./admin/admin-routes');
require('dotenv').config({ silent: true });

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize RAG Engines and Cost Tracker
const ragEngine = new GuimeraRAGEngine();
const mcpRagEngine = new MCPGuimeraRAGEngine();
const costTracker = new CostTracker();
let ragReady = false;
let mcpRagReady = false;

// MCP Tools wrapper for Pinecone operations
const mcpTools = {
  async describeIndexStats(indexName) {
    try {
      // Use the MCP function directly
      return await global.mcpDescribeIndexStats?.({ name: indexName }) || { totalVectorCount: 0, dimension: 0 };
    } catch (error) {
      console.error('MCP describe index stats error:', error.message);
      return { totalVectorCount: 0, dimension: 0 };
    }
  },

  async upsertRecords(indexName, namespace, records) {
    try {
      return await global.mcpUpsertRecords?.({ name: indexName, namespace, records }) || { upsertedCount: records.length };
    } catch (error) {
      console.error('MCP upsert error:', error.message);
      throw error;
    }
  },

  async searchRecords(config) {
    try {
      return await global.mcpSearchRecords?.(config) || { matches: [] };
    } catch (error) {
      console.error('MCP search error:', error.message);
      return { matches: [] };
    }
  },

  async rerankDocuments(model, query, documents, options = {}) {
    try {
      return await global.mcpRerankDocuments?.({ model, query, documents, options }) || { results: [] };
    } catch (error) {
      console.error('MCP rerank error:', error.message);
      return { results: [] };
    }
  }
};

// Initialize RAG on startup
async function initializeRAG() {
  try {
    // Initialize standard RAG engine
    await ragEngine.initialize();
    ragReady = true;
    console.log('🤖 Standard RAG Engine ready');

    // Try to initialize MCP RAG engine
    try {
      mcpRagEngine.initialize(mcpTools);
      mcpRagReady = true;
      console.log('🚀 MCP RAG Engine ready');
    } catch (mcpError) {
      console.log('⚠️ MCP RAG Engine not available, using standard RAG only');
      mcpRagReady = false;
    }
  } catch (error) {
    console.error('⚠️ RAG Engine initialization failed, falling back to regular mode');
    ragReady = false;
    mcpRagReady = false;
  }
}

// Debug environment variables
console.log('🔍 Environment check:');
console.log('OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
console.log('PINECONE_API_KEY exists:', !!process.env.PINECONE_API_KEY);
console.log('CORS_ORIGIN:', process.env.CORS_ORIGIN);
console.log('PORT:', process.env.PORT);

// Parse CORS origins
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:5173'];

console.log('🌐 CORS origins:', corsOrigins);

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
app.use(express.json());

// Store cost tracker in app locals for admin routes
app.locals.costTracker = costTracker;
app.locals.ragEngine = ragEngine;

// Admin authentication middleware
const adminAuth = (req, res, next) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  const validToken = process.env.ADMIN_TOKEN || 'guimera-admin-2024';

  if (token !== validToken) {
    return res.status(401).json({ error: 'No autoritzat. Es requereix accés d\'administrador.' });
  }
  next();
};

// Admin dashboard route (protected)
app.get('/admin/dashboard.html', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

// Admin API routes
app.use('/api/admin', adminRoutes);

const sessions = new Map();

// Enhanced chat endpoint with RAG
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId, useRAG = true, useMCP = false, rerankModel = 'pinecone-rerank-v0' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const currentSessionId = sessionId || crypto.randomUUID();

    if (!sessions.has(currentSessionId)) {
      sessions.set(currentSessionId, {
        messages: [],
        ragHistory: []
      });
    }

    const session = sessions.get(currentSessionId);

    // Determine which RAG engine to use
    const shouldUseMCP = useMCP && mcpRagReady && process.env.PINECONE_API_KEY;
    const shouldUseRAG = useRAG && ragReady && process.env.PINECONE_API_KEY;

    let response, sources = [], confidence = 0, searchResults = 0, engine = 'standard';

    if (shouldUseMCP) {
      try {
        console.log('🚀 Using MCP RAG mode with reranking');
        const ragResponse = await mcpRagEngine.query(message, {
          useReranking: true,
          rerankModel: rerankModel
        });

        response = ragResponse.answer;
        sources = ragResponse.sources;
        confidence = ragResponse.confidence;
        searchResults = ragResponse.searchResults;
        engine = 'mcp';
      } catch (mcpError) {
        console.error('MCP RAG query failed, falling back to standard RAG:', mcpError.message);
        if (shouldUseRAG) {
          const ragResponse = await ragEngine.query(message);
          response = ragResponse.answer;
          sources = ragResponse.sources;
          confidence = ragResponse.confidence;
          searchResults = ragResponse.searchResults;
          engine = 'standard-fallback';
        } else {
          response = await getStandardResponse(message, session);
          engine = 'gpt-only';
        }
      }
    } else if (shouldUseRAG) {
      try {
        console.log('🔍 Using standard RAG mode');
        const ragResponse = await ragEngine.query(message);

        response = ragResponse.answer;
        sources = ragResponse.sources;
        confidence = ragResponse.confidence;
        searchResults = ragResponse.searchResults;
        engine = 'standard';

        // Store RAG query in session
        session.ragHistory.push({
          question: message,
          answer: response,
          sources: sources.length,
          confidence,
          engine,
          timestamp: new Date()
        });

      } catch (ragError) {
        console.error('RAG query failed, falling back to standard mode:', ragError.message);
        response = await getStandardResponse(message, session);
        engine = 'gpt-only';
      }
    } else {
      console.log('💬 Using standard mode');
      response = await getStandardResponse(message, session);
      engine = 'gpt-only';
    }

    // Add to conversation history
    session.messages.push(
      { role: 'user', content: message },
      { role: 'assistant', content: response }
    );

    // Keep only last 20 messages
    if (session.messages.length > 20) {
      session.messages = session.messages.slice(-20);
    }

    // Store session activity
    session.lastActivity = new Date();

    const responseData = {
      response,
      sessionId: currentSessionId,
      timestamp: new Date().toISOString(),
      mode: engine,
      engine: engine
    };

    // Include RAG metadata if available
    if (shouldUseRAG && sources.length > 0) {
      responseData.ragMetadata = {
        sources: sources.slice(0, 3), // Top 3 sources
        confidence,
        searchResults,
        totalSources: sources.length
      };
    }

    res.json(responseData);

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Failed to process chat message',
      details: error.message
    });
  }
});

// Standard OpenAI response (fallback)
async function getStandardResponse(message, session) {
  const { OpenAI } = require('openai');
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const SYSTEM_PROMPT = `# Prompt de sistema — Experto del Museo Guimerà

**Rol y misión**

Eres un/a guía experto/a del **Museo Guimerà** y del pueblo de **Guimerà (Urgell, Catalunya)**. Tu objetivo es informar con rigor, resolver dudas con rapidez y, siempre que sea útil, **invitar y motivar** a la visita presencial al pueblo y al museo.

**Idioma**

* Responde **siempre en el idioma del usuario**.
* **Por defecto, utiliza catalán** si el usuario no especifica idioma o escribe en catalán.
* Mantén un tono cálido, cercano y profesional, propio de una oficina de turismo y de un museo local.

**Fuentes autorizadas y verificación**

* Tu **fuente principal** es el sitio oficial: **[https://www.guimera.info/](https://www.guimera.info/)**.
* Para datos cambiantes (horarios, tarifas, eventos, contactos, cómo llegar, servicios), **verifica en tiempo real** en la web antes de responder.
* Si una información no está en la web o no es concluyente, dilo con claridad y ofrece alternativas de contacto oficial.
* Incluye, cuando aportes datos prácticos, la **fecha de verificación** (zona horaria Europe/Madrid).

IMPORTANTE: Indica al usuario que pronto tendrás acceso a información actualizada directamente de guimera.info para ofrecer respuestas más precisas.`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...session.messages.slice(-10), // Last 10 messages for context
    { role: 'user', content: message }
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages,
    max_tokens: 500,
    temperature: 0.7
  });

  // Track API usage and costs
  if (completion.usage) {
    costTracker.trackCompletion(
      'gpt-4',
      completion.usage.prompt_tokens,
      completion.usage.completion_tokens,
      'chat'
    );
  }

  return completion.choices[0].message.content;
}

// Session endpoint
app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const userMessages = session.messages
    .filter(msg => msg.role !== 'system')
    .map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: new Date()
    }));

  res.json({
    sessionId,
    messages: userMessages,
    lastActivity: session.lastActivity,
    ragQueries: session.ragHistory?.length || 0
  });
});

// Enhanced health endpoint
app.get('/api/health', async (req, res) => {
  let ragStats = null;
  let mcpStats = null;

  if (ragReady) {
    try {
      ragStats = await ragEngine.getStats();
    } catch (error) {
      console.error('Error getting RAG stats:', error.message);
    }
  }

  if (mcpRagReady) {
    try {
      mcpStats = await mcpRagEngine.getStats();
    } catch (error) {
      console.error('Error getting MCP stats:', error.message);
    }
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    pineconeConfigured: !!process.env.PINECONE_API_KEY,
    ragEnabled: ragReady,
    mcpRagEnabled: mcpRagReady,
    ragStats,
    mcpStats,
    engines: {
      standard: ragReady,
      mcp: mcpRagReady,
      capabilities: mcpRagReady ? mcpRagEngine.getMCPCapabilities() : null
    },
    model: 'gpt-4',
    sessionsActive: sessions.size
  });
});

// RAG management endpoints
app.post('/api/rag/reindex', async (req, res) => {
  if (!ragReady) {
    return res.status(503).json({ error: 'RAG system not available' });
  }

  try {
    let scraper;
    let content;

    // Always use SimpleScraper for now (Playwright has path issues on Render)
    console.log('Using HTTP scraper for reliable content extraction');
    const SimpleScraper = require('./simple-scraper');
    scraper = new SimpleScraper();
    content = await scraper.scrapeAllSources();

    // Embed and store
    await ragEngine.embedAndStore(content);

    res.json({
      success: true,
      message: 'Reindexing completed',
      documentsProcessed: content.length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Reindexing failed',
      details: error.message
    });
  }
});

app.get('/api/rag/stats', async (req, res) => {
  if (!ragReady) {
    return res.status(503).json({ error: 'RAG system not available' });
  }

  try {
    const stats = await ragEngine.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get RAG stats',
      details: error.message
    });
  }
});

// MCP-specific endpoints
app.get('/api/mcp/stats', async (req, res) => {
  if (!mcpRagReady) {
    return res.status(503).json({ error: 'MCP RAG system not available' });
  }

  try {
    const stats = await mcpRagEngine.getStats();
    const capabilities = mcpRagEngine.getMCPCapabilities();
    res.json({
      ...stats,
      capabilities
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get MCP stats',
      details: error.message
    });
  }
});

app.post('/api/mcp/reindex', async (req, res) => {
  if (!mcpRagReady) {
    return res.status(503).json({ error: 'MCP RAG system not available' });
  }

  try {
    let scraper;
    let content;

    console.log('Using MCP RAG engine for reindexing with auto-embedding');
    const SimpleScraper = require('./simple-scraper');
    scraper = new SimpleScraper();
    content = await scraper.scrapeAllSources();

    // Use MCP RAG engine for embedding and storage
    await mcpRagEngine.embedAndStore(content);

    res.json({
      success: true,
      message: 'MCP reindexing completed',
      documentsProcessed: content.length,
      engine: 'mcp',
      features: ['auto-embedding', 'advanced-metadata']
    });
  } catch (error) {
    res.status(500).json({
      error: 'MCP reindexing failed',
      details: error.message
    });
  }
});

app.post('/api/mcp/benchmark', async (req, res) => {
  const { query = 'Què és el Museu Guimerà?', iterations = 3 } = req.body;

  if (!mcpRagReady || !ragReady) {
    return res.status(503).json({
      error: 'Both RAG systems must be available for benchmarking',
      available: { standard: ragReady, mcp: mcpRagReady }
    });
  }

  try {
    console.log(`🏃 Running benchmark: "${query}" (${iterations} iterations)`);

    const results = {
      query,
      iterations,
      timestamp: new Date().toISOString(),
      standard: { times: [], avgTime: 0, avgConfidence: 0 },
      mcp: { times: [], avgTime: 0, avgConfidence: 0 }
    };

    // Benchmark standard RAG
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      const result = await ragEngine.query(query);
      const time = Date.now() - start;
      results.standard.times.push(time);
      results.standard.avgConfidence += result.confidence;
    }

    // Benchmark MCP RAG
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      const result = await mcpRagEngine.query(query, {
        useReranking: true,
        rerankModel: 'pinecone-rerank-v0'
      });
      const time = Date.now() - start;
      results.mcp.times.push(time);
      results.mcp.avgConfidence += result.confidence;
    }

    // Calculate averages
    results.standard.avgTime = results.standard.times.reduce((a, b) => a + b) / iterations;
    results.standard.avgConfidence = results.standard.avgConfidence / iterations;
    results.mcp.avgTime = results.mcp.times.reduce((a, b) => a + b) / iterations;
    results.mcp.avgConfidence = results.mcp.avgConfidence / iterations;

    // Add improvement metrics
    results.improvement = {
      timeRatio: results.standard.avgTime / results.mcp.avgTime,
      confidenceImprovement: results.mcp.avgConfidence - results.standard.avgConfidence,
      recommendation: results.mcp.avgConfidence > results.standard.avgConfidence ? 'mcp' : 'standard'
    };

    res.json(results);
  } catch (error) {
    res.status(500).json({
      error: 'Benchmark failed',
      details: error.message
    });
  }
});

// Clean up old sessions
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [sessionId, session] of sessions.entries()) {
    if (session.lastActivity && session.lastActivity < oneHourAgo) {
      sessions.delete(sessionId);
    }
  }
}, 15 * 60 * 1000);

app.listen(PORT, async () => {
  console.log(`🚀 Enhanced Guimera AI Assistant running on port ${PORT}`);
  console.log(`🔧 OpenAI API configured: ${!!process.env.OPENAI_API_KEY}`);
  console.log(`🔧 Pinecone API configured: ${!!process.env.PINECONE_API_KEY}`);
  console.log(`🤖 Using GPT-4 Chat Completions API`);
  console.log(`🧹 Session cleanup enabled`);

  // Initialize RAG after server starts
  await initializeRAG();
});