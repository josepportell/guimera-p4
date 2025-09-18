#!/usr/bin/env node

require('dotenv').config();
const ProgressiveIndexer = require('./progressive-indexer');
const QualityAssuranceValidator = require('./quality-assurance/qa-validator');

class SmartIndexingWorkflow {
  constructor() {
    this.testResults = null;
    this.qaResults = null;
    this.recommendations = null;
  }

  async runSmartWorkflow(options = {}) {
    console.log('🧠 Smart Indexing Workflow');
    console.log('═══════════════════════════════════════');
    console.log('This workflow will:');
    console.log('1. Index a small sample (50 pages)');
    console.log('2. Run quality assurance analysis');
    console.log('3. Provide recommendations for full-scale indexing');
    console.log('');

    const workflowOptions = {
      testSampleSize: options.testSampleSize || 50,
      testBudget: options.testBudget || 5,
      proceedIfGood: options.proceedIfGood || false,
      ...options
    };

    try {
      // Step 1: Small-scale test indexing
      await this.runTestIndexing(workflowOptions);

      // Step 2: Quality assurance
      await this.runQualityAssurance(workflowOptions);

      // Step 3: Generate recommendations
      await this.generateRecommendations(workflowOptions);

      // Step 4: Display final recommendations
      await this.displayFinalRecommendations(workflowOptions);

      console.log('\n✅ Smart workflow completed successfully!');

    } catch (error) {
      console.error('❌ Smart workflow failed:', error);
      throw error;
    }
  }

  async runTestIndexing(options) {
    console.log('\n📦 Step 1: Test Indexing (Small Sample)');
    console.log('──────────────────────────────────────────');

    const indexer = new ProgressiveIndexer({
      maxPages: options.testSampleSize,
      batchSize: 10,
      costBudget: options.testBudget,
      testMode: options.testMode || false,
      delayMs: 1000,
      retryAttempts: 2
    });

    console.log(`🎯 Indexing ${options.testSampleSize} pages with $${options.testBudget} budget...`);

    this.testResults = await indexer.executePhase1();

    console.log('✅ Test indexing completed');
    console.log(`📊 Results: ${indexer.stats.urlsSuccessful}/${indexer.stats.urlsProcessed} pages indexed`);
    console.log(`💰 Cost: $${indexer.stats.totalCost.toFixed(4)}`);
  }

  async runQualityAssurance(options) {
    console.log('\n🔍 Step 2: Quality Assurance Analysis');
    console.log('─────────────────────────────────────────');

    const validator = new QualityAssuranceValidator();

    console.log('🔎 Analyzing content quality, duplicates, metadata, and search performance...');

    this.qaResults = await validator.runCompleteQA({
      sampleSize: options.testSampleSize,
      verbose: false,
      skipDuplication: options.testSampleSize < 10
    });

    const summary = this.qaResults.summary;

    console.log('✅ QA analysis completed');
    console.log(`📊 Overall Status: ${summary.overview.overallStatus}`);
    console.log(`📋 Content Quality: ${(summary.contentQuality.averageScore * 100).toFixed(1)}%`);
    console.log(`🔄 Duplicate Rate: ${summary.deduplication.duplicateRate}`);
    console.log(`🔍 Search Relevance: ${(summary.searchQuality.averageRelevance * 100).toFixed(1)}%`);
  }

