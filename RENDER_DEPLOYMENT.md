# Render Deployment Guide - Guimera AI Assistant

This guide provides step-by-step instructions for deploying the Guimera AI Assistant to Render.com and embedding it in WordPress at guimera.info.

## Why Render?

- ✅ **Free tier available** for testing
- ✅ **Automatic deployments** from GitHub
- ✅ **Built-in SSL certificates**
- ✅ **Environment variable management**
- ✅ **Both backend and frontend hosting**

## Prerequisites

- ✅ GitHub repository: `https://github.com/josepportell/guimera-p4`
- ✅ Render.com account (free)
- ✅ OpenAI API key
- ✅ Access to guimera.info WordPress admin

## Part 1: Deploy Backend API to Render

### Step 1: Create Render Account

1. Go to [render.com](https://render.com)
2. Sign up using your GitHub account
3. Connect your GitHub repository

### Step 2: Deploy Backend Service

1. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect to your GitHub repository: `josepportell/guimera-p4`
   - Click "Connect"

2. **Configure Backend Service**
   ```
   Name: guimera-ai-backend
   Environment: Node
   Region: Frankfurt (closest to Spain)
   Branch: master
   Root Directory: backend
   Build Command: npm install
   Start Command: npm start
   ```

3. **Set Environment Variables**
   Click "Environment" tab and add:
   ```
   OPENAI_API_KEY=your_actual_openai_api_key_here
   OPENAI_ASSISTANT_ID=g-68c70e83c6ec8191a4417a2e4ac2e90f
   PORT=3001
   CORS_ORIGIN=https://guimera-ai-frontend.onrender.com
   ```

   **Important**: Replace `your_actual_openai_api_key_here` with your real OpenAI API key

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment (5-10 minutes)
   - Note your backend URL: `https://guimera-ai-backend.onrender.com`

### Step 3: Test Backend Deployment

Once deployed, test your backend:
```bash
curl https://guimera-ai-backend.onrender.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "...",
  "openaiConfigured": true,
  "assistantConfigured": true
}
```

## Part 2: Deploy Frontend to Render

### Step 1: Create Frontend Service

1. **Create New Static Site**
   - Click "New +" → "Static Site"
   - Connect to the same repository: `josepportell/guimera-p4`

2. **Configure Frontend Service**
   ```
   Name: guimera-ai-frontend
   Branch: master
   Root Directory: frontend
   Build Command: npm install && npm run build
   Publish Directory: dist
   ```

3. **Set Environment Variables**
   Click "Environment" tab and add:
   ```
   VITE_API_URL=https://guimera-ai-backend.onrender.com
   ```

4. **Deploy**
   - Click "Create Static Site"
   - Wait for deployment (5-10 minutes)
   - Note your frontend URL: `https://guimera-ai-frontend.onrender.com`

### Step 2: Update Backend CORS

1. Go back to your backend service settings
2. Update the `CORS_ORIGIN` environment variable:
   ```
   CORS_ORIGIN=https://guimera-ai-frontend.onrender.com,https://guimera.info,https://www.guimera.info
   ```
3. Save and redeploy the backend

### Step 3: Test Frontend Deployment

1. Open `https://guimera-ai-frontend.onrender.com` in your browser
2. Test the chat functionality
3. Verify AI responses are working

## Part 3: WordPress Integration at guimera.info

### Method 1: Direct iframe Embedding (Recommended)

1. **Log into WordPress Admin**
   - Go to `https://guimera.info/wp-admin`
   - Login with your credentials

2. **Create New Page or Edit Existing**
   - Go to Pages → Add New (or edit existing page)
   - Title: "Assistent IA" or similar

3. **Add iframe Code**
   Switch to "Text" or "HTML" mode and add:
   ```html
   <div style="width: 100%; max-width: 800px; margin: 20px auto;">
       <iframe
           src="https://guimera-ai-frontend.onrender.com"
           width="100%"
           height="600"
           frameborder="0"
           style="border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border: 1px solid #ddd;">
       </iframe>
   </div>
   ```

4. **Publish the Page**
   - Click "Publish"
   - Note the page URL for visitors

### Method 2: WordPress Shortcode (Advanced)

1. **Add to functions.php**
   Go to Appearance → Theme Editor → functions.php and add:
   ```php
   function guimera_ai_shortcode($atts) {
       $atts = shortcode_atts(array(
           'height' => '600',
           'width' => '100%',
       ), $atts, 'guimera_ai');

       $iframe_style = 'border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border: 1px solid #ddd;';

       return '<div style="width: 100%; max-width: 800px; margin: 20px auto;">
                   <iframe src="https://guimera-ai-frontend.onrender.com"
                           width="' . esc_attr($atts['width']) . '"
                           height="' . esc_attr($atts['height']) . '"
                           frameborder="0"
                           style="' . $iframe_style . '">
                   </iframe>
               </div>';
   }
   add_shortcode('guimera_ai', 'guimera_ai_shortcode');
   ```

2. **Use Shortcode in Posts/Pages**
   ```
   [guimera_ai]
   [guimera_ai height="500"]
   [guimera_ai height="700" width="90%"]
   ```

### Method 3: Gutenberg Block (WordPress 5.0+)

1. **Add Custom HTML Block**
   - In page editor, click "+" to add block
   - Search for "Custom HTML"
   - Paste the iframe code from Method 1

2. **Preview and Publish**

## Part 4: Custom Domain Setup (Optional)

### If you want to use a subdomain like chat.guimera.info:

1. **In Render Dashboard**
   - Go to your frontend service
   - Click "Settings" → "Custom Domains"
   - Add `chat.guimera.info`

2. **In Your DNS Provider**
   Add CNAME record:
   ```
   Name: chat
   Value: guimera-ai-frontend.onrender.com
   ```

3. **Update WordPress iframe**
   Change iframe src to: `https://chat.guimera.info`

4. **Update Backend CORS**
   Add to CORS_ORIGIN: `https://chat.guimera.info`

## Part 5: Testing Your Deployment

### ✅ Backend Tests
```bash
# Health check
curl https://guimera-ai-backend.onrender.com/api/health

# Chat test
curl -X POST https://guimera-ai-backend.onrender.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hola, què és Guimera?"}'
```

### ✅ Frontend Tests
1. Open `https://guimera-ai-frontend.onrender.com`
2. Test chat functionality
3. Verify AI responses
4. Check mobile responsiveness

### ✅ WordPress Integration Tests
1. Visit your WordPress page with the iframe
2. Test chat within the iframe
3. Verify no CORS errors (check browser console)
4. Test on mobile devices

## Part 6: Maintenance and Updates

### Automatic Deployments
- Any push to the `master` branch will automatically deploy
- Backend and frontend deploy independently
- Check deployment logs in Render dashboard

### Monitoring
1. **Render Dashboard**
   - Monitor service health
   - Check deployment logs
   - View performance metrics

2. **Error Logging**
   - Backend errors appear in Render logs
   - Frontend errors in browser console
   - Monitor OpenAI API usage

### Updating the Application
1. Make changes locally
2. Push to GitHub: `git push origin master`
3. Render automatically deploys
4. Test the updates

## Part 7: Cost Considerations

### Render Pricing (as of 2024)
- **Static Sites**: Free tier available
- **Web Services**: Free tier with limitations
  - 750 hours/month free
  - Sleeps after 15 minutes of inactivity
  - Upgrade to $7/month for always-on

### OpenAI Costs
- GPT-4 Assistant API usage-based pricing
- Monitor usage in OpenAI dashboard
- Set usage limits if needed

## Part 8: Troubleshooting

### Common Issues

**1. Backend not responding**
- Check Render service logs
- Verify environment variables are set
- Ensure OpenAI API key is valid

**2. CORS errors in WordPress**
- Verify CORS_ORIGIN includes guimera.info domain
- Check WordPress page URL matches CORS settings

**3. iframe not loading**
- Check if iframe src URL is correct
- Verify SSL certificates are working
- Test iframe URL directly in browser

**4. AI not responding**
- Check OpenAI API key permissions
- Verify assistant ID is correct
- Monitor OpenAI API usage limits

### Getting Help
- **Render Support**: [render.com/docs](https://render.com/docs)
- **OpenAI Support**: [help.openai.com](https://help.openai.com)
- **WordPress Support**: Check with your hosting provider

## Part 9: Security Best Practices

### Environment Variables
- Never commit API keys to git
- Use Render's environment variable system
- Regularly rotate API keys

### CORS Configuration
- Only allow necessary domains
- Don't use wildcard (*) in production
- Include both www and non-www versions

### WordPress Security
- Keep WordPress updated
- Use strong admin passwords
- Consider security plugins

## Part 10: Performance Optimization

### Render Optimization
- Use Frankfurt region (closest to Spain)
- Enable HTTP/2 compression
- Monitor response times

### WordPress Optimization
- Use caching plugins
- Optimize iframe loading
- Consider lazy loading for below-fold content

## Summary

Your Guimera AI Assistant is now deployed and ready for production use:

- **Backend API**: `https://guimera-ai-backend.onrender.com`
- **Frontend App**: `https://guimera-ai-frontend.onrender.com`
- **WordPress Integration**: Embedded at guimera.info

The application will automatically deploy when you push updates to GitHub, making maintenance simple and efficient.

## Quick Reference Commands

```bash
# Test backend health
curl https://guimera-ai-backend.onrender.com/api/health

# Test chat API
curl -X POST https://guimera-ai-backend.onrender.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Test message"}'

# Local development with Node 20
source ./use-node20.sh
cd backend && npm run dev    # Terminal 1
cd frontend && npm run dev   # Terminal 2
```

🎉 **Congratulations!** Your Guimera AI Assistant is now live and ready to help visitors at guimera.info!