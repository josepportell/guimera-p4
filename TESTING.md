# Testing Guide - Guimera AI Assistant

This guide provides comprehensive testing instructions to ensure your application works correctly before deployment.

## Prerequisites for Testing

1. **OpenAI API Key**: You'll need a valid OpenAI API key with access to the Assistants API
2. **Node.js**: Backend requires any Node.js version, frontend requires 20.19+ for development
3. **Test Environment**: Local development setup

## 1. Environment Setup for Testing

### Backend Testing Setup

```bash
cd backend

# Copy environment file
cp .env.example .env

# Edit the .env file with your actual API key
nano .env
```

Your `.env` should look like:
```env
OPENAI_API_KEY=sk-your-actual-openai-api-key-here
OPENAI_ASSISTANT_ID=g-68c70e83c6ec8191a4417a2e4ac2e90f
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

### Frontend Testing Setup

```bash
cd frontend

# Copy environment file
cp .env.example .env

# Edit the .env file
nano .env
```

Your `.env` should look like:
```env
VITE_API_URL=http://localhost:3001
```

## 2. API Testing (Backend Only)

### Start Backend Server

```bash
cd backend
npm install
npm run dev
```

You should see:
```
🚀 Guimera AI Assistant backend running on port 3001
🔧 OpenAI API configured: true
🤖 Assistant configured: true
```

### Test API Endpoints

#### Health Check Test
```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-XX...",
  "openaiConfigured": true,
  "assistantConfigured": true
}
```

#### Chat API Test
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hola, què és Guimera?"}'
```

Expected response:
```json
{
  "response": "Guimera és...",
  "sessionId": "uuid-here",
  "threadId": "thread_id_here"
}
```

### Troubleshooting Backend Issues

**If health check shows `openaiConfigured: false`:**
- Check your API key is correctly set in `.env`
- Ensure no extra spaces or quotes around the key
- Verify the API key is valid and has proper permissions

**If chat API fails:**
- Check the assistant ID is correct
- Ensure your OpenAI account has access to the Assistants API
- Check backend logs for specific error messages

## 3. Full Application Testing

### Start Both Services

**Terminal 1 (Backend):**
```bash
cd backend
npm run dev
```

**Terminal 2 (Frontend - if you have Node.js 20.19+):**
```bash
cd frontend
npm install
npm run dev
```

**If you have Node.js 18.x (alternative method):**
```bash
cd frontend
npm run build
npx serve -s dist -l 5173
```

### Access the Application

Open your browser and go to: `http://localhost:5173`

## 4. Manual Testing Checklist

### ✅ Basic Functionality

1. **Page Load**
   - [ ] Application loads without errors
   - [ ] Welcome message is displayed
   - [ ] Chat input is visible and functional

2. **UI Elements**
   - [ ] Header displays "Guimera - Assistent IA"
   - [ ] "Nova conversa" button is visible
   - [ ] Chat input placeholder text is in Catalan
   - [ ] Send button is visible

3. **Chat Functionality**
   - [ ] Type a message and press Enter
   - [ ] Message appears in chat with user styling
   - [ ] Loading indicator appears while processing
   - [ ] AI response appears with assistant styling
   - [ ] Timestamps are displayed

### ✅ Advanced Testing

4. **Session Management**
   - [ ] Send multiple messages in sequence
   - [ ] Verify conversation context is maintained
   - [ ] Click "Nova conversa" and verify chat clears
   - [ ] Start new conversation and verify new session ID

5. **Error Handling**
   - [ ] Temporarily stop backend server
   - [ ] Try sending a message
   - [ ] Verify error message appears
   - [ ] Restart backend and verify recovery

6. **Responsive Design**
   - [ ] Test on desktop browser
   - [ ] Test on mobile browser (dev tools)
   - [ ] Verify UI adapts to different screen sizes
   - [ ] Check iframe compatibility

### ✅ Content Testing

7. **AI Responses**
   - [ ] Ask: "Què és Guimera?"
   - [ ] Ask: "Quines són les activitats de Guimera?"
   - [ ] Ask: "Com puc contactar amb Guimera?"
   - [ ] Verify responses are relevant and in Catalan
   - [ ] Test follow-up questions

## 5. Test Scripts

### Automated API Testing Script

Create `test-api.js` in the backend folder:

```javascript
const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';

async function testAPI() {
  console.log('🧪 Testing Guimera AI Assistant API...\n');

  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const health = await axios.get(`${API_BASE}/health`);
    console.log('✅ Health check:', health.data);

    // Test chat endpoint
    console.log('\n2. Testing chat endpoint...');
    const chat = await axios.post(`${API_BASE}/chat`, {
      message: 'Hola, què és Guimera?'
    });
    console.log('✅ Chat response received');
    console.log('Session ID:', chat.data.sessionId);
    console.log('Response preview:', chat.data.response.substring(0, 100) + '...');

    // Test session continuity
    console.log('\n3. Testing session continuity...');
    const chat2 = await axios.post(`${API_BASE}/chat`, {
      message: 'Pots donar-me més informació?',
      sessionId: chat.data.sessionId
    });
    console.log('✅ Follow-up response received');
    console.log('Same session ID:', chat2.data.sessionId === chat.data.sessionId);

    console.log('\n🎉 All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testAPI();
```

