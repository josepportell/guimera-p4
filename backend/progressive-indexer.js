const playwright = require('playwright');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const OpenAI = require('openai');
const { Pinecone } = require('@pinecone-database/pinecone');
const RAG_CONFIG = require('./rag/config');
const SimpleIndexingReporter = require('./monitoring/simple-reporter');

class ProgressiveIndexer {
  constructor(options = {}) {
    this.sessionId = `guimera-phase1-${Date.now()}`;
    this.options = {
      maxPages: options.maxPages || 100,
      batchSize: options.batchSize || 25,
      delayMs: options.delayMs || 2000,
      retryAttempts: options.retryAttempts || 3,
      costBudget: options.costBudget || 50,
      testMode: options.testMode || false,
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
    this.failedUrls = new Map();
  }

  async executePhase1() {
    console.log(`🚀 Starting Phase 1 indexing - Session: ${this.sessionId}`);
    console.log(`📊 Configuration: ${this.options.maxPages} pages max, ${this.options.batchSize} batch size`);

    try {
      await this.reporter.initialize();
      await this.reporter.recordSession({
        sessionId: this.sessionId,
        source: 'guimera.info',
        startTime: new Date().toISOString(),
        status: 'running'
      });

      // Try Playwright first, fall back to SimpleScraper if it fails
      let browser = null;
      let page = null;
      let usePlaywright = true;

      try {
        browser = await playwright.chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        page = await browser.newPage();
        await this.setupPage(page);
        console.log('✅ Using Playwright for content extraction');
      } catch (playwrightError) {
        console.warn('⚠️ Playwright failed, falling back to SimpleScraper:', playwrightError.message);
        usePlaywright = false;
      }

      let urls;
      if (usePlaywright) {
        urls = await this.discoverPhase1Urls(page);
      } else {
        // Use SimpleScraper approach for URL discovery
        const SimpleScraper = require('./simple-scraper');
        const simpleScraper = new SimpleScraper();
        const content = await simpleScraper.scrapeAllSources();

        // Extract URLs from scraped content and use them
        urls = [...new Set(content.map(item => item.metadata.url))];
        console.log(`🔍 Using SimpleScraper approach: ${urls.length} URLs for Phase 1`);

        // Process the content we already have
        for (const item of content) {
          const chunks = [item.content];
          const embeddings = await this.createEmbeddings(chunks, item.metadata.url);
          if (embeddings && embeddings.length > 0) {
            await this.indexChunks(chunks, embeddings, {
              title: item.metadata.title,
              language: item.metadata.language,
              author: item.metadata.author,
              headings: item.metadata.headings
            }, item.metadata.url);
            this.stats.chunksCreated += chunks.length;
            this.stats.totalCost += this.estimateCost(chunks);
            this.stats.urlsSuccessful++;
          } else {
            this.stats.urlsFailed++;
          }
          this.stats.urlsProcessed++;
        }
      }

      console.log(`🔍 Discovered ${urls.length} URLs for Phase 1`);

      if (usePlaywright) {
        await this.processBatches(page, urls);
        await browser.close();
      }

      await this.generateFinalReport();

      console.log(`✅ Phase 1 completed! Processed ${this.stats.urlsSuccessful}/${this.stats.urlsProcessed} pages`);
      console.log(`💰 Total cost: $${this.stats.totalCost.toFixed(2)}`);

    } catch (error) {
      console.error('❌ Phase 1 indexing failed:', error);
      await this.reporter.recordError({ sessionId: this.sessionId, errorType: 'PHASE_1_FAILURE', message: error.message || 'Unknown error', context: { phase: 1 } });
      throw error;
    }
  }

  async setupPage(page) {
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (compatible; GuimeraBot/1.0; +https://guimera.info)'
    });
    await page.setViewportSize({ width: 1280, height: 720 });

    page.on('response', response => {
      if (response.status() >= 400) {
        console.warn(`⚠️ HTTP ${response.status()}: ${response.url()}`);
      }
    });
  }

