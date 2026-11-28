import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createMemoryStorage } from './helpers/mockDom.js';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

globalThis.localStorage = createMemoryStorage();

test('TranslateService: preferences default to enabled=true and lang=ar, and validate allowed languages', async () => {
  localStorage.clear();
  const {
    SUPPORTED_TRANSLATE_LANGUAGES,
    isHighlightTranslateEnabled,
    setHighlightTranslateEnabled,
    getHighlightTranslateLang,
    setHighlightTranslateLang
  } = await import('../src/services/translateService.js');

  assert.deepEqual(
    SUPPORTED_TRANSLATE_LANGUAGES.map(l => l.code),
    ['ar', 'en', 'fr', 'de']
  );
  assert.equal(isHighlightTranslateEnabled(), true);
  assert.equal(getHighlightTranslateLang(), 'ar');

  setHighlightTranslateEnabled(false);
  assert.equal(isHighlightTranslateEnabled(), false);

  setHighlightTranslateEnabled(true);
  assert.equal(isHighlightTranslateEnabled(), true);

  setHighlightTranslateLang('de');
  assert.equal(getHighlightTranslateLang(), 'de');

  // Invalid language falls back to default 'ar'
  setHighlightTranslateLang('xx');
  assert.equal(getHighlightTranslateLang(), 'ar');
});

test('TranslateService: splits long text into chunks under max length without dropping content', async () => {
  const { splitTextIntoTranslateChunks } = await import('../src/services/translateService.js');

  const sentence = 'La déshydratation aiguë du nourrisson nécessite une réhydratation orale rapide. ';
  const longText = sentence.repeat(35).trim(); // ~2800 chars
  const chunks = splitTextIntoTranslateChunks(longText, 900);

  assert.ok(chunks.length >= 3, 'Expected at least 3 chunks for ~2800 chars');
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 900, `Chunk exceeded max length: ${chunk.length}`);
  }
  assert.equal(chunks.join(' ').replace(/\s+/g, ' '), longText.replace(/\s+/g, ' '));
});

test('TranslateService: translateWithGoogle parses Google response, handles long text, and reports offline error cleanly', async () => {
  const { translateWithGoogle } = await import('../src/services/translateService.js');

  const originalFetch = globalThis.fetch;
  const originalNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    const requestedUrls = [];
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      configurable: true
    });
    globalThis.fetch = async (url) => {
      requestedUrls.push(String(url));
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            [['ترجمة طبية ', 'Medical translation ', null, null, 1], ['دقيقة.', 'accurate.', null, null, 1]],
            null,
            'fr'
          ];
        }
      };
    };

    const res = await translateWithGoogle('Medical translation accurate.', 'ar');
    assert.equal(res.translatedText, 'ترجمة طبية دقيقة.');
    assert.equal(res.detectedSourceLang, 'fr');
    assert.equal(res.provider, 'google');
    assert.ok(requestedUrls[0].includes('translate.googleapis.com/translate_a/single'));
    assert.ok(requestedUrls[0].includes('tl=ar'));

    // Offline failure should reject with explicit OFFLINE_ERROR code
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: false },
      configurable: true
    });
    await assert.rejects(
      () => translateWithGoogle('Ictère néonatal', 'ar'),
      (err) => err && err.code === 'OFFLINE_ERROR'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalNavigatorDesc) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDesc);
    }
  }
});

test('GeminiService: translateWithGemini and explainMedicalTerm fail fast without user API keys', async () => {
  localStorage.clear();
  const { geminiService } = await import('../src/services/gemini.js');
  geminiService.setApiKey('');

  await assert.rejects(
    () => geminiService.translateWithGemini('Déshydratation', 'ar'),
    (err) => err && err.code === 'NO_API_KEY_CONFIGURED'
  );

  await assert.rejects(
    () => geminiService.explainMedicalTerm('RCIU', 'ar'),
    (err) => err && err.code === 'NO_API_KEY_CONFIGURED'
  );
});

test('Settings UI and bundle include translation toggle button and 4 languages', () => {
  const templateHtml = fs.readFileSync(path.join(ROOT_DIR, 'template.html'), 'utf8');
  const distIndexHtml = fs.readFileSync(path.join(ROOT_DIR, 'dist', 'index.html'), 'utf8');

  for (const html of [templateHtml, distIndexHtml]) {
    assert.ok(html.includes('id="btn-toggle-translate-enabled"'), 'Missing translate toggle button in settings');
    assert.ok(html.includes('id="settings-translate-lang"'), 'Missing translate language select in settings');
    assert.ok(html.includes('value="ar"'), 'Missing Arabic option');
    assert.ok(html.includes('value="en"'), 'Missing English option');
    assert.ok(html.includes('value="fr"'), 'Missing French option');
    assert.ok(html.includes('value="de"'), 'Missing German option');
  }
});

test('FirebaseSyncService syncs highlightTranslateEnabled and highlightTranslateLang from remote profile', async () => {
  localStorage.clear();
  const {
    isHighlightTranslateEnabled,
    getHighlightTranslateLang
  } = await import('../src/services/translateService.js');
  const { FirebaseSyncService } = await import('../src/services/firebaseSyncService.js');

  const sync = new FirebaseSyncService();
  localStorage.setItem('pedia_settings_updated_at', '1000');

  sync.handleRemoteProfileUpdate({
    settingsUpdatedAt: 5000,
    settings: {
      clinicalCaseMode: 'sequential',
      highlightTranslateEnabled: false,
      highlightTranslateLang: 'de'
    }
  });

  assert.equal(isHighlightTranslateEnabled(), false);
  assert.equal(getHighlightTranslateLang(), 'de');
});

test('SelectionTranslator: hasActiveTextSelection detects non-empty selection cleanly', async () => {
  const { hasActiveTextSelection } = await import('../src/utils/selectionTranslator.js');
  const originalWindow = globalThis.window;

  try {
    globalThis.window = {
      getSelection: () => ({ isCollapsed: true, toString: () => '' })
    };
    assert.equal(hasActiveTextSelection(), false);

    globalThis.window = {
      getSelection: () => ({ isCollapsed: false, toString: () => 'bronchiolite' })
    };
    assert.equal(hasActiveTextSelection(), true);
  } finally {
    globalThis.window = originalWindow;
  }
});
