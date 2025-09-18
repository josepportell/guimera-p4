const { OpenAI } = require('openai');
const RAG_CONFIG = require('./config');

/**
 * MCP-powered RAG Engine for Guimerà Museum
 * Uses Pinecone MCP for vector operations and advanced reranking
 */
class MCPGuimeraRAGEngine {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.indexName = RAG_CONFIG.vectorDB.indexName;
    this.namespace = RAG_CONFIG.vectorDB.namespace;
    this.mcpAvailable = false;

    // Store reference to MCP tools (injected from server)
    this.mcpTools = null;
  }

  // Initialize with MCP tools reference
  initialize(mcpTools = null) {
    this.mcpTools = mcpTools;
    this.mcpAvailable = !!mcpTools;
    console.log(`🔧 MCP RAG Engine initialized - MCP available: ${this.mcpAvailable}`);
  }

  // Embed and store content using MCP upsert
  async embedAndStore(content) {
    console.log(`📚 Embedding and storing ${content.length} chunks via MCP...`);

    if (!this.mcpAvailable) {
      throw new Error('MCP tools not available for embedding');
    }

    const batches = this.createBatches(content, RAG_CONFIG.embedding.batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`Processing batch ${i + 1}/${batches.length} via MCP...`);

      try {
        // Prepare records for MCP upsert
        const records = batch.map(chunk => ({
          id: chunk.id,
          text: chunk.content, // MCP will auto-embed this
          ...chunk.metadata,
          // Store additional metadata
          originalContent: chunk.content,
          chunkLength: chunk.content.length,
          indexed_at: new Date().toISOString()
        }));

        // Use MCP to upsert records
        const result = await this.mcpTools.upsertRecords(
          this.indexName,
          this.namespace,
          records
        );

        console.log(`✅ Batch ${i + 1} processed: ${result.upsertedCount || records.length} records`);

      } catch (error) {
        console.error(`❌ Error processing batch ${i + 1}:`, error.message);
        // Continue with next batch
      }

      // Rate limiting
      await this.delay(1000);
    }

    console.log('✅ All content embedded and stored via MCP');
  }

  // Enhanced query with MCP search and reranking
  async query(userQuestion, options = {}) {
    const {
      topK = RAG_CONFIG.vectorDB.topK,
      useReranking = true,
      minScore = 0.7,
      rerankModel = 'pinecone-rerank-v0', // Best Pinecone reranker
      rerankTopN = 5
    } = options;

    try {
      console.log(`🔍 Processing MCP query: "${userQuestion}"`);

      if (!this.mcpAvailable) {
        throw new Error('MCP tools not available for querying');
      }

      // Prepare MCP search query
      const searchQuery = {
        topK: useReranking ? Math.min(topK * 3, 50) : topK, // Get more for reranking
        inputs: { text: userQuestion }
      };

      let searchConfig = {
        name: this.indexName,
        namespace: this.namespace,
        query: searchQuery
      };

      // Add reranking if enabled
      if (useReranking) {
        searchConfig.rerank = {
          model: rerankModel,
          topN: rerankTopN,
          rankFields: ['text'], // Field to rerank on
          query: userQuestion // Reranking query (can be different from search)
        };
      }

      // Execute MCP search with integrated reranking
      const searchResults = await this.mcpTools.searchRecords(searchConfig);

      console.log(`📊 MCP search found ${searchResults.matches?.length || 0} results`);

      // Filter by relevance score
      const relevantResults = (searchResults.matches || []).filter(
        match => (match.score || 0) >= minScore
      );

      if (relevantResults.length === 0) {
        return {
          answer: "No he trobat informació específica sobre aquesta pregunta en les fonts de guimera.info. Podries reformular la pregunta o ser més específic?",
          sources: [],
          confidence: 0,
          searchResults: 0,
          method: 'mcp',
          reranked: useReranking,
          model: rerankModel
        };
      }

      // Generate enhanced answer
      const answer = await this.generateAnswer(userQuestion, relevantResults, {
        reranked: useReranking,
        model: rerankModel
      });

      return {
        ...answer,
        method: 'mcp',
        reranked: useReranking,
        model: rerankModel
      };

    } catch (error) {
      console.error('❌ MCP query error:', error.message);
      throw error;
    }
  }

  // Enhanced answer generation with MCP metadata
  async generateAnswer(question, searchResults, options = {}) {
    const context = this.prepareEnhancedContext(searchResults);
    const sources = this.extractEnhancedSources(searchResults);

    const systemPrompt = `# Guia Expert del Museu Guimerà - Mode MCP Avançat

Ets un/a guía expert/a del Museu Guimerà i del poble de Guimerà. Utilitza la informació proporcionada per generar respostes precises i útils.

## Instruccions avançades:
1. Respon en CATALÀ per defecte (excepte si l'usuari pregunta en un altre idioma)
2. Utilitza la informació del context, prioritzant les fonts amb major puntuació
3. Combina informació de múltiples fonts quan sigui coherent
4. Proporciona respostes detallades però concises
5. Inclou referències específiques quan sigui apropiat
6. Mantén un to càlid, professional i acollidor
7. Invita a visitar Guimerà quan sigui rellevant

## Metadades del sistema:
- Motor de cerca: Pinecone MCP amb ${options.reranked ? `reranking ${options.model}` : 'puntuació de similitud'}
- Fonts analitzades: ${sources.length}
- Confiança del sistema: ${this.calculateEnhancedConfidence(searchResults).toFixed(3)}

## Context disponible (ordenat per rellevància):
${context}

## Fonts consultades:
${sources.map((s, i) => `${i + 1}. ${s.title} (${s.source}) - Puntuació: ${s.relevanceScore.toFixed(3)}`).join('\n')}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      max_tokens: 900,
      temperature: 0.3
    });

    return {
      answer: response.choices[0].message.content,
      sources: sources,
      confidence: this.calculateEnhancedConfidence(searchResults),
      searchResults: searchResults.length,
      enhanced: true
    };
  }

  // Enhanced context preparation with MCP metadata
  prepareEnhancedContext(searchResults) {
    return searchResults
      .map((result, index) => {
        const metadata = result.metadata || result;
        const content = metadata.originalContent || metadata.text || metadata.content || 'Contingut no disponible';

        return `## Font ${index + 1}: ${metadata.title || 'Sense títol'}
📊 Puntuació de rellevància: ${(result.score || 0).toFixed(3)}
🔗 URL: ${metadata.url || 'N/A'}
📁 Tipus: ${metadata.sourceType || 'web'}
📅 Data: ${metadata.publishedDate || 'N/A'}
👤 Autor: ${metadata.author || 'N/A'}

💬 Contingut:
${content.substring(0, 800)}${content.length > 800 ? '...' : ''}

---`;
      })
      .join('\n');
  }

  // Enhanced source extraction
  extractEnhancedSources(searchResults) {
    const uniqueSources = new Map();

    searchResults.forEach(result => {
      const metadata = result.metadata || result;
      const sourceKey = metadata.url || result.id || `source-${Date.now()}`;

      if (!uniqueSources.has(sourceKey)) {
        uniqueSources.set(sourceKey, {
          title: metadata.title || 'Sense títol',
          url: metadata.url || '',
          source: metadata.source || 'guimera.info',
          sourceType: metadata.sourceType || 'web',
          author: metadata.author,
          publishedDate: metadata.publishedDate,
          relevanceScore: result.score || 0,
          chunkLength: metadata.chunkLength || 0,
          indexed_at: metadata.indexed_at
        });
      } else {
        // Update with higher score if found
        const existing = uniqueSources.get(sourceKey);
        if ((result.score || 0) > existing.relevanceScore) {
          existing.relevanceScore = result.score || 0;
        }
      }
    });

    return Array.from(uniqueSources.values())
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  // Enhanced confidence calculation for MCP results
  calculateEnhancedConfidence(searchResults) {
    if (searchResults.length === 0) return 0;

    const scores = searchResults.map(r => r.score || 0);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);

    // Base confidence from scores
    const baseConfidence = (maxScore * 0.6) + (avgScore * 0.4);

    // Bonus for consistency (low score variance)
    const scoreVariance = scores.length > 1 ?
      scores.reduce((acc, score) => acc + Math.pow(score - avgScore, 2), 0) / scores.length : 0;
    const consistencyBonus = Math.max(0, 0.1 - scoreVariance);

    // Bonus for multiple sources
    const diversityBonus = Math.min(0.1, searchResults.length * 0.02);

    // MCP reranking bonus (typically improves relevance)
    const mcpBonus = 0.05;

    return Math.min(0.99, baseConfidence + consistencyBonus + diversityBonus + mcpBonus);
  }

  // Get enhanced statistics via MCP
  async getStats() {
    try {
      if (!this.mcpAvailable) {
        return {
          error: 'MCP not available',
          totalVectors: 0,
          method: 'unavailable'
        };
      }

      const stats = await this.mcpTools.describeIndexStats(this.indexName);

      return {
        totalVectors: stats.totalVectorCount || 0,
        dimension: stats.dimension || 0,
        namespaces: stats.namespaces || {},
        enhanced: true,
        method: 'mcp',
        capabilities: [
          'advanced-reranking',
          'multi-model-support',
          'enhanced-search',
          'integrated-embedding'
        ]
      };
    } catch (error) {
      console.error('❌ Error getting MCP stats:', error.message);
      return {
        error: error.message,
        totalVectors: 0,
        method: 'mcp-error'
      };
    }
  }

  // Advanced reranking comparison
  async compareRerankingModels(query, documents) {
    if (!this.mcpAvailable) {
      throw new Error('MCP not available for reranking comparison');
    }

    const models = [
      'pinecone-rerank-v0',
      'bge-reranker-v2-m3',
      'cohere-rerank-3.5'
    ];

    const results = {};

    for (const model of models) {
      try {
        const start = Date.now();
        const reranked = await this.mcpTools.rerankDocuments(
          model,
          query,
          documents,
          { topN: 5 }
        );
        const time = Date.now() - start;

        results[model] = {
          time,
          results: reranked.results || [],
          success: true
        };
      } catch (error) {
        results[model] = {
          error: error.message,
          success: false
        };
      }
    }

    return results;
  }

  // Utility methods
  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Check MCP availability and capabilities
  getMCPCapabilities() {
    return {
      available: this.mcpAvailable,
      features: this.mcpAvailable ? [
        'auto-embedding',
        'integrated-search',
        'advanced-reranking',
        'multiple-rerank-models',
        'enhanced-metadata',
        'index-management'
      ] : [],
      indexName: this.indexName,
      namespace: this.namespace
    };
  }
}

module.exports = MCPGuimeraRAGEngine;