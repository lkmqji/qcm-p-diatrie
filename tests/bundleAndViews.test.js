import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createMemoryStorage } from './helpers/mockDom.js';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

function collectJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

function createFakeElement(tag = 'div', id = '') {
  const classes = new Set();
  const attrs = {};
  const listeners = {};
  let innerHtmlValue = '';
  let childList = [];

  const el = {
    tagName: tag.toUpperCase(),
    id,
    style: {},
    dataset: {},
    value: '',
    textContent: '',
    disabled: false,
    checked: false,
    title: '',
    alt: '',
    src: '',
    children: childList,
    parentNode: { insertBefore() {} },
    parentElement: null,
    classList: {
      add(...tokens) { tokens.forEach(t => classes.add(t)); },
      remove(...tokens) { tokens.forEach(t => classes.delete(t)); },
      toggle(token, force) {
        if (force === true) { classes.add(token); return true; }
        if (force === false) { classes.delete(token); return false; }
        if (classes.has(token)) { classes.delete(token); return false; }
        classes.add(token);
        return true;
      },
      contains(token) { return classes.has(token); }
    },
    set className(val) {
      classes.clear();
      String(val || '').split(/\s+/).filter(Boolean).forEach(t => classes.add(t));
    },
    get className() {
      return Array.from(classes).join(' ');
    },
    set innerHTML(val) {
      innerHtmlValue = String(val || '');
      childList.length = 0;
    },
    get innerHTML() {
      return innerHtmlValue;
    },
    get firstElementChild() {
      if (childList.length > 0) return childList[0];
      const synthetic = createFakeElement('div');
      synthetic.innerHTML = innerHtmlValue;
      return synthetic;
    },
    appendChild(child) {
      child.parentElement = el;
      childList.push(child);
      return child;
    },
    remove() {},
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return attrs[k] ?? null; },
    addEventListener(ev, cb) {
      if (!listeners[ev]) listeners[ev] = [];
      listeners[ev].push(cb);
    },
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    scrollIntoView() {},
    focus() {},
    click() {
      if (typeof el.onclick === 'function') el.onclick({ target: el });
      (listeners.click || []).forEach(cb => cb({ target: el }));
    }
  };
  return el;
}

