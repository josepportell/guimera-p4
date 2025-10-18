# Guimera AI Assistant

## Metadata
- **Status**: paused
- **Priority**: low
- **Group**: Client
- **Last Updated**: 2025-10-18
- **Created**: 2024-09-17

## Description
AI chat assistant for guimera.info website. RAG system with OpenAI GPT integration providing specialized knowledge about Guimera content. Embeddable in WordPress via iframe.

## Key Information
- **Tech Stack**: Node.js/Express, React, OpenAI API, Pinecone
- **GitHub URL**: (private repository)
- **Key Contacts**: Guimera organization
- **Project Type**: client-project
- **Language**: Catalan interface

## Current Status

### Latest Work
- RAG system architecture designed
- Pinecone SDK migration guide created
- Monitoring architecture comparison completed
- Deployment strategy defined

### Next Actions
- [ ] Await client feedback on architecture
- [ ] Finalize deployment platform choice
- [ ] Complete Pinecone integration
- [ ] Test with real Guimera data

### Blockers
- Waiting for client approval on architecture
- Need access to Guimera content for indexing
- OpenAI API costs need client approval

## Planning

### Time/Effort Estimates
- **Initial Estimate**: 2 weeks development
- **Time Spent**: 3 days
- **Remaining Estimate**: 1.5 weeks when resumed

### Dependencies
- Client content for RAG indexing
- OpenAI API key from client
- WordPress access for embedding

### Revenue/Business Status
- **Business Model**: One-time development + monthly maintenance
- **Pricing**: Development fee + hosting costs
- **Customer Status**: Client project (Guimera)
- **Revenue Target**: €[TBD based on agreement]
- **Progress to Completion**: 30%

## Technical Details

### Architecture
- Backend: Node.js/Express API
- Frontend: React chat interface
- AI: OpenAI Assistants API
- Vector DB: Pinecone for RAG
- Deployment: TBD (Render/Vercel/Railway)

### Features
- Real-time chat with GPT assistant
- Session management
- Context preservation
- WordPress iframe embedding
- Catalan language interface

## Learning References
- RAG system patterns → ClaudeCodeMastery/patterns/
- API integration patterns → ClaudeCodeMastery/optimizations/

## SOP References
- Implementation → ~/projects/claudecode-job/SOPs/delivery/
- Client communication → ~/projects/claudecode-job/SOPs/operations/

## Notes
Project on hold pending client decisions on architecture and budget. Good technical learning opportunity for RAG systems and multilingual AI assistants.

---
*Last sync: 2025-10-18*