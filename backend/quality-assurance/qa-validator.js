const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');
const RAG_CONFIG = require('../rag/config');
const fs = require('fs').promises;
const path = require('path');

class QualityAssuranceValidator {
  constructor() {
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.results = {
      contentVerification: [],
      deduplication: [],
      metadataQuality: [],
      searchTesting: [],
      summary: null
    };

    this.thresholds = {
      similarityThreshold: 0.85, // For duplicate detection
      qualityScoreMin: 0.7,      // Minimum content quality
      searchRelevanceMin: 0.6,   // Minimum search relevance
      maxChunkLength: 2000,      // Maximum reasonable chunk size
      minChunkLength: 50         // Minimum useful chunk size
    };
  }

  async runCompleteQA(options = {}) {
    console.log('🔍 Starting Comprehensive Quality Assurance...');

    const qaOptions = {
      sampleSize: options.sampleSize || 50,
      skipDuplication: options.skipDuplication || false,
      verbose: options.verbose || false,
      ...options
    };

    try {
      // 1. Content Verification
      await this.verifyContentQuality(qaOptions);

      // 2. Deduplication Analysis
      if (!qaOptions.skipDuplication) {
        await this.analyzeDuplication(qaOptions);
      }

      // 3. Metadata Quality Check
      await this.validateMetadata(qaOptions);

      // 4. Search Quality Testing
      await this.testSearchQuality(qaOptions);

      // 5. Generate Summary
      await this.generateQASummary();

      // 6. Save Results
      await this.saveQAReport();

      console.log('✅ Quality Assurance completed successfully!');
      return this.results;

    } catch (error) {
      console.error('❌ Quality Assurance failed:', error);
      throw error;
    }
  }

  async verifyContentQuality(options) {
    console.log('\n📋 1. Content Verification & Quality Assessment');

    const index = this.pinecone.index(RAG_CONFIG.vectorDB.indexName);

    // Get sample of records
    const queryResponse = await index.query({
      vector: new Array(3072).fill(0), // Dummy vector for sampling
      topK: options.sampleSize,
      includeMetadata: true,
      includeValues: false
    });

    console.log(`   Analyzing ${queryResponse.matches.length} content chunks...`);

    for (const match of queryResponse.matches) {
      const chunk = match.metadata;

      const qualityAssessment = await this.assessContentQuality(chunk);

      this.results.contentVerification.push({
        id: match.id,
        url: chunk.url,
        source: chunk.source,
        title: chunk.title,
        chunkIndex: chunk.chunkIndex,
        contentLength: chunk.content?.length || 0,
        qualityScore: qualityAssessment.score,
        issues: qualityAssessment.issues,
        recommendations: qualityAssessment.recommendations,
        language: chunk.language,
        hasHeadings: chunk.headings?.length > 0,
        timestamp: chunk.indexedAt
      });

      if (options.verbose) {
        console.log(`   ✓ ${chunk.url} - Quality: ${qualityAssessment.score.toFixed(2)}`);
      }
    }

    const avgQuality = this.results.contentVerification.reduce((sum, item) => sum + item.qualityScore, 0) / this.results.contentVerification.length;
    const lowQualityCount = this.results.contentVerification.filter(item => item.qualityScore < this.thresholds.qualityScoreMin).length;

    console.log(`   📊 Average Quality Score: ${avgQuality.toFixed(2)}`);
    console.log(`   ⚠️  Low Quality Chunks: ${lowQualityCount}/${this.results.contentVerification.length}`);
  }

  async assessContentQuality(chunk) {
    const issues = [];
    const recommendations = [];
    let score = 1.0;

    // Length checks
    if (!chunk.content || chunk.content.length < this.thresholds.minChunkLength) {
      issues.push('Content too short');
      recommendations.push('Consider increasing minimum content length threshold');
      score -= 0.3;
    }

    if (chunk.content && chunk.content.length > this.thresholds.maxChunkLength) {
      issues.push('Content too long');
      recommendations.push('Consider reducing chunk size or improving splitting');
      score -= 0.2;
    }

    // Content quality checks
    if (chunk.content) {
      // Check for repetitive content
      const words = chunk.content.split(/\s+/);
      const uniqueWords = new Set(words);
      const uniqueRatio = uniqueWords.size / words.length;

      if (uniqueRatio < 0.3) {
        issues.push('Highly repetitive content');
        score -= 0.3;
      }

      // Check for meaningful content
      const meaningfulWordCount = words.filter(word =>
        word.length > 3 && !/^\d+$/.test(word)
      ).length;

      if (meaningfulWordCount / words.length < 0.4) {
        issues.push('Low meaningful content ratio');
        score -= 0.2;
      }

      // Check for proper sentence structure
      const sentences = chunk.content.split(/[.!?]+/);
      const avgSentenceLength = chunk.content.length / sentences.length;

      if (avgSentenceLength < 10) {
        issues.push('Very short sentences, possibly fragmented content');
        score -= 0.1;
      }
    }

    // Metadata quality
    if (!chunk.title || chunk.title.length < 10) {
      issues.push('Missing or poor title');
      score -= 0.1;
    }

    if (!chunk.headings || chunk.headings.length === 0) {
      issues.push('No structural headings found');
      recommendations.push('Improve content extraction to capture headings');
      score -= 0.1;
    }

    if (!chunk.language || chunk.language === 'unknown') {
      issues.push('Language not detected');
      score -= 0.1;
    }

    return {
      score: Math.max(0, score),
      issues,
      recommendations
    };
  }

