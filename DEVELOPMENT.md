# Development Setup Guide

## Quick Start

### 1. Build for Development
```bash
# Install dependencies
npm install

# Build development version (points to localhost)
npm run build:dev
```

### 2. Load Extension in Chrome
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist` folder from this project
5. The extension will appear as "Price Patrol (Dev)"

### 3. Start Your API Server
Make sure your Price Patrol API is running on `http://localhost:3000`

### 4. Start Your Web Server
Make sure your Price Patrol web app is running on `http://localhost:5173`

## Development vs Production

### Development Mode
- **API**: `http://localhost:3000/api/v1`
- **Web**: `http://localhost:5173`
- **Extension Name**: "Price Patrol (Dev)"
- **Version**: "1.0.0.1"
- **Environment Indicator**: Red "DEV" badge

### Production Mode
- **API**: `https://www.pricepatrol.co.nz/api/v1`
- **Web**: `https://www.pricepatrol.co.nz`
- **Extension Name**: "Price Patrol"
- **Version**: "1.0.0"
- **Environment Indicator**: Green "PROD" badge

## Build Commands

```bash
# Development build (localhost endpoints)
npm run build:dev

# Production build (pricepatrol.co.nz endpoints)
npm run build:prod

# Watch for changes (after initial build)
npm run watch

# Development workflow (build:dev + watch)
npm run dev
```

## Testing the Extension

### 1. Login Test
1. Click the extension icon
2. Try to log in with test credentials
3. You should see a clear error message about server connection if API is not running

### 2. Page Support Test
1. Visit any website after logging in
2. Extension should show "Page not supported" since no recipes exist yet

### 3. Environment Verification
1. Check that the extension shows "DEV" badge in the footer
2. Verify that "Create Account" and "Forgot Password" links point to localhost:5173

## Debugging

### View Extension Logs
1. Right-click the extension icon → "Inspect popup" (for popup logs)
2. Go to `chrome://extensions/` → Click "background page" link (for background logs)
3. Open DevTools on any page and check Console (for content script logs)

### Common Issues

**"Cannot connect to server" error**
- Make sure your API server is running on `http://localhost:3000`
- Check that CORS is properly configured on your API

**Extension not updating**
- Click the refresh button on the extension in `chrome://extensions/`
- Or disable and re-enable the extension

**API calls failing**
- Check Network tab in DevTools for actual HTTP requests
- Verify the API endpoints match your backend routes

## File Structure

```
dist/                  # Built extension files
├── manifest.json      # Extension manifest (dev or prod)
├── background/        # Background service worker
├── content/          # Content scripts
├── popup/            # Extension popup
└── icons/            # Extension icons

src/                   # Source code
├── background/       # Background service worker
├── content/         # Content scripts  
├── popup/           # Extension popup
├── utils/           # Shared utilities
└── config.ts        # Environment configuration
```

## Next Steps

1. Build your API endpoints (`/auth/login`, `/auth/me`, etc.)
2. Test login functionality
3. Create scraping recipes in your backend
4. Test data extraction on merchant sites
5. Build the web interface for managing recipes

The extension is now ready for development with localhost endpoints!