# 🚀 Progressive Indexing & Quality Assurance Guide

Complete guide for scaling Guimerà AI with progressive indexing and quality assurance systems.

## 📋 Overview

This system enables you to:
- **Scale indexing** from 15 pages to 500+ pages
- **Monitor quality** with comprehensive QA validation
- **Track progress** with real-time analytics
- **Run on production** server without local resource usage

## 🛠️ Core Components

### 1. Progressive Indexer (`progressive-indexer.js`)
Efficiently indexes large numbers of pages with batch processing and progress tracking.

### 2. Quality Assurance Validator (`quality-assurance/qa-validator.js`)
Validates content quality, detects duplicates, and tests search relevance.

### 3. Smart Indexing Workflow (`smart-indexing-workflow.js`)
Intelligent workflow that tests small samples before recommending large-scale indexing.

### 4. Admin API Endpoints
RESTful endpoints for triggering and monitoring indexing operations.

## 🌐 API Endpoints

### Progressive Indexing

**Start Progressive Indexing**
```http
POST /admin/content/progressive-index
Authorization: x-admin-token: guimera-admin-2024
Content-Type: application/json

{
  "maxPages": 500,
  "source": "guimera.info",
  "priority": "normal"
}
```

**Response:**
```json
{
  "success": true,
  "indexingId": "1726678872513",
  "message": "Indexació progressiva iniciada: 500 pàgines de guimera.info",
  "estimatedDuration": "125 minuts",
  "status": "running"
}
```

### Content Refresh (Existing)

**Basic Content Update**
```http
POST /admin/content/refresh
Authorization: x-admin-token: guimera-admin-2024
Content-Type: application/json

{
  "sources": "all",
  "priority": "normal"
}
```

### Monitoring & Analytics

**Dashboard Overview**
```http
GET /admin/dashboard
Authorization: x-admin-token: guimera-admin-2024
```

**Content Status**
```http
GET /admin/content/status
Authorization: x-admin-token: guimera-admin-2024
```

**Analytics**
```http
GET /admin/analytics?timeframe=7d&metric=all
Authorization: x-admin-token: guimera-admin-2024
```

## 🎯 Usage Scenarios

### Scenario 1: Scale to 500 Pages (Recommended)

```bash
# 1. Call the progressive indexing endpoint
curl -X POST https://your-app.onrender.com/admin/content/progressive-index \
  -H "x-admin-token: guimera-admin-2024" \
  -H "Content-Type: application/json" \
  -d '{"maxPages": 500, "source": "guimera.info"}'

# 2. Monitor progress via dashboard
curl -H "x-admin-token: guimera-admin-2024" \
  https://your-app.onrender.com/admin/dashboard

# 3. Check completion status
curl -H "x-admin-token: guimera-admin-2024" \
  https://your-app.onrender.com/admin/content/status
```

### Scenario 2: Local Development & Testing

```bash
# Run progressive indexing locally
cd backend
node progressive-indexer.js --maxPages=50 --source=guimera.info

# Run quality assurance
node test-qa.js

# Run smart workflow (test + QA + recommendations)
node smart-indexing-workflow.js --maxPages=50
```

### Scenario 3: Quality Testing Before Scaling

```bash
# Test with small sample first
curl -X POST https://your-app.onrender.com/admin/content/progressive-index \
  -H "x-admin-token: guimera-admin-2024" \
  -H "Content-Type: application/json" \
  -d '{"maxPages": 50, "source": "guimera.info"}'

# Review QA reports in backend/monitoring/reports/
# If quality is good, scale to full 500 pages
```

## 📊 Monitoring & Reports

### Progress Tracking

The system tracks indexing progress in real-time:

- **Admin Dashboard**: Live status updates
- **Content Status API**: Detailed progress information
- **Server Logs**: Real-time indexing output via Render console

### Quality Assurance Reports

QA reports are generated in `backend/monitoring/reports/`:

**HTML Reports** (Visual)
- `qa-report-YYYY-MM-DDTHH-mm-ss-sssZ.html`

**JSON Reports** (Data)
- `qa-report-YYYY-MM-DDTHH-mm-ss-sssZ.json`