  async discoverPhase1Urls(page) {
    console.log('🔍 Discovering URLs from guimera.info...');

    try {
      await page.goto('https://www.guimera.info', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      const urls = await page.evaluate((maxPages) => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        const baseUrl = 'https://www.guimera.info';
        const domain = 'guimera.info';

        return links
          .map(a => {
            try {
              const href = a.href;
              if (href.includes(domain)) {
                return new URL(href, baseUrl).href;
              }
              return null;
            } catch {
              return null;
            }
          })
          .filter(href => href !== null)
          .filter(href => !href.includes('#'))
          .filter(href => !href.match(/\.(jpg|jpeg|png|gif|pdf|zip)$/i))
          .filter((href, index, arr) => arr.indexOf(href) === index)
          .slice(0, maxPages);
      }, this.options.maxPages);

      for (const url of urls) {
        await this.reporter.recordUrl({ sessionId: this.sessionId, url, status: 'discovered' });
      }
      this.stats.urlsDiscovered = urls.length;

      return urls;

    } catch (error) {
      console.error('❌ URL discovery failed:', error);
      await this.reporter.recordError({ sessionId: this.sessionId, errorType: 'URL_DISCOVERY_FAILED', message: error.message, url: 'https://www.guimera.info' });
      return [];
    }
  }

  async processBatches(page, urls) {
    const batches = this.createBatches(urls, this.options.batchSize);

    console.log(`📦 Processing ${batches.length} batches of ${this.options.batchSize} URLs each`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNum = i + 1;

      console.log(`\n🔄 Processing batch ${batchNum}/${batches.length} (${batch.length} URLs)`);

      await this.processBatch(page, batch, batchNum);

      if (this.stats.totalCost > this.options.costBudget) {
        console.warn(`⚠️ Cost budget exceeded ($${this.stats.totalCost.toFixed(2)} > $${this.options.costBudget})`);
        break;
      }

      if (i < batches.length - 1) {
        console.log(`⏳ Waiting ${this.options.delayMs}ms before next batch...`);
        await this.delay(this.options.delayMs);
      }

      // Progress tracking handled by individual URL records
    }
  }

  async processBatch(page, urls, batchNum) {
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
        const success = await this.processUrl(page, url);
        const processingTime = Date.now() - startTime;

        if (success) {
          this.stats.urlsSuccessful++;
          await this.reporter.recordUrl({ sessionId: this.sessionId, url, status: 'indexed', processingTimeMs: processingTime });
          console.log(`✅ [${batchNum}:${urlNum}] Success (${processingTime}ms): ${url}`);
        } else {
          this.stats.urlsFailed++;
          await this.reporter.recordUrl({ sessionId: this.sessionId, url, status: 'failed', processingTimeMs: processingTime });
          console.log(`❌ [${batchNum}:${urlNum}] Failed (${processingTime}ms): ${url}`);
        }

        this.processedUrls.add(url);
        this.stats.urlsProcessed++;

      } catch (error) {
        const processingTime = Date.now() - startTime;
        this.stats.urlsFailed++;
        this.stats.urlsProcessed++;

        console.error(`💥 [${batchNum}:${urlNum}] Error (${processingTime}ms): ${url}`, error.message);
        await this.reporter.recordError({ sessionId: this.sessionId, errorType: 'URL_PROCESSING_ERROR', message: error.message, url, context: { batchNum, urlNum } });
        await this.reporter.recordUrl({ sessionId: this.sessionId, url, status: 'failed', processingTimeMs: processingTime, error: error.message });

        this.stats.errors.push({ url, error: error.message, timestamp: new Date() });
      }