  async analyzeDuplication(options) {
    console.log('\n🔄 2. Deduplication Analysis');

    const duplicates = [];
    const processed = new Set();

    console.log(`   Analyzing similarity between ${this.results.contentVerification.length} chunks...`);

    for (let i = 0; i < this.results.contentVerification.length; i++) {
      if (processed.has(i)) continue;

      const chunk1 = this.results.contentVerification[i];

      for (let j = i + 1; j < this.results.contentVerification.length; j++) {
        if (processed.has(j)) continue;

        const chunk2 = this.results.contentVerification[j];

        const similarity = await this.calculateContentSimilarity(chunk1, chunk2);

        if (similarity > this.thresholds.similarityThreshold) {
          duplicates.push({
            chunk1: { id: chunk1.id, url: chunk1.url, title: chunk1.title },
            chunk2: { id: chunk2.id, url: chunk2.url, title: chunk2.title },
            similarity: similarity,
            type: chunk1.url === chunk2.url ? 'same-page' : 'cross-page',
            source1: chunk1.source,
            source2: chunk2.source
          });

          processed.add(j);

          if (options.verbose) {
            console.log(`   🔄 Found duplicate (${similarity.toFixed(2)}): ${chunk1.url} ↔ ${chunk2.url}`);
          }
        }
      }
    }

    this.results.deduplication = duplicates;

    const samePage = duplicates.filter(d => d.type === 'same-page').length;
    const crossPage = duplicates.filter(d => d.type === 'cross-page').length;

    console.log(`   📊 Found ${duplicates.length} duplicate pairs:`);
    console.log(`   📄 Same-page duplicates: ${samePage}`);
    console.log(`   🔗 Cross-page duplicates: ${crossPage}`);
  }

