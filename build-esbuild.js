const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Check if this is a development build
const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev' || process.argv.includes('--dev');
const isWatch = process.argv.includes('--watch');

console.log(`🔨 Building Price Patrol Extension with esbuild (${isDev ? 'Development' : 'Production'})...`);

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
}

// Copy manifest file
const manifestSource = isDev ? 'manifest.dev.json' : 'manifest.json';
copyFile(manifestSource, 'dist/manifest.json');

// Copy static files
copyFile('src/popup/popup.html', 'dist/popup/popup.html');
copyFile('src/popup/popup.css', 'dist/popup/popup.css');
copyFile('src/popup/recipe-builder.html', 'dist/popup/recipe-builder.html');
copyFile('src/popup/recipe-builder.css', 'dist/popup/recipe-builder.css');
copyFile('src/content/content.css', 'dist/content/content.css');

// Copy icon files
copyFile('src/icons/icon16.svg', 'dist/icons/icon16.svg');
copyFile('src/icons/icon32.svg', 'dist/icons/icon32.svg');
copyFile('src/icons/icon48.svg', 'dist/icons/icon48.svg');
copyFile('src/icons/icon128.svg', 'dist/icons/icon128.svg');

// Bundle JavaScript files with esbuild
async function build() {
    try {
        // Common esbuild options
        const commonOptions = {
            bundle: true,
            platform: 'browser',
            target: 'chrome100',
            minify: !isDev,
            sourcemap: isDev,
            logLevel: 'info',
        };

        const buildOptions = isWatch ? { ...commonOptions, watch: {
            onRebuild(error, result) {
                if (error) console.error('❌ Watch build failed:', error);
                else console.log('✅ Rebuilt successfully');
            },
        }} : commonOptions;

        // Build content script
        await esbuild.build({
            ...buildOptions,
            entryPoints: ['src/content/content.ts'],
            outfile: 'dist/content/content.js',
        });

        // Build background script
        await esbuild.build({
            ...buildOptions,
            entryPoints: ['src/background/background.ts'],
            outfile: 'dist/background/background.js',
        });

        // Build popup script
        await esbuild.build({
            ...buildOptions,
            entryPoints: ['src/popup/popup.ts'],
            outfile: 'dist/popup/popup.js',
        });

        // Build recipe builder script
        await esbuild.build({
            ...buildOptions,
            entryPoints: ['src/popup/recipe-builder.ts'],
            outfile: 'dist/popup/recipe-builder.js',
        });

        console.log('✅ Extension built successfully!');
        console.log('📦 Output: /dist');
        
        if (isWatch) {
            console.log('👀 Watching for changes...');
        }
    } catch (error) {
        console.error('❌ Build failed:', error);
        process.exit(1);
    }
}

function copyFile(src, dest) {
    const destDir = path.dirname(dest);
    
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`📄 Copied: ${src} -> ${dest}`);
    } else {
        console.warn(`⚠️ Source file not found: ${src}`);
    }
}

// Run the build
build();