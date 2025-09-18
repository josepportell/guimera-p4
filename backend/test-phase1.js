#!/usr/bin/env node

require('dotenv').config();
const ProgressiveIndexer = require('./progressive-indexer');

async function testPhase1() {
  console.log('🧪 Testing Phase 1 Progressive Indexer');
  console.log('═══════════════════════════════════════');

  console.log('📋 Configuration:');
  console.log(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   PINECONE_API_KEY: ${process.env.PINECONE_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   TEST_MODE: ${process.env.TEST_MODE || 'false'}`);

  try {
    const indexer = new ProgressiveIndexer({
      maxPages: 10,
      batchSize: 5,
      testMode: true,
      costBudget: 1.0,
      delayMs: 1000,
      retryAttempts: 2
    });

    console.log('\n🚀 Starting Phase 1 test run...');
    await indexer.executePhase1();

  } catch (error) {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  testPhase1().catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = testPhase1;