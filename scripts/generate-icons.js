#!/usr/bin/env node
// Generate placeholder PWA icons
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// Skip if canvas isn't available - use a simple SVG approach instead
const sizes = [192, 512];
const iconDir = path.join(__dirname, 'public', 'icons');

if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

// Create SVG favicon
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#4f46e5"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="20" fill="url(#bg)"/>
  <text x="50" y="68" text-anchor="middle" font-size="50" fill="white" font-family="Arial">♠</text>
</svg>`;

fs.writeFileSync(path.join(iconDir, 'favicon.svg'), svg);
console.log('Created favicon.svg');

// Create PNG placeholders (1x1 transparent PNG if canvas not available)
sizes.forEach(size => {
  const name = `icon-${size}x${size}.png`;
  const filePath = path.join(iconDir, name);
  if (!fs.existsSync(filePath)) {
    // Write a minimal valid PNG (1x1 pixel)
    const png = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG header
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xD7, 0x63, 0x60, 0x60, 0x00, 0x00,
      0x00, 0x02, 0x00, 0x01, 0xE5, 0x27, 0xDE, 0xFC,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
      0xAE, 0x42, 0x60, 0x82
    ]);
    fs.writeFileSync(filePath, png);
    console.log(`Created ${name}`);
  }
});
