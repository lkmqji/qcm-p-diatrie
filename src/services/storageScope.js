// ============================================================
// Service de Partitionnement du Stockage Local (Scoped Storage)
// Isole les données par module médical sans aucune perte de données
// ============================================================

import {
  getActiveModuleId,
  doesQuestionBelongToModule
} from './moduleCatalog.js';

const LEGACY_PEDIA_KEY_MAP = {
  drill_state: 'pedia_drill_state_v1',
  today_tracker: 'pedia_today_tracker',
  first_pass_records: 'pedia_first_pass_records_v2',
  first_pass_records_v1: 'pedia_first_pass_records_v1',
  lesson_tracker: 'pedia_lesson_tracker_v1',
  lesson_tracker_state: 'pedia_lesson_tracker_state_v1',
  lesson_sessions: 'pedia_lesson_sessions_v1',
  reasoning_notes: 'pedia_drill_reasoning_notes_v1',
  study_history: 'pedia_study_history_v1',
  ai_cache: 'pedia_ai_explanations_cache',
  lesson_timer_cleared: 'pedia_lesson_timer_cleared_at',
  selected_chapters: 'pedia_selected_chapters_v1',
  snoozed_questions: 'pedia_snoozed_questions_v1'
};

export function resolveStorageKey(baseKey, moduleId) {
  const modId = moduleId || getActiveModuleId();
  if (modId === 'pediatrie' && LEGACY_PEDIA_KEY_MAP[baseKey]) {
    return LEGACY_PEDIA_KEY_MAP[baseKey];
  }
  return `mod_${modId}_${baseKey}`;
}

export function getScopedItem(baseKey, moduleId) {
  const key = resolveStorageKey(baseKey, moduleId);
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.error(`[storageScope] Erreur de lecture pour ${key}:`, e);
    return null;
  }
}

export function setScopedItem(baseKey, value, moduleId) {
  const key = resolveStorageKey(baseKey, moduleId);
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  } catch (e) {
    console.error(`[storageScope] Erreur d'écriture pour ${key}:`, e);
  }
}

export function removeScopedItem(baseKey, moduleId) {
  const key = resolveStorageKey(baseKey, moduleId);
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.error(`[storageScope] Erreur de suppression pour ${key}:`, e);
  }
}

export function migrateReasoningNotesBetweenModules() {
  if (typeof localStorage === 'undefined') return;
  try {
    const pediaKey = 'pedia_drill_reasoning_notes_v1';
    const psyKey = 'mod_psychiatrie_reasoning_notes';
    
    let pediaNotes = [];
    let psyNotes = [];
    try { pediaNotes = JSON.parse(localStorage.getItem(pediaKey)) || []; } catch {}
    try { psyNotes = JSON.parse(localStorage.getItem(psyKey)) || []; } catch {}
    
    if (!Array.isArray(pediaNotes)) pediaNotes = [];
    if (!Array.isArray(psyNotes)) psyNotes = [];

    // Migrate any psychiatry notes found in pediatrics storage
    const psyInPedia = pediaNotes.filter(n => n && n.questionUid && n.questionUid.startsWith('psy_'));
    const pediaInPsy = psyNotes.filter(n => n && n.questionUid && !n.questionUid.startsWith('psy_'));

    let pediaChanged = false;
    let psyChanged = false;

    if (psyInPedia.length > 0) {
      console.log(`[storageScope] Migrating ${psyInPedia.length} psychiatry note(s) from pediatrics storage to mod_psychiatrie_reasoning_notes...`);
      const existingPsyUids = new Set(psyNotes.map(n => n.questionUid));
      psyInPedia.forEach(n => {
        if (!existingPsyUids.has(n.questionUid)) {
          psyNotes.push(n);
          existingPsyUids.add(n.questionUid);
        }
      });
      pediaNotes = pediaNotes.filter(n => !n || !n.questionUid || !n.questionUid.startsWith('psy_'));
      pediaChanged = true;
      psyChanged = true;
    }

    if (pediaInPsy.length > 0) {
      console.log(`[storageScope] Migrating ${pediaInPsy.length} pediatrics note(s) from psychiatry storage to pedia_drill_reasoning_notes_v1...`);
      const existingPediaUids = new Set(pediaNotes.map(n => n.questionUid));
      pediaInPsy.forEach(n => {
        if (!existingPediaUids.has(n.questionUid)) {
          pediaNotes.push(n);
          existingPediaUids.add(n.questionUid);
        }
      });
      psyNotes = psyNotes.filter(n => !n || !n.questionUid || n.questionUid.startsWith('psy_'));
      pediaChanged = true;
      psyChanged = true;
    }

    if (pediaChanged) {
      localStorage.setItem(pediaKey, JSON.stringify(pediaNotes));
    }
    if (psyChanged) {
      localStorage.setItem(psyKey, JSON.stringify(psyNotes));
    }
  } catch (err) {
    console.warn('[storageScope] Error during reasoning notes cross-module migration:', err);
  }
}