function buildMockBrowserContext() {
  const elementsById = new Map();
  const getOrCreateById = (id) => {
    if (!elementsById.has(id)) {
      elementsById.set(id, createFakeElement('div', id));
    }
    return elementsById.get(id);
  };

  let backButtonHandler = null;
  const listeners = {};
  const storage = createMemoryStorage();

  const mockDocument = {
    readyState: 'complete',
    body: createFakeElement('body'),
    activeElement: null,
    hidden: false,
    getElementById: (id) => getOrCreateById(id),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => createFakeElement(tag),
    addEventListener: (ev, cb) => {
      listeners[ev] = cb;
    }
  };

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: (cb) => cb(),
    Date,
    Math,
    JSON,
    Intl,
    URL,
    Promise,
    Set,
    Map,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Error,
    RegExp,
    encodeURIComponent,
    decodeURIComponent,
    localStorage: storage,
    document: mockDocument,
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    navigator: {
      onLine: true
    },
    PEDIA_CHAPTERS: [
      { id: 'ch_1', title: 'Déshydratation aiguë', count: 1 }
    ],
    PEDIA_QUESTIONS: [
      {
        uid: 'ch_1_1',
        chapterId: 'ch_1',
        chapterTitle: 'Déshydratation aiguë',
        id: 1,
        type: 'QCU',
        is_croq: false,
        question: 'Quel critère définit une déshydratation sévère ?',
        options: [
          { id: 1, letter: 'A', text: 'Perte > 10% du poids', is_correct: true },
          { id: 2, letter: 'B', text: 'Perte < 3%', is_correct: false }
        ],
        explanation: 'Critère OMS > 10%.'
      }
    ],
    PSY_CHAPTERS: [
      { id: 'psy_ch_1', title: 'Troubles anxieux', count: 1 }
    ],
    PSY_QUESTIONS: [
      {
        uid: 'psy_ch_1_1',
        chapterId: 'psy_ch_1',
        chapterTitle: 'Troubles anxieux',
        id: 1,
        type: 'QCU',
        is_croq: false,
        question: 'Critère DSM du trouble panique ?',
        options: [
          { id: 10, letter: 'A', text: 'Attaques de panique récurrentes inattendues', is_correct: true }
        ],
        explanation: 'Critère A.'
      }
    ],
    Capacitor: {
      Plugins: {
        App: {
          addListener(eventName, cb) {
            if (eventName === 'backButton') backButtonHandler = cb;
          },
          exitAppCalled: false,
          exitApp() {
            this.exitAppCalled = true;
          }
        }
      }
    },
    scrollTo: () => {},
    addEventListener: (ev, cb) => {
      listeners[`win_${ev}`] = cb;
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  return {
    sandbox,
    elementsById,
    getBackHandler: () => backButtonHandler
  };
}

test('Production bundle & modular sources contain zero blocking dialogs, dead calls, or leftover ESM keywords', () => {
  const bundleCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'app.bundle.js'), 'utf8');

  assert.equal(bundleCode.includes('showNotificationToast'), false, 'Bundle must not call removed showNotificationToast');
  assert.equal(/^\s*(import\s+|export\s+)/m.test(bundleCode), false, 'Bundle IIFE must have zero unstripped import/export lines');

  const uiFiles = [
    ...collectJsFiles(path.join(ROOT_DIR, 'src', 'views')),
    ...collectJsFiles(path.join(ROOT_DIR, 'src', 'utils')),
    ...collectJsFiles(path.join(ROOT_DIR, 'src', 'state')),
    path.join(ROOT_DIR, 'src', 'app.js')
  ];

  for (const file of uiFiles) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT_DIR, file);
    assert.equal(/\balert\s*\(/.test(src), false, `${rel} must not use blocking alert()`);
    assert.equal(/\bconfirm\s*\(/.test(src), false, `${rel} must not use blocking confirm()`);
    assert.equal(/behavior\s*:\s*['"]smooth['"]/.test(src), false, `${rel} must not use laggy smooth scroll`);
  }
});

test('Offline vendors and build outputs match PWA & Capacitor requirements with Agentation enabled everywhere', () => {
  const templateHtml = fs.readFileSync(path.join(ROOT_DIR, 'template.html'), 'utf8');
  const rootIndexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  const distIndexHtml = fs.readFileSync(path.join(ROOT_DIR, 'dist', 'index.html'), 'utf8');
  const swJs = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');

  // Verify no duplicate HTML element IDs in template.html
  const idMatches = [...templateHtml.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const seenIds = new Set();
  const dupIds = [];
  for (const id of idMatches) {
    if (seenIds.has(id)) dupIds.push(id);
    seenIds.add(id);
  }
  assert.deepEqual(dupIds, [], `Duplicate DOM IDs found in template.html: ${dupIds.join(', ')}`);

  // Verify CDN removal, local vendors, and Agentation toolbar in index.html & dist/index.html
  for (const [label, html] of [['index.html', rootIndexHtml], ['dist/index.html', distIndexHtml]]) {
    assert.equal(html.includes('unpkg.com/lucide'), false, `${label} must not reference unpkg lucide CDN`);
    assert.equal(html.includes('canvas-confetti'), false, `${label} must not reference jsdelivr canvas-confetti CDN`);
    assert.equal(html.includes('./vendor/lucide.min.js'), true, `${label} must load local vendor/lucide.min.js`);
    assert.equal(html.includes('./vendor/confetti.browser.min.js'), true, `${label} must load local vendor/confetti.browser.min.js`);
    assert.equal(html.includes('agentation.bundle.js'), true, `${label} must include agentation.bundle.js everywhere`);
  }

  // Verify copied vendor files & dist/agentation.bundle.js
  for (const relPath of [
    'vendor/lucide.min.js',
    'vendor/confetti.browser.min.js',
    'dist/vendor/lucide.min.js',
    'dist/vendor/confetti.browser.min.js',
    'agentation.bundle.js',
    'dist/agentation.bundle.js'
  ]) {
    const abs = path.join(ROOT_DIR, relPath);
    assert.equal(fs.existsSync(abs), true, `Missing offline asset: ${relPath}`);
    assert.ok(fs.statSync(abs).size > 1000, `Expected non-empty vendor file: ${relPath}`);
  }

  // Verify Service Worker pre-caches vendor libraries
  assert.equal(swJs.includes('./vendor/lucide.min.js'), true);
  assert.equal(swJs.includes('./vendor/confetti.browser.min.js'), true);
});

test('Unified bundle initializes cleanly in a simulated browser DOM and handles Capacitor hardware back button navigation', () => {
  const bundleCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'app.bundle.js'), 'utf8');
  const { sandbox, elementsById, getBackHandler } = buildMockBrowserContext();

  vm.createContext(sandbox);
  assert.doesNotThrow(() => {
    vm.runInContext(bundleCode, sandbox, { filename: 'app.bundle.js' });
  });

  assert.ok(sandbox.window.geminiService, 'window.geminiService should be exposed');
  assert.equal(typeof sandbox.window.openMediaLightbox, 'function');
  assert.equal(typeof sandbox.window.loadMoreNotebookNotes, 'function');

  // Hardware back button listener should be bound and walk overlay -> modal -> view -> exitApp
  const backHandler = getBackHandler();
  assert.equal(typeof backHandler, 'function', 'Capacitor backButton handler must be registered');

  // 1) Back closes an open settings modal first
  elementsById.get('modal-settings').style.display = 'flex';
  backHandler();
  assert.equal(elementsById.get('modal-settings').style.display, 'none');
  assert.equal(sandbox.Capacitor.Plugins.App.exitAppCalled, false);

  // 2) Navigate to Arena and press Back -> returns to Dashboard instead of exiting
  elementsById.get('btn-start-random').onclick();
  assert.equal(elementsById.get('view-arena').style.display, 'flex');
  backHandler();
  assert.equal(elementsById.get('view-dashboard').style.display, 'flex');
  assert.equal(sandbox.Capacitor.Plugins.App.exitAppCalled, false);

  // 3) Back on clean Dashboard calls exitApp()
  backHandler();
  assert.equal(sandbox.Capacitor.Plugins.App.exitAppCalled, true);
});

