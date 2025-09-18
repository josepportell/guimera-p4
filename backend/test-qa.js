#!/usr/bin/env node

require('dotenv').config();
const QualityAssuranceValidator = require('./quality-assurance/qa-validator');

async function testQA() {
  console.log('🔍 Testing Quality Assurance on Current Index');
  console.log('═══════════════════════════════════════════════');

  console.log('📋 Configuration:');
  console.log(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   PINECONE_API_KEY: ${process.env.PINECONE_API_KEY ? '✅ Set' : '❌ Missing'}`);

  try {
    const validator = new QualityAssuranceValidator();

    console.log('\n🚀 Running QA analysis on current indexed content...');

    const results = await validator.runCompleteQA({
      sampleSize: 15, // Use all current records
      verbose: true,
      skipDuplication: false
    });

    console.log('\n📊 QA Analysis Complete!');
    console.log('═══════════════════════════════════════');

    const summary = results.summary;

    console.log(`🎯 Overall Status: ${summary.overview.overallStatus}`);
    console.log(`📊 Content Quality: ${(summary.contentQuality.averageScore * 100).toFixed(1)}%`);
    console.log(`🔄 Duplicate Rate: ${summary.deduplication.duplicateRate}`);
    console.log(`🔍 Search Relevance: ${(summary.searchQuality.averageRelevance * 100).toFixed(1)}%`);
    console.log(`📋 Metadata Issues: ${summary.metadata.issueRate}`);

    if (summary.recommendations.length > 0) {
      console.log('\n🎯 Key Recommendations:');
      summary.recommendations.forEach((rec, i) => {
        console.log(`   ${i+1}. [${rec.priority}] ${rec.category}: ${rec.recommendation}`);
      });
    }

    console.log('\n📄 Detailed reports saved to backend/monitoring/reports/');

  } catch (error) {
    console.error('\n💥 QA test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  testQA().catch(error => {
    console.error('💥 QA test execution failed:', error);
    process.exit(1);
  });
}

module.exports = testQA;