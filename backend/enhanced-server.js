const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const GuimeraRAGEngine = require('./rag-engine');
const CostTracker = require('./admin/cost-tracker');
const adminRoutes = require('./admin/admin-routes');
require('dotenv').config({ silent: true });

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize RAG Engine and Cost Tracker
const ragEngine = new GuimeraRAGEngine();
const costTracker = new CostTracker();
let ragReady = false;

// Initialize RAG on startup
async function initializeRAG() {
  try {
    await ragEngine.initialize();
    ragReady = true;
    console.log('🤖 RAG Engine ready');
  } catch (error) {
    console.error('⚠️ RAG Engine initialization failed, falling back to regular mode');
    ragReady = false;
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
app.use('/content', adminRoutes);

const sessions = new Map();

// Enhanced chat endpoint with RAG
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId, useRAG = true } = req.body;

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

    // Determine if we should use RAG or fallback
    const shouldUseRAG = useRAG && ragReady && process.env.PINECONE_API_KEY;

    let response, sources = [], confidence = 0, searchResults = 0;

    if (shouldUseRAG) {
      try {
        console.log('🔍 Using RAG mode');
        const ragResponse = await ragEngine.query(message);

        response = ragResponse.answer;
        sources = ragResponse.sources;
        confidence = ragResponse.confidence;
        searchResults = ragResponse.searchResults;

        // Store RAG query in session
        session.ragHistory.push({
          question: message,
          answer: response,
          sources: sources.length,
          confidence,
          timestamp: new Date()
        });

      } catch (ragError) {
        console.error('RAG query failed, falling back to standard mode:', ragError.message);
        response = await getStandardResponse(message, session);
      }
    } else {
      console.log('💬 Using standard mode');
      response = await getStandardResponse(message, session);
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
      mode: shouldUseRAG ? 'rag' : 'standard'
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
  if (ragReady) {
    try {
      ragStats = await ragEngine.getStats();
    } catch (error) {
      console.error('Error getting RAG stats:', error.message);
    }
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    pineconeConfigured: !!process.env.PINECONE_API_KEY,
    ragEnabled: ragReady,
    ragStats,
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

// Progressive indexing endpoint (direct implementation)
app.post('/content/progressive-index', async (req, res) => {
  // Admin authentication
  const token = req.headers['x-admin-token'] || req.query.token;
  const validToken = process.env.ADMIN_TOKEN || 'guimera-admin-2024';

  if (token !== validToken) {
    return res.status(401).json({ error: 'No autoritzat. Es requereix accés d\'administrador.' });
  }

  const { maxPages = 500, source = 'guimera.info', priority = 'normal' } = req.body;
  const indexingId = Date.now().toString();

  try {
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

        const indexerScript = path.join(__dirname, 'progressive-indexer.js');
        console.log(`📄 Running script: ${indexerScript}`);

        const indexingProcess = spawn('node', [indexerScript], {
          cwd: __dirname,
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
          console.log(`Progressive indexing completed with code: ${code}`);
        });

      } catch (error) {
        console.error('Progressive indexing error:', error);
      }
    });

  } catch (error) {
    console.error('Progressive indexing startup error:', error);
    res.status(500).json({
      error: 'Error iniciant la indexació progressiva',
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