  async calculateContentSimilarity(chunk1, chunk2) {
    // Simple text-based similarity for now
    // In production, you might want to use embedding similarity

    const text1 = (chunk1.content || '').toLowerCase();
    const text2 = (chunk2.content || '').toLowerCase();

    if (!text1 || !text2) return 0;

    // Calculate Jaccard similarity on word level
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  async validateMetadata(options) {
    console.log('\n📋 3. Metadata Quality Validation');

    const metadataIssues = [];

    for (const chunk of this.results.contentVerification) {
      const issues = [];

      // Check required fields
      if (!chunk.url) issues.push('Missing URL');
      if (!chunk.source) issues.push('Missing source');
      if (!chunk.title) issues.push('Missing title');

      // Check data types and formats
      if (chunk.chunkIndex && typeof chunk.chunkIndex !== 'number') {
        issues.push('Invalid chunkIndex type');
      }

      if (chunk.timestamp && !Date.parse(chunk.timestamp)) {
        issues.push('Invalid timestamp format');
      }

      // Check URL validity
      if (chunk.url) {
        try {
          new URL(chunk.url);
        } catch (e) {
          issues.push('Invalid URL format');
        }
      }

      // Check language code
      if (chunk.language && chunk.language.length !== 2) {
        issues.push('Invalid language code format');
      }

      if (issues.length > 0) {
        metadataIssues.push({
          id: chunk.id,
          url: chunk.url,
          issues: issues
        });
      }
    }

    this.results.metadataQuality = metadataIssues;

    console.log(`   📊 Metadata Issues Found: ${metadataIssues.length}/${this.results.contentVerification.length} chunks`);

    if (metadataIssues.length > 0) {
      const issueTypes = {};
      metadataIssues.forEach(item => {
        item.issues.forEach(issue => {
          issueTypes[issue] = (issueTypes[issue] || 0) + 1;
        });
      });

      console.log('   📋 Issue Breakdown:');
      Object.entries(issueTypes).forEach(([issue, count]) => {
        console.log(`      - ${issue}: ${count}`);
      });
    }
  }

  async testSearchQuality(options) {
    console.log('\n🔍 4. Search Quality Testing');

    const testQueries = [
      "Guimerà història",
      "Josep Corbella",
      "educació infantil",
      "festes populars",
      "tradicions catalanes",
      "escola",
      "cultura local",
      "patrimoni"
    ];

    const searchResults = [];

    for (const query of testQueries) {
      try {
        const result = await this.testSearchQuery(query);
        searchResults.push(result);

        if (options.verbose) {
          console.log(`   🔍 Query: "${query}" - Relevance: ${result.avgRelevance.toFixed(2)}`);
        }
      } catch (error) {
        console.error(`   ❌ Search test failed for "${query}":`, error.message);
        searchResults.push({
          query,
          success: false,
          error: error.message,
          avgRelevance: 0,
          results: []
        });
      }
    }

    this.results.searchTesting = searchResults;

    const successfulSearches = searchResults.filter(r => r.success).length;
    const avgRelevance = searchResults
      .filter(r => r.success)
      .reduce((sum, r) => sum + r.avgRelevance, 0) / successfulSearches;

    console.log(`   📊 Successful Searches: ${successfulSearches}/${testQueries.length}`);
    console.log(`   📊 Average Relevance Score: ${avgRelevance.toFixed(2)}`);
  }

  async testSearchQuery(query) {
    // Create embedding for the query
    const embedding = await this.openai.embeddings.create({
      model: "text-embedding-3-large",
      input: query,
      dimensions: 3072
    });

    const queryVector = embedding.data[0].embedding;

    // Search the index
    const index = this.pinecone.index(RAG_CONFIG.vectorDB.indexName);
    const searchResponse = await index.query({
      vector: queryVector,
      topK: 10,
      includeMetadata: true,
      includeValues: false
    });

    // Assess relevance of results
    const results = [];
    for (const match of searchResponse.matches) {
      const relevanceScore = await this.assessSearchRelevance(query, match.metadata);
      results.push({
        id: match.id,
        score: match.score,
        relevanceScore,
        url: match.metadata.url,
        title: match.metadata.title,
        content: match.metadata.content?.substring(0, 200) + '...'
      });
    }

    const avgRelevance = results.reduce((sum, r) => sum + r.relevanceScore, 0) / results.length;

    return {
      query,
      success: true,
      avgRelevance,
      results: results.slice(0, 5) // Top 5 for reporting
    };
  }

  async assessSearchRelevance(query, metadata) {
    // Simple keyword-based relevance scoring
    // In production, you might use a more sophisticated approach

    const queryTerms = query.toLowerCase().split(/\s+/);
    const content = (metadata.content || '').toLowerCase();
    const title = (metadata.title || '').toLowerCase();

    let score = 0;
    let maxScore = queryTerms.length;

    queryTerms.forEach(term => {
      if (title.includes(term)) score += 0.7;
      else if (content.includes(term)) score += 0.5;
    });

    return Math.min(1.0, score / maxScore);
  }

  async generateQASummary() {
    console.log('\n📊 5. Generating Quality Assurance Summary');

    const contentVerification = this.results.contentVerification;
    const deduplication = this.results.deduplication;
    const metadataQuality = this.results.metadataQuality;
    const searchTesting = this.results.searchTesting;

    // Content Quality Summary
    const avgQuality = contentVerification.reduce((sum, item) => sum + item.qualityScore, 0) / contentVerification.length;
    const lowQualityCount = contentVerification.filter(item => item.qualityScore < this.thresholds.qualityScoreMin).length;
    const qualityIssues = {};

    contentVerification.forEach(item => {
      item.issues.forEach(issue => {
        qualityIssues[issue] = (qualityIssues[issue] || 0) + 1;
      });
    });

    // Deduplication Summary
    const duplicateRate = deduplication.length / (contentVerification.length / 2) * 100;
    const samePage = deduplication.filter(d => d.type === 'same-page').length;
    const crossPage = deduplication.filter(d => d.type === 'cross-page').length;

    // Search Quality Summary
    const successfulSearches = searchTesting.filter(r => r.success).length;
    const avgSearchRelevance = searchTesting
      .filter(r => r.success)
      .reduce((sum, r) => sum + r.avgRelevance, 0) / successfulSearches;

    // Recommendations
    const recommendations = this.generateRecommendations({
      avgQuality,
      lowQualityCount,
      duplicateRate,
      avgSearchRelevance,
      qualityIssues,
      metadataIssuesCount: metadataQuality.length
    });

    this.results.summary = {
      overview: {
        totalChunksAnalyzed: contentVerification.length,
        analysisDate: new Date().toISOString(),
        overallStatus: this.determineOverallStatus(avgQuality, duplicateRate, avgSearchRelevance)
      },
      contentQuality: {
        averageScore: avgQuality,
        lowQualityCount,
        commonIssues: Object.entries(qualityIssues)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([issue, count]) => ({ issue, count }))
      },
      deduplication: {
        duplicatePairs: deduplication.length,
        duplicateRate: `${duplicateRate.toFixed(1)}%`,
        samePageDuplicates: samePage,
        crossPageDuplicates: crossPage
      },
      metadata: {
        issueCount: metadataQuality.length,
        issueRate: `${(metadataQuality.length / contentVerification.length * 100).toFixed(1)}%`
      },
      searchQuality: {
        successRate: `${(successfulSearches / searchTesting.length * 100).toFixed(1)}%`,
        averageRelevance: avgSearchRelevance,
        queriesTested: searchTesting.length
      },
      recommendations,
      thresholds: this.thresholds
    };

    console.log('   ✅ Summary generated successfully');
  }

