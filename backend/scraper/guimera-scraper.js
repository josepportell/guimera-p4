const playwright = require('playwright');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

class GuimeraScraper {
  constructor() {
    this.baseUrl = 'https://www.guimera.info';
    this.scrapedUrls = new Set();
    this.content = [];
  }

  async scrapeWebsite() {
    const browser = await playwright.chromium.launch();
    const page = await browser.newPage();

    try {
      // Start with homepage and discover all links
      const urlsToScrape = await this.discoverUrls(page);

      // Scrape each page
      for (const url of urlsToScrape) {
        if (!this.scrapedUrls.has(url)) {
          console.log(`Scraping: ${url}`);
          await this.scrapePage(page, url);
          this.scrapedUrls.add(url);

          // Rate limiting - be respectful
          await this.delay(1000);
        }
      }
    } finally {
      await browser.close();
    }

    return this.content;
  }

  async discoverUrls(page) {
    await page.goto(this.baseUrl);

    // Get all internal links
    const links = await page.evaluate((baseUrl) => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      return anchors
        .map(a => a.href)
        .filter(href => href.startsWith(baseUrl))
        .filter((href, index, arr) => arr.indexOf(href) === index); // unique
    }, this.baseUrl);

    return links;
  }

  async scrapePage(page, url) {
    try {
      await page.goto(url, { waitUntil: 'networkidle' });

      const content = await page.evaluate(() => {
        // Extract main content, excluding navigation
        const mainContent = document.querySelector('main, article, .content, #content')
          || document.body;

        // Remove navigation, footer, sidebar elements
        const elementsToRemove = mainContent.querySelectorAll(
          'nav, footer, aside, .navigation, .sidebar, .menu'
        );
        elementsToRemove.forEach(el => el.remove());

        return {
          title: document.title,
          text: mainContent.innerText,
          html: mainContent.innerHTML,
          headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
            .map(h => h.innerText)
            .slice(0, 5)
        };
      });

      // Extract metadata
      const metadata = await this.extractMetadata(page);

      this.content.push({
        url,
        title: content.title,
        text: content.text,
        html: content.html,
        headings: content.headings,
        metadata,
        scrapedAt: new Date().toISOString()
      });

    } catch (error) {
      console.error(`Error scraping ${url}:`, error.message);
    }
  }

  async extractMetadata(page) {
    return await page.evaluate(() => {
      const getMetaContent = (name) => {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return meta ? meta.getAttribute('content') : null;
      };

      return {
        description: getMetaContent('description'),
        keywords: getMetaContent('keywords'),
        author: getMetaContent('author'),
        publishedTime: getMetaContent('article:published_time'),
        modifiedTime: getMetaContent('article:modified_time'),
        section: getMetaContent('article:section'),
        language: document.documentElement.lang || 'ca'
      };
    });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async saveContent(filename = 'guimera-content.json') {
    const filepath = path.join(__dirname, filename);
    await fs.writeFile(filepath, JSON.stringify(this.content, null, 2));
    console.log(`Content saved to ${filepath}`);
    return filepath;
  }
}

// Usage
async function main() {
  const scraper = new GuimeraScraper();
  const content = await scraper.scrapeWebsite();
  await scraper.saveContent();
  console.log(`Scraped ${content.length} pages from guimera.info`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = GuimeraScraper;