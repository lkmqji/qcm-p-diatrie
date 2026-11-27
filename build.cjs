const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFileSafe(srcPath, destPath, label) {
  if (!fs.existsSync(srcPath)) {
    console.warn(`[build] Warning: missing asset ${srcPath}`);
    return;
  }
  ensureDir(path.dirname(destPath));
  fs.copyFileSync(srcPath, destPath);
  const stat = fs.statSync(destPath);
  console.log(`[build] Copied ${label} (${stat.size} bytes)`);
}

function buildDist({ isDev = process.argv.includes('--dev') || process.env.PEDIA_DEV === '1' } = {}) {
  const distDir = path.join(__dirname, 'dist');
  const rootVendorDir = path.join(__dirname, 'vendor');
  const distVendorDir = path.join(distDir, 'vendor');

  ensureDir(distDir);
  ensureDir(rootVendorDir);
  ensureDir(distVendorDir);

  // Sync offline vendor dependencies (Lucide + Canvas-Confetti) to root vendor/ and dist/vendor/
  const vendorEntries = [
    {
      src: path.join(__dirname, 'node_modules', 'lucide', 'dist', 'umd', 'lucide.min.js'),
      outName: 'lucide.min.js'
    },
    {
      src: path.join(__dirname, 'node_modules', 'canvas-confetti', 'dist', 'confetti.browser.js'),
      outName: 'confetti.browser.min.js'
    }
  ];

  for (const v of vendorEntries) {
    copyFileSafe(v.src, path.join(rootVendorDir, v.outName), `vendor/${v.outName}`);
    copyFileSafe(v.src, path.join(distVendorDir, v.outName), `dist/vendor/${v.outName}`);
  }

  const filesToCopy = [
    'index.html',
    'manifest.json',
    'sw.js',
    'icon-192.svg',
    'icon-512.svg'
  ];

  if (isDev) {
    filesToCopy.push('agentation.bundle.js');
  } else {
    const staleDevFile = path.join(distDir, 'agentation.bundle.js');
    if (fs.existsSync(staleDevFile)) {
      fs.unlinkSync(staleDevFile);
      console.log('[build] Removed stale dist/agentation.bundle.js in prod mode');
    }
  }

  for (const file of filesToCopy) {
    copyFileSafe(path.join(__dirname, file), path.join(distDir, file), `dist/${file}`);
  }

  console.log(`[build] ${isDev ? 'Development' : 'Production'} bundle ready in dist/ directory.`);
}

if (require.main === module) {
  buildDist();
}

module.exports = { buildDist };
