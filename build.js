const fs = require('fs');
const path = require('path');

// Check if this is a development build
const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev' || process.argv.includes('--dev');

console.log(`🔨 Building Price Patrol Extension (${isDev ? 'Development' : 'Production'})...`);

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
}

// Copy appropriate manifest.json
const manifestSource = isDev ? 'manifest.dev.json' : 'manifest.json';
copyFile(manifestSource, 'manifest.json');

// Copy static files
copyFile('src/popup/popup.html', 'popup/popup.html');
copyFile('src/popup/popup.css', 'popup/popup.css');
copyFile('src/content/content.css', 'content/content.css');

// Process JavaScript files (already compiled by TypeScript)
processJsFile('dist-temp/popup/popup.js', 'popup/popup.js');
processJsFile('dist-temp/content/content.js', 'content/content.js');
processJsFile('dist-temp/background/background.js', 'background/background.js');

// Copy static icon files
copyFile('src/icons/icon16.svg', 'icons/icon16.svg');
copyFile('src/icons/icon32.svg', 'icons/icon32.svg');
copyFile('src/icons/icon48.svg', 'icons/icon48.svg');
copyFile('src/icons/icon128.svg', 'icons/icon128.svg');

// Clean up temp directory
if (fs.existsSync('dist-temp')) {
    fs.rmSync('dist-temp', { recursive: true });
}

console.log('✅ Extension built successfully!');
console.log('📦 Output: /dist');

function copyFile(src, dest) {
    const destPath = path.join('dist', dest);
    const destDir = path.dirname(destPath);
    
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    
    fs.copyFileSync(src, destPath);
    console.log(`📄 Copied: ${src} -> ${dest}`);
}

function processJsFile(src, dest) {
    const destPath = path.join('dist', dest);
    const destDir = path.dirname(destPath);
    
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    
    if (fs.existsSync(src)) {
        let content = fs.readFileSync(src, 'utf8');
        
        // Remove any import/export statements that might cause issues
        content = content.replace(/^import .+$/gm, '');
        content = content.replace(/^export .+$/gm, '');
        
        fs.writeFileSync(destPath, content);
        console.log(`📄 Processed: ${src} -> ${dest}`);
    } else {
        console.warn(`⚠️ Source file not found: ${src}`);
    }
}

function createIcon(filename) {
    const iconPath = path.join('dist', 'icons', filename);
    const iconDir = path.dirname(iconPath);
    
    if (!fs.existsSync(iconDir)) {
        fs.mkdirSync(iconDir, { recursive: true });
    }
    
    // Create a simplified Price Patrol icon that works reliably
    const size = parseInt(filename.match(/\d+/)[0]);
    const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <!-- Background circle -->
        <circle cx="${size/2}" cy="${size/2}" r="${size/2-2}" fill="#4F46E5" stroke="#3730A3" stroke-width="2"/>
        
        <!-- Price tag shape -->
        <path d="M${size*0.2} ${size*0.3} L${size*0.6} ${size*0.3} L${size*0.7} ${size*0.4} L${size*0.7} ${size*0.6} L${size*0.6} ${size*0.7} L${size*0.2} ${size*0.7} Z" 
              fill="white" stroke="#3730A3" stroke-width="1"/>
        
        <!-- Price tag hole -->
        <circle cx="${size*0.35}" cy="${size*0.45}" r="${size*0.04}" fill="#4F46E5"/>
        
        <!-- Dollar sign -->
        <text x="${size*0.45}" y="${size*0.6}" text-anchor="middle" fill="#4F46E5" 
              font-size="${size*0.2}" font-family="Arial, sans-serif" font-weight="bold">$</text>
    </svg>`;
    
    fs.writeFileSync(iconPath, svg);
    console.log(`🎨 Created icon: ${filename}`);
}