test('Notebook progressive pagination renders 30 cards initially and loads next batch on demand', async () => {
  const { sandbox, elementsById } = buildMockBrowserContext();
  // Provide globals expected by ES modules in Node test context
  globalThis.document = sandbox.document;
  globalThis.localStorage = sandbox.localStorage;
  globalThis.window = sandbox.window;

  const { appState, queueEngine } = await import('../src/state/appState.js');
  const { renderNotebookUI, NOTEBOOK_PAGE_SIZE } = await import('../src/views/notebookView.js');

  appState.allQuestions = sandbox.PEDIA_QUESTIONS;
  appState.questionsMap = new Map(sandbox.PEDIA_QUESTIONS.map(q => [q.uid, q]));
  queueEngine.setQuestions(sandbox.PEDIA_QUESTIONS, sandbox.PEDIA_CHAPTERS);

  // Seed 45 distinct reasoning notes
  const seeded = [];
  for (let i = 1; i <= 45; i++) {
    seeded.push({
      id: `note_${i}`,
      questionUid: `q_test_${i}`,
      questionText: `Question test ${i}`,
      chapterTitle: 'Néonatologie',
      options: [{ letter: 'A', text: 'Réponse A', is_correct: true }],
      userAnswer: 'B',
      userAnswerLetters: ['B'],
      correctAnswer: 'A. Réponse A',
      reasoningNote: `Analyse clinique détaillée ${i}`,
      timestamp: Date.now() - i * 1000
    });
  }
  localStorage.setItem('pedia_drill_reasoning_notes_v1', JSON.stringify(seeded));

  renderNotebookUI('');
  const listContainer = elementsById.get('notebook-notes-list');
  // In chapter mode: 1 chapter group + 1 pagination wrapper
  const paginationWrap = listContainer.children.find(c => c.className.includes('notebook-pagination-wrap'));
  assert.ok(paginationWrap, 'Pagination button wrapper should be rendered when notes > 30');
  assert.ok(paginationWrap.innerHTML.includes(`30/45`), `Expected 30/45 indicator, got: ${paginationWrap.innerHTML}`);
  assert.equal(NOTEBOOK_PAGE_SIZE, 30);

  // Click load more -> should show all 45 without pagination wrapper
  sandbox.window.loadMoreNotebookNotes();
  const afterWrap = listContainer.children.find(c => c.className.includes('notebook-pagination-wrap'));
  assert.equal(afterWrap, undefined, 'Pagination button should disappear once all 45 items are loaded');
});

