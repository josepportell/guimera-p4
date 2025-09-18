const GuimeraRAGEngine = require('../rag-engine');
require('dotenv').config();

async function testRAGSystem() {
  console.log('🧪 Testing Guimera RAG System\n');

  const ragEngine = new GuimeraRAGEngine();

  try {
    // Initialize
    console.log('1. Initializing RAG Engine...');
    await ragEngine.initialize();
    console.log('✅ RAG Engine initialized\n');

    // Test queries in different languages
    const testQueries = [
      'Quin és l\'horari del museu?',
      '¿Cuáles son las actividades para familias?',
      'What is the history of Guimerà?',
      'Quins esdeveniments hi ha aquest mes?',
      'Com puc arribar a Guimerà amb transport públic?',
      'Quin és el preu de l\'entrada?'
    ];

    for (const query of testQueries) {
      console.log(`🔍 Testing query: "${query}"`);
      console.log('⏳ Processing...');

      try {
        const result = await ragEngine.query(query);

        console.log(`✅ Answer (confidence: ${(result.confidence * 100).toFixed(1)}%):`);
        console.log(result.answer);

        if (result.sources.length > 0) {
          console.log('\n📚 Sources:');
          result.sources.slice(0, 3).forEach((source, index) => {
            console.log(`  ${index + 1}. ${source.title}`);
            console.log(`     ${source.url}`);
            console.log(`     Source: ${source.source} (Score: ${(source.relevanceScore * 100).toFixed(1)}%)`);
          });
        }

        console.log('\n' + '='.repeat(80) + '\n');

      } catch (queryError) {
        console.error(`❌ Query failed: ${queryError.message}\n`);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Get system stats
    console.log('📊 System Statistics:');
    const stats = await ragEngine.getStats();
    if (stats) {
      console.log(`Total vectors: ${stats.totalVectors}`);
      console.log(`Dimensions: ${stats.dimension}`);
      console.log(`Namespaces: ${Object.keys(stats.namespaces || {}).length}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);

    if (error.message.includes('index') || error.message.includes('Pinecone')) {
      console.log('\n💡 To fix this:');
      console.log('1. Make sure you have a Pinecone account and API key');
      console.log('2. Set PINECONE_API_KEY in your .env file');
      console.log('3. Create an index named "guimera-knowledge" with dimension 3072');
      console.log('4. Run the scraper first: npm run scrape');
    }
  }
}

if (require.main === module) {
  testRAGSystem().catch(console.error);
}

module.exports = testRAGSystem;