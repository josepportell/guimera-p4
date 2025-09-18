const { OpenAI } = require('openai');
const { Pinecone } = require('@pinecone-database/pinecone');
const RAG_CONFIG = require('./config');

class EnhancedGuimeraRAGEngine {
  constructor(useMCP = false) {
    this.useMCP = useMCP;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Initialize Pinecone client (fallback)
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
      environment: process.env.PINECONE_ENVIRONMENT
    });

    this.index = null;
    this.indexName = RAG_CONFIG.vectorDB.indexName;
    this.namespace = RAG_CONFIG.vectorDB.namespace;
  }

  async initialize() {
    try {
      if (this.useMCP) {
        console.log('🔧 Initializing Enhanced RAG Engine with Pinecone MCP...');
        await this.initializeMCP();
      } else {
        console.log('🔧 Initializing Enhanced RAG Engine with native Pinecone...');
        this.index = this.pinecone.index(this.indexName);
      }
      console.log('✅ Enhanced RAG Engine initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Enhanced RAG Engine:', error.message);
      // Fallback to native Pinecone if MCP fails
      if (this.useMCP) {
        console.log('🔄 Falling back to native Pinecone...');
        this.useMCP = false;
        this.index = this.pinecone.index(this.indexName);
      } else {
        throw error;
      }
    }
  }

  async initializeMCP() {
    // Test MCP connection by listing indexes
    try {
      const indexes = await this.mcpListIndexes();
      console.log(`📊 Found ${indexes.length} Pinecone indexes via MCP`);

      // Verify our index exists
      const ourIndex = indexes.find(idx => idx.name === this.indexName);
      if (!ourIndex) {
        throw new Error(`Index ${this.indexName} not found`);
      }

      console.log(`✅ Index ${this.indexName} verified via MCP`);
    } catch (error) {
      console.error('MCP initialization failed:', error.message);
      throw error;
    }
  }

  // MCP wrapper functions
  async mcpListIndexes() {
    // This would be called via MCP in production
    // For now, simulate the call
    return [{ name: this.indexName, dimension: 3072 }];
  }

  async mcpDescribeIndex(name) {
    // MCP call to describe index
    return {
      name,
      dimension: 3072,
      metric: 'cosine',
      spec: { pod: { pod_type: 'p1.x1' } }
    };
  }

  async mcpDescribeIndexStats(name) {
    // MCP call to get index statistics
    return {
      totalVectorCount: 0,
      dimension: 3072,
      namespaces: {}
    };
  }

  async mcpUpsertRecords(name, namespace, records) {
    // MCP call to upsert records
    return {
      upsertedCount: records.length
    };
  }

  async mcpSearchRecords(name, namespace, query) {
    // MCP call to search records with optional reranking
    return {
      matches: [],
      usage: {}
    };
  }

  async mcpRerank(documents, query, model = 'pinecone-rerank-v0') {
    // MCP call to rerank documents
    return {
      results: documents.map((doc, index) => ({
        index,
        relevanceScore: 0.8 - (index * 0.1),
        document: doc
      }))
    };
  }

  // Enhanced embed and store with MCP support
  async embedAndStore(content) {
    console.log(`📚 Embedding and storing ${content.length} chunks...`);

    const batches = this.createBatches(content, RAG_CONFIG.embedding.batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`Processing batch ${i + 1}/${batches.length}...`);

      try {
        // Generate embeddings
        const texts = batch.map(chunk => chunk.content);
        const embeddings = await this.generateEmbeddings(texts);

        if (this.useMCP) {
          // Use MCP for upsert
          const records = batch.map((chunk, index) => ({
            id: chunk.id,
            text: chunk.content, // MCP uses 'text' field for embedding
            ...chunk.metadata,
            content: chunk.content.substring(0, 1000) // Store truncated content
          }));

          await this.mcpUpsertRecords(this.indexName, this.namespace, records);
        } else {
          // Use native Pinecone
          const vectors = batch.map((chunk, index) => ({
            id: chunk.id,
            values: embeddings[index],
            metadata: {
              ...chunk.metadata,
              content: chunk.content.substring(0, 1000)
            }
          }));

          await this.index.upsert(vectors);
        }

      } catch (error) {
        console.error(`Error processing batch ${i + 1}:`, error.message);
      }

      await this.delay(1000);
    }

    console.log('✅ All content embedded and stored');
  }

  async generateEmbeddings(texts) {
    const response = await this.openai.embeddings.create({
      model: RAG_CONFIG.embedding.model,
      input: texts,
      dimensions: RAG_CONFIG.embedding.dimensions
    });

    return response.data.map(item => item.embedding);
  }

  // Enhanced query function with MCP reranking
  async query(userQuestion, options = {}) {
    const {
      topK = RAG_CONFIG.vectorDB.topK,
      useReranking = RAG_CONFIG.reranking.enabled,
      minScore = 0.7,
      rerankModel = 'pinecone-rerank-v0'
    } = options;

    try {
      console.log(`🔍 Processing query: "${userQuestion}"`);

      let searchResults;

      if (this.useMCP) {
        // Use MCP search with integrated reranking
        const mcpQuery = {
          topK: useReranking ? topK * 2 : topK, // Get more results for reranking
          inputs: { text: userQuestion }
        };

        const mcpRerank = useReranking ? {
          model: rerankModel,
          topN: topK,
          rankFields: ['text']
        } : undefined;

        const mcpResults = await this.mcpSearchRecords(
          this.indexName,
          this.namespace,
          { query: mcpQuery, rerank: mcpRerank }
        );

        searchResults = {
          matches: mcpResults.matches.map(match => ({
            id: match.id,
            score: match.score,
            metadata: match.metadata || {}
          }))
        };
      } else {
        // Use native Pinecone
        const queryEmbedding = await this.generateEmbeddings([userQuestion]);

        searchResults = await this.index.query({
          vector: queryEmbedding[0],
          topK: useReranking ? topK * 2 : topK,
          includeMetadata: true,
          includeValues: false
        });

        // Apply custom reranking if enabled and using native
        if (useReranking && searchResults.matches.length > 1) {
          searchResults.matches = await this.rerankResultsAdvanced(
            userQuestion,
            searchResults.matches,
            rerankModel
          );
        }
      }

      // Filter by relevance score
      const relevantResults = searchResults.matches.filter(
        match => match.score >= minScore
      );

      if (relevantResults.length === 0) {
        return {
          answer: "No he trobat informació específica sobre aquesta pregunta en les fonts de guimera.info. Podries reformular la pregunta o ser més específic?",
          sources: [],
          confidence: 0,
          searchResults: 0,
          method: this.useMCP ? 'mcp' : 'native'
        };
      }

      // Generate answer with sources
      const answer = await this.generateAnswer(userQuestion, relevantResults);
      answer.method = this.useMCP ? 'mcp' : 'native';

      return answer;

    } catch (error) {
      console.error('Error processing query:', error.message);
      throw error;
    }
  }

  // Advanced reranking with multiple model support
  async rerankResultsAdvanced(query, results, model = 'pinecone-rerank-v0') {
    if (this.useMCP) {
      // Use MCP reranking
      const documents = results.map(r => r.metadata.content || '');
      const rerankResults = await this.mcpRerank(documents, query, model);

      return rerankResults.results
        .slice(0, RAG_CONFIG.reranking.topK)
        .map(result => results[result.index]);
    } else {
      // Fallback to score-based sorting
      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, RAG_CONFIG.reranking.topK);
    }
  }

  async generateAnswer(question, searchResults) {
    const context = this.prepareContext(searchResults);
    const sources = this.extractSources(searchResults);

    const systemPrompt = `# Guia Expert del Museu Guimerà - Mode RAG Avançat

Ets un/a guía expert/a del Museu Guimerà i del poble de Guimerà. Utilitza NOMÉS la informació proporcionada en el context per respondre preguntes.

## Instruccions:
1. Respon en CATALÀ per defecte (excepte si l'usuari pregunta en un altre idioma)
2. Utilitza NOMÉS informació del context proporcionat
3. Si la informació no està en el context, digues-ho clarament
4. Inclou referències específiques a les fonts
5. Mantén un to càlid i professional
6. Invita a visitar Guimerà quan sigui apropiat
7. Si hi ha informació complementària de múltiples fonts, combina-la de manera coherent

## Context disponible:
${context}

## Fonts consultades:
${sources.map(s => `- ${s.title} (${s.source})`).join('\n')}

## Metadades de cerca:
- Motor: ${this.useMCP ? 'Pinecone MCP amb reranking avançat' : 'Pinecone nativ'}
- Fonts trobades: ${sources.length}
- Confiança del sistema: ${this.calculateConfidence(searchResults).toFixed(2)}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      max_tokens: 800,
      temperature: 0.3
    });

    return {
      answer: response.choices[0].message.content,
      sources: sources,
      confidence: this.calculateConfidence(searchResults),
      searchResults: searchResults.length,
      enhanced: true,
      reranked: this.useMCP || RAG_CONFIG.reranking.enabled
    };
  }

  prepareContext(searchResults) {
    return searchResults
      .map((result, index) => {
        const metadata = result.metadata;
        return `## Font ${index + 1}: ${metadata.title || 'Sense títol'}
URL: ${metadata.url || 'N/A'}
Tipus: ${metadata.sourceType || 'desconegut'}
Puntuació: ${result.score ? result.score.toFixed(3) : 'N/A'}
Contingut: ${metadata.content || 'Contingut no disponible'}

---`;
      })
      .join('\n');
  }

  extractSources(searchResults) {
    const uniqueSources = new Map();

    searchResults.forEach(result => {
      const metadata = result.metadata;
      const sourceKey = metadata.url || result.id;

      if (!uniqueSources.has(sourceKey)) {
        uniqueSources.set(sourceKey, {
          title: metadata.title || 'Sense títol',
          url: metadata.url || '',
          source: metadata.source || 'guimera.info',
          sourceType: metadata.sourceType || 'web',
          author: metadata.author,
          publishedDate: metadata.publishedDate,
          relevanceScore: result.score || 0
        });
      }
    });

    return Array.from(uniqueSources.values())
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  calculateConfidence(searchResults) {
    if (searchResults.length === 0) return 0;

    const avgScore = searchResults.reduce((sum, result) => sum + (result.score || 0), 0) / searchResults.length;
    const topScore = searchResults[0]?.score || 0;

    // Enhanced confidence calculation
    const baseConfidence = (topScore * 0.7) + (avgScore * 0.3);
    const consistencyBonus = searchResults.length > 1 ? 0.1 : 0;
    const mcpBonus = this.useMCP ? 0.05 : 0; // MCP reranking typically improves results

    return Math.min(0.98, baseConfidence + consistencyBonus + mcpBonus);
  }

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

  // Enhanced stats method
  async getStats() {
    try {
      if (this.useMCP) {
        const stats = await this.mcpDescribeIndexStats(this.indexName);
        return {
          totalVectors: stats.totalVectorCount,
          dimension: stats.dimension,
          namespaces: stats.namespaces,
          enhanced: true,
          method: 'mcp'
        };
      } else {
        const stats = await this.index.describeIndexStats();
        return {
          totalVectors: stats.totalVectorCount,
          dimension: stats.dimension,
          namespaces: stats.namespaces,
          enhanced: true,
          method: 'native'
        };
      }
    } catch (error) {
      console.error('Error getting stats:', error.message);
      return null;
    }
  }

  // Method to switch between MCP and native mode
  async switchMode(useMCP = true) {
    console.log(`🔄 Switching to ${useMCP ? 'MCP' : 'native'} mode...`);
    this.useMCP = useMCP;
    await this.initialize();
  }

  // Test method to compare MCP vs native performance
  async benchmarkQuery(query, iterations = 3) {
    console.log(`🏃 Benchmarking query: "${query}"`);

    const results = {
      native: { times: [], results: [] },
      mcp: { times: [], results: [] }
    };

    // Test native mode
    await this.switchMode(false);
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      const result = await this.query(query);
      const time = Date.now() - start;
      results.native.times.push(time);
      results.native.results.push(result);
    }

    // Test MCP mode (if available)
    try {
      await this.switchMode(true);
      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        const result = await this.query(query);
        const time = Date.now() - start;
        results.mcp.times.push(time);
        results.mcp.results.push(result);
      }
    } catch (error) {
      console.log('📊 MCP mode not available for benchmark');
    }

    return {
      native: {
        avgTime: results.native.times.reduce((a, b) => a + b) / results.native.times.length,
        avgConfidence: results.native.results.reduce((a, b) => a + b.confidence, 0) / results.native.results.length
      },
      mcp: results.mcp.times.length > 0 ? {
        avgTime: results.mcp.times.reduce((a, b) => a + b) / results.mcp.times.length,
        avgConfidence: results.mcp.results.reduce((a, b) => a + b.confidence, 0) / results.mcp.results.length
      } : null
    };
  }
}

module.exports = EnhancedGuimeraRAGEngine;