Run the test:
```bash
cd backend
npm install axios
node test-api.js
```

### Browser Testing Script

Create `test-frontend.html` for manual testing:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Guimera AI Assistant Test</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .test { margin: 10px 0; padding: 10px; border: 1px solid #ddd; }
        .pass { background: #d4edda; }
        .fail { background: #f8d7da; }
        iframe { width: 100%; height: 600px; border: 1px solid #ccc; }
    </style>
</head>
<body>
    <h1>Guimera AI Assistant - Test Page</h1>

    <div class="test">
        <h3>Test 1: Direct Access</h3>
        <p>Open <a href="http://localhost:5173" target="_blank">http://localhost:5173</a> in a new tab</p>
        <label><input type="checkbox"> Application loads correctly</label><br>
        <label><input type="checkbox"> Can send and receive messages</label>
    </div>

    <div class="test">
        <h3>Test 2: iframe Embedding (WordPress Simulation)</h3>
        <p>This simulates how the app will work in WordPress:</p>
        <iframe src="http://localhost:5173"></iframe>
        <label><input type="checkbox"> iframe loads correctly</label><br>
        <label><input type="checkbox"> Chat works inside iframe</label><br>
        <label><input type="checkbox"> No scrolling issues</label>
    </div>

    <div class="test">
        <h3>Test 3: Mobile Simulation</h3>
        <p>Use browser dev tools to simulate mobile device</p>
        <label><input type="checkbox"> Responsive design works</label><br>
        <label><input type="checkbox"> Touch interactions work</label>
    </div>
</body>
</html>
```

## 6. Performance Testing

### Load Testing (Optional)

Install and run a simple load test:

```bash
npm install -g artillery
```

Create `load-test.yml`:
```yaml
config:
  target: 'http://localhost:3001'
  phases:
    - duration: 60
      arrivalRate: 5
scenarios:
  - name: "Chat API Load Test"
    requests:
      - post:
          url: "/api/chat"
          json:
            message: "Test message"
```

Run load test:
```bash
artillery run load-test.yml
```

## 7. WordPress Integration Testing

### Local WordPress Setup (Optional)

If you want to test with actual WordPress:

```bash
# Using Docker
docker run --name wordpress-test -p 8080:80 -d wordpress:latest

# Or using Local by Flywheel, XAMPP, etc.
```

Then:
1. Set up WordPress at `http://localhost:8080`
2. Create a test page
3. Add the iframe code:
```html
<iframe src="http://localhost:5173" width="100%" height="600" frameborder="0"></iframe>
```

## 8. Pre-Deployment Checklist

Before deploying to production:

### ✅ Functionality
- [ ] All API endpoints work
- [ ] Chat conversation flows naturally
- [ ] Error handling works properly
- [ ] Session management works
- [ ] UI is responsive

### ✅ Content
- [ ] AI provides relevant Guimera information
- [ ] Responses are in Catalan
- [ ] Context is maintained across messages
- [ ] No inappropriate or incorrect responses

### ✅ Technical
- [ ] No console errors in browser
- [ ] No 404 or 500 errors in network tab
- [ ] API calls complete successfully
- [ ] Loading states work properly

### ✅ Integration
- [ ] iframe embedding works
- [ ] No X-Frame-Options issues
- [ ] CORS configured correctly
- [ ] Mobile compatibility confirmed

## 9. Common Testing Issues

### Frontend Won't Start
```bash
# If Node.js version is too old
cd frontend
npm run build
npx serve -s dist -l 5173
```

### API Errors
- Check OpenAI API key is valid
- Verify assistant ID is correct
- Check network connectivity
- Review backend logs

### CORS Issues
- Ensure CORS_ORIGIN in backend matches frontend URL
- Use exact URLs (include http/https)

### iframe Issues
- Test with simple HTML file first
- Check browser security settings
- Verify no mixed content warnings

## 10. Next Steps

Once all tests pass:
1. Review the DEPLOYMENT.md guide
2. Choose your hosting platform
3. Update environment variables for production
4. Deploy backend first, then frontend
5. Test in production environment
6. Integrate with WordPress

## Support

If you encounter issues during testing:
1. Check the console logs (browser and terminal)
2. Verify all environment variables are set correctly
3. Test each component individually (API first, then frontend)
4. Review the troubleshooting sections in DEPLOYMENT.md