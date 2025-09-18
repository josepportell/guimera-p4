const axios = require('axios');
const cheerio = require('cheerio');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const RAG_CONFIG = require('./config');

class SimpleScraper {
  constructor() {
    this.content = [];
    this.scrapedUrls = new Set();
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: RAG_CONFIG.embedding.chunkSize,
      chunkOverlap: RAG_CONFIG.embedding.chunkOverlap,
    });
  }

  async scrapeAllSources() {
    console.log('🚀 Starting simple HTTP scraping...');

    // Start with primary source
    await this.scrapePrimarySource();

    console.log(`✅ Scraping complete! Collected ${this.content.length} documents`);
    return this.content;
  }

  async scrapePrimarySource() {
    console.log('📝 Scraping primary source: guimera.info');
    const config = RAG_CONFIG.sources.primary;

    // Start with some key pages from guimera.info
    const keyPages = [
      'https://www.guimera.info/',
      'https://www.guimera.info/historia/',
      'https://www.guimera.info/museu/',
      'https://www.guimera.info/turisme/',
      'https://www.guimera.info/patrimoni/',
      'https://www.guimera.info/visites/',
      'https://www.guimera.info/esdeveniments/',
    ];

    for (const url of keyPages) {
      try {
        await this.scrapePage(url, config);
        await this.delay(1000); // Be respectful
      } catch (error) {
        console.error(`Error scraping ${url}:`, error.message);
      }
    }
  }

  async scrapePage(url, sourceConfig) {
    if (this.scrapedUrls.has(url)) {
      return;
    }

    try {
      console.log(`🔍 Scraping: ${url}`);

      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GuimeraBot/1.0; +https://guimera.info)'
        }
      });

      const $ = cheerio.load(response.data);

      // Extract content based on common selectors
      $('nav, footer, aside, .sidebar, .navigation, .comments, .related-posts, .social-share, .advertisement, .ads, script, style, .cookie-notice').remove();

      const title = $('title').text() || $('h1').first().text() || 'Untitled';

      // Try to get main content
      let mainContent = $('main').text() ||
                       $('article').text() ||
                       $('.content').text() ||
                       $('.post-content').text() ||
                       $('.entry-content').text() ||
                       $('body').text();

      mainContent = mainContent.replace(/\s+/g, ' ').trim();

      if (mainContent.length < 100) {
        console.log(`Skipping ${url} - insufficient content`);
        return;
      }

      // Extract headings for structure
      const headings = [];
      $('h1, h2, h3, h4, h5, h6').each((i, el) => {
        const text = $(el).text().trim();
        if (text) {
          headings.push({
            level: parseInt(el.tagName.charAt(1)),
            text: text
          });
        }
      });

      // Split content into chunks
      const chunks = await this.textSplitter.splitText(mainContent);

      for (let i = 0; i < chunks.length; i++) {
        const chunkData = {
          id: `${sourceConfig.domain}-${Date.now()}-${i}`,
          content: chunks[i],
          metadata: {
            url,
            title: title.trim(),
            source: sourceConfig.domain,
            sourceType: sourceConfig.type,
            priority: sourceConfig.priority,
            chunkIndex: i,
            totalChunks: chunks.length,
            scrapedAt: new Date().toISOString(),
            language: 'ca',
            headings: headings.slice(0, 5) // Keep first 5 headings
          }
        };

        this.content.push(chunkData);
      }

      this.scrapedUrls.add(url);
      console.log(`✓ Scraped: ${title} (${chunks.length} chunks)`);

    } catch (error) {
      console.error(`Error scraping page ${url}:`, error.message);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = SimpleScraper;

// CLI usage
if (require.main === module) {
  async function main() {
    const scraper = new SimpleScraper();
    const content = await scraper.scrapeAllSources();
    console.log(`📊 Collected ${content.length} content chunks`);
  }

  main().catch(console.error);
}