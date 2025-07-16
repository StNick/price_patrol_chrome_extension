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

// Create icons (placeholder - you'll need actual icon files)
createIcon('icon16.png');
createIcon('icon32.png');
createIcon('icon48.png');
createIcon('icon128.png');

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
    
    // Create a simple SVG icon (replace with actual PNG files)
    const size = parseInt(filename.match(/\d+/)[0]);
    const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${size/2}" cy="${size/2}" r="${size/2-2}" fill="#667eea"/>
        <text x="${size/2}" y="${size/2+4}" text-anchor="middle" fill="white" font-size="${size/3}" font-family="Arial">P</text>
    </svg>`;
    
    fs.writeFileSync(iconPath.replace('.png', '.svg'), svg);
    console.log(`🎨 Created icon: ${filename.replace('.png', '.svg')}`);
}