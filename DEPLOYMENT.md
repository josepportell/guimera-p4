# Deployment Guide - Guimera AI Assistant

This guide provides step-by-step instructions for deploying the Guimera AI Assistant web application to production.

## Prerequisites

- Server with Node.js 20.19+ or 22.12+
- OpenAI API key with access to Assistants API
- Domain name or subdomain for hosting
- Basic knowledge of server administration

## 1. Server Setup

### Option A: VPS/Dedicated Server (Ubuntu/Debian)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install nginx for reverse proxy
sudo apt install nginx -y

# Install git
sudo apt install git -y
```

### Option B: Cloud Platforms

- **Vercel**: Perfect for frontend deployment
- **Railway**: Good for both backend and frontend
- **DigitalOcean App Platform**: Full-stack deployment
- **Heroku**: Backend deployment (requires buildpack)

## 2. Clone and Setup Application

```bash
# Clone the repository
git clone https://github.com/josepportell/guimera-p4.git
cd guimera-p4

# Setup backend
cd backend
npm install
cp .env.example .env

# Edit environment variables
nano .env
```

### Environment Configuration

#### Backend `.env` file:
```env
OPENAI_API_KEY=your_actual_openai_api_key_here
OPENAI_ASSISTANT_ID=g-68c70e83c6ec8191a4417a2e4ac2e90f
PORT=3001
CORS_ORIGIN=https://your-domain.com
```

#### Frontend `.env` file:
```bash
cd ../frontend
cp .env.example .env
nano .env
```

```env
VITE_API_URL=https://api.your-domain.com
```

## 3. Backend Deployment

### Build and Start Backend

```bash
cd backend

# Install dependencies
npm install

# Test the application
npm run dev

# Start with PM2 for production
pm2 start server.js --name "guimera-backend"
pm2 save
pm2 startup
```

### Configure Nginx Reverse Proxy

Create nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/guimera-api
```

```nginx
server {
    listen 80;
    server_name api.your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/guimera-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL Certificate (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d api.your-domain.com
```

## 4. Frontend Deployment

### Option A: Static Hosting (Recommended)

```bash
cd frontend

# Install dependencies
npm install

# Build for production
npm run build

# The dist/ folder contains your built application
```

Upload the `dist/` folder contents to:
- **Vercel**: Connect GitHub repo, auto-deploy
- **Netlify**: Drag & drop dist folder or connect GitHub
- **GitHub Pages**: Push dist folder to gh-pages branch
- **Your web server**: Copy to `/var/www/html/` or your web root

### Option B: Server Deployment

```bash
# Install serve globally
sudo npm install -g serve

# Serve the built application
serve -s dist -l 5173

# Or use PM2
pm2 serve dist 5173 --name "guimera-frontend"
```

Configure nginx for frontend:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/guimera-p4/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 5. WordPress Integration

### Method 1: Direct iframe Embedding

Add this code to your WordPress page/post:

```html
<iframe
    src="https://your-domain.com"
    width="100%"
    height="600"
    frameborder="0"
    style="border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
</iframe>
```

### Method 2: WordPress Plugin/Custom Code

Add to your theme's `functions.php`:

```php
function guimera_ai_shortcode($atts) {
    $atts = shortcode_atts(array(
        'height' => '600',
        'width' => '100%',
    ), $atts, 'guimera_ai');

    return '<iframe src="https://your-domain.com" width="' . $atts['width'] . '" height="' . $atts['height'] . '" frameborder="0" style="border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);"></iframe>';
}
add_shortcode('guimera_ai', 'guimera_ai_shortcode');
```

Then use in WordPress: `[guimera_ai height="600"]`

### Method 3: WordPress Block (Gutenberg)

Use the "Custom HTML" block and paste the iframe code.

## 6. Domain Configuration

### DNS Records

Set up these DNS records:

```
A     your-domain.com        -> your-server-ip
CNAME api.your-domain.com    -> your-domain.com
```

### Subdomain Setup (Alternative)

If you prefer subdomains:
```
CNAME chat.guimera.info      -> your-domain.com
CNAME api.guimera.info       -> your-domain.com
```

## 7. Production Checklist

### Security
- ✅ HTTPS enabled (SSL certificate)
- ✅ Environment variables secured (not in git)
- ✅ CORS properly configured
- ✅ API key permissions limited to necessary scopes

### Performance
- ✅ Frontend built and minified
- ✅ Gzip compression enabled in nginx
- ✅ Static assets cached
- ✅ PM2 cluster mode for backend (optional)

### Monitoring
- ✅ PM2 monitoring enabled
- ✅ Server logs configured
- ✅ Uptime monitoring setup
- ✅ Error tracking (optional: Sentry, LogRocket)

## 8. Quick Deployment Commands

### Full deployment script:

```bash
#!/bin/bash
# deploy.sh

# Pull latest changes
git pull origin master

# Update backend
cd backend
npm install
pm2 reload guimera-backend

# Update frontend
cd ../frontend
npm install
npm run build

# Restart nginx (if serving from server)
sudo systemctl reload nginx

echo "Deployment complete!"
```

Make it executable: `chmod +x deploy.sh`

## 9. Troubleshooting

### Common Issues

**Backend won't start:**
- Check OpenAI API key is valid
- Verify port 3001 is available
- Check PM2 logs: `pm2 logs guimera-backend`

**Frontend build fails:**
- Ensure Node.js version is 20.19+
- Clear node_modules: `rm -rf node_modules && npm install`
- Check TypeScript errors: `npm run build`

**CORS errors:**
- Verify CORS_ORIGIN in backend .env matches frontend domain
- Check nginx proxy headers are set correctly

**WordPress iframe issues:**
- Check X-Frame-Options headers
- Ensure HTTPS on both WordPress and app
- Test iframe src URL directly

### Logs and Debugging

```bash
# Backend logs
pm2 logs guimera-backend

# Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# System logs
journalctl -u nginx -f
```

## 10. Scaling and Advanced Setup

### Load Balancing (Multiple Servers)

```nginx
upstream guimera_backend {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
}

server {
    location / {
        proxy_pass http://guimera_backend;
    }
}
```

### Database Session Storage (Optional)

For session persistence across restarts, consider adding Redis:

```bash
# Install Redis
sudo apt install redis-server -y

# In your backend, add redis session storage
npm install connect-redis express-session redis
```

### CDN Setup

For better performance, use a CDN like Cloudflare:
1. Add your domain to Cloudflare
2. Update DNS to Cloudflare nameservers
3. Enable proxy (orange cloud) for your records
4. Configure caching rules

## Support

For issues or questions:
- Check GitHub Issues: https://github.com/josepportell/guimera-p4/issues
- Review application logs
- Test components individually (backend API, frontend build)

## Updates

To update the application:
1. Pull latest changes: `git pull origin master`
2. Run deployment script: `./deploy.sh`
3. Test functionality
4. Monitor logs for any issues