  async generateRecommendations(options) {
    console.log('\n🎯 Step 3: Generating Recommendations');
    console.log('─────────────────────────────────────────');

    const summary = this.qaResults.summary;
    const recommendations = [];

    // Evaluate overall readiness
    let overallScore = 0;
    let maxScore = 4;

    // Content Quality Assessment (25%)
    const contentScore = summary.contentQuality.averageScore;
    if (contentScore >= 0.8) {
      overallScore += 1;
      recommendations.push({
        category: 'Content Quality',
        status: '✅ Excellent',
        message: `High content quality (${(contentScore * 100).toFixed(1)}%). Ready for full-scale indexing.`
      });
    } else if (contentScore >= 0.7) {
      overallScore += 0.7;
      recommendations.push({
        category: 'Content Quality',
        status: '⚠️ Good',
        message: `Good content quality (${(contentScore * 100).toFixed(1)}%). Minor improvements recommended.`
      });
    } else {
      recommendations.push({
        category: 'Content Quality',
        status: '❌ Needs Improvement',
        message: `Low content quality (${(contentScore * 100).toFixed(1)}%). Review chunk size and extraction logic.`
      });
    }

    // Deduplication Assessment (25%)
    const duplicateRate = parseFloat(summary.deduplication.duplicateRate);
    if (duplicateRate < 5) {
      overallScore += 1;
      recommendations.push({
        category: 'Deduplication',
        status: '✅ Excellent',
        message: `Low duplicate rate (${duplicateRate.toFixed(1)}%). Minimal content overlap.`
      });
    } else if (duplicateRate < 15) {
      overallScore += 0.6;
      recommendations.push({
        category: 'Deduplication',
        status: '⚠️ Moderate',
        message: `Moderate duplicate rate (${duplicateRate.toFixed(1)}%). Consider deduplication during indexing.`
      });
    } else {
      recommendations.push({
        category: 'Deduplication',
        status: '❌ High',
        message: `High duplicate rate (${duplicateRate.toFixed(1)}%). Implement deduplication before proceeding.`
      });
    }

    // Search Quality Assessment (25%)
    const searchScore = summary.searchQuality.averageRelevance;
    if (searchScore >= 0.7) {
      overallScore += 1;
      recommendations.push({
        category: 'Search Quality',
        status: '✅ Excellent',
        message: `High search relevance (${(searchScore * 100).toFixed(1)}%). Search results are highly relevant.`
      });
    } else if (searchScore >= 0.6) {
      overallScore += 0.7;
      recommendations.push({
        category: 'Search Quality',
        status: '⚠️ Good',
        message: `Good search relevance (${(searchScore * 100).toFixed(1)}%). Consider minor optimizations.`
      });
    } else {
      recommendations.push({
        category: 'Search Quality',
        status: '❌ Needs Improvement',
        message: `Low search relevance (${(searchScore * 100).toFixed(1)}%). Review embedding strategy.`
      });
    }

    // Metadata Quality Assessment (25%)
    const metadataIssueRate = parseFloat(summary.metadata.issueRate);
    if (metadataIssueRate < 5) {
      overallScore += 1;
      recommendations.push({
        category: 'Metadata Quality',
        status: '✅ Excellent',
        message: `Low metadata issue rate (${metadataIssueRate}%). Metadata structure is solid.`
      });
    } else if (metadataIssueRate < 15) {
      overallScore += 0.7;
      recommendations.push({
        category: 'Metadata Quality',
        status: '⚠️ Good',
        message: `Some metadata issues (${metadataIssueRate}%). Minor fixes recommended.`
      });
    } else {
      recommendations.push({
        category: 'Metadata Quality',
        status: '❌ Needs Improvement',
        message: `High metadata issue rate (${metadataIssueRate}%). Review extraction logic.`
      });
    }

    // Overall recommendation
    const overallPercent = (overallScore / maxScore) * 100;
    let overallRecommendation;

    if (overallPercent >= 85) {
      overallRecommendation = {
        status: '🚀 Ready for Full-Scale Indexing',
        action: 'PROCEED',
        message: 'System is performing excellently. Proceed with confidence to index all sources.',
        estimatedFullCost: this.estimateFullCost(options)
      };
    } else if (overallPercent >= 70) {
      overallRecommendation = {
        status: '⚠️ Proceed with Minor Optimizations',
        action: 'PROCEED_WITH_CAUTION',
        message: 'System is performing well but could benefit from minor improvements. Consider applying recommended fixes.',
        estimatedFullCost: this.estimateFullCost(options)
      };
    } else if (overallPercent >= 50) {
      overallRecommendation = {
        status: '🔧 Optimization Required',
        action: 'OPTIMIZE_FIRST',
        message: 'Several issues detected. Address high-priority recommendations before full-scale indexing.',
        estimatedFullCost: this.estimateFullCost(options)
      };
    } else {
      overallRecommendation = {
        status: '🛑 Stop and Fix Issues',
        action: 'DO_NOT_PROCEED',
        message: 'Significant issues detected. Review and fix fundamental problems before proceeding.',
        estimatedFullCost: 'N/A - Fix issues first'
      };
    }

    this.recommendations = {
      overallScore: overallPercent,
      overall: overallRecommendation,
      categories: recommendations,
      qaIssues: summary.recommendations
    };

    console.log('✅ Recommendations generated');
  }

