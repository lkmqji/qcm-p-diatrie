// ============================================================
// Service de Partitionnement du Stockage Local (Scoped Storage)
// Isole les données par module médical sans aucune perte de données
// ============================================================

import { getActiveModuleId } from './moduleCatalog.js';

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

// Run cross-module notes migration once at initialization
if (typeof localStorage !== 'undefined') {
  migrateReasoningNotesBetweenModules();
}

if (typeof window !== 'undefined') {
  window.StorageScope = {
    resolveStorageKey,
    getScopedItem,
    setScopedItem,
    removeScopedItem,
    migrateReasoningNotesBetweenModules
  };
}