**Report Contents:**
- Content quality metrics (100% target)
- Deduplication analysis (0% duplicates target)
- Search relevance testing (>60% target)
- Metadata validation
- Recommendations for improvement

### Key Metrics

| Metric | Good | Acceptable | Needs Improvement |
|--------|------|------------|-------------------|
| Content Quality | >90% | 70-90% | <70% |
| Duplicate Rate | <5% | 5-15% | >15% |
| Search Relevance | >60% | 40-60% | <40% |
| Metadata Issues | <2% | 2-5% | >5% |

## ⚙️ Configuration

### Environment Variables

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-key

# Pinecone Configuration
PINECONE_API_KEY=pcsk_your-pinecone-key
PINECONE_ENVIRONMENT=us-east-1
PINECONE_INDEX_NAME=guimera-knowledge

# Admin Configuration
ADMIN_TOKEN=guimera-admin-2024

# Server Configuration
PORT=3001
CORS_ORIGIN=http://localhost:5173,https://your-app.onrender.com
```

### Progressive Indexer Options

```javascript
// Command line options
--maxPages=500          // Maximum pages to index
--source=guimera.info   // Source website to index
--batchSize=10          // Pages processed per batch
--delay=2000           // Delay between requests (ms)

// Environment variables
MAX_PAGES=500
SOURCE_URL=guimera.info
BATCH_SIZE=10
REQUEST_DELAY=2000
```

## 🔧 Troubleshooting

### Common Issues

**1. "Progressive indexing not starting"**
- Check admin token is correct
- Verify all required dependencies are installed
- Ensure progressive-indexer.js is in backend directory

**2. "Quality assurance failing"**
- Verify OpenAI API key is valid and has credits
- Check Pinecone connection and index exists
- Review search test queries in qa-validator.js

**3. "High memory usage during indexing"**
- Reduce batch size: `--batchSize=5`
- Increase delay between requests: `--delay=3000`
- Monitor Render server resources

**4. "Low search relevance scores"**
- Review embedding model choice (currently text-embedding-3-large)
- Consider implementing hybrid search with keyword matching
- Adjust chunk size and overlap parameters

### Debug Commands

```bash
# Test progressive indexer
cd backend
TEST_MODE=true node progressive-indexer.js --maxPages=5

# Test QA system
node test-qa.js

# Check Pinecone connection
node -e "
const config = require('./rag/config');
console.log('Pinecone config:', {
  apiKey: config.vectorDB.apiKey ? 'Set' : 'Missing',
  environment: config.vectorDB.environment,
  indexName: config.vectorDB.indexName
});
"
```

## 📈 Performance Expectations

### Indexing Speed

- **Small batch (50 pages)**: 15-20 minutes
- **Medium batch (200 pages)**: 45-60 minutes
- **Large batch (500 pages)**: 2-4 hours

### Resource Usage

- **Memory**: 500MB-1GB peak on Render server
- **CPU**: Moderate usage during active processing
- **Network**: ~100MB total bandwidth per 500 pages
- **Storage**: Reports ~5-10MB per QA run

### Costs

- **OpenAI API**: ~$15-25 per 500 pages
- **Pinecone**: ~$70/month for serverless index
- **Render**: Included in current plan

## 🚀 Next Steps

### Phase 2: Multi-Domain Expansion

After successful 500-page indexing of guimera.info:

1. **guimera.blog** (~100 pages)
2. **agora.xtec.cat/zerriucorb/** (~150 pages)
3. **miradesalvent.blogspot.com** (~50 pages)
4. **Additional domains** as needed

### Phase 3: Advanced Features

- **Hybrid search** (semantic + keyword)
- **Auto-refresh scheduling**
- **Content freshness monitoring**
- **Multi-language support optimization**

## 🆘 Support

### Documentation
- **Comprehensive Strategy**: `COMPREHENSIVE-INDEXING-STRATEGY.md`
- **QA Reports**: `backend/monitoring/reports/`
- **Admin API**: `backend/admin/admin-routes.js`

### Monitoring
- **Render Dashboard**: Monitor server performance
- **Admin Panel**: Real-time indexing status
- **QA Reports**: Content quality validation

---

**Ready to scale Guimerà AI to 500 pages!** 🎯

Use the progressive indexing endpoint to begin large-scale content indexing with full quality assurance and monitoring.