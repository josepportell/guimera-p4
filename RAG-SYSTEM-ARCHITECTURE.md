# 🧠 Guimerà RAG System - Architecture Documentation

## 🎯 Overview

The Guimerà RAG (Retrieval-Augmented Generation) system transforms your AI assistant from a generic chatbot into an authoritative expert on Guimerà and its rich cultural ecosystem. This comprehensive system automatically scrapes, processes, and indexes content from multiple specialized websites to provide precise, source-backed answers.

## 🏗️ System Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Guimerà RAG System                       │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React)          │  Backend (Node.js/Express)     │
│  - Chat Interface          │  - Enhanced Server             │
│  - Topic Suggestions       │  - RAG Engine                  │
│  - Admin Dashboard         │  - Multi-Domain Scraper        │
│                            │  - Cost Management             │
├─────────────────────────────────────────────────────────────┤
│                    Data Layer                               │
│  - Pinecone Vector DB      │  - OpenAI Embeddings          │
│  - Content Cache           │  - Analytics Storage           │
└─────────────────────────────────────────────────────────────┘
```

## 📚 Content Sources

### Primary Sources
- **guimera.info** - Main tourism and cultural information
- **guimera.blog** - Official blog with updates and insights
- **agora.xtec.cat** - Educational content and resources
- **miradesalvent.blogspot.com** - Community perspectives
- **WordPress sites** - Various cultural blogs
- **General web sources** - Additional context when needed

### Content Processing Pipeline

```
Web Content → Scraping → Text Extraction → Chunking → Embeddings → Vector Storage
     ↓              ↓            ↓            ↓           ↓             ↓
 HTML Pages    Clean Text   Meaningful   1000-char   OpenAI      Pinecone
               Processing    Sections     Chunks    Embeddings    Database
```

## 🔍 RAG Engine Workflow

### 1. Query Processing
```javascript
User Query → Embedding Generation → Vector Search → Content Retrieval → Re-ranking
```

### 2. Response Generation
```javascript
Retrieved Chunks → Context Assembly → GPT-4 Synthesis → Source Attribution → Response
```

### 3. Fallback Logic
- **Primary**: RAG-enhanced responses with sources
- **Fallback**: Standard GPT-4 when no relevant content found
- **Hybrid**: Combines both approaches for optimal coverage

## 🎛️ Admin Dashboard Features

### Real-Time Monitoring
- **System Health**: RAG status, vector count, uptime
- **Usage Analytics**: Query patterns, confidence scores, response times
- **Content Status**: Last updates, source availability, freshness metrics
- **Performance Metrics**: Average response time, processing status

### Cost Management
- **Token Tracking**: Real-time OpenAI API usage monitoring
- **Budget Controls**: Daily ($5) and monthly ($100) limits with alerts
- **Cost Analytics**: Detailed breakdowns by model and usage type
- **Efficiency Metrics**: Cost per token, request optimization insights

### Content Management
- **Automated Updates**: Scheduled scraping and reindexing
- **Health Checks**: Source availability monitoring
- **Manual Controls**: Force refresh, content validation
- **Issue Detection**: Automatic problem identification and alerting

## 🔧 Technical Implementation

### Multi-Domain Scraper (`multi-domain-scraper.js`)
```javascript
class MultiDomainScraper {
  // Platform-specific extraction strategies
  // Respectful crawling with delays
  // Content deduplication
  // Error handling and retry logic
}
```

### RAG Engine (`rag-engine.js`)
```javascript
class GuimeraRAGEngine {
  // Vector search with semantic similarity
  // Content re-ranking for relevance
  // Source attribution and confidence scoring
  // Hybrid response generation
}
```

### Cost Tracker (`cost-tracker.js`)
```javascript
class CostTracker {
  // Real-time API usage monitoring
  // Budget management and alerts
  // Historical analytics and reporting
  // Cost optimization recommendations
}
```

## 📊 Performance Characteristics

### Speed Optimization
- **Target Response Time**: 2-3 seconds (vs 30-60s for Deep Agents)
- **Caching Strategy**: Intelligent content caching for frequent queries
- **Parallel Processing**: Concurrent operations where possible
- **Efficient Retrieval**: Optimized vector search algorithms

### Accuracy Improvements
- **Source Attribution**: Every response linked to original content
- **Confidence Scoring**: Reliability metrics for each answer
- **Content Freshness**: Automatic updates ensure current information
- **Multi-Source Synthesis**: Combines information from multiple authorities

### Scalability Features
- **Modular Architecture**: Easy to add new content sources
- **Resource Management**: Configurable limits and quotas
- **Automated Maintenance**: Self-updating content pipeline
- **Production Ready**: Comprehensive error handling and monitoring

## 🚀 Deployment Architecture

### Development Environment
```
Local Development → Hot Reloading → Live Testing → Admin Dashboard
```

### Production Environment
```
GitHub → Render.com → Environment Variables → Live Deployment
                ↓
          Pinecone Vector DB ← Content Updates ← Automated Scheduler
