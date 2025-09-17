const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173'
}));
app.use(express.json());

const sessions = new Map();

// System prompt for Guimera AI Assistant
const SYSTEM_PROMPT = `Ets l'Assistent IA de Guimera, un expert en la història, cultura i activitats del Museu Guimera. Respon sempre en català i proporciona informació precisa i útil sobre:

- Història del Museu Guimera
- Col·leccions i exposicions
- Activitats i esdeveniments
- Informació pràctica per a visitants
- Patrimoni cultural de la zona

Sigues amable, informatiu i sempre respectuós amb el patrimoni cultural. Si no tens informació específica sobre alguna cosa, ho pots dir honestament i oferir ajuda alternativa.`;

app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const currentSessionId = sessionId || crypto.randomUUID();

    if (!sessions.has(currentSessionId)) {
      sessions.set(currentSessionId, {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT }
        ]
      });
    }

    const session = sessions.get(currentSessionId);

    // Add user message to conversation history
    session.messages.push({ role: 'user', content: message });

    // Keep only last 20 messages to avoid token limits
    if (session.messages.length > 21) { // 1 system + 20 conversation messages
      session.messages = [
        session.messages[0], // Keep system message
        ...session.messages.slice(-20) // Keep last 20 messages
      ];
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: session.messages,
      max_tokens: 500,
      temperature: 0.7
    });

    const response = completion.choices[0].message.content;

    // Add assistant response to conversation history
    session.messages.push({ role: 'assistant', content: response });

    // Store for session retrieval
    const timestamp = new Date();
    session.lastActivity = timestamp;

    res.json({
      response,
      sessionId: currentSessionId,
      timestamp: timestamp.toISOString()
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Failed to process chat message',
      details: error.message
    });
  }
});

app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Filter out system message for frontend display
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
    lastActivity: session.lastActivity
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    model: 'gpt-4',
    sessionsActive: sessions.size
  });
});

// Clean up old sessions (older than 1 hour)
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [sessionId, session] of sessions.entries()) {
    if (session.lastActivity && session.lastActivity < oneHourAgo) {
      sessions.delete(sessionId);
    }
  }
}, 15 * 60 * 1000); // Run every 15 minutes

app.listen(PORT, () => {
  console.log(`🚀 Guimera AI Assistant backend running on port ${PORT}`);
  console.log(`🔧 OpenAI API configured: ${!!process.env.OPENAI_API_KEY}`);
  console.log(`🤖 Using GPT-4 Chat Completions API`);
  console.log(`🧹 Session cleanup enabled`);
});