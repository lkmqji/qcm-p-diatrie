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

import { slimNote } from './queueEngine.js';
import { studyTracker } from './studyTracker.js';
import { lessonTracker } from './lessonTracker.js';

function toSlimNote(note) {
  if (typeof slimNote === 'function') return slimNote(note);
  if (!note || typeof note !== 'object') return note;
  return {
    id: note.id || `note_${note.timestamp || Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    questionUid: note.questionUid || '',
    userAnswer: note.userAnswer || '',
    userAnswerLetters: Array.isArray(note.userAnswerLetters)
      ? note.userAnswerLetters
      : (note.userAnswer ? [note.userAnswer] : []),
    correctAnswer: note.correctAnswer || '',
    score: (note.score !== undefined && note.score !== null) ? Number(note.score) : null,
    isCroq: !!note.isCroq,
    reasoningNote: note.reasoningNote || '',
    modelUsed: note.modelUsed || '',
    timestamp: note.timestamp || Date.now()
  };
}

/**
 * Intelligent state merger: unites local and remote progress non-destructively.
 * - Takes highest current mastery hits
 * - Takes highest penalty target and mistakes
 * - Logical OR for question done state
 * - Full union of all unique AI reasoning notes (no notes deleted) in lean format
 */
export function mergeStates(local, remote) {
  if (!remote || typeof remote !== 'object') return local;
  if (!local || typeof local !== 'object') return remote;

  const merged = {
    version: 2,
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
    snoozedQuestions: {
      ...((remote && remote.snoozedQuestions) || {}),
      ...((local && local.snoozedQuestions) || {})
    },
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

  // Merge reasoning notes without loss in lean format
  const notesMap = new Map();
  const localNotes = Array.isArray(local.reasoningNotes) ? local.reasoningNotes : [];
  const remoteNotes = Array.isArray(remote.reasoningNotes) ? remote.reasoningNotes : [];

  for (const rawNote of [...remoteNotes, ...localNotes]) {
    if (!rawNote) continue;
    const note = toSlimNote(rawNote);
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

  // Merge study history across devices non-destructively
  if (remote.studyHistory && typeof remote.studyHistory === 'object') {
    if (typeof studyTracker !== 'undefined' && studyTracker && typeof studyTracker.mergeHistory === 'function') {
      studyTracker.mergeHistory(remote.studyHistory);
    }
  }

  // Merge lesson sessions across devices non-destructively
  if (remote.lessonSessions && Array.isArray(remote.lessonSessions)) {
    if (typeof lessonTracker !== 'undefined' && lessonTracker && typeof lessonTracker.mergeSessions === 'function') {
      lessonTracker.mergeSessions(remote.lessonSessions);
    }
  }

  // Merge active lesson stopwatch across devices in real-time
  if (typeof lessonTracker !== 'undefined' && lessonTracker && typeof lessonTracker.mergeActiveTimer === 'function') {
    const remoteTimer = remote.activeLessonTimer || null;
    const remoteTimerUpdatedAt = remote.activeLessonTimerUpdatedAt || (remoteTimer ? remoteTimer.updatedAt : null);
    lessonTracker.mergeActiveTimer(remoteTimer, remoteTimerUpdatedAt);
  }

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
   * Launch official Google Sign-In: uses native Google dialog on Android/Capacitor,
   * with seamless fallback to popup/redirect on Web/Desktop.
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

    // 1. Détection de l'environnement natif Capacitor (Android / iOS)
    const isNative = typeof window.Capacitor !== 'undefined' && 
                     typeof window.Capacitor.isNativePlatform === 'function' && 
                     window.Capacitor.isNativePlatform();
    const nativeAuth = window.Capacitor?.Plugins?.FirebaseAuthentication;

    if (isNative && nativeAuth && typeof nativeAuth.signInWithGoogle === 'function') {
      try {
        this.updateStatus('syncing', 'Ouverture du compte Google natif...');
        const nativeResult = await nativeAuth.signInWithGoogle();

        // Si un idToken est disponible, authentifier également le SDK Web pour Firestore
        if (nativeResult?.credential?.idToken && window.firebase?.auth) {
          const credential = window.firebase.auth.GoogleAuthProvider.credential(nativeResult.credential.idToken);
          const webUserCred = await window.firebase.auth().signInWithCredential(credential);
          this.user = webUserCred.user;
        } else if (nativeResult?.user) {
          this.user = nativeResult.user;
        }

        this.updateStatus('synced', `Connecté avec ${this.user.displayName || this.user.email}`);
        return { success: true, user: this.user };
      } catch (nativeErr) {
        console.error('Native Google Sign-In failed:', nativeErr);
        if (nativeErr.code === '12501' || nativeErr.message?.includes('cancel') || nativeErr.message?.includes('12501')) {
          this.updateStatus('idle', 'Connexion annulée.');
          return { success: false, error: 'Connexion annulée par l\'utilisateur.' };
        }
        const friendlyMsg = this.getFriendlyAuthError(nativeErr);
        this.updateStatus('error', friendlyMsg);
        return { success: false, error: friendlyMsg };
      }
    }

    // 2. Flux Web / PC Desktop (Popup avec secours redirect)
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
    const isNative = typeof window.Capacitor !== 'undefined' && 
                     typeof window.Capacitor.isNativePlatform === 'function' && 
                     window.Capacitor.isNativePlatform();
    const nativeAuth = window.Capacitor?.Plugins?.FirebaseAuthentication;
    if (isNative && nativeAuth && typeof nativeAuth.signOut === 'function') {
      try { await nativeAuth.signOut(); } catch(e) { console.warn('Native signOut error:', e); }
    }

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
  /**
   * Fetch reasoning notes from chunked Firestore documents (or fallback to legacy single doc array)
   */
  async fetchRemoteNotes(pediaCol, remoteData) {
    const notes = [];
    if (remoteData && typeof remoteData.notesChunksCount === 'number' && remoteData.notesChunksCount > 0) {
      try {
        const chunkPromises = [];
        for (let i = 0; i < remoteData.notesChunksCount; i++) {
          chunkPromises.push(pediaCol.doc(`notes_${i}`).get());
        }
        const chunkSnaps = await Promise.all(chunkPromises);
        for (const snap of chunkSnaps) {
          if (snap.exists) {
            const data = snap.data();
            if (Array.isArray(data?.notes)) {
              notes.push(...data.notes);
            }
          }
        }
      } catch (e) {
        console.warn('Error fetching note chunks from Firestore:', e);
      }
    }

    // Fallback: If no chunk notes were found or legacy single document, check reasoningNotes
    if (notes.length === 0 && Array.isArray(remoteData?.reasoningNotes) && remoteData.reasoningNotes.length > 0) {
      notes.push(...remoteData.reasoningNotes);
    }

    return notes.map(n => toSlimNote(n));
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
      const pediaCol = db.collection('users').doc(this.user.uid).collection('pedia');
      const docRef = pediaCol.doc('progress');

      this.firestoreUnsubscribe = docRef.onSnapshot(async (doc) => {
        if (!doc.exists) {
          console.log('No Firestore progress document yet for user, will create on first push.');
          return;
        }

        const remoteData = doc.data();
        if (!remoteData || this.isPushing) return;

        console.log('Real-time update received from Firestore');

        // Fetch chunked reasoning notes
        const remoteNotes = await this.fetchRemoteNotes(pediaCol, remoteData);
        remoteData.reasoningNotes = remoteNotes;

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
      const pediaCol = db.collection('users').doc(this.user.uid).collection('pedia');
      const docRef = pediaCol.doc('progress');

      const doc = await docRef.get();
      const localState = this.queueEngine.getStateObject();

      let merged = localState;
      if (doc.exists) {
        const remoteData = doc.data();
        const remoteNotes = await this.fetchRemoteNotes(pediaCol, remoteData);
        remoteData.reasoningNotes = remoteNotes;
        merged = mergeStates(localState, remoteData);
        this.queueEngine.applyMergedState(merged);
      }

      // Notify app to re-render UI with merged state
      if (typeof this.onDataMerged === 'function') {
        this.onDataMerged(merged);
      }

      // Save unified state back to Firestore using chunked architecture
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
      const pediaCol = db.collection('users').doc(this.user.uid).collection('pedia');
      const docRef = pediaCol.doc('progress');

      const doc = await docRef.get();
      if (!doc.exists) {
        this.updateStatus('synced', 'Aucune progression distante sur ce compte Google');
        return { success: true, empty: true };
      }

      const remoteData = doc.data();
      const remoteNotes = await this.fetchRemoteNotes(pediaCol, remoteData);
      remoteData.reasoningNotes = remoteNotes;

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
   * Push current state to Firestore using Chunked Storage Architecture.
   * Splits notes into 50-item chunks (~60 KB each) and compacts question stats,
   * guaranteeing document size remains far below Firestore's 1,048,576 bytes (1 MiB) limit.
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
      const pediaCol = db.collection('users').doc(this.user.uid).collection('pedia');
      const progressDocRef = pediaCol.doc('progress');

      const state = explicitState || this.queueEngine.getStateObject();
      const rawNotes = Array.isArray(state.reasoningNotes) ? state.reasoningNotes : [];
      const slimmedNotes = rawNotes.map(n => toSlimNote(n));

      // 1. Chunk reasoning notes into batches of 50
      // 50 slim notes ~ 60-75 KB, 15x below Firestore's 1MB limit
      const CHUNK_SIZE = 50;
      const noteChunks = [];
      for (let i = 0; i < slimmedNotes.length; i += CHUNK_SIZE) {
        noteChunks.push(slimmedNotes.slice(i, i + CHUNK_SIZE));
      }

      // 2. Compact question stats (omit default untouched questions to keep document small)
      const compactStats = {};
      const rawStats = state.stats || {};
      for (const [uid, st] of Object.entries(rawStats)) {
        if (!st) continue;
        if (st.current > 0 || st.mistakes > 0 || st.done || (st.target && st.target !== 3)) {
          compactStats[uid] = {
            current: st.current || 0,
            target: Math.min(10, st.target || 3),
            mistakes: st.mistakes || 0,
            done: !!st.done
          };
        }
      }

      // 3. Prepare core SRS progress document (~15-20 KB, guaranteed never to exceed 1MB)
      const progressToSave = sanitizeForFirestore({
        version: 2,
        exportedAt: state.exportedAt || new Date().toISOString(),
        stats: compactStats,
        queue: state.queue || [],
        cursor: state.cursor || 0,
        selectedChapterIds: state.selectedChapterIds || [],
        selectedChaptersUpdatedAt: state.selectedChaptersUpdatedAt || Date.now(),
        totalMistakesCount: state.totalMistakesCount || 0,
        todayTracker: state.todayTracker || null,
        studyHistory: (typeof studyTracker !== 'undefined' && studyTracker && typeof studyTracker.getRawHistory === 'function')
          ? studyTracker.getRawHistory()
          : (state.studyHistory || {}),
        lessonSessions: (typeof lessonTracker !== 'undefined' && lessonTracker && typeof lessonTracker.getRawSessions === 'function')
          ? lessonTracker.getRawSessions()
          : (state.lessonSessions || []),
        activeLessonTimer: (typeof lessonTracker !== 'undefined' && lessonTracker && typeof lessonTracker.getActiveTimer === 'function')
          ? lessonTracker.getActiveTimer()
          : null,
        activeLessonTimerUpdatedAt: (typeof lessonTracker !== 'undefined' && lessonTracker && typeof lessonTracker.getLastTimerUpdatedAt === 'function')
          ? lessonTracker.getLastTimerUpdatedAt()
          : Date.now(),
        userEmail: this.user.email || '',
        userDisplayName: this.user.displayName || '',
        lastClientTimestamp: Date.now(),
        notesCount: slimmedNotes.length,
        notesChunksCount: noteChunks.length,
        reasoningNotes: [] // Explicitly clear legacy bloated array in progress document
      });

      progressToSave.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();

      // 4. Atomic batch write for progress doc and all chunk documents
      const batch = db.batch();
      batch.set(progressDocRef, progressToSave, { merge: true });

      for (let i = 0; i < noteChunks.length; i++) {
        const chunkDocRef = pediaCol.doc(`notes_${i}`);
        const chunkData = sanitizeForFirestore({
          chunkIndex: i,
          totalChunks: noteChunks.length,
          notes: noteChunks[i],
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });
        batch.set(chunkDocRef, chunkData);
      }

      // 5. Clean up any excess chunk docs if note count decreased
      const prevChunksCount = Number(localStorage.getItem('pedia_firebase_notes_chunks') || 0);
      if (prevChunksCount > noteChunks.length) {
        for (let i = noteChunks.length; i < prevChunksCount; i++) {
          batch.delete(pediaCol.doc(`notes_${i}`));
        }
      }
      localStorage.setItem('pedia_firebase_notes_chunks', String(noteChunks.length));

      await batch.commit();

      this.lastSyncedAt = Date.now().toString();
      localStorage.setItem('pedia_firebase_last_synced', this.lastSyncedAt);

      const notesCount = slimmedNotes.length;
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
   * Debounced automatic push: triggered automatically after each answered question or timer change
   */
  triggerAutoPush(immediate = false) {
    if (!this.user || !this.isInitialized) return;

    if (this.autoPushTimer) {
      clearTimeout(this.autoPushTimer);
      this.autoPushTimer = null;
    }

    if (immediate) {
      this.pushToFirestore();
      return;
    }

    this.autoPushTimer = setTimeout(() => {
      this.pushToFirestore();
    }, 1200);
  }

  /**
   * Push current state to Firestore immediately or debounced
   */
  pushState(immediate = true) {
    return this.triggerAutoPush(immediate);
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
    if (msg.includes('exceeds the maximum allowed size') || (msg.includes('size') && msg.includes('1048576'))) {
      return '⚠️ Limite de taille Firestore dépassée. Le partitionnement automatique des notes a été appliqué.';
    }
    return msg || 'Erreur Firestore';
  }

  getFriendlyAuthError(err) {
    if (!err) return 'Erreur inconnue';
    const msg = err.message || '';
    const code = String(err.code || '');

    if (code === '10' || msg.includes('10:') || msg.includes('DEVELOPER_ERROR')) {
      return '⚠️ Configuration Google Android (Code 10) : L\'empreinte SHA-1 doit être ajoutée dans la Console Firebase (Paramètres du projet > Vos applications > Empreinte SHA).';
    }
    if (code === '12501' || msg.includes('12501') || msg.includes('canceled') || msg.includes('cancelled')) {
      return 'Connexion annulée par l\'utilisateur.';
    }
    if (msg.includes('missing initial state') || code.includes('missing-initial-state')) {
      return 'Erreur de session du navigateur. Utilisez la connexion native Android intégrée.';
    }

    switch (code) {
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
        return msg || 'Erreur de connexion Google';
    }
  }
}
