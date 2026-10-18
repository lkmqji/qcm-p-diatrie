// Firebase Authentication (Google Sign-In) & Firestore Real-time Sync Service for PédiaDrill
// Provides seamless multi-device progress sync across PC, Smartphone, and Tablet.

const FIREBASE_CONFIG_STORAGE_KEY = 'pedia_firebase_config';

// Official production Firebase configuration for qcm-pediatr
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAyTJf9A0mMtcnPM1cGfVzFoLZu2rA0qpA",
  authDomain: "qcm-pediatr.firebaseapp.com",
  projectId: "qcm-pediatr",
  storageBucket: "qcm-pediatr.firebasestorage.app",
  messagingSenderId: "1028938391462",
  appId: "1:1028938391462:web:c37c4f146fe3e72b633967"
};

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
    selectedChapterIds: Array.isArray(local.selectedChapterIds) && local.selectedChapterIds.length > 0
      ? local.selectedChapterIds 
      : (remote.selectedChapterIds || []),
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
        target: Math.min(10, Math.max(l.target || 3, r.target || 3)),
        mistakes: Math.max(l.mistakes || 0, r.mistakes || 0),
        done: !!(l.done || r.done)
      };
      if (merged.stats[uid].current >= merged.stats[uid].target) {
        merged.stats[uid].done = true;
      }
    } else if (l) {
      merged.stats[uid] = { ...l, target: Math.min(10, l.target || 3) };
    } else if (r) {
      merged.stats[uid] = { ...r, target: Math.min(10, r.target || 3) };
    }
  }

  // Merge reasoning notes without loss
  const notesMap = new Map();
  const localNotes = Array.isArray(local.reasoningNotes) ? local.reasoningNotes : [];
  const remoteNotes = Array.isArray(remote.reasoningNotes) ? remote.reasoningNotes : [];

  for (const note of [...remoteNotes, ...localNotes]) {
    if (!note) continue;
    // Ensure every note has a unique stable ID
    if (!note.id) {
      note.id = `note_${note.timestamp || Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }
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

/**
 * Sanitize any object for Firestore: converts undefined to null or omits them
 */
export function sanitizeForFirestore(obj) {
  if (obj === undefined) return null;
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    return value === undefined ? null : value;
  }));
}

export class FirebaseSyncService {
  constructor(queueEngine, onStateChange = null, onDataMerged = null) {
    this.queueEngine = queueEngine;
    this.onStateChange = onStateChange; // (status, detail, user, lastSyncText) => void
    this.onDataMerged = onDataMerged;   // (mergedState) => void - Re-renders UI
    this.user = null;
    this.isInitialized = false;
    this.firestoreUnsubscribe = null;
    this.autoPushTimer = null;
    this.isPushing = false;
    this.lastSyncedAt = localStorage.getItem('pedia_firebase_last_synced') || null;
    this.status = 'idle'; // 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
  }

  getSavedConfig() {
    try {
      const saved = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Error reading saved Firebase config:', e);
    }
    return DEFAULT_FIREBASE_CONFIG;
  }

  saveConfig(config) {
    try {
      localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(config));
      this.init(true);
      return true;
    } catch (e) {
      console.error('Error saving Firebase config:', e);
      return false;
    }
  }

  hasConfig() {
    const config = this.getSavedConfig();
    return !!(config && config.apiKey && config.projectId);
  }

  init(forceReinit = false) {
    if (typeof window === 'undefined' || !window.firebase) {
      console.warn('Firebase SDK not loaded in window.');
      return false;
    }

    const config = this.getSavedConfig();
    if (!config || !config.apiKey || !config.projectId) {
      this.isInitialized = false;
      this.updateStatus('idle', 'Compte Google prêt à être configuré');
      return false;
    }

    try {
      if (window.firebase.apps.length > 0) {
        if (forceReinit) {
          window.firebase.app().delete().then(() => {
            window.firebase.initializeApp(config);
            this.configureFirestoreSettings();
            this.setupAuthListener();
          });
          return true;
        }
      } else {
        window.firebase.initializeApp(config);
      }

      this.configureFirestoreSettings();
      this.isInitialized = true;
      this.setupAuthListener();
      return true;
    } catch (err) {
      console.error('Firebase initialization error:', err);
      this.updateStatus('error', `Erreur initialisation Firebase: ${err.message}`);
      return false;
    }
  }

  configureFirestoreSettings() {
    try {
      if (window.firebase && window.firebase.firestore) {
        const db = window.firebase.firestore();
        db.settings({ ignoreUndefinedProperties: true });
      }
    } catch (e) {
      // Settings can only be applied before any firestore operation, ignore if already set
    }
  }

  updateStatus(status, detail = '') {
    this.status = status;
    if (typeof this.onStateChange === 'function') {
      this.onStateChange(this.status, detail, this.user, this.getLastSyncedText());
    }
  }

  getLastSyncedText() {
    if (!this.lastSyncedAt) return 'Jamais synchronisé avec Firestore';
    try {
      const date = new Date(Number(this.lastSyncedAt));
      const hours = date.getHours().toString().padStart(2, '0');
      const mins = date.getMinutes().toString().padStart(2, '0');
      return `Synchronisé aujourd'hui à ${hours}:${mins}`;
    } catch {
      return 'Synchronisé';
    }
  }

  setupAuthListener() {
    if (!window.firebase || !window.firebase.auth) return;

    window.firebase.auth().onAuthStateChanged(async (user) => {
      this.user = user;
      if (user) {
        console.log('Firebase User logged in:', user.displayName || user.email);
        this.updateStatus('syncing', `Connecté : ${user.displayName || user.email}`);
        this.setupFirestoreListener();
        // Initial sync on sign-in: Pull remote, merge, and push back
        await this.syncOnLogin();
      } else {
        console.log('Firebase User logged out.');
        if (this.firestoreUnsubscribe) {
          this.firestoreUnsubscribe();
          this.firestoreUnsubscribe = null;
        }
        this.updateStatus('idle', 'Non connecté');
      }
    });
  }

  /**
   * Launch official Google Sign-In with popup, fallback to redirect if popup is blocked
   */
  async signInWithGoogle() {
    if (!this.isInitialized) {
      const ok = this.init();
      if (!ok) {
        return {
          success: false,
          error: 'Veuillez renseigner votre configuration Firebase dans les Paramètres pour activer la connexion Google.'
        };
      }
    }

    try {
      this.updateStatus('syncing', 'Ouverture de la fenêtre Google...');
      const provider = new window.firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      try {
        const result = await window.firebase.auth().signInWithPopup(provider);
        this.user = result.user;
        this.updateStatus('synced', `Connecté avec ${this.user.displayName || this.user.email}`);
        return { success: true, user: this.user };
      } catch (popupErr) {
        if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/popup-closed-by-user') {
          console.warn('Popup blocked, attempting signInWithRedirect...');
          await window.firebase.auth().signInWithRedirect(provider);
          return { success: true, redirecting: true };
        }
        throw popupErr;
      }
    } catch (err) {
      console.error('Google Sign-In error:', err);
      const friendlyMsg = this.getFriendlyAuthError(err);
      this.updateStatus('error', friendlyMsg);
      return { success: false, error: friendlyMsg };
    }
  }

  async signOut() {
    if (!window.firebase || !window.firebase.auth) return;
    try {
      if (this.firestoreUnsubscribe) {
        this.firestoreUnsubscribe();
        this.firestoreUnsubscribe = null;
      }
      await window.firebase.auth().signOut();
      this.user = null;
      this.updateStatus('idle', 'Déconnecté du compte Google');
      return { success: true };
    } catch (err) {
      console.error('Sign out error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Real-time Firestore subscription: automatically receives changes made from other devices
   */
  setupFirestoreListener() {
    if (!this.user || !window.firebase || !window.firebase.firestore) return;

    if (this.firestoreUnsubscribe) {
      this.firestoreUnsubscribe();
    }

    try {
      const db = window.firebase.firestore();
      const docRef = db.collection('users').doc(this.user.uid).collection('pedia').doc('progress');

      this.firestoreUnsubscribe = docRef.onSnapshot((doc) => {
        if (!doc.exists) {
          console.log('No Firestore progress document yet for user, will create on first push.');
          return;
        }

        const remoteData = doc.data();
        if (!remoteData || this.isPushing) return;

        console.log('Real-time update received from Firestore');
        const localState = this.queueEngine.getStateObject();

        const merged = mergeStates(localState, remoteData);
        this.queueEngine.applyMergedState(merged);

        this.lastSyncedAt = Date.now().toString();
        localStorage.setItem('pedia_firebase_last_synced', this.lastSyncedAt);

        // Notify app to re-render UI
        if (typeof this.onDataMerged === 'function') {
          this.onDataMerged(merged);
        }

        const notesCount = (merged.reasoningNotes || []).length;
        this.updateStatus('synced', `En direct : ${notesCount} note${notesCount > 1 ? 's' : ''} synchronisée${notesCount > 1 ? 's' : ''}`);
      }, (err) => {
        console.warn('Firestore snapshot error:', err);
        const friendly = this.getFriendlyFirestoreError(err);
        this.updateStatus('error', friendly);
      });
    } catch (e) {
      console.warn('Could not setup Firestore listener:', e);
    }
  }

  /**
   * Synchronize on user login: pulls remote progress, merges with current device progress, and uploads
   */
  async syncOnLogin() {
    if (!this.user || !window.firebase || !window.firebase.firestore) return;

    try {
      const db = window.firebase.firestore();
      const docRef = db.collection('users').doc(this.user.uid).collection('pedia').doc('progress');

      const doc = await docRef.get();
      const localState = this.queueEngine.getStateObject();

      let merged = localState;
      if (doc.exists) {
        const remoteData = doc.data();
        merged = mergeStates(localState, remoteData);
        this.queueEngine.applyMergedState(merged);
      }

      // Notify app to re-render UI with merged state
      if (typeof this.onDataMerged === 'function') {
        this.onDataMerged(merged);
      }

      // Save unified state back to Firestore
      await this.pushToFirestore(merged);
      this.lastSyncedAt = Date.now().toString();
      localStorage.setItem('pedia_firebase_last_synced', this.lastSyncedAt);
      
      const notesCount = (merged.reasoningNotes || []).length;
      this.updateStatus('synced', `Progression & ${notesCount} note${notesCount > 1 ? 's' : ''} synchronisée${notesCount > 1 ? 's' : ''} avec votre compte Google !`);
    } catch (err) {
      console.error('Sync on login error:', err);
      const friendly = this.getFriendlyFirestoreError(err);
      this.updateStatus('error', friendly);
    }
  }

  /**
   * Pull state from Firestore manually
   */
  async pullFromFirestore() {
    if (!this.user || !window.firebase || !window.firebase.firestore) {
      return { success: false, error: 'Veuillez vous connecter avec votre compte Google.' };
    }

    this.updateStatus('syncing', 'Récupération depuis Google Cloud...');

    try {
      const db = window.firebase.firestore();
      const docRef = db.collection('users').doc(this.user.uid).collection('pedia').doc('progress');

      const doc = await docRef.get();
      if (!doc.exists) {
        this.updateStatus('synced', 'Aucune progression distante sur ce compte Google');
        return { success: true, empty: true };
      }

      const remoteData = doc.data();
      const localState = this.queueEngine.getStateObject();
      const merged = mergeStates(localState, remoteData);
      this.queueEngine.applyMergedState(merged);

      this.lastSyncedAt = Date.now().toString();
      localStorage.setItem('pedia_firebase_last_synced', this.lastSyncedAt);

      if (typeof this.onDataMerged === 'function') {
        this.onDataMerged(merged);
      }

      const notesCount = (merged.reasoningNotes || []).length;
      this.updateStatus('synced', `Succès : ${notesCount} note${notesCount > 1 ? 's' : ''} récupérée${notesCount > 1 ? 's' : ''} depuis Google Cloud !`);
      return { success: true, merged };
    } catch (err) {
      console.error('Pull from Firestore error:', err);
      const friendly = this.getFriendlyFirestoreError(err);
      this.updateStatus('error', friendly);
      return { success: false, error: friendly };
    }
  }

  /**
   * Push current state to Firestore
   */
  async pushToFirestore(explicitState = null) {
    if (!this.user || !window.firebase || !window.firebase.firestore) {
      return { success: false, error: 'Non connecté à Google' };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.updateStatus('offline', 'Hors-ligne');
      return { success: false, error: 'Hors-ligne' };
    }

    this.isPushing = true;
    this.updateStatus('syncing', 'Sauvegarde vers Google Cloud...');

    try {
      const db = window.firebase.firestore();
      const docRef = db.collection('users').doc(this.user.uid).collection('pedia').doc('progress');

      const state = explicitState || this.queueEngine.getStateObject();

      const toSave = sanitizeForFirestore({
        ...state,
        userEmail: this.user.email || '',
        userDisplayName: this.user.displayName || '',
        lastClientTimestamp: Date.now()
      });

      // Add server timestamp safely
      toSave.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();

      await docRef.set(toSave, { merge: true });

      this.lastSyncedAt = Date.now().toString();
      localStorage.setItem('pedia_firebase_last_synced', this.lastSyncedAt);

      const notesCount = (state.reasoningNotes || []).length;
      this.updateStatus('synced', `Enregistré : ${notesCount} note${notesCount > 1 ? 's' : ''} sauvegardée${notesCount > 1 ? 's' : ''} sur Google Cloud`);
      this.isPushing = false;
      return { success: true };
    } catch (err) {
      this.isPushing = false;
      console.error('Push to Firestore error:', err);
      const friendly = this.getFriendlyFirestoreError(err);
      this.updateStatus('error', friendly);
      return { success: false, error: friendly };
    }
  }

  /**
   * Debounced automatic push: triggered automatically after each answered question
   */
  triggerAutoPush() {
    if (!this.user || !this.isInitialized) return;

    if (this.autoPushTimer) {
      clearTimeout(this.autoPushTimer);
    }
    this.autoPushTimer = setTimeout(() => {
      this.pushToFirestore();
    }, 1500);
  }

  getFriendlyFirestoreError(err) {
    if (!err) return 'Erreur Firestore inconnue';
    const msg = err.message || '';
    if (err.code === 'permission-denied' || msg.includes('Missing or insufficient permissions') || msg.includes('PERMISSION_DENIED')) {
      return '⚠️ Permissions Firestore refusées. Veuillez activer les règles de lecture/écriture dans la console Firebase (Firestore > Règles).';
    }
    if (err.code === 'unavailable' || msg.includes('unavailable')) {
      return 'Connexion Firestore temporairement indisponible (vérifiez votre connexion internet).';
    }
    return msg || 'Erreur Firestore';
  }

  getFriendlyAuthError(err) {
    if (!err || !err.code) return err.message || 'Erreur inconnue';
    switch (err.code) {
      case 'auth/popup-blocked':
        return 'La fenêtre de connexion Google a été bloquée par le navigateur. Veuillez autoriser les popups.';
      case 'auth/popup-closed-by-user':
        return 'Connexion annulée par l\'utilisateur.';
      case 'auth/network-request-failed':
        return 'Erreur réseau : vérifiez votre connexion Internet.';
      case 'auth/unauthorized-domain':
        return 'Ce domaine n\'est pas encore autorisé dans la console Firebase (Authentication > Settings > Authorized Domains).';
      case 'auth/operation-not-allowed':
        return 'La connexion Google n\'est pas encore activée dans la console Firebase (Authentication > Sign-in method > Google).';
      default:
        return err.message;
    }
  }
}
