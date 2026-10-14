// Firebase Authentication (Google Sign-In) & Firestore Real-time Sync Service for PédiaDrill
// Provides seamless multi-device progress sync across PC, Smartphone, and Tablet.

import { mergeStates } from './syncService.js';

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

export class FirebaseSyncService {
  constructor(queueEngine, onStateChange = null) {
    this.queueEngine = queueEngine;
    this.onStateChange = onStateChange; // (status, detail, user) => void
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
      // Re-initialize with new config
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
            this.setupAuthListener();
          });
          return true;
        }
      } else {
        window.firebase.initializeApp(config);
      }

      this.isInitialized = true;
      this.setupAuthListener();
      return true;
    } catch (err) {
      console.error('Firebase initialization error:', err);
      this.updateStatus('error', `Erreur initialisation Firebase: ${err.message}`);
      return false;
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
        const localState = this.queueEngine.getStateObject 
          ? this.queueEngine.getStateObject() 
          : JSON.parse(this.queueEngine.exportState());

        const merged = mergeStates(localState, remoteData);
        this.queueEngine.applyMergedState(merged);

        this.lastSyncedAt = Date.now().toString();
        localStorage.setItem('pedia_firebase_last_synced', this.lastSyncedAt);
        this.updateStatus('synced', 'Synchronisé en direct avec Firestore');
      }, (err) => {
        console.warn('Firestore snapshot error:', err);
        this.updateStatus('error', `Erreur synchronisation Firestore: ${err.message}`);
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
      const localState = this.queueEngine.getStateObject 
        ? this.queueEngine.getStateObject() 
        : JSON.parse(this.queueEngine.exportState());

      let merged = localState;
      if (doc.exists) {
        const remoteData = doc.data();
        merged = mergeStates(localState, remoteData);
        this.queueEngine.applyMergedState(merged);
      }

      // Save unified state back to Firestore
      await this.pushToFirestore(merged);
      this.lastSyncedAt = Date.now().toString();
      localStorage.setItem('pedia_firebase_last_synced', this.lastSyncedAt);
      this.updateStatus('synced', 'Progression fusionnée et synchronisée avec votre compte Google !');
    } catch (err) {
      console.error('Sync on login error:', err);
      this.updateStatus('error', `Erreur synchro Firestore: ${err.message}`);
    }
  }

  /**
   * Push current state to Firestore
   */
  async pushToFirestore(explicitState = null) {
    if (!this.user || !window.firebase || !window.firebase.firestore) return { success: false, error: 'Non connecté' };

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.updateStatus('offline', 'Hors-ligne');
      return { success: false, error: 'Hors-ligne' };
    }

    this.isPushing = true;
    this.updateStatus('syncing', 'Sauvegarde Cloud en cours...');

    try {
      const db = window.firebase.firestore();
      const docRef = db.collection('users').doc(this.user.uid).collection('pedia').doc('progress');

      const state = explicitState || (this.queueEngine.getStateObject 
        ? this.queueEngine.getStateObject() 
        : JSON.parse(this.queueEngine.exportState()));

      const toSave = {
        ...state,
        userEmail: this.user.email || '',
        userDisplayName: this.user.displayName || '',
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        lastClientTimestamp: Date.now()
      };

      await docRef.set(toSave, { merge: true });

      this.lastSyncedAt = Date.now().toString();
      localStorage.setItem('pedia_firebase_last_synced', this.lastSyncedAt);
      this.updateStatus('synced', 'Synchronisé');
      this.isPushing = false;
      return { success: true };
    } catch (err) {
      this.isPushing = false;
      console.error('Push to Firestore error:', err);
      this.updateStatus('error', `Échec d'envoi Firestore: ${err.message}`);
      return { success: false, error: err.message };
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
