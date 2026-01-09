#!/usr/bin/env node

/**
 * Generate PNG logos from SVG source
 * This script converts the SVG logo to various PNG sizes needed for the app
 */

const fs = require('fs');
const path = require('path');

// Try to use sharp if available, otherwise provide instructions
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('Sharp not installed. Installing...');
  console.error('Please run: npm install --save-dev sharp');
  console.error('Then run this script again.');
  process.exit(1);
}

const sourceSvg = path.join(__dirname, '../public/brand/logo.svg');
const outputDir = {
  brand: path.join(__dirname, '../public/brand'),
  icons: path.join(__dirname, '../public/icons'),
  root: path.join(__dirname, '../public'),
};

// Define all sizes we need
const sizes = {
  'brand/logo.png': 200, // Primary logo
  'favicon.ico': [16, 32, 48], // Multi-size ICO
  'icons/icon-192.png': 192,
  'icons/icon-512.png': 512,
  'icons/apple-touch-icon.png': 180,
  'og.png': { width: 1200, height: 630 },
  'twitter.png': { width: 1200, height: 630 },
};

async function generatePng(svgPath, outputPath, size) {
  try {
    let options;
    if (typeof size === 'object') {
      // For og.png and twitter.png, use exact dimensions
      options = {
        width: size.width,
        height: size.height,
        fit: 'contain',
        background: { r: 0, g: 0, b: 51, alpha: 1 }, // Dark blue background #000033
      };
    } else {
      // Square images
      options = {
        width: size,
        height: size,
        fit: 'contain',
        background: { r: 0, g: 0, b: 51, alpha: 1 }, // Transparent or dark blue
      };
    }

    await sharp(svgPath)
      .resize(options)
      .png()
      .toFile(outputPath);

    console.log(`✅ Generated: ${outputPath} (${size.width || size}x${size.height || size})`);
  } catch (error) {
    console.error(`❌ Error generating ${outputPath}:`, error.message);
    throw error;
  }
}

async function generateFavicon(svgPath, outputPath) {
  try {
    // For favicon, we'll create a PNG first, then user can convert to ICO
    // Most modern browsers accept PNG favicons
    await sharp(svgPath)
      .resize(32, 32)
      .png()
      .toFile(outputPath.replace('.ico', '.png'));

    console.log(`✅ Generated favicon PNG: ${outputPath.replace('.ico', '.png')}`);
    console.log(`⚠️  Note: For .ico format, use an online converter or tool`);
  } catch (error) {
    console.error(`❌ Error generating favicon:`, error.message);
    throw error;
  }
}

async function main() {
  if (!fs.existsSync(sourceSvg)) {
    console.error(`❌ Source SVG not found: ${sourceSvg}`);
    process.exit(1);
  }

  console.log('🖼️  Generating logo assets from SVG...\n');

  // Generate all PNG sizes
  for (const [outputFile, size] of Object.entries(sizes)) {
    const outputPath = path.join(outputDir.root, outputFile);
    const dir = path.dirname(outputPath);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      if (outputFile === 'favicon.ico') {
        await generateFavicon(sourceSvg, outputPath);
      } else {
        await generatePng(sourceSvg, outputPath, size);
      }
    } catch (error) {
      console.error(`Failed to generate ${outputFile}`);
    }
  }

  console.log('\n✨ Logo generation complete!');
  console.log('\n📝 Next steps:');
  console.log('   - Convert favicon.png to .ico format if needed');
  console.log('   - Verify all images display correctly in the app');
}

main().catch(console.error);