      await this.delay(1000);
    }
  }

  async processUrl(page, url, attempt = 1) {
    try {
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      const content = await this.extractContent(page, url);

      if (!content || content.text.length < 100) {
        await this.reporter.recordError({ sessionId: this.sessionId, errorType: 'INSUFFICIENT_CONTENT', message: `Content too short: ${content?.text?.length || 0} chars`, url });
        return false;
      }

      const chunks = await this.textSplitter.splitText(content.text);

      if (chunks.length === 0) {
        await this.reporter.recordError({ sessionId: this.sessionId, errorType: 'NO_CHUNKS_CREATED', message: 'Text splitter returned empty chunks', url });
        return false;
      }

      const embeddings = await this.createEmbeddings(chunks, url);

      if (!embeddings || embeddings.length === 0) {
        await this.reporter.recordError({ sessionId: this.sessionId, errorType: 'EMBEDDING_FAILED', message: 'Failed to create embeddings', url });
        return false;
      }

      await this.indexChunks(chunks, embeddings, content, url);

      this.stats.chunksCreated += chunks.length;
      this.stats.totalCost += this.estimateCost(chunks);

      return true;

    } catch (error) {
      if (attempt < this.options.retryAttempts) {
        console.log(`🔄 Retry ${attempt + 1}/${this.options.retryAttempts} for: ${url}`);
        await this.delay(2000 * attempt);
        return this.processUrl(page, url, attempt + 1);
      }
      throw error;
    }
  }

  async extractContent(page, url) {
    return await page.evaluate(() => {
      const mainElement = document.querySelector('main, article, .content, .post-content, #content') || document.body;

      const elementsToRemove = mainElement.querySelectorAll(
        'nav, footer, aside, .sidebar, .navigation, .comments, ' +
        '.related-posts, .social-share, .advertisement, .ads, ' +
        'script, style, .cookie-notice, .breadcrumb'
      );
      elementsToRemove.forEach(el => el.remove());

      const getMetaContent = (name) => {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return meta ? meta.getAttribute('content') : null;
      };

      const headings = Array.from(mainElement.querySelectorAll('h1, h2, h3, h4, h5, h6'))
        .map(h => h.innerText.trim())
        .filter(text => text.length > 0)
        .slice(0, 5);

      return {
        title: document.title || '',
        text: mainElement.innerText || '',
        language: document.documentElement.lang || 'ca',
        author: getMetaContent('author') || getMetaContent('article:author') || 'Guimerà Official',
        publishedDate: getMetaContent('article:published_time') || getMetaContent('pubdate'),
        description: getMetaContent('description'),
        headings
      };
    });
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
      await this.reporter.recordError({ sessionId: this.sessionId, errorType: 'OPENAI_EMBEDDING_ERROR', message: error.message, url });
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
        id: `guimera-p1-${Date.now()}-${i}`,
        values: embeddings[i],
        metadata: {
          content: chunk,
          url,
          title: content.title,
          source: 'guimera.info',
          sourceType: 'main_site',
          priority: 1,
          chunkIndex: i,
          totalChunks: chunks.length,
          indexedAt: new Date().toISOString(),
          language: content.language || 'ca',
          author: content.author,
          publishedDate: content.publishedDate,
          headings: content.headings,
          sessionId: this.sessionId,
          phase: 1
        }
      }));

      await index.upsert(vectors);

    } catch (error) {
      await this.reporter.recordError({ sessionId: this.sessionId, errorType: 'PINECONE_INDEXING_ERROR', message: error.message, url });
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

  async generateFinalReport() {
    const report = await this.reporter.generateSummary();

    console.log('\n📊 PHASE 1 FINAL REPORT');
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
      console.log('\n❌ Top Errors:');
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

    await this.reporter.exportToHTML(`phase1-${this.sessionId}`);
    await this.reporter.exportToCSV(`phase1-${this.sessionId}`);

    console.log('\n📄 Reports saved to backend/monitoring/reports/');
    console.log('═══════════════════════════════════════\n');
  }
}

module.exports = ProgressiveIndexer;

if (require.main === module) {
  async function main() {
    const indexer = new ProgressiveIndexer({
      maxPages: process.env.PHASE1_MAX_PAGES || 100,
      batchSize: process.env.PHASE1_BATCH_SIZE || 25,
      testMode: process.env.TEST_MODE === 'true',
      costBudget: parseFloat(process.env.PHASE1_BUDGET) || 50
    });

    await indexer.executePhase1();
  }

  main().catch(error => {
    console.error('💥 Phase 1 execution failed:', error);
    process.exit(1);
  });
}