test('Clinical case UI displays uncleaned questions counter over total case questions next to start button', async () => {
  const { sandbox, elementsById } = buildMockBrowserContext();
  globalThis.document = sandbox.document;
  globalThis.localStorage = sandbox.localStorage;
  globalThis.window = sandbox.window;

  const { appState, queueEngine } = await import('../src/state/appState.js');
  const { updateClinicalCaseUI, updateClinicalUncleanedBadge } = await import('../src/views/clinicalCaseView.js');

  const caseQuestions = [
    { uid: 'case_1_1', id: '1.1', chapterId: 'neonat', clinical_case: 'Nouveau-né ictérique à J2.', question: 'Q1' },
    { uid: 'case_1_2', id: '1.2', chapterId: 'neonat', clinical_case: 'Nouveau-né ictérique à J2.', question: 'Q2' },
    { uid: 'case_1_3', id: '1.3', chapterId: 'neonat', clinical_case: 'Nouveau-né ictérique à J2.', question: 'Q3' }
  ];
  const isolatedQ = { uid: 'q_iso', id: '99', chapterId: 'neonat', clinical_case: null, question: 'Isolée' };

  appState.allQuestions = [...caseQuestions, isolatedQ];
  appState.isClinicalRunActive = false;
  queueEngine.stats = {};

  // 1) Initial: 3/3 not yet cleaned
  updateClinicalCaseUI(caseQuestions[0]);
  const badge = elementsById.get('clinical-uncleaned-badge');
  const badgeText = elementsById.get('clinical-uncleaned-text');
  assert.equal(elementsById.get('btn-start-clinical-case').style.display, 'inline-flex');
  assert.equal(badge.style.display, 'inline-flex');
  assert.equal(badgeText.textContent, '3/3 à nettoyer');
  assert.equal(badge.classList.contains('is-all-cleaned'), false);

  // 2) One question cleaned -> 2/3
  queueEngine.stats['case_1_1'] = { target: 3, current: 3, mistakes: 0, done: true };
  updateClinicalUncleanedBadge(caseQuestions[0]);
  assert.equal(badgeText.textContent, '2/3 à nettoyer');
  assert.equal(badge.classList.contains('is-all-cleaned'), false);

  // 3) All cleaned -> 0/3 + is-all-cleaned class
  queueEngine.stats['case_1_2'] = { target: 3, current: 3, mistakes: 0, done: true };
  queueEngine.stats['case_1_3'] = { target: 3, current: 3, mistakes: 0, done: true };
  updateClinicalCaseUI(caseQuestions[0]);
  assert.equal(badgeText.textContent, '0/3 à nettoyer');
  assert.equal(badge.classList.contains('is-all-cleaned'), true);

  // 4) Hidden during active clinical run
  appState.isClinicalRunActive = true;
  updateClinicalCaseUI(caseQuestions[0]);
  assert.equal(badge.style.display, 'none');

  // 5) Hidden for non-clinical questions
  appState.isClinicalRunActive = false;
  updateClinicalCaseUI(isolatedQ);
  assert.equal(badge.style.display, 'none');
});