  estimateFullCost(options) {
    // Estimate based on test results
    if (!this.testResults) return 'Unknown';

    // Rough calculation:
    // - Target: ~1500 pages total across all sources
    // - Current test: options.testSampleSize pages
    // - Observed cost per page: testCost / successfulPages

    const testCostPerPage = this.testResults?.totalCost || 0.01; // Fallback estimate
    const estimatedPages = 1500;
    const estimatedCost = (testCostPerPage / options.testSampleSize) * estimatedPages;

    return `$${estimatedCost.toFixed(2)}`;
  }

  async displayFinalRecommendations(options) {
    console.log('\n📋 Step 4: Final Recommendations');
    console.log('═══════════════════════════════════════');

    const rec = this.recommendations;

    console.log(`🎯 Overall Assessment: ${rec.overall.status}`);
    console.log(`📊 Quality Score: ${rec.overallScore.toFixed(1)}%`);
    console.log(`💰 Estimated Full Cost: ${rec.overall.estimatedFullCost}`);
    console.log('');
    console.log(`📝 ${rec.overall.message}`);
    console.log('');

    console.log('📊 Category Breakdown:');
    rec.categories.forEach(cat => {
      console.log(`   ${cat.status} ${cat.category}: ${cat.message}`);
    });

    if (rec.qaIssues.length > 0) {
      console.log('\n🔧 Priority Actions:');
      rec.qaIssues
        .filter(issue => issue.priority === 'High')
        .forEach((issue, i) => {
          console.log(`   ${i+1}. [${issue.category}] ${issue.recommendation}`);
        });
    }

    console.log('\n🎯 Next Steps:');
    switch (rec.overall.action) {
      case 'PROCEED':
        console.log('   1. ✅ Execute full Phase 1 indexing (500 pages)');
        console.log('   2. ✅ Continue with Phase 2 (blog network)');
        console.log('   3. ✅ Monitor with existing QA system');
        break;
      case 'PROCEED_WITH_CAUTION':
        console.log('   1. 🔧 Address medium-priority recommendations');
        console.log('   2. ✅ Execute Phase 1 with enhanced monitoring');
        console.log('   3. 🔍 Run QA checks every 100 pages');
        break;
      case 'OPTIMIZE_FIRST':
        console.log('   1. 🛠️ Fix high-priority issues identified in QA');
        console.log('   2. 🧪 Re-run this test workflow');
        console.log('   3. ⏳ Only proceed after achieving 70%+ score');
        break;
      case 'DO_NOT_PROCEED':
        console.log('   1. 🛑 Do not proceed with large-scale indexing');
        console.log('   2. 🔍 Review chunk size, extraction logic, and embedding strategy');
        console.log('   3. 🧪 Test with different parameters');
        break;
    }

    if (options.proceedIfGood && rec.overall.action === 'PROCEED') {
      console.log('\n🚀 Auto-proceeding with full indexing...');
      return await this.executeFullIndexing(options);
    }
  }

  async executeFullIndexing(options) {
    console.log('\n🚀 Executing Full Phase 1 Indexing');
    console.log('───────────────────────────────────────');

    const indexer = new ProgressiveIndexer({
      maxPages: 500,
      batchSize: 25,
      costBudget: 50,
      testMode: false,
      delayMs: 2000,
      retryAttempts: 3
    });

    console.log('🎯 Starting full Phase 1 indexing...');
    return await indexer.executePhase1();
  }
}

module.exports = SmartIndexingWorkflow;

// CLI usage
if (require.main === module) {
  async function main() {
    const workflow = new SmartIndexingWorkflow();

    const options = {
      testSampleSize: parseInt(process.env.TEST_SAMPLE_SIZE) || 50,
      testBudget: parseFloat(process.env.TEST_BUDGET) || 5,
      testMode: process.env.TEST_MODE === 'true',
      proceedIfGood: process.env.AUTO_PROCEED === 'true'
    };

    await workflow.runSmartWorkflow(options);
  }

  main().catch(error => {
    console.error('💥 Smart workflow failed:', error);
    process.exit(1);
  });
}