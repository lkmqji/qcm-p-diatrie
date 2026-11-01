const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Port de départ
let port = parseInt(process.env.PORT, 10) || 3000;
const publicDir = fs.existsSync(path.join(__dirname, 'dist')) ? path.join(__dirname, 'dist') : __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

function createServer() {
  const server = http.createServer((req, res) => {
    let cleanUrl = req.url.split('?')[0];
    if (cleanUrl === '/' || cleanUrl === '') {
      cleanUrl = '/index.html';
    }

    let filePath = path.join(publicDir, cleanUrl);

    // Sécurité: interdire de sortir du dossier
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('403 Interdit');
    }

    fs.stat(filePath, (err, stats) => {
      // Si le fichier n'existe pas ou est un dossier, renvoyer index.html (SPA Fallback)
      if (err || stats.isDirectory()) {
        filePath = path.join(publicDir, 'index.html');
      }

      fs.readFile(filePath, (readErr, content) => {
        if (readErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('404 Introuvable');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(content);
      });
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      port++;
      createServer();
    } else {
      console.error('[Serveur Local] Erreur :', err);
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log('============================================================');
    console.log('  🚀 PédiaDrill — Serveur Local Actif');
    console.log('============================================================');
    console.log(`  🌐 URL de l\'application : ${url}`);
    console.log(`  📂 Dossier servi        : ${publicDir}`);
    console.log('  💡 Appuyez sur Ctrl+C pour arrêter le serveur.');
    console.log('============================================================');

    // Ouvrir automatiquement le navigateur sur Windows
    const openCmd = process.platform === 'win32' ? `start ${url}` : `open ${url}`;
    exec(openCmd, (execErr) => {
      if (execErr) {
        console.log(`  👉 Veuillez ouvrir votre navigateur sur : ${url}`);
      }
    });
  });
}

createServer();