test('Clinical case run can be quit cleanly via confirm modal after answering the first sub-question', async () => {
  const bundleCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'app.bundle.js'), 'utf8');
  const { sandbox, elementsById } = buildMockBrowserContext();

  const caseQuestions = [
    {
      uid: 'case_quit_1',
      id: '10.1',
      chapterId: 'neonat',
      chapterTitle: 'Néonatologie',
      clinical_case: 'Nouveau-né présentant une détresse respiratoire.',
      question: 'Première question du cas ?',
      type: 'QCU',
      options: [
        { id: 'opt_a', letter: 'A', text: 'Réponse A', is_correct: true },
        { id: 'opt_b', letter: 'B', text: 'Réponse B', is_correct: false }
      ]
    },
    {
      uid: 'case_quit_2',
      id: '10.2',
      chapterId: 'neonat',
      chapterTitle: 'Néonatologie',
      clinical_case: 'Nouveau-né présentant une détresse respiratoire.',
      question: 'Deuxième question du cas ?',
      type: 'QCU',
      options: [
        { id: 'opt_c', letter: 'A', text: 'Réponse C', is_correct: true },
        { id: 'opt_d', letter: 'B', text: 'Réponse D', is_correct: false }
      ]
    }
  ];
  sandbox.PEDIA_QUESTIONS = caseQuestions;
  sandbox.window.PEDIA_QUESTIONS = caseQuestions;
  sandbox.PEDIA_CHAPTERS = [{ id: 'neonat', title: 'Néonatologie' }];
  sandbox.window.PEDIA_CHAPTERS = sandbox.PEDIA_CHAPTERS;

  vm.createContext(sandbox);
  vm.runInContext(bundleCode, sandbox, { filename: 'app.bundle.js' });

  // Launch arena on Q1 of the clinical case
  elementsById.get('btn-start-random').onclick();
  assert.equal(elementsById.get('view-arena').style.display, 'flex');

  // Start full clinical case run
  sandbox.window.startClinicalCaseRun();
  assert.equal(elementsById.get('arena-clinical-run-bar').style.display, 'flex');

  // Select an option on Q1 and submit/verify Q1
  const optsContainer = elementsById.get('arena-options-container');
  const firstOptEl = optsContainer.children[0];
  assert.ok(firstOptEl, 'First option should be rendered');
  sandbox.document.querySelectorAll = (sel) => {
    if (sel === '.option-item.selected' || sel === '.option-item') return [firstOptEl];
    return [];
  };
  firstOptEl.click();
  await elementsById.get('btn-submit-answer').onclick();

  assert.equal(optsContainer.style.pointerEvents, 'none');

  // Click Quitter -> opens confirm modal; confirming exits the clinical run cleanly
  const quitPromise = sandbox.window.quitClinicalCaseRun();
  const confirmModal = elementsById.get('modal-app-confirm');
  assert.equal(confirmModal.style.display, 'flex');

  elementsById.get('btn-confirm-modal-ok').onclick();
  await quitPromise;

  assert.equal(confirmModal.style.display, 'none');
  assert.equal(elementsById.get('arena-clinical-run-bar').style.display, 'none');
  assert.equal(optsContainer.style.pointerEvents, 'auto');

  // Confirm modal markup must use styled .modal-content and sit above floating chat overlays
  const templateHtml = fs.readFileSync(path.join(ROOT_DIR, 'template.html'), 'utf8');
  assert.equal(templateHtml.includes('id="modal-app-confirm" style="display:none;z-index:10500;"'), true);
  assert.equal(templateHtml.includes('<div class="modal-content confirm-modal-card">'), true);
});

