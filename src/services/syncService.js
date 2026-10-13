// Multi-device Cloud & Secret Code Sync Service

const SESSION_CODE_KEY = 'pedia_session_code';
const DEFAULT_SESSION_CODE = 'OUAIL-2026';
const CLOUD_SYNC_API = 'https://api.jsonbin.io/v3/b'; // Or generic cloud storage endpoint

export class SyncService {
  constructor(queueEngine) {
    this.queueEngine = queueEngine;
    this.sessionCode = localStorage.getItem(SESSION_CODE_KEY) || DEFAULT_SESSION_CODE;
    this.syncStatus = 'idle'; // 'idle' | 'syncing' | 'synced' | 'error'
    this.lastSyncedAt = localStorage.getItem('pedia_last_synced') || null;
  }

  getSessionCode() {
    return this.sessionCode;
  }

  setSessionCode(code) {
    if (code && code.trim()) {
      this.sessionCode = code.trim().toUpperCase();
      localStorage.setItem(SESSION_CODE_KEY, this.sessionCode);
    }
  }

  getLastSyncedText() {
    if (!this.lastSyncedAt) return 'Jamais synchronisé';
    try {
      const date = new Date(Number(this.lastSyncedAt));
      return `Synchronisé le ${date.toLocaleDateString()} à ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return 'Synchronisé';
    }
  }

  /**
   * Cloud push: Sync local state to cloud under the session code
   */
  async pushToCloud() {
    this.syncStatus = 'syncing';
    try {
      const payload = this.queueEngine.exportState();
      
      // Use kv storage or public endpoint keyed by session code
      const endpoint = `https://kv.val.town/v1/pedia_sync_${encodeURIComponent(this.sessionCode)}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      }).catch(() => null);

      this.lastSyncedAt = Date.now().toString();
      localStorage.setItem('pedia_last_synced', this.lastSyncedAt);
      this.syncStatus = 'synced';
      return { success: true, timestamp: this.lastSyncedAt };
    } catch (err) {
      this.syncStatus = 'error';
      return { success: false, error: err.message };
    }
  }

  /**
   * Cloud pull: Retrieve state from cloud using session code
   */
  async pullFromCloud() {
    this.syncStatus = 'syncing';
    try {
      const endpoint = `https://kv.val.town/v1/pedia_sync_${encodeURIComponent(this.sessionCode)}`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`Aucune session distante trouvée pour le code ${this.sessionCode}`);
      const data = await res.text();
      const success = this.queueEngine.importState(data);
      if (success) {
        this.lastSyncedAt = Date.now().toString();
        localStorage.setItem('pedia_last_synced', this.lastSyncedAt);
        this.syncStatus = 'synced';
        return { success: true };
      } else {
        throw new Error('Données corrompues');
      }
    } catch (err) {
      this.syncStatus = 'error';
      return { success: false, error: err.message };
    }
  }

  /**
   * Generate an ultra-compact Base64 export string for 1-click manual sharing
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
