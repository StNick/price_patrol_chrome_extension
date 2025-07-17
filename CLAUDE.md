# Price Patrol Chrome Extension - Architecture & Development Guide

## Project Overview

Price Patrol is an open-source Chrome extension for crowdsourced price tracking. The extension automatically detects supported merchant websites, extracts product pricing data using configurable "recipes," and submits this data to the Price Patrol API for building a comprehensive price database.

## Architecture Overview

### Extension Structure (Manifest V3)

The extension follows Chrome's Manifest V3 architecture with three main components:

1. **Background Service Worker** (`background/background.ts`) - Persistent service worker handling extension lifecycle, recipe management, and API coordination
2. **Content Scripts** (`content/content.ts`) - Injected scripts that extract data from merchant pages using recipes
3. **Popup Interface** (`popup/`) - Extension popup providing authentication, status, and manual extraction controls

### Key Design Patterns

#### Environment-Aware Configuration
- **Development Mode**: Points to `localhost:3000` (API) and `localhost:5173` (web app)
- **Production Mode**: Points to `pricepatrol.co.nz` domains
- Environment detection via manifest name checking (`includes('Dev')`)
- Dual manifest files: `manifest.json` (prod) and `manifest.dev.json` (dev)

#### Recipe-Based Data Extraction
- **Dynamic Recipe System**: Extraction logic is data-driven via recipes fetched from API
- **Multi-Method Extraction**: Supports CSS selectors, XPath, structured data (JSON-LD), and regex
- **Automatic Updates**: Recipes auto-update every 24 hours via background alarms
- **URL Pattern Matching**: Recipes include regex patterns to match supported pages

#### Structured Message Passing
- Background ↔ Popup: Authentication state, recipe management, stats
- Background ↔ Content: Recipe retrieval for current URL
- Popup ↔ Content: Data extraction triggers and status updates

## Core Components

### Background Service Worker (`background/background.ts`)

**Responsibilities:**
- Extension lifecycle management (startup, install, update)
- Recipe management (fetch, cache, periodic updates)
- Authentication state coordination
- URL-to-recipe matching
- Periodic background tasks via Chrome alarms

**Key Functions:**
```typescript
initializeExtension()     // Setup on startup/install
updateRecipes()           // Fetch latest recipes from API
findRecipesForUrl(url)    // Match recipes to current page
handleBackgroundMessage() // Process messages from popup/content
```

**Recipe Management Flow:**
1. Check for cached recipes on extension start
2. Update if cache is older than 24 hours
3. Set up periodic alarm for automatic updates
4. Provide recipe lookup service for content scripts

### Content Scripts (`content/content.ts`)

**Responsibilities:**
- Page data extraction using recipes
- Structured data context building (meta tags, JSON-LD, data layers)
- Multi-method field extraction (CSS, XPath, structured data)
- API submission of extracted data
- User notification display

**Extraction Pipeline:**
1. **Context Building**: Extract meta tags, JSON-LD, data layers from page
2. **Field Processing**: Apply each recipe selector using appropriate method
3. **Data Validation**: Parse prices, normalize URLs, validate required fields
4. **API Submission**: Submit structured data to Price Patrol API
5. **User Feedback**: Show extraction success/failure notifications

**Extraction Methods:**
- `CSS_SELECTOR`: Standard DOM queries with optional attribute extraction
- `XPATH`: XPath expressions for complex element selection
- `STRUCTURED_DATA`: JSON-LD and meta tag data extraction via object paths
- `TEXT`: Text content extraction with regex parsing

### Popup Interface (`popup/`)

**Responsibilities:**
- User authentication (login/logout)
- Extension status display
- Page support detection
- Manual data extraction triggering
- Recipe management (refresh, stats)

**UI States:**
- **Unauthenticated**: Login form with environment-aware register/forgot links
- **Authenticated**: User info, page status, extraction controls, stats dashboard

**Page Support Detection:**
- Real-time checking of current tab against recipe database
- Visual indicators (supported/not-supported/checking)
- Automatic retry logic for content script communication issues

### Utility Modules (`utils/`)

#### API Client (`api-client.ts`)
- Centralized API communication with automatic token handling
- Environment-aware base URL configuration
- Standardized error handling and response wrapping
- Type-safe interfaces for all API endpoints

#### Storage Manager (`storage.ts`)
- Chrome storage abstraction layer
- Authentication token management
- Recipe caching with timestamp tracking
- User data persistence

#### Data Extractor (`data-extractor.ts`)
- Reusable extraction logic (duplicated in content script for compatibility)
- Field value parsing and normalization
- Price parsing with currency symbol handling
- Boolean and URL normalization utilities

