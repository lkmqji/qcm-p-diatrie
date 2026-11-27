import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installMockBrowserEnv } from './helpers/mockDom.js';

installMockBrowserEnv();

const {
  escapeHtml,
  parseMarkdownInline,
  formatMedicalContent,
  extractQuestionDateOrSession,
  debounce
} = await import('../src/utils/formatters.js');

describe('Formatters & XSS/HTML Escaping', () => {
  it('escapes medical angle brackets cleanly so < and > never break HTML rendering', () => {
    const raw1 = 'TRC < 3 secondes';
    const raw2 = 'Leucocytes < 500/mm3 et fièvre > 38°C';
    const raw3 = '<b>Injection</b>';

    assert.equal(escapeHtml(raw1), 'TRC &lt; 3 secondes');
    assert.equal(parseMarkdownInline(raw2), 'Leucocytes &lt; 500/mm3 et fièvre &gt; 38°C');
    assert.equal(parseMarkdownInline(raw3), '&lt;b&gt;Injection&lt;/b&gt;');
  });

  it('normalizes exam session badges from metadata or text', () => {
    assert.equal(extractQuestionDateOrSession({ session: 'Rattrapage 2021' }), 'Rattrapage 2021');
    assert.equal(extractQuestionDateOrSession({ explanation: 'Source : Diapo 2024 Dr Nafai • Résidanat 2022' }), 'Résidanat 2022');
  });

  it('formats glued medical content into structured HTML blocks', () => {
    const out = formatMedicalContent('Rappel : Signe clé\nA-Vrai : Justification');
    assert.ok(out.includes('medical-section-title'));
    assert.ok(out.includes('<strong>A) Vrai</strong>'));
  });

  it('debounces rapid calls and invokes only the trailing call', async () => {
    let count = 0;
    let lastVal = null;
    const fn = debounce((val) => {
      count++;
      lastVal = val;
    }, 30);

    fn('a');
    fn('ab');
    fn('abc');
    assert.equal(count, 0);

    await new Promise(r => setTimeout(r, 60));
    assert.equal(count, 1);
    assert.equal(lastVal, 'abc');
  });
});
