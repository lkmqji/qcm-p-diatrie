const fs = require('fs');
const path = require('path');

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
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s*\{[^}]*\};?/g, '');
}

let gemini = cleanModuleCode(fs.readFileSync(path.join(__dirname, 'src', 'services', 'gemini.js'), 'utf8'));
let queue = cleanModuleCode(fs.readFileSync(path.join(__dirname, 'src', 'services', 'queueEngine.js'), 'utf8'));
let tracker = cleanModuleCode(fs.readFileSync(path.join(__dirname, 'src', 'services', 'studyTracker.js'), 'utf8'));
let lesson = cleanModuleCode(fs.readFileSync(path.join(__dirname, 'src', 'services', 'lessonTracker.js'), 'utf8'));
let sync = cleanModuleCode(fs.readFileSync(path.join(__dirname, 'src', 'services', 'firebaseSyncService.js'), 'utf8'));
let app = cleanModuleCode(fs.readFileSync(path.join(__dirname, 'src', 'app.js'), 'utf8'));

const bundle = `// ==========================================
// PédiaDrill Unified Client Bundle
// ==========================================
(function() {
${gemini}

${queue}

${tracker}

${lesson}

${sync}

${app}
})();
`;

fs.writeFileSync(path.join(__dirname, 'src', 'app.bundle.js'), bundle, 'utf8');
console.log(`[bundle] src/app.bundle.js created (${bundle.length} bytes)`);

// 3. Assemble index.html
// Extract datasets from existing index.html or src/data
let indexContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// Find the dataset script tags
const chaptersMatch = indexContent.match(/<script>\s*window\.PEDIA_CHAPTERS\s*=[\s\S]*?<\/script>/);
const questionsMatch = indexContent.match(/<script>\s*window\.PEDIA_QUESTIONS\s*=[\s\S]*?<\/script>/);

if (!chaptersMatch || !questionsMatch) {
  console.error('[bundle] Error: could not find PEDIA_CHAPTERS or PEDIA_QUESTIONS in index.html');
  process.exit(1);
}

// Build final standalone index.html
const updatedIndex = `${templateHtml.replace('</body>', '')}
  ${chaptersMatch[0]}

  ${questionsMatch[0]}

  <script>
${bundle}
  </script>

  <!-- Agentation Visual Feedback & UI Annotation Toolbar -->
  <script src="agentation.bundle.js"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, 'index.html'), updatedIndex, 'utf8');
console.log(`[bundle] index.html updated successfully (${updatedIndex.length} bytes)`);

// 4. Update dist directory
require('./build.cjs');
