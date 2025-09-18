const { OpenAI } = require('openai');
const { Pinecone } = require('@pinecone-database/pinecone');
const RAG_CONFIG = require('./config');

class GuimeraRAGEngine {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Pinecone initialization with environment
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
      environment: process.env.PINECONE_ENVIRONMENT || 'aped-4627-b74a'
    });

    this.index = null;
  }

  async initialize() {
    try {
      this.index = this.pinecone.index(RAG_CONFIG.vectorDB.indexName);
      console.log('✅ RAG Engine initialized');
    } catch (error) {
      console.error('❌ Failed to initialize RAG Engine:', error.message);
      throw error;
    }
  }

  // Embed and store content in vector database
  async embedAndStore(content) {
    try {
      console.log(`📚 Embedding and storing ${content.length} chunks...`);

      const batches = this.createBatches(content, RAG_CONFIG.embedding.batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`Processing batch ${i + 1}/${batches.length}...`);

      try {
        // Generate embeddings
        const texts = batch.map(chunk => chunk.content);
        const embeddings = await this.generateEmbeddings(texts);

        // Prepare vectors for Pinecone
        const vectors = batch.map((chunk, index) => ({
          id: chunk.id,
          values: embeddings[index],
          metadata: {
            ...chunk.metadata,
            content: chunk.content.substring(0, 1000) // Store truncated content for preview
          }
        }));

        // Upsert to Pinecone
        console.log(`📤 Upserting ${vectors.length} vectors to Pinecone...`);
        const upsertResponse = await this.index.upsert(vectors);
        console.log(`✅ Batch ${i + 1} upserted successfully:`, upsertResponse);

      } catch (error) {
        console.error(`❌ Failed to process batch ${i + 1}:`, error.message);
        console.error('Full error:', error);
        throw error; // Stop execution on error instead of continuing
      }

      // Rate limiting
      await this.delay(1000);
    }

      console.log('✅ All content embedded and stored');
    } catch (error) {
      console.error('❌ Failed to embed and store content:', error.message);
      throw error;
    }
  }

  async generateEmbeddings(texts) {
    const response = await this.openai.embeddings.create({
      model: RAG_CONFIG.embedding.model,
      input: texts,
      dimensions: RAG_CONFIG.embedding.dimensions
    });

    return response.data.map(item => item.embedding);
  }

  // Main query function
  async query(userQuestion, options = {}) {
    const {
      topK = RAG_CONFIG.vectorDB.topK,
      useReranking = RAG_CONFIG.reranking.enabled,
      minScore = 0.7
    } = options;

    try {
      console.log(`🔍 Processing query: "${userQuestion}"`);

      // 1. Generate query embedding
      const queryEmbedding = await this.generateEmbeddings([userQuestion]);

      // 2. Search vector database
      const searchResults = await this.index.query({
        vector: queryEmbedding[0],
        topK,
        includeMetadata: true,
        includeValues: false
      });

      // 3. Filter by relevance score
      const relevantResults = searchResults.matches.filter(
        match => match.score >= minScore
      );

      if (relevantResults.length === 0) {
        return {
          answer: "No he trobat informació específica sobre aquesta pregunta en les fonts de guimera.info. Podries reformular la pregunta o ser més específic?",
          sources: [],
          confidence: 0
        };
      }

      // 4. Optional re-ranking for better results
      let finalResults = relevantResults;
      if (useReranking && relevantResults.length > 1) {
        finalResults = await this.rerankResults(userQuestion, relevantResults);
      }

      // 5. Generate answer with sources
      const answer = await this.generateAnswer(userQuestion, finalResults);

      return answer;

    } catch (error) {
      console.error('Error processing query:', error.message);
      throw error;
    }
  }

  async rerankResults(query, results) {
    // Implement re-ranking with cross-encoder or Cohere rerank
    // For now, return top results sorted by score
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, RAG_CONFIG.reranking.topK);
  }

  async generateAnswer(question, searchResults) {
    // Prepare context from search results
    const context = this.prepareContext(searchResults);
    const sources = this.extractSources(searchResults);

    const systemPrompt = `# Guia Expert del Museu Guimerà - Mode RAG

Ets un/a guía expert/a del Museu Guimerà i del poble de Guimerà. Utilitza NOMÉS la informació proporcionada en el context per respondre preguntes.

## Instruccions:
1. Respon en CATALÀ per defecte (excepte si l'usuari pregunta en un altre idioma)
2. Utilitza NOMÉS informació del context proporcionat
3. Si la informació no està en el context, digues-ho clarament
4. Inclou referències específiques a les fonts
5. Mantén un to càlid i professional
6. Invita a visitar Guimerà quan sigui apropiat

## Context disponible:
${context}

## Fonts consultades:
${sources.map(s => `- ${s.title} (${s.source})`).join('\n')}`;

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
      searchResults: searchResults.length
    };
  }

  prepareContext(searchResults) {
    return searchResults
      .map((result, index) => {
        const metadata = result.metadata;
        return `## Font ${index + 1}: ${metadata.title}
URL: ${metadata.url}
Contingut: ${metadata.content}

---`;
      })
      .join('\n');
  }

  extractSources(searchResults) {
    const uniqueSources = new Map();

    searchResults.forEach(result => {
      const metadata = result.metadata;
      const sourceKey = metadata.url;

      if (!uniqueSources.has(sourceKey)) {
        uniqueSources.set(sourceKey, {
          title: metadata.title,
          url: metadata.url,
          source: metadata.source,
          sourceType: metadata.sourceType,
          author: metadata.author,
          publishedDate: metadata.publishedDate,
          relevanceScore: result.score
        });
      }
    });

    return Array.from(uniqueSources.values())
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  calculateConfidence(searchResults) {
    if (searchResults.length === 0) return 0;

    const avgScore = searchResults.reduce((sum, result) => sum + result.score, 0) / searchResults.length;
    const topScore = searchResults[0]?.score || 0;

    // Confidence based on top score and consistency
    return Math.min(0.95, (topScore * 0.7) + (avgScore * 0.3));
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

  // Utility method to get system statistics
  async getStats() {
    try {
      if (!this.index) {
        console.log('📊 Index not initialized yet');
        return null;
      }

      const stats = await this.index.describeIndexStats();
      console.log(`📊 Pinecone Stats - Records: ${stats.totalRecordCount || stats.totalVectorCount || 0}, Dimension: ${stats.dimension}`);
      return {
        totalVectors: stats.totalRecordCount || stats.totalVectorCount || 0,
        dimension: stats.dimension,
        namespaces: stats.namespaces
      };
    } catch (error) {
      if (error.message.includes('404')) {
        console.error(`❌ Index "${RAG_CONFIG.vectorDB.indexName}" not found. Please create it first.`);
      } else {
        console.error('❌ Error getting stats:', error.message);
      }
      return {
        totalVectors: 0,
        dimension: 0,
        namespaces: {},
        error: error.message
      };
    }
  }
}

module.exports = GuimeraRAGEngine;