  generateRecommendations(stats) {
    const recommendations = [];

    // Content Quality Recommendations
    if (stats.avgQuality < 0.8) {
      recommendations.push({
        category: 'Content Quality',
        priority: 'High',
        issue: `Average quality score (${stats.avgQuality.toFixed(2)}) is below optimal threshold`,
        recommendation: 'Review and improve content extraction logic, consider adjusting chunk size parameters'
      });
    }

    if (stats.lowQualityCount > stats.totalChunksAnalyzed * 0.1) {
      recommendations.push({
        category: 'Content Quality',
        priority: 'Medium',
        issue: `${stats.lowQualityCount} chunks have quality scores below threshold`,
        recommendation: 'Implement pre-processing filters to exclude low-quality content'
      });
    }

    // Deduplication Recommendations
    if (stats.duplicateRate > 10) {
      recommendations.push({
        category: 'Deduplication',
        priority: 'High',
        issue: `High duplicate rate (${stats.duplicateRate.toFixed(1)}%)`,
        recommendation: 'Implement deduplication during indexing process to reduce storage costs and improve search quality'
      });
    }

    // Search Quality Recommendations
    if (stats.avgSearchRelevance < 0.6) {
      recommendations.push({
        category: 'Search Quality',
        priority: 'High',
        issue: `Low search relevance score (${stats.avgSearchRelevance.toFixed(2)})`,
        recommendation: 'Review embedding model choice and consider implementing hybrid search with keyword matching'
      });
    }

    // Metadata Recommendations
    if (stats.metadataIssuesCount > 0) {
      recommendations.push({
        category: 'Metadata',
        priority: 'Medium',
        issue: `${stats.metadataIssuesCount} chunks have metadata issues`,
        recommendation: 'Improve metadata validation and extraction during indexing'
      });
    }

    return recommendations;
  }

  determineOverallStatus(avgQuality, duplicateRate, avgSearchRelevance) {
    if (avgQuality >= 0.8 && duplicateRate < 5 && avgSearchRelevance >= 0.7) {
      return 'Excellent';
    } else if (avgQuality >= 0.7 && duplicateRate < 10 && avgSearchRelevance >= 0.6) {
      return 'Good';
    } else if (avgQuality >= 0.6 && duplicateRate < 20 && avgSearchRelevance >= 0.5) {
      return 'Acceptable';
    } else {
      return 'Needs Improvement';
    }
  }

