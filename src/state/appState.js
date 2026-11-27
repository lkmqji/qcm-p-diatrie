// ============================================================================
// État Global Partagé & Accès aux Jeux de Données
// ============================================================================
import { getActiveModuleId } from '../services/moduleCatalog.js';
import { QueueEngine } from '../services/queueEngine.js';

export function getDatasetForModule(moduleId) {
  const modId = moduleId || getActiveModuleId();
  if ((modId === 'psychiatrie' || modId === 'psychiatrie_5') && typeof window !== 'undefined' && window.PSY_QUESTIONS && window.PSY_CHAPTERS) {
    return {
      questions: window.PSY_QUESTIONS,
      chapters: window.PSY_CHAPTERS
    };
  }
  return {
    questions: (typeof window !== 'undefined' && window.PEDIA_QUESTIONS) || [],
    chapters: (typeof window !== 'undefined' && window.PEDIA_CHAPTERS) || []
  };
}

const initialDataset = getDatasetForModule(getActiveModuleId());

export const appState = {
  activeDataset: initialDataset,
  allQuestions: initialDataset.questions,
  allChapters: initialDataset.chapters,
  questionsMap: new Map(initialDataset.questions.map(q => [q.uid, q])),
  chaptersMap: new Map(initialDataset.chapters.map(c => [c.id, c])),
  currentQuestion: null,
  selectedOptionIds: new Set(),
  isEvaluating: false,
  currentView: 'dashboard',
  answeredHistory: [],
  historyCursor: -1,
  isCurrentQuestionAnswered: false,
  isClinicalAccordionOpen: false,
  isClinicalRunActive: false,
  clinicalRunState: null,
  aiExplanationsCache: {},
  arenaChatHistory: [],
  questionChatHistories: {},
  firebaseSyncService: null,
  switchViewHandler: null
};

export const queueEngine = new QueueEngine(appState.allQuestions, appState.allChapters);

export function registerViewNavigator(fn) {
  appState.switchViewHandler = typeof fn === 'function' ? fn : null;
}

export function navigateToView(viewName) {
  if (typeof appState.switchViewHandler === 'function') {
    appState.switchViewHandler(viewName);
  }
}

export function getClinicalModePreference() {
  try {
    return localStorage.getItem('pedia_clinical_case_mode') || 'sequential';
  } catch {
    return 'sequential';
  }
}

export function setClinicalModePreference(mode) {
  const cleanMode = mode === 'scroll' ? 'scroll' : 'sequential';
  try {
    localStorage.setItem('pedia_clinical_case_mode', cleanMode);
  } catch {}
  if (typeof document !== 'undefined') {
    const selectEl = document.getElementById('settings-clinical-mode-select');
    if (selectEl) selectEl.value = cleanMode;
    const badgeEl = document.getElementById('settings-clinical-mode-badge');
    if (badgeEl) badgeEl.textContent = cleanMode === 'scroll' ? 'Déroulant' : 'Séquentiel';
  }
}

export function isArenaChapterRevealed() {
  if (appState.historyCursor >= 0) return true;
  if (appState.isCurrentQuestionAnswered) return true;
  if (typeof document !== 'undefined') {
    const badge = document.getElementById('arena-chapter-title');
    if (badge && badge.classList.contains('is-revealed')) return true;
  }
  return false;
}

export function getEffectiveArenaQuestion() {
  if (appState.historyCursor >= 0 && appState.answeredHistory[appState.historyCursor]) {
    return appState.answeredHistory[appState.historyCursor].question;
  }
  return appState.currentQuestion;
}

export function getDomViews() {
  if (typeof document === 'undefined') return {};
  return {
    dashboard: document.getElementById('view-dashboard'),
    arena: document.getElementById('view-arena'),
    notebook: document.getElementById('view-notebook'),
    stats: document.getElementById('view-stats')
  };
}

export function getDomModals() {
  if (typeof document === 'undefined') return {};
  return {
    error: document.getElementById('modal-error'),
    chapters: document.getElementById('modal-chapters'),
    sync: document.getElementById('modal-sync'),
    settings: document.getElementById('modal-settings'),
    update: document.getElementById('modal-app-update'),
    clinicalSummary: document.getElementById('modal-clinical-case-summary'),
    manualLesson: document.getElementById('modal-manual-lesson-session'),
    confirm: document.getElementById('modal-app-confirm')
  };
}
