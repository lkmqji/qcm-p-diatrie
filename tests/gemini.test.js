import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installMockBrowserEnv } from './helpers/mockDom.js';

installMockBrowserEnv();

const geminiMod = await import('../src/services/gemini.js');
const { GeminiService, cleanLatexMath, geminiService, resolveAiModuleContext } = geminiMod;

describe('GeminiService Security, Multi-Keys & Dynamic Context', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('does not embed any hardcoded API keys in source or defaults', () => {
    assert.equal(geminiMod.DEFAULT_GEMINI_KEYS, undefined);
    assert.equal(geminiMod.GEMINI_KEY_REGISTRY, undefined);

    const fresh = new GeminiService();
    assert.equal(fresh.apiKeys.length, 0);
    assert.equal(fresh.hasApiKeys(), false);
  });

  it('parses, trims, and deduplicates multiple user API keys (comma, semicolon, newline)', () => {
    const fresh = new GeminiService();
    fresh.setApiKey('key-alpha, key-beta\nkey-gamma; key-alpha\n  ');
    assert.deepEqual(fresh.apiKeys, ['key-alpha', 'key-beta', 'key-gamma']);
    assert.equal(fresh.hasApiKeys(), true);
    assert.equal(fresh.getKeyCount(), 3);
  });

  it('exposes window.geminiService globally for Firestore profile sync', () => {
    assert.equal(globalThis.window.geminiService, geminiService);
  });

  it('fails fast with NO_API_KEY_CONFIGURED when calling AI without user keys', async () => {
    const fresh = new GeminiService();
    await assert.rejects(
      () => fresh.callWithFallback('Test prompt'),
      /NO_API_KEY_CONFIGURED/
    );
  });

  it('falls back cleanly to local CROQ semantic evaluator when no API key is configured', async () => {
    const fresh = new GeminiService();
    const res = await fresh.evaluateCroq(
      'Signes de méningite',
      '',
      'Fièvre céphalées vomissements raideur nucale',
      'Fièvre avec céphalées, vomissements et raideur nucale'
    );
    assert.equal(res.isValid, true);
    assert.ok(res.score >= 75);
  });

  it('resolves module context dynamically for Psychiatrie vs Pediatrie', () => {
    assert.equal(typeof resolveAiModuleContext, 'function');
    const psyCtx = resolveAiModuleContext({ uid: 'psy_schizophrenies_1' });
    assert.equal(psyCtx.moduleId, 'psychiatrie');
    assert.equal(psyCtx.moduleName, 'Psychiatrie');
    assert.match(psyCtx.tutorTitle, /Psychiatrie/i);

    const pediaCtx = resolveAiModuleContext({ uid: 'meningo_1' });
    assert.equal(pediaCtx.moduleId, 'pediatrie');
    assert.equal(pediaCtx.moduleName, 'Pédiatrie');
  });

  it('converts LaTeX medical artifacts into readable Unicode text', () => {
    const cleaned = cleanLatexMath('Déficit = $14 \\times 3 = 42\\text{ mg/kg}$ et $\\frac{1}{2}$ avec $\\leq 38^{\\circ}C$');
    assert.equal(cleaned.includes('\\text'), false);
    assert.equal(cleaned.includes('\\times'), false);
    assert.ok(cleaned.includes('×'));
    assert.ok(cleaned.includes('≤'));
    assert.ok(cleaned.includes('°C'));
  });
});
