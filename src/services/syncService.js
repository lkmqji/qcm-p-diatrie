// Multi-device Cloud & Secret Code Sync Service for PédiaDrill
// Enables 100% zero-friction synchronization across PC, Phone, and Tablet.

const SESSION_CODE_KEY = 'pedia_session_code';
const DEFAULT_SESSION_CODE = 'OUAIL-2026';
const BIN_MAP_KEY_PREFIX = 'pedia_bin_id_';
const KV_APP_ID = 'pediadrile_v1';

// Pre-seeded dedicated persistent bin for default session code
const DEFAULT_BINS = {
  'OUAIL-2026': 'cbdabdf'
};

const VERCEL_API_FALLBACK = 'https://qcm-p-diatrie-coral.vercel.app/api/sync';

export function getSyncEndpoint() {
  if (typeof window !== 'undefined' && window.location) {
    if (window.location.protocol.startsWith('http') && window.location.hostname.includes('vercel.app')) {
      return '/api/sync';
    }
  }
  return VERCEL_API_FALLBACK;
}

/**
 * Intelligent state merger: unites local and remote progress non-destructively.
 * - Takes highest current mastery hits
 * - Takes highest penalty target and mistakes
 * - Logical OR for question done state
 * - Full union of all unique AI reasoning notes (no notes deleted)
 */
