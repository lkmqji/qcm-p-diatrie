// ============================================================
// Service de Partitionnement du Stockage Local (Scoped Storage)
// Isole les données par module médical sans aucune perte de données
// ============================================================

import { getActiveModuleId } from './moduleCatalog.js';

const LEGACY_PEDIA_KEY_MAP = {
  today_tracker: 'pedia_today_tracker',
  first_pass_records: 'pedia_first_pass_records_v1',
  lesson_tracker: 'pedia_lesson_tracker_v1',
  reasoning_notes: 'pedia_drill_reasoning_notes_v1',
  ai_cache: 'pedia_ai_explanations_cache',
  lesson_timer_cleared: 'pedia_lesson_timer_cleared_at'
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

if (typeof window !== 'undefined') {
  window.StorageScope = {
    resolveStorageKey,
    getScopedItem,
    setScopedItem,
    removeScopedItem
  };
}
