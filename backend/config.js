// RAG System Configuration
const RAG_CONFIG = {
  // Knowledge sources - starting with main site, then expanding
  sources: {
    primary: {
      domain: 'guimera.info',
      baseUrl: 'https://www.guimera.info',
      type: 'main_site',
      priority: 1,
      scraper: 'wordpress_custom'
    },
    blogs: {
      guimera_blog: {
        domain: 'guimera.blog',
        baseUrl: 'https://guimera.blog',
        type: 'blog_network',
        priority: 2,
        scraper: 'generic_blog'
      },
      zerriu_corb: {
        domain: 'agora.xtec.cat',
        baseUrl: 'https://agora.xtec.cat/zerriucorb/',
        type: 'educational_blog',
        priority: 2,
        scraper: 'xtec_platform'
      },
      mirades_alvent: {
        domain: 'miradesalvent.blogspot.com',
        baseUrl: 'http://miradesalvent.blogspot.com/',
        type: 'blogspot',
        priority: 3,
        scraper: 'blogspot'
      },
      josep_corbella: {
        domain: 'guimera.info',
        baseUrl: 'https://www.guimera.info/wordpress/josepcorbella/',
        type: 'wordpress_subdirectory',
        priority: 2,
        scraper: 'wordpress'
      },
      giliet: {
        domain: 'giliet.wordpress.com',
        baseUrl: 'http://giliet.wordpress.com/',
        type: 'wordpress_hosted',
        priority: 3,
        scraper: 'wordpress'
      },
      vitrall: {
        domain: 'vitrall.blogspot.com',
        baseUrl: 'https://vitrall.blogspot.com/',
        type: 'blogspot',
        priority: 3,
        scraper: 'blogspot'
      }
    }
  },

  // Embedding and retrieval configuration
  embedding: {
    model: 'text-embedding-3-large',
    dimensions: 3072,
    batchSize: 100,
    chunkSize: 1000,
    chunkOverlap: 200
  },

  // Vector database configuration
  vectorDB: {
    provider: 'pinecone', // or 'weaviate' for self-hosted
    indexName: process.env.PINECONE_INDEX_NAME || 'guimera-knowledge',
    namespace: 'main',
    topK: 20,
    includeMetadata: true
  },

  // Re-ranking configuration for better results
  reranking: {
    enabled: true,
    model: 'rerank-3',
    topK: 5
  },

  // Chunking strategy for different content types
  chunking: {
    strategies: {
      main_site: {
        method: 'semantic',
        minChunkSize: 500,
        maxChunkSize: 1500,
        preserveHeaders: true
      },
      blog_posts: {
        method: 'paragraph',
        minChunkSize: 300,
        maxChunkSize: 1000,
        preserveStructure: true
      },
      documents: {
        method: 'page',
        minChunkSize: 800,
        maxChunkSize: 2000,
        includePageNumbers: true
      }
    }
  },

  // Content processing rules
  processing: {
    languages: ['ca', 'es', 'en'],
    removeElements: [
      'nav', 'footer', 'aside', '.sidebar', '.navigation',
      '.comments', '.related-posts', '.social-share'
    ],
    preserveElements: [
      'main', 'article', '.content', '.post-content',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
    ]
  },

  // Citation and attribution
  attribution: {
    includeUrl: true,
    includeTitle: true,
    includeAuthor: true,
    includeDate: true,
    includeSourceType: true
  }
};

module.exports = RAG_CONFIG;