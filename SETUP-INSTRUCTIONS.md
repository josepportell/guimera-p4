# 🚀 Guimera RAG System - Complete Setup Guide

## Current Status
- ✅ **Frontend**: https://guimera-ai-frontend.onrender.com (Enhanced with topic suggestions)
- ❌ **Backend**: Needs restart/redeploy
- ⚙️ **RAG System**: Built and ready to activate

---

## Step 1: Fix Backend Service

### Check Render Dashboard
1. Go to your Render dashboard
2. Find your backend service (guimera-ai-backend)
3. Check if it's running/failed
4. If needed, click "Manual Deploy" to restart

### Alternative: Redeploy with Enhanced Server
The RAG-enhanced server is ready in `/backend/rag/enhanced-server.js`

**To activate RAG mode:**
1. Copy `backend/rag/enhanced-server.js` to replace `backend/server.js`
2. Copy `backend/rag/package.json` dependencies to main `backend/package.json`
3. Commit and push to trigger redeploy

---

## Step 2: Set Up Pinecone Vector Database

### Create Pinecone Account
1. Go to https://www.pinecone.io/
2. Sign up (free tier includes 100K vectors - enough for testing)
3. Create new project

### Create Vector Index
**Critical settings** (must match exactly):
```
Index Name: guimera-knowledge
Dimensions: 3072
Metric: cosine
Region: europe-west1 (or closest to your users)
Pod Type: s1.x1 (starter)
```

### Get API Credentials
1. Go to API Keys section in Pinecone dashboard
2. Copy your API key (starts with `pc-`)
3. Note your environment/region

---

## Step 3: Configure Environment Variables

### Add to Render Backend Service
In your backend service settings, add:

```env
# Existing variables
OPENAI_API_KEY=your_openai_key
CORS_ORIGIN=https://guimera-ai-frontend.onrender.com,http://localhost:5173
PORT=3001

# New RAG variables
PINECONE_API_KEY=pc-xxxxxxxxxxxxx
PINECONE_ENVIRONMENT=europe-west1
```

---

## Step 4: Initial Content Scraping

### Option A: Local Scraping (Recommended)
```bash
# 1. Install dependencies locally
cd backend/rag
npm install

# 2. Set environment variables in .env file
cp .env.example .env
# Edit .env with your keys

# 3. Run scraper
npm run scrape

# This will:
# - Scrape guimera.info and blog network
# - Generate embeddings
# - Store in Pinecone
```

### Option B: API Endpoint (After backend is running)
```bash
# Trigger scraping via API
curl -X POST https://guimera-ai-backend.onrender.com/api/rag/reindex
```

---

## Step 5: Test RAG System

### Check System Status
```bash
curl https://guimera-ai-backend.onrender.com/api/health
```

Should return:
```json
{
  "status": "ok",
  "ragEnabled": true,
  "pineconeConfigured": true,
  "ragStats": {
    "totalVectors": 1234,
    "dimension": 3072
  }
}
```

### Test RAG Query
```bash
curl -X POST https://guimera-ai-backend.onrender.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Quin és l'\''horari del museu?", "useRAG": true}'
```

Expected response with `"mode": "rag"` and `"ragMetadata"` section.

---

## Step 6: Verify Frontend Integration

### Test Frontend
1. Visit https://guimera-ai-frontend.onrender.com
2. Try example questions like "Quin és l'horari del museu?"
3. Look for source citations in responses

### Expected Behavior
- **With RAG**: Specific answers with source links
- **Without RAG**: Falls back to general GPT-4 responses

---

## Troubleshooting

### Backend Issues
- Check Render logs for errors
- Verify environment variables are set
- Ensure dependencies are installed

### Pinecone Issues
- Verify index name exactly matches: `guimera-knowledge`
- Check API key format (should start with `pc-`)
- Confirm dimensions are 3072

### Content Issues
- Run scraper locally first to verify it works
- Check for rate limiting from websites
- Monitor token usage in OpenAI dashboard

---

## Cost Estimates

### Initial Setup
- **Pinecone**: Free tier (up to 100K vectors)
- **OpenAI Embeddings**: ~$5-10 for initial indexing
- **OpenAI Chat**: Existing usage

### Monthly Operating
- **Pinecone**: $10-20/month for production use
- **OpenAI**: Minimal additional cost
- **Render**: Existing hosting costs

---

## Success Metrics

### Technical
- [ ] Backend health check shows `ragEnabled: true`
- [ ] Pinecone shows vectors indexed
- [ ] Chat responses include source citations

### User Experience
- [ ] Questions get specific, accurate answers
- [ ] Sources link to actual guimera.info pages
- [ ] Response time under 5 seconds

---

## Next Steps After Setup

1. **Content Updates**: Set up weekly reindexing
2. **Monitoring**: Track which questions get RAG responses
3. **Optimization**: Tune retrieval parameters based on usage
4. **Expansion**: Add more content sources as needed

---

**Ready to transform your AI assistant from generic to authoritative!** 🚀

Contact for support: The RAG system is comprehensive and production-ready.