  async saveQAReport() {
    const reportsDir = path.join(__dirname, '../monitoring/reports');
    await fs.mkdir(reportsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `qa-report-${timestamp}.json`;
    const filepath = path.join(reportsDir, filename);

    await fs.writeFile(filepath, JSON.stringify(this.results, null, 2));

    // Also generate HTML report
    await this.generateHTMLReport(reportsDir, timestamp);

    console.log(`📄 QA Report saved to ${filepath}`);
    console.log(`📄 HTML Report saved to ${reportsDir}/qa-report-${timestamp}.html`);
  }

  async generateHTMLReport(reportsDir, timestamp) {
    const summary = this.results.summary;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quality Assurance Report - ${timestamp}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .status-${summary.overview.overallStatus.toLowerCase().replace(/\s+/g, '-')} {
            padding: 10px; border-radius: 5px; font-weight: bold; text-align: center; margin: 20px 0;
        }
        .status-excellent { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .status-good { background-color: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        .status-acceptable { background-color: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
        .status-needs-improvement { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin: 20px 0; }
        .card { background: #f8f9fa; padding: 20px; border-radius: 5px; border-left: 4px solid #007bff; }
        .metric { font-size: 24px; font-weight: bold; color: #007bff; }
        .recommendation { background: #e9ecef; padding: 15px; margin: 10px 0; border-left: 4px solid #ffc107; }
        .recommendation.high { border-left-color: #dc3545; }
        .recommendation.medium { border-left-color: #ffc107; }
        .recommendation.low { border-left-color: #28a745; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; font-weight: bold; }
        .issue-count { color: #dc3545; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Quality Assurance Report</h1>
            <p>Generated: ${new Date(summary.overview.analysisDate).toLocaleString()}</p>
            <p>Chunks Analyzed: ${summary.overview.totalChunksAnalyzed}</p>
        </div>

        <div class="status-${summary.overview.overallStatus.toLowerCase().replace(/\s+/g, '-')}">
            Overall Status: ${summary.overview.overallStatus}
        </div>

        <div class="grid">
            <div class="card">
                <h3>📋 Content Quality</h3>
                <div class="metric">${(summary.contentQuality.averageScore * 100).toFixed(1)}%</div>
                <p>Average Quality Score</p>
                <p><span class="issue-count">${summary.contentQuality.lowQualityCount}</span> low-quality chunks found</p>
            </div>

            <div class="card">
                <h3>🔄 Deduplication</h3>
                <div class="metric">${summary.deduplication.duplicateRate}</div>
                <p>Duplicate Rate</p>
                <p>${summary.deduplication.duplicatePairs} duplicate pairs found</p>
            </div>

            <div class="card">
                <h3>🔍 Search Quality</h3>
                <div class="metric">${(summary.searchQuality.averageRelevance * 100).toFixed(1)}%</div>
                <p>Average Relevance Score</p>
                <p>${summary.searchQuality.successRate} search success rate</p>
            </div>

            <div class="card">
                <h3>📊 Metadata Quality</h3>
                <div class="metric">${summary.metadata.issueRate}</div>
                <p>Issue Rate</p>
                <p>${summary.metadata.issueCount} chunks with metadata issues</p>
            </div>
        </div>

        <h2>📋 Recommendations</h2>
        ${summary.recommendations.map(rec => `
            <div class="recommendation ${rec.priority.toLowerCase()}">
                <h4>${rec.category} - ${rec.priority} Priority</h4>
                <p><strong>Issue:</strong> ${rec.issue}</p>
                <p><strong>Recommendation:</strong> ${rec.recommendation}</p>
            </div>
        `).join('')}

        <h2>📊 Detailed Metrics</h2>

        <h3>Content Quality Issues</h3>
        <table>
            <thead>
                <tr><th>Issue Type</th><th>Count</th><th>Percentage</th></tr>
            </thead>
            <tbody>
                ${summary.contentQuality.commonIssues.map(issue => `
                    <tr>
                        <td>${issue.issue}</td>
                        <td>${issue.count}</td>
                        <td>${(issue.count / summary.overview.totalChunksAnalyzed * 100).toFixed(1)}%</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <h3>Search Test Results</h3>
        <table>
            <thead>
                <tr><th>Query</th><th>Success</th><th>Relevance Score</th><th>Top Result</th></tr>
            </thead>
            <tbody>
                ${this.results.searchTesting.map(test => `
                    <tr>
                        <td>${test.query}</td>
                        <td>${test.success ? '✅' : '❌'}</td>
                        <td>${test.success ? (test.avgRelevance * 100).toFixed(1) + '%' : 'N/A'}</td>
                        <td>${test.success && test.results.length > 0 ? test.results[0].title : 'N/A'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
</body>
</html>`;

    const htmlPath = path.join(reportsDir, `qa-report-${timestamp}.html`);
    await fs.writeFile(htmlPath, html);
  }
}

module.exports = QualityAssuranceValidator;

// CLI usage
if (require.main === module) {
  async function main() {
    const validator = new QualityAssuranceValidator();

    const options = {
      sampleSize: process.env.QA_SAMPLE_SIZE || 50,
      verbose: process.env.QA_VERBOSE === 'true',
      skipDuplication: process.env.QA_SKIP_DUPLICATION === 'true'
    };

    await validator.runCompleteQA(options);
  }

  main().catch(error => {
    console.error('💥 QA validation failed:', error);
    process.exit(1);
  });
}