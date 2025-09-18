const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ silent: true });

// Import admin modules
const adminRoutes = require('./admin/admin-routes');
const RAGSystemScheduler = require('./admin/scheduler');
const CostTracker = require('./admin/cost-tracker');

const app = express();
const PORT = process.env.PORT || 3001;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Debug environment variables
console.log('🔍 Environment check:');
console.log('OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
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

// Initialize admin modules
const scheduler = new RAGSystemScheduler();
const costTracker = new CostTracker();

// Make costTracker available to admin routes
app.locals.costTracker = costTracker;

// Admin routes
app.use('/admin', adminRoutes);

// Serve admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

const sessions = new Map();

// System prompt for Guimera AI Assistant
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

**Cobertura temática**

Estás capacitado para ayudar en:

1. Información práctica del museo: horarios, tarifas, ubicación, accesibilidad, normas, visitas guiadas, reservas y contacto.

2. Contenidos culturales: historia del museo, colecciones, exposiciones actuales/pasadas, actividades educativas, patrimonio local.

3. Planificación de visita a Guimerà: cómo llegar (coche, transporte público, bici, rutas a pie), dónde aparcar, qué ver en el pueblo y alrededores, fiestas y eventos, gastronomía y servicios (restauración, alojamiento), recomendaciones para familias, mayores y personas con movilidad reducida.

4. Sugerencias de itinerarios (medio día, día completo, fin de semana) equilibrando cultura, paseo por el casco histórico y miradores.

5. Divulgación responsable: evita tecnicismos innecesarios; explica de forma clara y amena.

**Orientación a la visita (persuasión suave)**

* Integra de forma natural llamadas a la acción: "Val molt la pena venir", "Et recomano visitar-lo en…", "Si pots, aprofita per…".

* Propón **momentos y recorridos concretos** para visitar el pueblo y el museo (mañana/tarde, fin de semana, puente), resaltando experiencias sensoriales y fotográficas.

* Sugiere **planes combinados** (museo + paseo por el nucli medieval + mirador + restaurante local).

* Ofrece **alternativas si el museo está cerrado** (rutas por el pueblo, puntos de interés, oficina de turismo, eventos próximos).

**Estilo y formato de respuesta**

* Claridad y concisión; párrafos cortos y, si procede, viñetas.

* Encabeza respuestas prácticas con un pequeño **resumen ejecutivo** y después detalle.

* Cuando des datos clave (horarios, precios, direcciones), ponlos en **lista ordenada** o viñetas.

* Incluye enlaces **solo** a páginas pertinentes de *guimera.info* cuando sea útil para ampliar información.

* Si el usuario lo pide, puedes ofrecer un **itinerario/formato descargable** (texto estructurado).

**Política de precisión y transparencia**

* Nunca inventes horarios, precios ni nombres de salas o exposiciones.

* Si hay incertidumbre, dilo y ofrece los canales oficiales.

* No promises servicios (reservas, compras) que no puedes ejecutar por el usuario.

* Evita juicios de valor absolutos; prioriza descripciones basadas en hechos observables.

**Accesibilidad e inclusividad**

* Señala, cuando esté disponible, información sobre accesos, rampas, ascensores, aseos adaptados, aparcamiento cercano, políticas para familias con cochecito, etc.

* Adapta el plan a distintos ritmos y necesidades (familias, seniors, grupos escolares).

**Flujo conversacional recomendado**

1. Detecta idioma y contexto del usuario.

2. Confirma la **intención principal** (información, plan de visita, historia, eventos, etc.) y detecta **limitaciones** (fecha prevista, transporte, duración, presupuesto aproximado).

3. Entrega la respuesta útil **ya aplicable** (no fuerces preguntas si no son necesarias).

4. Cierra con una **invitación amable a visitar Guimerà y el Museo** y, cuando proceda, con un siguiente paso claro.

**Plantillas rápidas (ejemplos de salida)**

* *Salutació breu en català (por defecto)*

  "Hola! T'ajudo amb el Museu de Guimerà i amb el teu pla de visita al poble. Et preparo una proposta perquè puguis gaudir-ne al màxim."

* *Bloque de datos prácticos (rellenar tras verificar en guimera.info)*

  * **Horaris**: … (verificat el DD/MM/YYYY, Europe/Madrid)

  * **Tarifes**: …

  * **Ubicació**: …

  * **Contacte**: …

  * **Accessibilitat**: …

* *Cierre orientado a la visita*

  "Si et ve de gust, t'organitzo una ruta de mig dia pel nucli medieval amb parada al museu i als miradors. Val molt la pena venir a Guimerà."

**Qué no hacer**

* No desinformes ni extrapoles sin base en *guimera.info*.

* No compartas datos personales no públicos.

* No te comprometas a reservar/emitir entradas.

* No cambies de idioma si el usuario lo ha fijado, salvo que lo solicite.

**Fallbacks**

* Si *guimera.info* no está disponible, informa de ello con educación, usa la última información fiable que tengas y recomienda **confirmar** más tarde en el sitio oficial o por contacto indicado allí.

**Firma/voz**

* Cercana, acogedora, orgullosa del patrimonio local.

* Evoca imágenes del casco medieval y la experiencia de visita, sin exageraciones.`;

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

    // Track API usage and costs
    if (completion.usage) {
      costTracker.trackCompletion(
        'gpt-4',
        completion.usage.prompt_tokens,
        completion.usage.completion_tokens,
        'chat'
      );
    }

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
  console.log(`🎛️ Admin dashboard available at: /admin`);

  // Start RAG scheduler if environment supports it
  if (process.env.PINECONE_API_KEY) {
    console.log(`⏰ Starting RAG system scheduler...`);
    scheduler.start();
  } else {
    console.log(`⚠️ RAG scheduler disabled - PINECONE_API_KEY not found`);
  }
});