## Build System & Development

### TypeScript Configuration
- **Target**: ES2020 for modern browser compatibility
- **Output**: `dist-temp/` for compilation, then processed to `dist/`
- **Type Safety**: Strict mode enabled with Chrome extension type definitions

### Build Pipeline (`build.js`)
- **Environment Detection**: Dev/prod mode via `NODE_ENV` or `--dev` flag
- **Manifest Selection**: Automatic dev/prod manifest switching
- **File Processing**: Static file copying and JavaScript bundling
- **Icon Generation**: Placeholder SVG icon creation (replace with actual PNG files)
- **Module Cleanup**: Import/export statement removal for extension compatibility

### Development Commands
```bash
npm run build        # Standard build (production)
npm run build:dev    # Development build (localhost endpoints)
npm run build:prod   # Explicit production build
npm run watch        # TypeScript compilation watching
npm run dev          # Development workflow (build:dev + watch)
```

### Environment Management
The extension uses different manifests and configurations based on build mode:

**Development Features:**
- Extension name: "Price Patrol (Dev)"
- Version suffix: ".1" (e.g., "1.0.0.1")
- API endpoints: `localhost:3000`
- Web app links: `localhost:5173`
- Visual "DEV" environment indicator

**Production Features:**
- Extension name: "Price Patrol"
- Standard semantic versioning
- API endpoints: `pricepatrol.co.nz`
- Production web app links
- Visual "PROD" environment indicator

## Data Flow Architecture

### Authentication Flow
1. User enters credentials in popup
2. Popup sends login request to API
3. On success, token stored in Chrome storage
4. Background service worker notified for recipe initialization
5. Popup UI updates to authenticated state

### Recipe Management Flow
1. Background worker checks recipe cache age on startup
2. If stale, fetches latest recipes from API
3. Recipes stored with timestamp in Chrome storage
4. Periodic alarm (24h) triggers automatic updates
5. URL matching performed against cached recipes

### Data Extraction Flow
1. User navigates to merchant page
2. Popup queries background for recipes matching current URL
3. If recipes found, extraction controls enabled
4. User triggers extraction via popup
5. Popup sends extraction message to content script
6. Content script applies recipe selectors to extract data
7. Extracted data submitted to API
8. Results communicated back to popup for user feedback

## Integration Points

### Price Patrol API Integration
- **Authentication**: JWT-based with automatic token refresh
- **Recipe Management**: `GET /scraping-recipes` for recipe updates
- **Data Submission**: `POST /prices/submit` for extracted price data
- **User Management**: `GET /auth/me` for profile verification

### Merchant Website Integration
- **Universal Content Scripts**: Injected on all URLs for maximum compatibility
- **Passive Detection**: No intrusive page modifications
- **Structured Data Extraction**: Leverages existing meta tags and JSON-LD
- **Fallback Mechanisms**: Multiple extraction methods per field for reliability

## Development Patterns

### Error Handling Strategy
- **Network Resilience**: Graceful degradation when API unavailable
- **Content Script Safety**: Robust selector matching with fallbacks
- **User Communication**: Clear error messages with actionable guidance
- **Logging**: Comprehensive console logging for debugging

### Security Considerations
- **Minimal Permissions**: Only required Chrome permissions requested
- **Token Storage**: Secure local storage for authentication tokens
- **Data Privacy**: Only product data extracted, no personal information
- **Open Source**: Complete code transparency for security review

### Performance Optimizations
- **Recipe Caching**: 24-hour cache to minimize API requests
- **Lazy Loading**: Content scripts only active when needed
- **Efficient Selectors**: Optimized DOM queries and XPath expressions
- **Background Processing**: Heavy lifting done in service worker

## Common Development Scenarios

### Adding New Extraction Methods
1. Update `RecipeSelector` interface in `types.ts`
2. Implement extraction logic in `content/content.ts`
3. Add corresponding case in `extractFieldValue()` function
4. Test with sample merchant pages

### Environment Configuration Changes
1. Update base URLs in `config.ts`
2. Modify environment detection logic if needed
3. Update manifest files for new permissions
4. Test both dev and production builds

### API Integration Updates
1. Update type definitions in `types.ts`
2. Modify API client methods in `utils/api-client.ts`
3. Update error handling in popup and content scripts
4. Test with backend API changes

### Recipe Schema Evolution
1. Update recipe interfaces in `types.ts`
2. Implement backward compatibility in extraction logic
3. Update recipe processing in background worker
4. Coordinate with backend recipe management system

This architecture supports rapid development while maintaining code quality, security, and user experience across different environments and merchant integrations.