export function migrateStatsBetweenModules() {
  if (typeof localStorage === 'undefined') return;
  try {
    const pediaStateKey = resolveStorageKey('drill_state', 'pediatrie');
    const psyStateKey = resolveStorageKey('drill_state', 'psychiatrie');

    let pediaState = null;
    let psyState = null;
    try { pediaState = JSON.parse(localStorage.getItem(pediaStateKey) || 'null'); } catch {}
    try { psyState = JSON.parse(localStorage.getItem(psyStateKey) || 'null'); } catch {}

    const mergeStatEntry = (targetStats, uid, incoming) => {
      const existing = targetStats[uid];
      if (!existing) {
        targetStats[uid] = { ...incoming };
      } else {
        targetStats[uid] = {
          current: Math.max(existing.current || 0, incoming.current || 0),
          target: Math.min(10, Math.max(existing.target || 3, incoming.target || 3)),
          mistakes: Math.max(existing.mistakes || 0, incoming.mistakes || 0),
          done: !!(existing.done || incoming.done)
        };
      }
    };

    let pediaChanged = false;
    let psyChanged = false;

    if (pediaState && pediaState.stats && typeof pediaState.stats === 'object') {
      const psyEntries = Object.entries(pediaState.stats).filter(([uid]) => !doesQuestionBelongToModule(uid, 'pediatrie'));
      if (psyEntries.length > 0) {
        if (!psyState || typeof psyState !== 'object') {
          psyState = { stats: {}, queue: [], cursor: 0, selectedChapterIds: [], totalMistakesCount: 0, snoozedQuestions: {} };
        }
        if (!psyState.stats || typeof psyState.stats !== 'object') psyState.stats = {};

        let migratedMistakes = 0;
        psyEntries.forEach(([uid, st]) => {
          if (st && typeof st === 'object') {
            migratedMistakes += (st.mistakes || 0);
            mergeStatEntry(psyState.stats, uid, st);
          }
          delete pediaState.stats[uid];
        });
        if (Array.isArray(pediaState.queue)) {
          pediaState.queue = pediaState.queue.filter(uid => doesQuestionBelongToModule(uid, 'pediatrie'));
        }
        if (pediaState.snoozedQuestions && typeof pediaState.snoozedQuestions === 'object') {
          Object.keys(pediaState.snoozedQuestions).forEach(uid => {
            if (!doesQuestionBelongToModule(uid, 'pediatrie')) delete pediaState.snoozedQuestions[uid];
          });
        }
        const scopedPediaMistakes = Object.values(pediaState.stats).reduce((s, st) => s + ((st && st.mistakes) || 0), 0);
        if (typeof pediaState.totalMistakesCount === 'number' && migratedMistakes > 0) {
          pediaState.totalMistakesCount = Math.max(scopedPediaMistakes, pediaState.totalMistakesCount - migratedMistakes);
        }
        const scopedPsyMistakes = Object.values(psyState.stats).reduce((s, st) => s + ((st && st.mistakes) || 0), 0);
        psyState.totalMistakesCount = Math.max(psyState.totalMistakesCount || 0, scopedPsyMistakes);

        pediaChanged = true;
        psyChanged = true;
      }
    }

    if (psyState && psyState.stats && typeof psyState.stats === 'object') {
      const pediaEntries = Object.entries(psyState.stats).filter(([uid]) => !doesQuestionBelongToModule(uid, 'psychiatrie'));
      if (pediaEntries.length > 0) {
        if (!pediaState || typeof pediaState !== 'object') {
          pediaState = { stats: {}, queue: [], cursor: 0, selectedChapterIds: [], totalMistakesCount: 0, snoozedQuestions: {} };
        }
        if (!pediaState.stats || typeof pediaState.stats !== 'object') pediaState.stats = {};

        let migratedMistakes = 0;
        pediaEntries.forEach(([uid, st]) => {
          if (st && typeof st === 'object') {
            migratedMistakes += (st.mistakes || 0);
            mergeStatEntry(pediaState.stats, uid, st);
          }
          delete psyState.stats[uid];
        });
        if (Array.isArray(psyState.queue)) {
          psyState.queue = psyState.queue.filter(uid => doesQuestionBelongToModule(uid, 'psychiatrie'));
        }
        if (psyState.snoozedQuestions && typeof psyState.snoozedQuestions === 'object') {
          Object.keys(psyState.snoozedQuestions).forEach(uid => {
            if (!doesQuestionBelongToModule(uid, 'psychiatrie')) delete psyState.snoozedQuestions[uid];
          });
        }
        const scopedPsyMistakes = Object.values(psyState.stats).reduce((s, st) => s + ((st && st.mistakes) || 0), 0);
        if (typeof psyState.totalMistakesCount === 'number' && migratedMistakes > 0) {
          psyState.totalMistakesCount = Math.max(scopedPsyMistakes, psyState.totalMistakesCount - migratedMistakes);
        }
        const scopedPediaMistakes = Object.values(pediaState.stats).reduce((s, st) => s + ((st && st.mistakes) || 0), 0);
        pediaState.totalMistakesCount = Math.max(pediaState.totalMistakesCount || 0, scopedPediaMistakes);

        pediaChanged = true;
        psyChanged = true;
      }
    }

    if (pediaChanged && pediaState) {
      localStorage.setItem(pediaStateKey, JSON.stringify(pediaState));
    }
    if (psyChanged && psyState) {
      localStorage.setItem(psyStateKey, JSON.stringify(psyState));
    }
  } catch (err) {
    console.warn('[storageScope] Error during stats cross-module migration:', err);
  }
}

// Run cross-module notes and stats migration once at initialization
if (typeof localStorage !== 'undefined') {
  migrateReasoningNotesBetweenModules();
  migrateStatsBetweenModules();
}

if (typeof window !== 'undefined') {
  window.StorageScope = {
    resolveStorageKey,
    getScopedItem,
    setScopedItem,
    removeScopedItem,
    migrateReasoningNotesBetweenModules,
    migrateStatsBetweenModules
  };
}
