const playwright = require('playwright');
const cheerio = require('cheerio');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const RAG_CONFIG = require('./config');

class MultiDomainScraper {
  constructor() {
    this.content = [];
    this.scrapedUrls = new Set();
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: RAG_CONFIG.embedding.chunkSize,
      chunkOverlap: RAG_CONFIG.embedding.chunkOverlap,
    });
  }

  async scrapeAllSources() {
    console.log('🚀 Starting multi-domain scraping...');

    // Start with primary source (main site)
    await this.scrapePrimarySource();

    // Then scrape blog network
    await this.scrapeBlogNetwork();

    console.log(`✅ Scraping complete! Collected ${this.content.length} documents`);
    return this.content;
  }

  async scrapePrimarySource() {
    console.log('📝 Scraping primary source: guimera.info');
    const config = RAG_CONFIG.sources.primary;
    await this.scrapeWebsite(config);
  }

  async scrapeBlogNetwork() {
    console.log('📱 Scraping blog network...');
    const blogs = RAG_CONFIG.sources.blogs;

    for (const [blogKey, config] of Object.entries(blogs)) {
      console.log(`📖 Scraping ${blogKey}: ${config.baseUrl}`);
      await this.scrapeWebsite(config);

      // Rate limiting between different domains
      await this.delay(2000);
    }
  }

  async scrapeWebsite(sourceConfig) {
    // Configure browser for Render environment
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    };

    // Try to find Chromium executable in common Render locations
    try {
      const fs = require('fs');
      const possiblePaths = [
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        '/opt/render/.cache/ms-playwright/chromium-*/chrome-linux/chrome',
        '/opt/render/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell',
        require('playwright').chromium.executablePath(),
      ].filter(Boolean);

      for (const path of possiblePaths) {
        try {
          if (path.includes('*')) {
            // Handle glob patterns
            const glob = require('child_process').execSync(`ls ${path} 2>/dev/null || echo ""`, {encoding: 'utf8'}).trim();
            if (glob && fs.existsSync(glob)) {
              launchOptions.executablePath = glob;
              console.log(`Found Chromium at: ${glob}`);
              break;
            }
          } else if (fs.existsSync(path)) {
            launchOptions.executablePath = path;
            console.log(`Using Chromium at: ${path}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
    } catch (error) {
      console.log('Using default Chromium path, detection failed:', error.message);
    }

    const browser = await playwright.chromium.launch(launchOptions);
    const page = await browser.newPage();

    try {
      // Set user agent to be respectful
      await page.setUserAgent('Mozilla/5.0 (compatible; GuimeraBot/1.0; +https://guimera.info)');

      const urls = await this.discoverUrls(page, sourceConfig);
      console.log(`Found ${urls.length} URLs for ${sourceConfig.domain}`);

      for (const url of urls.slice(0, 50)) { // Limit for testing
        if (!this.scrapedUrls.has(url)) {
          await this.scrapePage(page, url, sourceConfig);
          this.scrapedUrls.add(url);
          await this.delay(1000); // Respectful crawling
        }
      }
    } catch (error) {
      console.error(`Error scraping ${sourceConfig.domain}:`, error.message);
    } finally {
      await browser.close();
    }
  }

  async discoverUrls(page, sourceConfig) {
    try {
      await page.goto(sourceConfig.baseUrl, { waitUntil: 'networkidle' });

      const urls = await page.evaluate((baseUrl, domain) => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        return links
          .map(a => {
            const href = a.href;
            // Normalize relative URLs
            try {
              return new URL(href, baseUrl).href;
            } catch {
              return null;
            }
          })
          .filter(href => href && href.includes(domain))
          .filter((href, index, arr) => arr.indexOf(href) === index);
      }, sourceConfig.baseUrl, sourceConfig.domain);

      return urls;
    } catch (error) {
      console.error(`Error discovering URLs for ${sourceConfig.domain}:`, error.message);
      return [];
    }
  }

  async scrapePage(page, url, sourceConfig) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      const content = await this.extractContent(page, sourceConfig);
      if (!content.text || content.text.length < 100) {
        return; // Skip pages with minimal content
      }

      // Split content into chunks
      const chunks = await this.textSplitter.splitText(content.text);

      for (let i = 0; i < chunks.length; i++) {
        const chunkData = {
          id: `${sourceConfig.domain}-${Date.now()}-${i}`,
          content: chunks[i],
          metadata: {
            url,
            title: content.title,
            source: sourceConfig.domain,
            sourceType: sourceConfig.type,
            priority: sourceConfig.priority,
            chunkIndex: i,
            totalChunks: chunks.length,
            scrapedAt: new Date().toISOString(),
            language: content.language || 'ca',
            author: content.author,
            publishedDate: content.publishedDate,
            headings: content.headings
          }
        };

        this.content.push(chunkData);
      }

      console.log(`✓ Scraped: ${content.title} (${chunks.length} chunks)`);

    } catch (error) {
      console.error(`Error scraping page ${url}:`, error.message);
    }
  }

  async extractContent(page, sourceConfig) {
    return await page.evaluate((config) => {
      // Content extraction based on source type
      let mainElement;

      switch (config.type) {
        case 'main_site':
        case 'wordpress_subdirectory':
          mainElement = document.querySelector('main, article, .content, .post-content, .entry-content');
          break;
        case 'blogspot':
          mainElement = document.querySelector('.post-body, .entry-content, article');
          break;
        case 'wordpress_hosted':
          mainElement = document.querySelector('.entry-content, .post-content, article');
          break;
        case 'educational_blog':
          mainElement = document.querySelector('.contingut, .content, main, article');
          break;
        default:
          mainElement = document.querySelector('main, article, .content');
      }

      if (!mainElement) {
        mainElement = document.body;
      }

      // Remove unwanted elements
      const elementsToRemove = mainElement.querySelectorAll(
        'nav, footer, aside, .sidebar, .navigation, .comments, ' +
        '.related-posts, .social-share, .advertisement, .ads, ' +
        'script, style, .cookie-notice'
      );
      elementsToRemove.forEach(el => el.remove());

      // Extract metadata
      const getMetaContent = (name) => {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return meta ? meta.getAttribute('content') : null;
      };

      // Extract headings for structure
      const headings = Array.from(mainElement.querySelectorAll('h1, h2, h3, h4, h5, h6'))
        .map(h => h.innerText.trim())
        .filter(text => text.length > 0)
        .slice(0, 5);

      return {
        title: document.title || '',
        text: mainElement.innerText || '',
        language: document.documentElement.lang || 'ca',
        author: getMetaContent('author') || getMetaContent('article:author'),
        publishedDate: getMetaContent('article:published_time') || getMetaContent('pubdate'),
        description: getMetaContent('description'),
        headings
      };
    }, sourceConfig);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async saveContent(filename = 'guimera-knowledge-base.json') {
    const fs = require('fs').promises;
    const path = require('path');

    const filepath = path.join(__dirname, 'data', filename);

    // Ensure data directory exists
    await fs.mkdir(path.dirname(filepath), { recursive: true });

    await fs.writeFile(filepath, JSON.stringify(this.content, null, 2));
    console.log(`💾 Knowledge base saved to ${filepath}`);
    console.log(`📊 Total chunks: ${this.content.length}`);

    // Save summary statistics
    const stats = this.generateStats();
    await fs.writeFile(
      filepath.replace('.json', '-stats.json'),
      JSON.stringify(stats, null, 2)
    );

    return filepath;
  }

  generateStats() {
    const sourceStats = {};
    let totalCharacters = 0;

    this.content.forEach(chunk => {
      const source = chunk.metadata.source;
      if (!sourceStats[source]) {
        sourceStats[source] = {
          chunks: 0,
          characters: 0,
          documents: new Set()
        };
      }

      sourceStats[source].chunks++;
      sourceStats[source].characters += chunk.content.length;
      sourceStats[source].documents.add(chunk.metadata.url);
      totalCharacters += chunk.content.length;
    });

    // Convert sets to counts
    Object.keys(sourceStats).forEach(source => {
      sourceStats[source].documents = sourceStats[source].documents.size;
    });

    return {
      totalChunks: this.content.length,
      totalCharacters,
      totalSources: Object.keys(sourceStats).length,
      sourceBreakdown: sourceStats,
      averageChunkSize: Math.round(totalCharacters / this.content.length),
      scrapedAt: new Date().toISOString()
    };
  }
}

module.exports = MultiDomainScraper;

// CLI usage
if (require.main === module) {
  async function main() {
    const scraper = new MultiDomainScraper();
    await scraper.scrapeAllSources();
    await scraper.saveContent();
  }

  main().catch(console.error);
}