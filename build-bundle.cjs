const fs = require('fs');
const path = require('path');

const isDevMode = process.argv.includes('--dev') || process.env.PEDIA_DEV === '1';

// 1. Synchronize template.html CSS with src/style.css
const cssContent = fs.readFileSync(path.join(__dirname, 'src', 'style.css'), 'utf8');
let templateHtml = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');

templateHtml = templateHtml.replace(
  /<style>[\s\S]*?<\/style>/,
  `<style>\n${cssContent}\n</style>`
);
fs.writeFileSync(path.join(__dirname, 'template.html'), templateHtml, 'utf8');
console.log('[bundle] template.html synchronized with src/style.css');

// 2. Assemble src/app.bundle.js from modular src files
function cleanModuleCode(code) {
  return code
    .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?\r?\n/g, '')
    .replace(/export\s+default\s+/g, '')
    .replace(/export\s+const\s+/g, 'const ')
    .replace(/export\s+let\s+/g, 'let ')
    .replace(/export\s+class\s+/g, 'class ')
    .replace(/export\s+async\s+function\s+/g, 'async function ')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s*\{[^}]*\};?/g, '');
}

const orderedSourceFiles = [
  ['src', 'services', 'moduleCatalog.js'],
  ['src', 'services', 'storageScope.js'],
  ['src', 'services', 'gemini.js'],
  ['src', 'services', 'queueEngine.js'],
  ['src', 'services', 'studyTracker.js'],
  ['src', 'services', 'lessonTracker.js'],
  ['src', 'services', 'firebaseSyncService.js'],
  ['src', 'services', 'updateService.js'],
  ['src', 'utils', 'formatters.js'],
  ['src', 'utils', 'uiDialogs.js'],
  ['src', 'state', 'appState.js'],
  ['src', 'views', 'dashboardView.js'],
  ['src', 'views', 'clinicalCaseView.js'],
  ['src', 'views', 'arenaView.js'],
  ['src', 'views', 'notebookView.js'],
  ['src', 'views', 'statsView.js'],
  ['src', 'views', 'lessonView.js'],
  ['src', 'app.js']
];

const cleanedParts = orderedSourceFiles.map(segments => {
  const fullPath = path.join(__dirname, ...segments);
  const raw = fs.readFileSync(fullPath, 'utf8');
  return `// --- ${segments.join('/')} ---\n${cleanModuleCode(raw)}`;
});

const bundle = `// ==========================================
// PédiaDrill Unified Client Bundle
// ==========================================
(function() {
${cleanedParts.join('\n\n')}
})();
`;

fs.writeFileSync(path.join(__dirname, 'src', 'app.bundle.js'), bundle, 'utf8');
console.log(`[bundle] src/app.bundle.js created (${bundle.length} bytes)`);

// 3. Assemble index.html directly from src/data datasets
function readDataScript(fileName, required = false) {
  const fullPath = path.join(__dirname, 'src', 'data', fileName);
  if (!fs.existsSync(fullPath)) {
    if (required) {
      console.error(`[bundle] Error: missing required dataset src/data/${fileName}`);
      process.exit(1);
    }
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
}

const pediaChaptersJs = readDataScript('chapters.js', true);
const pediaQuestionsJs = readDataScript('questions.js', true);
const psyChaptersJs = readDataScript('psy_chapters.js', false);
const psyQuestionsJs = readDataScript('psy_questions.js', false);

const devToolbarHtml = `\n  <!-- Agentation Visual Feedback & UI Annotation Toolbar -->\n  <script src="agentation.bundle.js"></script>`;

const updatedIndex = `${templateHtml.replace('</body>', '')}
  <script>
${pediaChaptersJs}
  </script>

  <script>
${pediaQuestionsJs}
  </script>

  ${psyChaptersJs ? `<script>\n${psyChaptersJs}\n  </script>` : ''}

  ${psyQuestionsJs ? `<script>\n${psyQuestionsJs}\n  </script>` : ''}

  <script>
${bundle}
  </script>${devToolbarHtml}
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, 'index.html'), updatedIndex, 'utf8');
console.log(`[bundle] index.html updated successfully (${updatedIndex.length} bytes, mode=${isDevMode ? 'dev' : 'prod'})`);

// 4. Update vendor/ and dist/ directory
const { buildDist } = require('./build.cjs');
buildDist({ isDev: isDevMode });
