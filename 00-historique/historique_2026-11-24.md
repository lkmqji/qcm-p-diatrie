# Historique des modifications — 2026-11-24

## 2026-11-24 21:24 — Refonte Complète, Sécurisation, Modularisation, Android Offline-First & Suite de Tests
*État de sauvegarde créé avant refonte : branche `backup/v1.6.4-2026-11-24` & tag `restore-point-v1.6.4-2026-11-24`.*

- **Sécurité & Architecture Multi-Clés Gemini (`src/services/gemini.js`, `template.html`, `src/views/dashboardView.js`)** :
  - Suppression totale des clés API codées en dur (`GEMINI_KEY_REGISTRY`, `DEFAULT_GEMINI_KEYS`, etc.).
  - Mise en place d'une zone de saisie multi-clés utilisateur dans les Paramètres (`.gemini-keys-textarea.is-masked`, séparateurs saut de ligne / `,` / `;`) avec bouton d'affichage/masquage, compteur de clés actives en direct et conservation complète du système Round-Robin + circuit-breaker/quarantaine.
  - Synchronisation Firestore des clés et paramètres utilisateur avec horodatage (`pedia_settings_updated_at`) et fail-fast `NO_API_KEY_CONFIGURED` couplé au fallback sémantique local hors-ligne.
- **Prompts & UI 100% Dynamiques Multi-Modules (`gemini.js`, `lessonTracker.js`, `arenaView.js`, `notebookView.js`, `lessonView.js`)** :
  - Ajout de `resolveAiModuleContext()` pour adapter automatiquement tous les prompts IA, badges de chapitres, titres du Tuteur IA et attributs `alt` à la Pédiatrie, à la Psychiatrie et à tout futur module.
  - Correction des totaux 5ème année dans `moduleCatalog.js` (`211` cours, `9 537` QCM) et propagation des suppressions de dates d'examen (`examDatesUpdatedAt`).
  - Généralisation de `lessonTracker.js` sur l'ensemble des modules de `MEDICAL_YEARS` via `getAllLessonSessionStorageKeys()`.
- **Correctifs Critiques & Synchronisation Cloud (`queueEngine.js`, `firebaseSyncService.js`, `arenaView.js`, `clinicalCaseView.js`, `lessonView.js`)** :
  - Correction du fuseau horaire UTC dans `queueEngine.getTodayTracker()` vers l'heure locale (`this.getTodayDateStr()`).
  - Correction de l'appel inexistant `showNotificationToast()` (remplacé par `showAppToast()`).
  - Correction de l'ID HTML dupliqué `lesson-dropdown-header` dans la modale de session manuelle vers `manual-dropdown-header`.
  - Correction de `savedAi.model` vers `savedAi.modelUsed` dans les cartes déroulantes des cas cliniques.
  - Échappement et formatage sécurisés des propositions QCM (`parseMarkdownInline(opt.text)`, `escapeHtml(chap.title)`) pour prévenir le troncage sur `<` / `>`.
  - Ajout d'un verrou `_syncLoginPromise` dans `firebaseSyncService.syncOnLogin()` attendu avant le retour de `signInWithGoogle()` (natif et popup).
  - Préservation des chapitres sélectionnés au clic sur `#btn-start-random` lorsque les questions restantes sont reportées à demain (`snoozed`).
- **Modularisation & Nettoyage du Dépôt (`src/utils/*`, `src/state/appState.js`, `src/views/*`, `src/app.js`)** :
  - Suppression des fichiers morts/legacy (`api/sync.js`, `api/test.js`, `src/services/syncService.js`, `src/App.tsx`, `src/main.tsx`, `src/App.css`, `src/index.css`, `.oxlintrc.json`, `desktop.ini`).
  - Découpage de `src/app.js` (8 511 lignes -> 742 lignes) vers `src/utils/formatters.js`, `src/utils/uiDialogs.js`, `src/state/appState.js` et les 6 vues `src/views/{dashboard,clinicalCase,arena,notebook,stats,lesson}View.js`.
- **Android Natif, Offline PWA & Optimisations Catégorie 2 (`@capacitor/app`, `vendor/`, `sw.js`, `build-bundle.cjs`, `build.cjs`, `src/style.css`)** :
  - Installation de `@capacitor/app` et ajout de `setupNativeCapacitorBackButton()` pour naviguer proprement avec le bouton Retour matériel Android (modales -> chatbox -> vues -> confirmation sortie).
  - Remplacement de la totalité des `alert()` et `confirm()` bloquants par des toasts (`showAppToast`) et la modale asynchrone `#modal-app-confirm` (`showConfirmModal`).
  - Embarquement local de `lucide` (`vendor/lucide.min.js`) et `canvas-confetti` (`vendor/confetti.browser.min.js`) sans aucun CDN externe bloquant, avec pré-cache ajouté dans `sw.js` (`pedia-drill-v1.6.4-r2`).
  - Exclusion de `agentation.bundle.js` (-605 Ko) en build de production (`npm run build`), pagination progressive à 30 fiches et debounce 200 ms dans le Carnet, lecture des datasets directement depuis `src/data/*.js`, défilements instantanés (`behavior: 'auto'`) et micro-transitions réactives (`0.14s` + `:active scale(0.985)`).
- **Suite de Tests Automatisés (`tests/*.test.js`)** :
  - Ajout de `tests/formatters.test.js`, `tests/gemini.test.js`, `tests/queueEngine.test.js`, `tests/syncAndCatalog.test.js`, `tests/bundleAndViews.test.js` : **26/26 tests passés** via `npm test`, bundle validé (`node -c src/app.bundle.js`) et synchronisation Capacitor Android effectuée (`npx cap sync android`).