```

### Environment Variables
```env
# Core API
OPENAI_API_KEY=your_openai_key
PINECONE_API_KEY=pc-xxxxxxxxxxxxx
PINECONE_ENVIRONMENT=europe-west1

# Configuration
CORS_ORIGIN=https://guimera-ai-frontend.onrender.com
ADMIN_TOKEN=guimera-admin-2024
PORT=3001
```

## 🔐 Security & Access Control

### Admin Authentication
- Token-based authentication for admin routes
- Configurable admin credentials
- Secure API endpoint protection

### Content Security
- Respectful web scraping with delays
- Source attribution and copyright respect
- Content validation and quality checks

### Cost Protection
- Automatic budget limits and alerts
- Usage monitoring and anomaly detection
- API key protection and rotation support

## 📈 Analytics & Insights

### Usage Patterns
- **Popular Topics**: Most asked questions and themes
- **Response Quality**: Confidence scores and user satisfaction
- **Content Performance**: Which sources provide best answers
- **System Efficiency**: Response times and resource utilization

### Cost Analysis
- **Model Usage**: Breakdown by GPT-4, embeddings, etc.
- **Daily/Monthly Trends**: Historical spending patterns
- **Optimization Opportunities**: Efficiency improvements
- **Budget Forecasting**: Projected costs and scaling needs

## 🛠️ Maintenance & Operations

### Automated Tasks
- **Daily Health Checks**: System status validation (2 AM)
- **Weekly Content Updates**: Fresh content scraping (Sundays 3 AM)
- **Monthly Full Refresh**: Complete reindexing (1st of month 4 AM)
- **Hourly Performance Monitoring**: Continuous system health

### Manual Operations
- **Content Refresh**: On-demand updates via admin dashboard
- **Budget Management**: Real-time limit adjustments
- **System Monitoring**: Live performance tracking
- **Issue Resolution**: Automated alerts with manual intervention

## 🎯 Business Impact

### User Experience
- **Authoritative Answers**: Specific, accurate information about Guimerà
- **Source Transparency**: Users can verify information sources
- **Faster Responses**: 2-3 second response times
- **Comprehensive Coverage**: Multiple information sources

### Operational Benefits
- **Cost Control**: Detailed tracking and budget management
- **Quality Assurance**: Content freshness and accuracy monitoring
- **Scalability**: Easy expansion to new content sources
- **Maintenance**: Automated operations with minimal manual intervention

### Strategic Value
- **Knowledge Centralization**: Single source of truth for Guimerà information
- **Content Optimization**: Insights into user information needs
- **System Intelligence**: Continuous learning and improvement
- **Competitive Advantage**: Authoritative AI assistant unique to Guimerà

---

*This RAG system represents a production-ready, enterprise-grade solution for domain-specific AI assistance, combining the power of modern AI with the rich cultural knowledge of the Guimerà ecosystem.*