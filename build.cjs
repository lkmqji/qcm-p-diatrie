const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const filesToCopy = [
  'index.html',
  'agentation.bundle.js',
  'manifest.json',
  'sw.js',
  'icon-192.svg',
  'icon-512.svg'
];

for (const file of filesToCopy) {
  const src = path.join(__dirname, file);
  const dest = path.join(distDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    const stat = fs.statSync(dest);
    console.log(`[build] Copied ${file} -> dist/${file} (${stat.size} bytes)`);
  }
}

console.log('[build] Production bundle ready in dist/ directory.');
