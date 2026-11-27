// Firebase Authentication (Google Sign-In) & Firestore Real-time Sync Service for PédiaDrill
// Provides seamless multi-device progress sync across PC, Smartphone, and Tablet.
// Supports multi-modules, global profile sync (exam dates, clinical mode, Gemini API key, timers),
// and chunked anti-quota reasoning notes.

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
import {
  getActiveModuleId,
  getAllExamDates,
  setAllExamDates,
  getExamDatesUpdatedAt
} from './moduleCatalog.js';

function getLocalDateStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
 * Intelligent module state merger: unites local and remote progress non-destructively.
 * - Takes highest current mastery hits
 * - Takes highest penalty target and mistakes
 * - Logical OR for question done state
 * - Full union of all unique AI reasoning notes (no notes deleted) in lean format
 * - Non-destructive merge of study history and first-pass records
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
  const todayStr = getLocalDateStr();
  const effectiveDate = (local.todayTracker?.dateStr === remote.todayTracker?.dateStr && local.todayTracker?.dateStr)
    ? local.todayTracker.dateStr
    : todayStr;
  const localToday = (local.todayTracker && local.todayTracker.dateStr === effectiveDate) ? (local.todayTracker.count || 0) : 0;
  const remoteToday = (remote.todayTracker && remote.todayTracker.dateStr === effectiveDate) ? (remote.todayTracker.count || 0) : 0;
  merged.todayTracker = {
    dateStr: effectiveDate,
    count: Math.max(localToday, remoteToday)
  };

  // Merge study history across devices non-destructively
  if (remote.studyHistory && typeof remote.studyHistory === 'object') {
    if (typeof studyTracker !== 'undefined' && studyTracker && typeof studyTracker.mergeHistory === 'function') {
      studyTracker.mergeHistory(remote.studyHistory);
    }
  }

  // Merge first pass discovery records across devices
  if (remote.firstPassRecords && typeof remote.firstPassRecords === 'object') {
    if (typeof studyTracker !== 'undefined' && studyTracker && typeof studyTracker.mergeFirstPassRecords === 'function') {
      studyTracker.mergeFirstPassRecords(remote.firstPassRecords);
    }
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
  constructor(queueEngine, onStateChange = null, onDataMerged = null, onRemoteModuleSwitch = null) {
    this.queueEngine = queueEngine;
    this.onStateChange = onStateChange; // (status, detail, user, lastSyncText) => void
    this.onDataMerged = onDataMerged;   // (mergedState) => void - Re-renders UI
    this.onRemoteModuleSwitch = onRemoteModuleSwitch; // (newModuleId) => void - Called when another device switched module
    this.user = null;
    this.isInitialized = false;

    // Separate Firestore listeners
    this.profileUnsubscribe = null;
    this.moduleUnsubscribe = null;
    this.activeListeningModuleId = null;

    // Protection flags
    this.autoPushTimer = null;
    this.isPushing = false;
    this.isApplyingRemoteSnapshot = false; // Anti ping-pong loop guard
    this.lastLocalModuleSwitchTimestamp = Date.now();
    this._syncLoginPromise = null;

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
        
        // Initial sync on sign-in: check migration, pull remote profile & module, and setup listeners
        await this.syncOnLogin();
      } else {
        console.log('Firebase User logged out.');
        this.unsubscribeAllListeners();
        this.updateStatus('idle', 'Non connecté');
      }
    });
  }

  unsubscribeAllListeners() {
    if (this.profileUnsubscribe) {
      this.profileUnsubscribe();
      this.profileUnsubscribe = null;
    }
    if (this.moduleUnsubscribe) {
      this.moduleUnsubscribe();
      this.moduleUnsubscribe = null;
    }
    this.activeListeningModuleId = null;
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

        if (nativeResult?.credential?.idToken && window.firebase?.auth) {
          const credential = window.firebase.auth.GoogleAuthProvider.credential(nativeResult.credential.idToken);
          const webUserCred = await window.firebase.auth().signInWithCredential(credential);
          this.user = webUserCred.user;
        } else if (nativeResult?.user) {
          this.user = nativeResult.user;
        }

        await this.syncOnLogin();
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
        await this.syncOnLogin();
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
      this.unsubscribeAllListeners();
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
   * Fetch reasoning notes from chunked Firestore subcollection (or fallback to legacy pedia doc chunks)
   */
  async fetchRemoteNotes(moduleDocRef, remoteData) {
    const notes = [];
    if (remoteData && typeof remoteData.notesChunksCount === 'number' && remoteData.notesChunksCount > 0) {
      try {
        const chunkPromises = [];
        for (let i = 0; i < remoteData.notesChunksCount; i++) {
          chunkPromises.push(moduleDocRef.collection('notes_chunks').doc(`chunk_${i}`).get());
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
        console.warn('Error fetching note chunks from Firestore subcollection:', e);
      }
    }

    // Fallback: Check reasoningNotes embedded in remoteData if chunks failed
    if (notes.length === 0 && Array.isArray(remoteData?.reasoningNotes) && remoteData.reasoningNotes.length > 0) {
      notes.push(...remoteData.reasoningNotes);
    }

    return notes.map(n => toSlimNote(n));
  }

  /**
   * Migrate legacy data from `users/{uid}/pedia/progress` to `profile/state` + `modules/pediatrie`
   */
  async checkAndMigrateLegacyData(db) {
    if (!this.user) return false;
    try {
      const userDocRef = db.collection('users').doc(this.user.uid);
      const newProfileDoc = await userDocRef.collection('profile').doc('state').get();
      const newPediaDoc = await userDocRef.collection('modules').doc('pediatrie').get();

      // If new profile or module already exists, migration is not needed
      if (newProfileDoc.exists || newPediaDoc.exists) {
        return false;
      }

      // Check if legacy data exists
      const legacyPediaRef = userDocRef.collection('pedia');
      const legacyProgressSnap = await legacyPediaRef.doc('progress').get();

      if (!legacyProgressSnap.exists) {
        return false;
      }

      console.log('🔄 Migrating legacy PediaDrill data to modern multi-module architecture...');
      this.updateStatus('syncing', 'Migration automatique des données vers le format multi-modules...');

      const legacyData = legacyProgressSnap.data() || {};

      // 1. Fetch legacy notes chunks
      const legacyNotes = [];
      const legacyChunksCount = Number(legacyData.notesChunksCount || 0);
      if (legacyChunksCount > 0) {
        for (let i = 0; i < legacyChunksCount; i++) {
          try {
            const snap = await legacyPediaRef.doc(`notes_${i}`).get();
            if (snap.exists && Array.isArray(snap.data()?.notes)) {
              legacyNotes.push(...snap.data().notes);
            }
          } catch (e) {}
        }
      }
      if (legacyNotes.length === 0 && Array.isArray(legacyData.reasoningNotes)) {
        legacyNotes.push(...legacyData.reasoningNotes);
      }

      // 2. Prepare modern profile document
      const currentExamDates = typeof getAllExamDates === 'function' ? getAllExamDates() : {};
      const currentClinicalMode = localStorage.getItem('pedia_clinical_case_mode') || 'sequential';
      const currentGeminiKey = localStorage.getItem('pedia_gemini_key') || '';

      const profileData = sanitizeForFirestore({
        activeModuleId: 'pediatrie',
        activeModuleUpdatedAt: Date.now(),
        examDates: currentExamDates,
        examDatesUpdatedAt: Date.now(),
        settings: {
          clinicalCaseMode: currentClinicalMode,
          geminiApiKey: currentGeminiKey
        },
        settingsUpdatedAt: Date.now(),
        activeLessonTimer: legacyData.activeLessonTimer || null,
        activeLessonTimerUpdatedAt: legacyData.activeLessonTimerUpdatedAt || Date.now(),
        lessonSessions: legacyData.lessonSessions || [],
        userEmail: this.user.email || '',
        userDisplayName: this.user.displayName || '',
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      });

      // 3. Prepare modern module document for pediatrie
      const moduleData = sanitizeForFirestore({
        moduleId: 'pediatrie',
        version: 2,
        exportedAt: legacyData.exportedAt || new Date().toISOString(),
        stats: legacyData.stats || {},
        queue: legacyData.queue || [],
        cursor: legacyData.cursor || 0,
        selectedChapterIds: legacyData.selectedChapterIds || [],
        selectedChaptersUpdatedAt: legacyData.selectedChaptersUpdatedAt || Date.now(),
        totalMistakesCount: legacyData.totalMistakesCount || 0,
        snoozedQuestions: legacyData.snoozedQuestions || {},
        todayTracker: legacyData.todayTracker || null,
        studyHistory: legacyData.studyHistory || {},
        firstPassRecords: {},
        notesCount: legacyNotes.length,
        notesChunksCount: Math.ceil(legacyNotes.length / 50),
        reasoningNotes: [],
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      });

      // Batch write migration
      const batch = db.batch();
      batch.set(userDocRef.collection('profile').doc('state'), profileData);
      
      const newPediaRef = userDocRef.collection('modules').doc('pediatrie');
      batch.set(newPediaRef, moduleData);

      // Write chunk notes to subcollection
      const CHUNK_SIZE = 50;
      for (let i = 0; i < legacyNotes.length; i += CHUNK_SIZE) {
        const chunkIndex = Math.floor(i / CHUNK_SIZE);
        const chunkNotes = legacyNotes.slice(i, i + CHUNK_SIZE).map(n => toSlimNote(n));
        const chunkRef = newPediaRef.collection('notes_chunks').doc(`chunk_${chunkIndex}`);
        batch.set(chunkRef, {
          chunkIndex,
          totalChunks: Math.ceil(legacyNotes.length / CHUNK_SIZE),
          notes: chunkNotes,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });
      }

      await batch.commit();
      console.log('✅ Migration to multi-module Firestore completed successfully!');
      return true;
    } catch (e) {
      console.error('Migration error:', e);
      return false;
    }
  }

  /**
   * Set up real-time listener on the user's global profile state
   */
  setupProfileListener() {
    if (!this.user || !window.firebase || !window.firebase.firestore) return;

    if (this.profileUnsubscribe) {
      this.profileUnsubscribe();
      this.profileUnsubscribe = null;
    }

    try {
      const db = window.firebase.firestore();
      const profileDocRef = db.collection('users').doc(this.user.uid).collection('profile').doc('state');

      this.profileUnsubscribe = profileDocRef.onSnapshot((doc) => {
        if (!doc.exists || this.isPushing) return;
        const remoteProfile = doc.data();
        if (!remoteProfile) return;

        this.handleRemoteProfileUpdate(remoteProfile);
      }, (err) => {
        console.warn('Profile snapshot error:', err);
      });
    } catch (e) {
      console.warn('Could not setup profile listener:', e);
    }
  }

  /**
   * Set up real-time listener on the current active module progress
   */
  setupModuleListener(moduleId = getActiveModuleId()) {
    if (!this.user || !window.firebase || !window.firebase.firestore) return;

    if (this.moduleUnsubscribe) {
      this.moduleUnsubscribe();
      this.moduleUnsubscribe = null;
    }

    this.activeListeningModuleId = moduleId;

    try {
      const db = window.firebase.firestore();
      const moduleDocRef = db.collection('users').doc(this.user.uid).collection('modules').doc(moduleId);

      this.moduleUnsubscribe = moduleDocRef.onSnapshot(async (doc) => {
        if (!doc.exists || this.isPushing) return;
        const remoteData = doc.data();
        if (!remoteData) return;

        await this.handleRemoteModuleUpdate(moduleId, moduleDocRef, remoteData);
      }, (err) => {
        console.warn(`Module snapshot error for ${moduleId}:`, err);
        const friendly = this.getFriendlyFirestoreError(err);
        this.updateStatus('error', friendly);
      });
    } catch (e) {
      console.warn(`Could not setup module listener for ${moduleId}:`, e);
    }
  }

  /**
   * Handle incoming remote profile updates (settings, exam dates, stopwatch, active module)
   */
  handleRemoteProfileUpdate(remoteProfile) {
    if (!remoteProfile || this.isApplyingRemoteSnapshot) return;
    this.isApplyingRemoteSnapshot = true;

    try {
      let uiNeedsRefresh = false;

      // 1. Sync Exam Dates (respecting timestamp & propagating deletions)
      if (remoteProfile.examDates && typeof remoteProfile.examDates === 'object') {
        if (typeof setAllExamDates === 'function') {
          const remoteExamTs = Number(remoteProfile.examDatesUpdatedAt || 0);
          const localExamTs = typeof getExamDatesUpdatedAt === 'function' ? getExamDatesUpdatedAt() : 0;
          if (remoteExamTs >= localExamTs) {
            const changed = setAllExamDates(remoteProfile.examDates, remoteExamTs, true);
            if (changed) uiNeedsRefresh = true;
          }
        }
      }

      // 2. Sync Settings (Clinical Mode, Gemini API Key) respecting settingsUpdatedAt
      if (remoteProfile.settings && typeof remoteProfile.settings === 'object') {
        const remoteSettingsTs = Number(remoteProfile.settingsUpdatedAt || 0);
        const localSettingsTs = Number(localStorage.getItem('pedia_settings_updated_at') || 0);
        const canApplySettings = remoteSettingsTs === 0 || remoteSettingsTs >= localSettingsTs;

        if (canApplySettings) {
          const { clinicalCaseMode, geminiApiKey } = remoteProfile.settings;
          if (clinicalCaseMode) {
            const localMode = localStorage.getItem('pedia_clinical_case_mode');
            if (localMode !== clinicalCaseMode) {
              localStorage.setItem('pedia_clinical_case_mode', clinicalCaseMode);
              uiNeedsRefresh = true;
            }
          }
          if (typeof geminiApiKey === 'string') {
            const trimmedRemoteKey = geminiApiKey.trim();
            const localKey = (localStorage.getItem('pedia_gemini_key') || '').trim();
            if (trimmedRemoteKey && localKey !== trimmedRemoteKey) {
              localStorage.setItem('pedia_gemini_key', trimmedRemoteKey);
              if (typeof window !== 'undefined' && window.geminiService) {
                window.geminiService.setApiKey(trimmedRemoteKey);
              }
              uiNeedsRefresh = true;
            } else if (!trimmedRemoteKey && remoteSettingsTs > localSettingsTs && localKey) {
              localStorage.removeItem('pedia_gemini_key');
              if (typeof window !== 'undefined' && window.geminiService) {
                window.geminiService.setApiKey('');
              }
              uiNeedsRefresh = true;
            }
          }
          if (remoteSettingsTs > 0) {
            localStorage.setItem('pedia_settings_updated_at', String(remoteSettingsTs));
          }
        }
      }

      // 3. Sync Active Stopwatch Timer
      if (typeof lessonTracker !== 'undefined' && lessonTracker && typeof lessonTracker.mergeActiveTimer === 'function') {
        const remoteTimer = remoteProfile.activeLessonTimer || null;
        const remoteTimerUpdatedAt = remoteProfile.activeLessonTimerUpdatedAt || (remoteTimer ? remoteTimer.updatedAt : null);
        lessonTracker.mergeActiveTimer(remoteTimer, remoteTimerUpdatedAt);
        uiNeedsRefresh = true;
      }

      // 4. Sync Lesson Sessions
      if (Array.isArray(remoteProfile.lessonSessions) && remoteProfile.lessonSessions.length > 0) {
        if (typeof lessonTracker !== 'undefined' && lessonTracker && typeof lessonTracker.mergeSessions === 'function') {
          const added = lessonTracker.mergeSessions(remoteProfile.lessonSessions);
          if (added) uiNeedsRefresh = true;
        }
      }

      // 5. Active Module Cross-Device Sync
      if (remoteProfile.activeModuleId && remoteProfile.activeModuleId !== getActiveModuleId()) {
        const remoteTs = Number(remoteProfile.activeModuleUpdatedAt || 0);
        if (remoteTs > this.lastLocalModuleSwitchTimestamp) {
          console.log(`📡 Remote module switch requested: ${remoteProfile.activeModuleId}`);
          if (typeof this.onRemoteModuleSwitch === 'function') {
            this.onRemoteModuleSwitch(remoteProfile.activeModuleId);
          }
        }
      }

      if (uiNeedsRefresh && typeof this.onDataMerged === 'function') {
        this.onDataMerged(null);
      }
    } finally {
      this.isApplyingRemoteSnapshot = false;
    }
  }

  /**
   * Handle incoming remote module updates (SRS stats, queue, cursor, studyHistory, notes)
   */
  async handleRemoteModuleUpdate(moduleId, moduleDocRef, remoteData) {
    if (!remoteData || this.isApplyingRemoteSnapshot) return;
    if (moduleId !== getActiveModuleId()) return;

    this.isApplyingRemoteSnapshot = true;
    try {
      console.log(`📡 Real-time update received for module ${moduleId}`);

      // Fetch chunked reasoning notes
      const remoteNotes = await this.fetchRemoteNotes(moduleDocRef, remoteData);
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
      this.updateStatus('synced', `En direct (${moduleId}) : ${notesCount} note${notesCount > 1 ? 's' : ''} synchronisée${notesCount > 1 ? 's' : ''}`);
    } finally {
      this.isApplyingRemoteSnapshot = false;
    }
  }

  /**
   * Switch the active Firestore listener when student changes module
   */
  switchListeningModule(newModuleId) {
    this.lastLocalModuleSwitchTimestamp = Date.now();
    if (!this.user || !this.isInitialized) return;
    if (this.activeListeningModuleId === newModuleId) return;

    this.setupModuleListener(newModuleId);
    // Push new active module to profile in background
    this.pushProfileToFirestore();
  }

  /**
   * Full synchronisation on login: migrates if needed, pulls profile, pulls active module, sets listeners, pushes back
   */
  async syncOnLogin() {
    if (!this.user || !window.firebase || !window.firebase.firestore) return;
    if (this._syncLoginPromise) return this._syncLoginPromise;

    this._syncLoginPromise = (async () => {
      try {
        const db = window.firebase.firestore();
        
        // 1. Run transparent migration if legacy format detected
        await this.checkAndMigrateLegacyData(db);

        // 2. Setup listeners
        const currentModId = getActiveModuleId();
        this.setupProfileListener();
        this.setupModuleListener(currentModId);

        // 3. Pull and merge initial remote state
        await this.pullFromFirestore();

        // 4. Push combined state back
        await this.pushToFirestore();

        this.lastSyncedAt = Date.now().toString();
        localStorage.setItem('pedia_firebase_last_synced', this.lastSyncedAt);
        this.updateStatus('synced', `Profil & progression synchronisés avec votre compte Google !`);
      } catch (err) {
        console.error('Sync on login error:', err);
        const friendly = this.getFriendlyFirestoreError(err);
        this.updateStatus('error', friendly);
      } finally {
        this._syncLoginPromise = null;
      }
    })();

    return this._syncLoginPromise;
  }

  /**
   * Pull global profile and active module state from Firestore
   */
  async pullFromFirestore() {
    if (!this.user || !window.firebase || !window.firebase.firestore) {
      return { success: false, error: 'Veuillez vous connecter avec votre compte Google.' };
    }

    this.updateStatus('syncing', 'Récupération depuis Google Cloud...');

    try {
      const db = window.firebase.firestore();
      const userDocRef = db.collection('users').doc(this.user.uid);
      const activeModId = getActiveModuleId();

      // 1. Pull Profile
      const profileSnap = await userDocRef.collection('profile').doc('state').get();
      if (profileSnap.exists) {
        this.handleRemoteProfileUpdate(profileSnap.data());
      }

      // 2. Pull Active Module Progress
      const modDocRef = userDocRef.collection('modules').doc(activeModId);
      const modSnap = await modDocRef.get();

      let merged = null;
      if (modSnap.exists) {
        const remoteData = modSnap.data() || {};
        const remoteNotes = await this.fetchRemoteNotes(modDocRef, remoteData);
        remoteData.reasoningNotes = remoteNotes;

        const localState = this.queueEngine.getStateObject();
        merged = mergeStates(localState, remoteData);
        this.queueEngine.applyMergedState(merged);
      } else {
        // Fallback: If modules/pediatrie does not exist yet, check legacy pedia
        if (activeModId === 'pediatrie') {
          const legacySnap = await userDocRef.collection('pedia').doc('progress').get();
          if (legacySnap.exists) {
            const legacyData = legacySnap.data() || {};
            const legacyNotes = await this.fetchRemoteNotes(userDocRef.collection('pedia'), legacyData);
            legacyData.reasoningNotes = legacyNotes;
            const localState = this.queueEngine.getStateObject();
            merged = mergeStates(localState, legacyData);
            this.queueEngine.applyMergedState(merged);
          }
        }
      }

      this.lastSyncedAt = Date.now().toString();
      localStorage.setItem('pedia_firebase_last_synced', this.lastSyncedAt);

      if (typeof this.onDataMerged === 'function') {
        this.onDataMerged(merged);
      }

      const notesCount = (merged?.reasoningNotes || this.queueEngine.getRawReasoningNotes() || []).length;
      this.updateStatus('synced', `Succès : Données & ${notesCount} note${notesCount > 1 ? 's' : ''} IA synchronisées !`);
      return { success: true, merged };
    } catch (err) {
      console.error('Pull from Firestore error:', err);
      const friendly = this.getFriendlyFirestoreError(err);
      this.updateStatus('error', friendly);
      return { success: false, error: friendly };
    }
  }

  /**
   * Push profile state (exam dates, settings, active module, timer, sessions)
   */
  async pushProfileToFirestore() {
    if (!this.user || !window.firebase || !window.firebase.firestore) return;

    try {
      const db = window.firebase.firestore();
      const profileDocRef = db.collection('users').doc(this.user.uid).collection('profile').doc('state');

      const examDates = typeof getAllExamDates === 'function' ? getAllExamDates() : {};
      const examDatesUpdatedAt = typeof getExamDatesUpdatedAt === 'function' ? getExamDatesUpdatedAt() : 0;
      const clinicalMode = localStorage.getItem('pedia_clinical_case_mode') || 'sequential';
      const geminiKey = localStorage.getItem('pedia_gemini_key') || '';
      const settingsUpdatedAt = Number(localStorage.getItem('pedia_settings_updated_at') || 0);

      const profilePayload = sanitizeForFirestore({
        activeModuleId: getActiveModuleId(),
        activeModuleUpdatedAt: this.lastLocalModuleSwitchTimestamp || Date.now(),
        examDates,
        examDatesUpdatedAt: examDatesUpdatedAt || Date.now(),
        settings: {
          clinicalCaseMode: clinicalMode,
          geminiApiKey: geminiKey
        },
        settingsUpdatedAt: settingsUpdatedAt || Date.now(),
        activeLessonTimer: (typeof lessonTracker !== 'undefined' && lessonTracker && typeof lessonTracker.getActiveTimer === 'function')
          ? lessonTracker.getActiveTimer()
          : null,
        activeLessonTimerUpdatedAt: (typeof lessonTracker !== 'undefined' && lessonTracker && typeof lessonTracker.getLastTimerUpdatedAt === 'function')
          ? lessonTracker.getLastTimerUpdatedAt()
          : Date.now(),
        lessonSessions: (typeof lessonTracker !== 'undefined' && lessonTracker && typeof lessonTracker.getRawSessions === 'function')
          ? lessonTracker.getRawSessions()
          : [],
        userEmail: this.user.email || '',
        userDisplayName: this.user.displayName || '',
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      });

      await profileDocRef.set(profilePayload, { merge: true });
    } catch (e) {
      console.warn('pushProfileToFirestore error:', e);
    }
  }

  /**
   * Push module state (SRS stats, queue, cursor, studyHistory, firstPassRecords, chunked notes)
   */
  async pushModuleToFirestore(moduleId = getActiveModuleId(), explicitState = null) {
    if (!this.user || !window.firebase || !window.firebase.firestore) {
      return { success: false, error: 'Non connecté à Google' };
    }

    try {
      const db = window.firebase.firestore();
      const modDocRef = db.collection('users').doc(this.user.uid).collection('modules').doc(moduleId);

      const state = explicitState || this.queueEngine.getStateObject();
      const rawNotes = Array.isArray(state.reasoningNotes) ? state.reasoningNotes : [];
      const slimmedNotes = rawNotes.map(n => toSlimNote(n));

      // 1. Chunk reasoning notes into batches of 50 (~60 KB each)
      const CHUNK_SIZE = 50;
      const noteChunks = [];
      for (let i = 0; i < slimmedNotes.length; i += CHUNK_SIZE) {
        noteChunks.push(slimmedNotes.slice(i, i + CHUNK_SIZE));
      }

      // 2. Compact question stats (omit untouched questions)
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

      // 3. Collect module first-pass discovery records
      const firstPassRecords = (typeof studyTracker !== 'undefined' && studyTracker && typeof studyTracker.getRawFirstPassRecords === 'function')
        ? studyTracker.getRawFirstPassRecords()
        : {};

      // 4. Collect study history
      const studyHistory = (typeof studyTracker !== 'undefined' && studyTracker && typeof studyTracker.getRawHistory === 'function')
        ? studyTracker.getRawHistory()
        : (state.studyHistory || {});

      // 5. Build module progress payload (~25-35 KB, guaranteed far below 1MB)
      const modulePayload = sanitizeForFirestore({
        moduleId,
        version: 2,
        exportedAt: state.exportedAt || new Date().toISOString(),
        stats: compactStats,
        queue: state.queue || [],
        cursor: state.cursor || 0,
        selectedChapterIds: state.selectedChapterIds || [],
        selectedChaptersUpdatedAt: state.selectedChaptersUpdatedAt || Date.now(),
        totalMistakesCount: state.totalMistakesCount || 0,
        snoozedQuestions: state.snoozedQuestions || {},
        todayTracker: state.todayTracker || null,
        studyHistory,
        firstPassRecords,
        notesCount: slimmedNotes.length,
        notesChunksCount: noteChunks.length,
        reasoningNotes: [] // Explicitly cleared from main document
      });

      modulePayload.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();

      // 6. Atomic batch write for module progress doc and all chunk documents
      const batch = db.batch();
      batch.set(modDocRef, modulePayload, { merge: true });

      for (let i = 0; i < noteChunks.length; i++) {
        const chunkRef = modDocRef.collection('notes_chunks').doc(`chunk_${i}`);
        const chunkData = sanitizeForFirestore({
          chunkIndex: i,
          totalChunks: noteChunks.length,
          notes: noteChunks[i],
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });
        batch.set(chunkRef, chunkData);
      }

      // 7. Clean up any excess chunk docs if note count decreased
      const chunkTrackingKey = `pedia_firebase_chunks_${moduleId}`;
      const prevChunksCount = Number(localStorage.getItem(chunkTrackingKey) || 0);
      if (prevChunksCount > noteChunks.length) {
        for (let i = noteChunks.length; i < prevChunksCount; i++) {
          batch.delete(modDocRef.collection('notes_chunks').doc(`chunk_${i}`));
        }
      }
      localStorage.setItem(chunkTrackingKey, String(noteChunks.length));

      await batch.commit();
      return { success: true, notesCount: slimmedNotes.length };
    } catch (err) {
      console.error(`Push to Firestore error for module ${moduleId}:`, err);
      throw err;
    }
  }

  /**
   * Push current state (Profile + Active Module) to Firestore atomically
   */
  async pushToFirestore(explicitState = null) {
    if (!this.user || !window.firebase || !window.firebase.firestore) {
      return { success: false, error: 'Non connecté à Google' };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.updateStatus('offline', 'Hors-ligne');
      return { success: false, error: 'Hors-ligne' };
    }

    if (this.isApplyingRemoteSnapshot) {
      return { success: true, skipped: 'Receiving remote snapshot' };
    }

    this.isPushing = true;
    this.updateStatus('syncing', 'Sauvegarde vers Google Cloud...');

    try {
      const activeModId = getActiveModuleId();

      // Push profile & active module
      await this.pushProfileToFirestore();
      const res = await this.pushModuleToFirestore(activeModId, explicitState);

      this.lastSyncedAt = Date.now().toString();
      localStorage.setItem('pedia_firebase_last_synced', this.lastSyncedAt);

      const notesCount = res?.notesCount || 0;
      this.updateStatus('synced', `Enregistré : Profil & ${notesCount} note${notesCount > 1 ? 's' : ''} sauvegardée${notesCount > 1 ? 's' : ''} sur Google Cloud`);
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
    if (this.isApplyingRemoteSnapshot) return;

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
