# Price Patrol Chrome Extension

An open-source Chrome extension for crowdsourced price tracking. Automatically extract product pricing data from supported merchant websites and contribute to the Price Patrol database.

## Features

- 🔍 **Smart Detection**: Automatically detects supported merchant pages
- 📊 **Data Extraction**: Extracts product pricing data using pre-built recipes
- 🔐 **Secure Authentication**: Secure login with Price Patrol account
- 🔄 **Auto-Updates**: Keeps extraction recipes up-to-date
- 🎯 **Privacy-First**: Only collects product data, no personal information

## Installation

### Chrome Web Store (Coming Soon)
The extension will be available on the Chrome Web Store.

### Manual Installation
1. Download the latest release from [Releases](https://github.com/price-patrol/price-patrol-extension/releases)
2. Extract the ZIP file
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" in the top right
5. Click "Load unpacked" and select the extracted folder

### Development Installation
1. Clone this repository
2. Install dependencies: `npm install`
3. Build the extension: `npm run build`
4. Load the `dist` folder as an unpacked extension in Chrome

## Usage

1. **Create Account**: Sign up for a free account at [Price Patrol](https://www.pricepatrol.co.nz)
2. **Login**: Click the extension icon and log in with your credentials
3. **Browse**: Visit supported merchant websites (Noel Leeming, PB Tech, etc.)
4. **Extract**: Click "Extract Data" when the extension detects a product page
5. **Contribute**: Your extracted data helps build the Price Patrol database

## Supported Merchants

The extension currently supports data extraction from:
- Noel Leeming
- PB Tech
- Harvey Norman
- JB Hi-Fi
- And many more (recipes are updated regularly)

## Privacy & Security

- ✅ **Open Source**: All code is publicly available for review
- ✅ **No Personal Data**: Only product pricing information is collected
- ✅ **Secure Storage**: Authentication tokens are stored securely
- ✅ **Local Processing**: Data extraction happens locally in your browser
- ✅ **Opt-in Only**: You control when data is submitted

See our [Privacy Policy](https://www.pricepatrol.co.nz/privacy) for complete details.

## Development

### Prerequisites
- Node.js 16+
- Chrome/Chromium browser

### Build Commands
```bash
# Install dependencies
npm install

# Build for development
npm run build

# Watch for changes (development)
npm run watch

# Development mode (build + watch)
npm run dev
```

### Project Structure
```
price-patrol-extension/
├── manifest.json           # Extension manifest
├── src/
│   ├── types.ts            # TypeScript type definitions
│   ├── background/         # Background service worker
│   ├── content/           # Content scripts and styles
│   ├── popup/             # Extension popup interface
│   └── utils/             # Shared utilities
└── dist/                  # Built extension
```

### Architecture

- **Background Script**: Manages recipes, authentication, and periodic updates
- **Content Script**: Extracts data from merchant pages
- **Popup Interface**: Provides user authentication and status
- **API Client**: Communicates with Price Patrol API
- **Recipe Manager**: Handles scraping recipe updates

## Contributing

We welcome contributions! Please read our [Contributing Guidelines](CONTRIBUTING.md) first.

### Ways to Contribute
- 🐛 Report bugs and issues
- 💡 Suggest new features
- 🔧 Submit code improvements
- 📝 Improve documentation
- 🏪 Request support for new merchants

## API Integration

This extension integrates with the Price Patrol API:
- **Authentication**: JWT-based user authentication
- **Recipe Management**: Automatic updates of scraping recipes
- **Data Submission**: Secure submission of extracted pricing data

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📧 Email: support@pricepatrol.co.nz
- 🐛 Issues: [GitHub Issues](https://github.com/price-patrol/price-patrol-extension/issues)
- 💬 Community: [Discord Server](https://discord.gg/pricepatrol)

## Roadmap

- [ ] Chrome Web Store listing
- [ ] Firefox extension port
- [ ] Advanced filtering options
- [ ] Bulk extraction capabilities
- [ ] Price history integration
- [ ] Custom notification settings

---

**Disclaimer**: This extension is designed for personal use and research purposes. Please respect website terms of service and rate limits.