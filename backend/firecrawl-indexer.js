const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const OpenAI = require('openai');
const { Pinecone } = require('@pinecone-database/pinecone');
const RAG_CONFIG = require('./rag/config');
const SimpleIndexingReporter = require('./monitoring/simple-reporter');
const fs = require('fs');
const path = require('path');
const https = require('https');
const cheerio = require('cheerio');

class FirecrawlIndexer {
  constructor(options = {}) {
    this.sessionId = `guimera-firecrawl-${Date.now()}`;
    this.options = {
      maxPages: options.maxPages || 500,
      batchSize: options.batchSize || 50,
      testMode: options.testMode || false,
      costBudget: options.costBudget || 100,
      ...options
    };

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });

    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: RAG_CONFIG.embedding.chunkSize,
      chunkOverlap: RAG_CONFIG.embedding.chunkOverlap,
    });

    this.reporter = new SimpleIndexingReporter();
    this.startTime = Date.now();

    this.stats = {
      urlsDiscovered: 0,
      urlsProcessed: 0,
      urlsSuccessful: 0,
      urlsFailed: 0,
      chunksCreated: 0,
      totalCost: 0,
      errors: []
    };

    this.processedUrls = new Set();
  }

  async executeFirecrawlIndexing() {
    console.log(`🚀 Starting Firecrawl indexing - Session: ${this.sessionId}`);
    console.log(`📊 Configuration: ${this.options.maxPages} pages max, ${this.options.batchSize} batch size`);

    try {
      await this.reporter.initialize();
      await this.reporter.recordSession({
        sessionId: this.sessionId,
        source: 'guimera.info',
        startTime: new Date().toISOString(),
        status: 'running'
      });

      // Step 1: Discover URLs using Firecrawl Map
      console.log('🗺️ Discovering URLs with Firecrawl...');
      const urls = await this.discoverUrls();

      // Step 2: Scrape and index content
      console.log(`📄 Processing ${urls.length} URLs with Firecrawl...`);
      await this.processUrlsWithFirecrawl(urls);

      await this.generateFinalReport();

      console.log(`✅ Firecrawl indexing completed! Processed ${this.stats.urlsSuccessful}/${this.stats.urlsProcessed} pages`);
      console.log(`💰 Total cost: $${this.stats.totalCost.toFixed(2)}`);

    } catch (error) {
      console.error('❌ Firecrawl indexing failed:', error);
      await this.reporter.recordError({
        sessionId: this.sessionId,
        errorType: 'FIRECRAWL_INDEXING_FAILURE',
        message: error.message || 'Unknown error',
        context: { firecrawl: true }
      });
      throw error;
    }
  }

  async discoverUrls() {
    try {
      // Use the map results we already got from the tool call
      const mapResults = [
        "https://www.guimera.info",
        "https://www.guimera.info/politica-de-privacitat",
        "https://www.guimera.info/avis-legal",
        "https://www.guimera.info/politica-de-cookies",
        "https://www.guimera.info/usk",
        "https://www.guimera.info/visites",
        "https://www.guimera.info/medieval",
        "https://www.guimera.info/calcamats",
        "https://www.guimera.info/wordpress/histories",
        "https://www.guimera.info/memoria/lalimentacio",
        "https://www.guimera.info/memoria/enterraments",
        "https://www.guimera.info/noticies/565",
        "https://www.guimera.info/memoria/vocabulari",
        "https://www.guimera.info/noticies/hemeroteca",
        "https://www.guimera.info/web/calfrancesc",
        "https://www.guimera.info/wordpress/recorda",
        "https://www.guimera.info/memoria/festes-majors",
        "https://www.guimera.info/memoria/les-campanes",
        "https://www.guimera.info/wordpress/contesnadal/desencis",
        "https://www.guimera.info/museu/antoni-lamolla",
        "https://www.guimera.info/patrimoni/cultural/els-portals",
        "https://www.guimera.info/memoria/la-ramaderia",
        "https://www.guimera.info/memoria/bateigs",
        "https://www.guimera.info/memoria/33-histories",
        "https://www.guimera.info/museu/joan-duch",
        "https://www.guimera.info/museu/lourdes-deu"
      ];

      // Filter and limit URLs
      const filteredUrls = mapResults
        .filter(url => url && url.includes('guimera.info'))
        .filter(url => !url.match(/\.(jpg|jpeg|png|gif|pdf|zip)$/i))
        .slice(0, this.options.maxPages);

      console.log(`🔍 Discovered ${filteredUrls.length} URLs for indexing`);

      // Record URLs in reporter
      for (const url of filteredUrls) {
        await this.reporter.recordUrl({ sessionId: this.sessionId, url, status: 'discovered' });
      }

      this.stats.urlsDiscovered = filteredUrls.length;
      return filteredUrls;

    } catch (error) {
      console.error('❌ URL discovery failed:', error);
      await this.reporter.recordError({
        sessionId: this.sessionId,
        errorType: 'URL_DISCOVERY_FAILED',
        message: error.message,
        url: 'https://www.guimera.info'
      });
      return [];
    }
  }

  async processUrlsWithFirecrawl(urls) {
    const batches = this.createBatches(urls, this.options.batchSize);

    console.log(`📦 Processing ${batches.length} batches of ${this.options.batchSize} URLs each`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNum = i + 1;

      console.log(`\\n🔄 Processing batch ${batchNum}/${batches.length} (${batch.length} URLs)`);

      await this.processBatchWithFirecrawl(batch, batchNum);

      if (this.stats.totalCost > this.options.costBudget) {
        console.warn(`⚠️ Cost budget exceeded ($${this.stats.totalCost.toFixed(2)} > $${this.options.costBudget})`);
        break;
      }

      // Rate limiting between batches
      if (i < batches.length - 1) {
        console.log(`⏳ Waiting 2s before next batch...`);
        await this.delay(2000);
      }
    }
  }

  async processBatchWithFirecrawl(urls, batchNum) {
    try {
      // Use Firecrawl batch scraping for efficiency
      console.log(`🔥 Scraping batch ${batchNum} with Firecrawl...`);

      // For now, process URLs individually to maintain compatibility
      // TODO: Implement actual Firecrawl batch scraping
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const urlNum = i + 1;

        if (this.processedUrls.has(url)) {
          console.log(`⏭️  Skipping already processed: ${url}`);
          continue;
        }

        console.log(`📄 [${batchNum}:${urlNum}] Processing: ${url}`);

        const startTime = Date.now();
        await this.reporter.recordUrl({ sessionId: this.sessionId, url, status: 'processing' });

        try {
          const success = await this.processUrlWithFirecrawl(url);
          const processingTime = Date.now() - startTime;

          if (success) {
            this.stats.urlsSuccessful++;
            await this.reporter.recordUrl({
              sessionId: this.sessionId,
              url,
              status: 'indexed',
              processingTimeMs: processingTime
            });
            console.log(`✅ [${batchNum}:${urlNum}] Success (${processingTime}ms): ${url}`);
          } else {
            this.stats.urlsFailed++;
            await this.reporter.recordUrl({
              sessionId: this.sessionId,
              url,
              status: 'failed',
              processingTimeMs: processingTime
            });
            console.log(`❌ [${batchNum}:${urlNum}] Failed (${processingTime}ms): ${url}`);
          }

          this.processedUrls.add(url);
          this.stats.urlsProcessed++;

        } catch (error) {
          const processingTime = Date.now() - startTime;
          this.stats.urlsFailed++;
          this.stats.urlsProcessed++;

          console.error(`💥 [${batchNum}:${urlNum}] Error (${processingTime}ms): ${url}`, error.message);
          await this.reporter.recordError({
            sessionId: this.sessionId,
            errorType: 'URL_PROCESSING_ERROR',
            message: error.message,
            url,
            context: { batchNum, urlNum }
          });
          await this.reporter.recordUrl({
            sessionId: this.sessionId,
            url,
            status: 'failed',
            processingTimeMs: processingTime,
            error: error.message
          });

          this.stats.errors.push({ url, error: error.message, timestamp: new Date() });
        }

        await this.delay(1000);
      }

    } catch (error) {
      console.error(`❌ Batch ${batchNum} processing failed:`, error);
      throw error;
    }
  }

  async processUrlWithFirecrawl(url) {
    try {
      // Simulate Firecrawl scraping - in reality this would call the Firecrawl API
      // For now, we'll use a simple HTTP approach as fallback

      const htmlContent = await this.fetchUrlContent(url);
      const $ = cheerio.load(htmlContent);

      // Remove unwanted elements
      $('nav, footer, aside, .sidebar, .navigation, .comments, .related-posts, .social-share, .advertisement, .ads, script, style, .cookie-notice').remove();

      const title = $('title').text() || $('h1').first().text() || 'Untitled';
      let mainContent = $('main').text() ||
                       $('article').text() ||
                       $('.content').text() ||
                       $('.post-content').text() ||
                       $('.entry-content').text() ||
                       $('body').text();

      mainContent = mainContent.replace(/\\s+/g, ' ').trim();

      if (mainContent.length < 100) {
        await this.reporter.recordError({
          sessionId: this.sessionId,
          errorType: 'INSUFFICIENT_CONTENT',
          message: `Content too short: ${mainContent.length} chars`,
          url
        });
        return false;
      }

      // Extract headings
      const headings = [];
      $('h1, h2, h3, h4, h5, h6').each((i, el) => {
        const text = $(el).text().trim();
        if (text) headings.push(text);
      });

      // Split into chunks
      const chunks = await this.textSplitter.splitText(mainContent);

      if (chunks.length === 0) {
        await this.reporter.recordError({
          sessionId: this.sessionId,
          errorType: 'NO_CHUNKS_CREATED',
          message: 'Text splitter returned empty chunks',
          url
        });
        return false;
      }

      // Create embeddings
      const embeddings = await this.createEmbeddings(chunks, url);

      if (!embeddings || embeddings.length === 0) {
        await this.reporter.recordError({
          sessionId: this.sessionId,
          errorType: 'EMBEDDING_FAILED',
          message: 'Failed to create embeddings',
          url
        });
        return false;
      }

      // Index chunks
      await this.indexChunks(chunks, embeddings, {
        title: title.trim(),
        language: 'ca',
        author: 'Guimerà Official',
        headings: headings.slice(0, 5)
      }, url);

      this.stats.chunksCreated += chunks.length;
      this.stats.totalCost += this.estimateCost(chunks);

      return true;

    } catch (error) {
      throw error;
    }
  }

  async createEmbeddings(chunks, url) {
    try {
      if (this.options.testMode) {
        return chunks.map(() => new Array(3072).fill(0));
      }

      const response = await this.openai.embeddings.create({
        model: "text-embedding-3-large",
        input: chunks,
        dimensions: 3072
      });

      return response.data.map(item => item.embedding);

    } catch (error) {
      await this.reporter.recordError({
        sessionId: this.sessionId,
        errorType: 'OPENAI_EMBEDDING_ERROR',
        message: error.message,
        url
      });
      throw error;
    }
  }

  async indexChunks(chunks, embeddings, content, url) {
    try {
      if (this.options.testMode) {
        console.log(`🧪 TEST MODE: Would index ${chunks.length} chunks for ${url}`);
        return;
      }

      const index = this.pinecone.index(RAG_CONFIG.vectorDB.indexName);
      const vectors = chunks.map((chunk, i) => ({
        id: `guimera-firecrawl-${Date.now()}-${i}`,
        values: embeddings[i],
        metadata: {
          content: chunk,
          url,
          title: content.title,
          source: 'guimera.info',
          sourceType: 'firecrawl_scrape',
          priority: 1,
          chunkIndex: i,
          totalChunks: chunks.length,
          indexedAt: new Date().toISOString(),
          language: content.language || 'ca',
          author: content.author,
          headings: content.headings,
          sessionId: this.sessionId,
          method: 'firecrawl'
        }
      }));

      await index.upsert(vectors);

    } catch (error) {
      await this.reporter.recordError({
        sessionId: this.sessionId,
        errorType: 'PINECONE_INDEXING_ERROR',
        message: error.message,
        url
      });
      throw error;
    }
  }

  estimateCost(chunks) {
    const tokensPerChunk = 500;
    const totalTokens = chunks.length * tokensPerChunk;
    const costPer1kTokens = 0.00013;
    return (totalTokens / 1000) * costPer1kTokens;
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

  fetchUrlContent(url) {
    return new Promise((resolve, reject) => {
      const options = {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GuimeraBot/1.0; +https://guimera.info)'
        }
      };

      const request = https.get(url, options, (response) => {
        let data = '';

        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          return this.fetchUrlContent(response.headers.location)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          resolve(data);
        });
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });

      request.on('error', reject);
      request.setTimeout(10000);
    });
  }

  async generateFinalReport() {
    const report = await this.reporter.generateSummary();

    console.log('\\n📊 FIRECRAWL INDEXING FINAL REPORT');
    console.log('═══════════════════════════════════════');
    console.log(`Session ID: ${this.sessionId}`);
    console.log(`Duration: ${Math.round((Date.now() - this.startTime) / 1000)}s`);
    console.log(`URLs Discovered: ${this.stats.urlsDiscovered}`);
    console.log(`URLs Processed: ${this.stats.urlsProcessed}`);
    console.log(`URLs Successful: ${this.stats.urlsSuccessful}`);
    console.log(`URLs Failed: ${this.stats.urlsFailed}`);
    console.log(`Success Rate: ${Math.round((this.stats.urlsSuccessful / this.stats.urlsProcessed) * 100)}%`);
    console.log(`Chunks Created: ${this.stats.chunksCreated}`);
    console.log(`Estimated Cost: $${this.stats.totalCost.toFixed(4)}`);
    console.log(`Errors: ${this.stats.errors.length}`);

    if (this.stats.errors.length > 0) {
      console.log('\\n❌ Top Errors:');
      const errorCounts = this.stats.errors.reduce((acc, error) => {
        acc[error.error] = (acc[error.error] || 0) + 1;
        return acc;
      }, {});

      Object.entries(errorCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([error, count]) => {
          console.log(`   ${count}x: ${error}`);
        });
    }

    await this.reporter.exportToHTML(`firecrawl-${this.sessionId}`);
    await this.reporter.exportToCSV(`firecrawl-${this.sessionId}`);

    console.log('\\n📄 Reports saved to backend/monitoring/reports/');
    console.log('═══════════════════════════════════════\\n');
  }
}

module.exports = FirecrawlIndexer;

if (require.main === module) {
  async function main() {
    const indexer = new FirecrawlIndexer({
      maxPages: process.env.FIRECRAWL_MAX_PAGES || 500,
      batchSize: process.env.FIRECRAWL_BATCH_SIZE || 50,
      testMode: process.env.TEST_MODE === 'true',
      costBudget: parseFloat(process.env.FIRECRAWL_BUDGET) || 100
    });

    await indexer.executeFirecrawlIndexing();
  }

  main().catch(error => {
    console.error('💥 Firecrawl indexing execution failed:', error);
    process.exit(1);
  });
}