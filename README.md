# Guimera - Assistent IA

A web application that provides an AI chat interface for guimera.info, integrating with specialized GPT assistants.

## Architecture

- **Backend**: Node.js/Express API server
- **Frontend**: React chat interface
- **AI Integration**: OpenAI GPT API
- **Deployment**: Frontend embeddable in WordPress via iframe

## Project Structure

```
├── backend/          # Node.js API server
├── frontend/         # React chat interface
└── README.md         # This file
```

## Quick Start

### Backend
```bash
cd backend
npm install
npm start
```

### Frontend
```bash
cd frontend
npm install
npm start
```

## Environment Variables

Create `.env` files in both backend and frontend directories:

### Backend `.env`
```
OPENAI_API_KEY=your_openai_api_key
OPENAI_ASSISTANT_ID=g-68c70e83c6ec8191a4417a2e4ac2e90f
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

### Frontend `.env`
```
VITE_API_URL=http://localhost:3001
```

## Setup Instructions

1. **Clone and Setup**:
   ```bash
   git clone <repository>
   cd guimera-p4
   ```

2. **Backend Setup**:
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env and add your OpenAI API key
   npm run dev
   ```

3. **Frontend Setup** (in a new terminal):
   ```bash
   cd frontend
   npm install
   cp .env.example .env
   npm run dev  # Note: Requires Node.js 20.19+ or 22.12+
   ```

4. **For WordPress Integration**:
   - Build the frontend: `npm run build`
   - Host the built files on your server
   - Embed using iframe: `<iframe src="https://your-domain.com" width="100%" height="600"></iframe>`

## API Endpoints

- `POST /api/chat` - Send a message to the AI assistant
- `GET /api/session/:sessionId` - Retrieve session history
- `GET /api/health` - Check server health

## Features

- ✅ Real-time chat with GPT assistant specialized in Guimera knowledge
- ✅ Session management with conversation history
- ✅ Context preservation across messages
- ✅ iframe-compatible for WordPress embedding
- ✅ Responsive design for mobile and desktop
- ✅ Catalan language interface
- ✅ Error handling and loading states

## Troubleshooting

- **Node.js Version**: Frontend requires Node.js 20.19+ or 22.12+
- **CORS Issues**: Ensure CORS_ORIGIN in backend .env matches your frontend URL
- **OpenAI API**: Make sure your API key has access to the Assistants API