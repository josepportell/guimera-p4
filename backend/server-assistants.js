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

app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const currentSessionId = sessionId || crypto.randomUUID();

    if (!sessions.has(currentSessionId)) {
      sessions.set(currentSessionId, {
        threadId: null,
        messages: []
      });
    }

    const session = sessions.get(currentSessionId);

    let threadId = session.threadId;
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      session.threadId = threadId;
    }

    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message
    });

    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID
    });

    let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);

    while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    }

    if (runStatus.status === 'completed') {
      const messages = await openai.beta.threads.messages.list(threadId);
      const lastMessage = messages.data[0];
      const response = lastMessage.content[0].text.value;

      session.messages.push(
        { role: 'user', content: message, timestamp: new Date() },
        { role: 'assistant', content: response, timestamp: new Date() }
      );

      res.json({
        response,
        sessionId: currentSessionId,
        threadId
      });
    } else {
      throw new Error(`Run failed with status: ${runStatus.status}`);
    }

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

  res.json({
    sessionId,
    messages: session.messages,
    threadId: session.threadId
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    assistantConfigured: !!process.env.OPENAI_ASSISTANT_ID
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Guimera AI Assistant backend running on port ${PORT}`);
  console.log(`🔧 OpenAI API configured: ${!!process.env.OPENAI_API_KEY}`);
  console.log(`🤖 Assistant configured: ${!!process.env.OPENAI_ASSISTANT_ID}`);
});