test('Notebook separates notes & mistakes strictly per module and renders module navigation buttons', async () => {
  const templateHtml = fs.readFileSync(path.join(ROOT_DIR, 'template.html'), 'utf8');
  assert.equal(templateHtml.includes('id="notebook-module-nav"'), true, 'template.html must expose #notebook-module-nav');

  const { sandbox, elementsById } = buildMockBrowserContext();
  globalThis.document = sandbox.document;
  globalThis.localStorage = sandbox.localStorage;
  globalThis.window = sandbox.window;

  const { setActiveModuleId } = await import('../src/services/moduleCatalog.js');
  const { appState, queueEngine } = await import('../src/state/appState.js');
  const { renderNotebookUI } = await import('../src/views/notebookView.js');

  // Seed mixed notes in both storages + mistakes in both modules
  localStorage.setItem('pedia_drill_reasoning_notes_v1', JSON.stringify([
    { id: 'np1', questionUid: 'ch_1_1', reasoningNote: 'Note pediatrie 1', timestamp: 2000 },
    { id: 'np_stray', questionUid: 'psy_ch_1_1', reasoningNote: 'Stray psy note', timestamp: 1500 }
  ]));
  localStorage.setItem('mod_psychiatrie_reasoning_notes', JSON.stringify([
    { id: 'ns1', questionUid: 'psy_ch_1_1', reasoningNote: 'Note psychiatrie 1', timestamp: 3000 },
    { id: 'ns_stray', questionUid: 'ch_1_1', reasoningNote: 'Stray pedia note', timestamp: 1000 }
  ]));
  localStorage.setItem('pedia_drill_state_v1', JSON.stringify({
    stats: { 'ch_1_1': { target: 5, current: 0, mistakes: 2, done: false } },
    queue: ['ch_1_1']
  }));
  localStorage.setItem('mod_psychiatrie_drill_state', JSON.stringify({
    stats: { 'psy_ch_1_1': { target: 6, current: 0, mistakes: 3, done: false } },
    queue: ['psy_ch_1_1']
  }));

  // 1) Active module: Pédiatrie -> only Pédiatrie note & 2 fautes appear
  setActiveModuleId('pediatrie');
  appState.allQuestions = sandbox.PEDIA_QUESTIONS;
  appState.allChapters = sandbox.PEDIA_CHAPTERS;
  appState.questionsMap = new Map(sandbox.PEDIA_QUESTIONS.map(q => [q.uid, q]));
  queueEngine.allQuestions = sandbox.PEDIA_QUESTIONS;
  queueEngine.chapters = sandbox.PEDIA_CHAPTERS;
  queueEngine.questionsMap = appState.questionsMap;
  queueEngine.loadState();

  renderNotebookUI('');
  const listEl = elementsById.get('notebook-notes-list');
  const summaryEl = elementsById.get('notebook-summary-bar');
  const navEl = elementsById.get('notebook-module-nav');

  const renderedPediaHtml = listEl.children.map(c => c.innerHTML).join('\n');
  assert.equal(renderedPediaHtml.includes('Note pediatrie 1'), true, 'Pedia note must appear in pediatrie mode');
  assert.equal(renderedPediaHtml.includes('Stray psy note'), false, 'Stray psy note must NOT appear in pediatrie mode');
  assert.equal(summaryEl.innerHTML.includes('Pédiatrie'), true);
  assert.equal(summaryEl.innerHTML.includes('2</strong> faute'), true, 'Only pediatrie mistakes (2) should appear');
  assert.equal(navEl.innerHTML.includes('data-notebook-module="pediatrie"'), true);
  assert.equal(navEl.innerHTML.includes('data-notebook-module="psychiatrie"'), true);
  assert.equal(navEl.innerHTML.includes('btn-notebook-cycle-module'), true);

  // 2) Active module: Psychiatrie -> only Psychiatrie note & 3 fautes appear
  setActiveModuleId('psychiatrie');
  appState.allQuestions = sandbox.PSY_QUESTIONS;
  appState.allChapters = sandbox.PSY_CHAPTERS;
  appState.questionsMap = new Map(sandbox.PSY_QUESTIONS.map(q => [q.uid, q]));
  queueEngine.switchModule(sandbox.PSY_QUESTIONS, sandbox.PSY_CHAPTERS);

  renderNotebookUI('');
  const renderedPsyHtml = listEl.children.map(c => c.innerHTML).join('\n');
  assert.equal(renderedPsyHtml.includes('Note psychiatrie 1'), true, 'Psy note must appear in psychiatrie mode');
  assert.equal(renderedPsyHtml.includes('Stray pedia note'), false, 'Stray pedia note must NOT appear in psychiatrie mode');
  assert.equal(summaryEl.innerHTML.includes('Psychiatrie'), true);
  assert.equal(summaryEl.innerHTML.includes('3</strong> faute'), true, 'Only psychiatrie mistakes (3) should appear');
});