export function mergeStates(local, remote) {
  if (!remote || typeof remote !== 'object') return local;
  if (!local || typeof local !== 'object') return remote;

  const merged = {
    version: 1,
    exportedAt: new Date().toISOString(),
    stats: {},
    queue: Array.isArray(local.queue) && local.queue.length > 0 ? local.queue : (remote.queue || []),
    cursor: local.cursor || remote.cursor || 0,
    selectedChapterIds: (() => {
      const localTs = Number(local.selectedChaptersUpdatedAt || 0);
      const remoteTs = Number(remote.selectedChaptersUpdatedAt || 0);
      if (remoteTs > localTs) {
        return Array.isArray(remote.selectedChapterIds) ? remote.selectedChapterIds : [];
      } else if (localTs > remoteTs) {
        return Array.isArray(local.selectedChapterIds) ? local.selectedChapterIds : [];
      }
      return (Array.isArray(remote.selectedChapterIds) && remote.selectedChapterIds.length > 0)
        ? remote.selectedChapterIds
        : (Array.isArray(local.selectedChapterIds) ? local.selectedChapterIds : []);
    })(),
    selectedChaptersUpdatedAt: Math.max(Number(local.selectedChaptersUpdatedAt || 0), Number(remote.selectedChaptersUpdatedAt || 0)),
    totalMistakesCount: Math.max(local.totalMistakesCount || 0, remote.totalMistakesCount || 0),
    reasoningNotes: []
  };

  // Merge question stats
  const allUids = new Set([
    ...Object.keys(local.stats || {}),
    ...Object.keys(remote.stats || {})
  ]);

  for (const uid of allUids) {
    const l = (local.stats && local.stats[uid]) || null;
    const r = (remote.stats && remote.stats[uid]) || null;

    if (l && r) {
      merged.stats[uid] = {
        current: Math.max(l.current || 0, r.current || 0),
        target: Math.max(l.target || 3, r.target || 3),
        mistakes: Math.max(l.mistakes || 0, r.mistakes || 0),
        done: !!(l.done || r.done)
      };
      if (merged.stats[uid].current >= merged.stats[uid].target) {
        merged.stats[uid].done = true;
      }
    } else if (l) {
      merged.stats[uid] = { ...l };
    } else if (r) {
      merged.stats[uid] = { ...r };
    }
  }

  // Merge reasoning notes without loss
  const notesMap = new Map();
  const localNotes = Array.isArray(local.reasoningNotes) ? local.reasoningNotes : [];
  const remoteNotes = Array.isArray(remote.reasoningNotes) ? remote.reasoningNotes : [];

  for (const note of [...remoteNotes, ...localNotes]) {
    if (!note) continue;
    const key = note.id || `${note.questionUid}_${note.timestamp}`;
    notesMap.set(key, note);
  }

  merged.reasoningNotes = Array.from(notesMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // Merge today's QCM count non-destructively
  const todayStr = new Date().toISOString().slice(0, 10);
  const localToday = (local.todayTracker && local.todayTracker.dateStr === todayStr) ? (local.todayTracker.count || 0) : 0;
  const remoteToday = (remote.todayTracker && remote.todayTracker.dateStr === todayStr) ? (remote.todayTracker.count || 0) : 0;
  merged.todayTracker = {
    dateStr: todayStr,
    count: Math.max(localToday, remoteToday)
  };

  return merged;
}

export class SyncService {
  constructor(queueEngine, onStatusChange = null) {
    this.queueEngine = queueEngine;
    this.sessionCode = localStorage.getItem(SESSION_CODE_KEY) || DEFAULT_SESSION_CODE;
    this.syncStatus = 'idle'; // 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
    this.lastSyncedAt = localStorage.getItem('pedia_last_synced') || null;
    this.onStatusChange = onStatusChange;
    this.autoPushTimer = null;
    this.isSyncing = false;
  }

  getSessionCode() {
    return this.sessionCode;
  }

  setSessionCode(code) {
    if (code && code.trim()) {
      this.sessionCode = code.trim().toUpperCase();
      localStorage.setItem(SESSION_CODE_KEY, this.sessionCode);
      this.updateStatus('idle', 'Code de session mis à jour');
    }
  }

  updateStatus(status, detail = '') {
    this.syncStatus = status;
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange(status, detail, this.getLastSyncedText());
    }
  }

  getLastSyncedText() {
    if (!this.lastSyncedAt) return 'Jamais synchronisé';
    try {
      const date = new Date(Number(this.lastSyncedAt));
      const hours = date.getHours().toString().padStart(2, '0');
      const mins = date.getMinutes().toString().padStart(2, '0');
      return `Synchronisé aujourd'hui à ${hours}:${mins}`;
    } catch {
      return 'Synchronisé';
    }
  }

  /**
   * Pull state from cloud and merge with local progress non-destructively
   */
  async pullFromCloud() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.updateStatus('offline', 'Hors-ligne');
      return { success: false, error: 'Connexion hors-ligne' };
    }

    this.isSyncing = true;
    this.updateStatus('syncing', 'Récupération du Cloud...');

    try {
      const endpoint = getSyncEndpoint();
      const url = `${endpoint}?code=${encodeURIComponent(this.sessionCode)}&_t=${Date.now()}`;

      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) {
        throw new Error(`Serveur Cloud inaccessible (HTTP ${res.status})`);
      }

      const remoteState = await res.json();
      const localState = this.queueEngine.getStateObject 
        ? this.queueEngine.getStateObject() 
        : JSON.parse(this.queueEngine.exportState());

      const merged = mergeStates(localState, remoteState);
      this.queueEngine.applyMergedState(merged);

      this.lastSyncedAt = Date.now().toString();
      localStorage.setItem('pedia_last_synced', this.lastSyncedAt);
      this.updateStatus('synced', 'Synchronisé');
      this.isSyncing = false;

      return { success: true, merged };
    } catch (err) {
      this.isSyncing = false;
      const friendlyError = (err.message === 'Failed to fetch' || err.name === 'TypeError')
        ? 'Impossible de joindre le serveur Cloud (vérifiez votre connexion internet).'
        : err.message;
      this.updateStatus('error', friendlyError);
      return { success: false, error: friendlyError };
    }
  }

  /**
   * Push local state to cloud (first merging with remote so no remote updates are erased)
   */
  async pushToCloud() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.updateStatus('offline', 'Hors-ligne');
      return { success: false, error: 'Connexion hors-ligne' };
    }

    this.isSyncing = true;
    this.updateStatus('syncing', 'Envoi au Cloud...');

    try {
      const endpoint = getSyncEndpoint();
      const localState = this.queueEngine.getStateObject 
        ? this.queueEngine.getStateObject() 
        : JSON.parse(this.queueEngine.exportState());

      // Fetch remote state to merge before pushing
      let toPush = localState;
      try {
        const pullUrl = `${endpoint}?code=${encodeURIComponent(this.sessionCode)}&_t=${Date.now()}`;
        const remoteRes = await fetch(pullUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        if (remoteRes.ok) {
          const remoteState = await remoteRes.json();
          toPush = mergeStates(localState, remoteState);
          this.queueEngine.applyMergedState(toPush);
        }
      } catch (fetchErr) {
        console.warn('Could not fetch remote before push, pushing local:', fetchErr.message);
      }

      const pushUrl = `${endpoint}?code=${encodeURIComponent(this.sessionCode)}`;
      const putRes = await fetch(pushUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(toPush)
      });

      if (!putRes.ok) {
        throw new Error(`Échec de sauvegarde sur le Cloud (HTTP ${putRes.status})`);
      }

      this.lastSyncedAt = Date.now().toString();
      localStorage.setItem('pedia_last_synced', this.lastSyncedAt);
      this.updateStatus('synced', 'Synchronisé');
      this.isSyncing = false;

      return { success: true, timestamp: this.lastSyncedAt };
    } catch (err) {
      this.isSyncing = false;
      const friendlyError = (err.message === 'Failed to fetch' || err.name === 'TypeError')
        ? 'Impossible de joindre le serveur Cloud (vérifiez votre connexion internet).'
        : err.message;
      this.updateStatus('error', friendlyError);
      return { success: false, error: friendlyError };
    }
  }

  /**
   * Debounced automatic push: triggered automatically after each answered question
   */
  triggerAutoPush() {
    if (this.autoPushTimer) {
      clearTimeout(this.autoPushTimer);
    }
    this.autoPushTimer = setTimeout(() => {
      this.pushToCloud();
    }, 1500);
  }

  /**
   * Auto-sync on startup: pulls newer cloud progress, merges, then syncs back
   */
  async autoSyncOnStart(onComplete = null) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.updateStatus('offline', 'Hors-ligne');
      if (onComplete) onComplete(false);
      return;
    }

    try {
      const pullResult = await this.pullFromCloud();
      if (pullResult.success && onComplete) {
        onComplete(true);
      }
      // Push back any local progress that was made offline
      setTimeout(() => {
        this.pushToCloud();
      }, 1000);
    } catch (e) {
      console.warn('AutoSyncOnStart error:', e);
      if (onComplete) onComplete(false);
    }
  }

  /**
   * Setup lifecycle listeners: visibilitychange and online events
   */
  setupLifecycleListeners(onUpdate = null) {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && !this.isSyncing && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
          this.pullFromCloud().then(res => {
            if (res.success && typeof onUpdate === 'function') {
              onUpdate();
            }
          });
        }
      });
    }

    window.addEventListener('online', () => {
      this.updateStatus('idle', 'En ligne');
      this.pullFromCloud().then(() => this.pushToCloud());
    });

    window.addEventListener('offline', () => {
      this.updateStatus('offline', 'Hors-ligne');
    });
  }

  /**
   * Ultra-compact Base64 string for 1-click manual sharing
   */
  getQuickShareCode() {
    try {
      const str = this.queueEngine.exportState();
      return btoa(unescape(encodeURIComponent(str)));
    } catch {
      return '';
    }
  }

  /**
   * Load from Base64 quick share string
   */
  importQuickShareCode(base64Str) {
    try {
      const json = decodeURIComponent(escape(atob(base64Str.trim())));
      return this.queueEngine.importState(json);
    } catch (err) {
      console.error('Import quick share failed:', err);
      return false;
    }
  }
}
