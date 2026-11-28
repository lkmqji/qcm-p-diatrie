# Historique des Modifications — 28 Novembre 2026

## 07:57:00 — Séparation Stricte des Notes et Fautes par Module & Bouton de Navigation Inter-Modules dans le Carnet IA

### Changements Effectués
1. **Filtrage et séparation stricte par module médical** :
   - Ajout des utilitaires `getAvailableModules`, `resolveModuleIdForQuestionUid` et `doesQuestionBelongToModule` dans [`src/services/moduleCatalog.js`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/services/moduleCatalog.js).
   - Ajout de la migration automatique des statistiques et fautes cross-modules (`migrateStatsBetweenModules`) dans [`src/services/storageScope.js`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/services/storageScope.js) afin d'isoler proprement les entrées `psy_` de celles de Pédiatrie.
   - Correction d'un bug critique dans `QueueEngine` ([`src/services/queueEngine.js`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/services/queueEngine.js)) et `switchActiveModule` ([`src/views/dashboardView.js`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/views/dashboardView.js)) : `QueueEngine` mémorise désormais `this.activeModuleId` pour sauvegarder l'ancien module dans sa propre clé avant de basculer vers le nouveau module, empêchant l'écrasement croisé des fautes et files d'attente lors d'un changement de module.
   - Restriction stricte de `autoHealNotesFromMistakes`, `getRawReasoningNotes`, `getReasoningNotes`, `getModuleMistakesCount`, `saveReasoningNote` et `applyMergedState` au module sélectionné (tout en rapatriant proprement d'éventuelles notes d'autres modules issues de snapshots cloud hérités vers leur stockage dédié).
2. **Petit bouton & sélecteur rapide pour naviguer entre les modules dans `#view-notebook`** :
   - Ajout du conteneur `#notebook-module-nav` dans l'en-tête du Carnet ([`template.html`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/template.html)) et de `renderNotebookModuleNav()` dans [`src/views/notebookView.js`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/views/notebookView.js).
   - Affichage de pilules compactes par module disponible avec le nombre de notes associées et un bouton de bascule rapide `#btn-notebook-cycle-module`, connectés à `switchToModule` ([`src/state/appState.js`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/state/appState.js), [`src/app.js`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/app.js)).
   - Mise à jour de la barre de résumé `#notebook-summary-bar` pour afficher le badge du module actif et uniquement son total de fautes et de notes, avec styles responsive desktop/mobile dans [`src/style.css`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/style.css).
3. **Compilation & Vérification** :
   - Recompilation du bundle et des sorties de production via `node build-bundle.cjs`.
   - Ajout du test de non-régression dans [`tests/bundleAndViews.test.js`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/tests/bundleAndViews.test.js) et exécution complète de la suite de tests (`node --test tests/*.test.js` : 29/29 réussis).

---

## 11:09:00 — Release v1.6.7 (versionCode 34) : Déploiement Vercel & Publication GitHub Release

### Changements Effectués
- **Incrémentation de Version** : Passage de `1.6.6` (`versionCode 33`) à **`1.6.7`** (`versionCode 34`) dans `package.json`, `src/services/updateService.js`, `android/app/build.gradle`, `template.html` et `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md`.
- **Contenu de la Release** : Séparation stricte des notes et fautes par module médical dans le Carnet de Raisonnement IA (`#view-notebook`), migration des données cross-modules, correctif d'isolation `QueueEngine.switchModule`, et ajout du sélecteur rapide de modules (`#notebook-module-nav`).
- **Compilation & Synchronisation** : Bundle web recompilé (`build-bundle.cjs`), synchronisation Capacitor (`npx cap sync android`) et compilation APK Android (`PediaDrill.apk`) réussies.
- **Déploiement** : Commit, tag `v1.6.7` et push vers GitHub (`main` + tag `v1.6.7`) pour déploiement continu Vercel et génération de la GitHub Release via GitHub Actions.

---

## 15:03:00 — Ajout de la Traduction Instantanée au Surlignage (Google Traduction + Enrichissement Gemini IA) & Bouton d'Activation dans les Options

### Changements Effectués
1. **Service de traduction directe (`src/services/translateService.js`)** :
   - Implémentation de `translateWithGoogle` via appel direct `translate.googleapis.com/translate_a/single` sans cache offline persistant, avec découpage automatique (`splitTextIntoTranslateChunks`) pour les sélections longues sans limite de longueur et gestion des erreurs réseau / hors-ligne (`OFFLINE_ERROR`, `TIMEOUT_ERROR`, `AbortController`).
   - Support des 4 langues configurables : **Arabe (`ar`, par défaut)**, **Anglais (`en`)**, **Français (`fr`)** et **Allemand (`de`)**, avec persistance `localStorage` (`pedia_translate_enabled`, `pedia_translate_lang`).
2. **Enrichissement & secours manuel Gemini Flash (`src/services/gemini.js`)** :
   - Ajout de `translateWithGemini(text, targetLang, question)` (bascule manuelle depuis la bulle en cas d'échec réseau Google) et `explainMedicalTerm(text, targetLang, question)` pour le bouton **« 💡 Sens médical (IA) »** contextualisé au module actif.
   - Ajout de `err.code = 'NO_API_KEY_CONFIGURED'` dans `callWithFallback` lorsque l'utilisateur n'a pas configuré de clé Gemini.
3. **Bulle flottante au surlignage & garde QCM (`src/utils/selectionTranslator.js`, `src/style.css`, `src/views/arenaView.js`, `src/views/clinicalCaseView.js`)** :
   - Création du contrôleur `initSelectionTranslator()` actif sur les zones médicales (`#view-arena`, `#view-notebook`, `#modal-error`, `#modal-clinical-case-summary`, `#arena-ai-chatbox`), avec bulle flottante `#selection-translate-popover` positionnée dynamiquement sur Desktop & Mobile, affichage RTL automatique pour l'arabe, sélecteur de langue à la volée, bouton Copier, bouton « Sens médical (IA) », zone scrollable et fermeture automatique au clic extérieur / touche Échap / bouton Retour Android / changement de vue ou de question.
   - Déblocage de la sélection de texte sur les propositions QCM (`.option-text { user-select: text; }`) avec garde anti-clic accidentel (`hasActiveTextSelection()`) dans `arenaView.js` et `clinicalCaseView.js`.
4. **Bouton d'activation/désactivation dans les Options & Sync Firestore (`template.html`, `src/views/dashboardView.js`, `src/app.js`, `src/services/firebaseSyncService.js`)** :
   - Ajout dans `#modal-settings` de la section **Traduction au Surlignage** avec le bouton `#btn-toggle-translate-enabled` (permettant d'activer/désactiver la fonctionnalité en 1 clic), le badge `#settings-translate-status-badge` et le sélecteur `#settings-translate-lang`.
   - Synchronisation complète des préférences `highlightTranslateEnabled` et `highlightTranslateLang` via `remoteProfile.settings` et `settingsUpdatedAt` dans `firebaseSyncService.js`.
5. **Assemblage & Tests (`build-bundle.cjs`, `tests/translateService.test.js`)** :
   - Intégration de `translateService.js` et `selectionTranslator.js` dans `build-bundle.cjs` et création de la suite de tests `tests/translateService.test.js`.

---

## 19:16:00 — Release v1.6.8 (versionCode 35) : Déploiement Vercel & Publication GitHub Release

### Changements Effectués
- **Incrémentation de Version** : Passage de `1.6.7` (`versionCode 34`) à **`1.6.8`** (`versionCode 35`) dans `package.json`, `src/services/updateService.js`, `android/app/build.gradle`, `template.html` et `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md`.
- **Contenu de la Release** : Traduction instantanée au surlignage (Google Traduction direct en Arabe/Anglais/Français/Allemand sans limite de longueur + bulle flottante + bouton « Sens médical (IA) » et bascule manuelle Gemini Flash) et bouton d'activation/désactivation dans les Options avec synchronisation Firestore.
- **Compilation & Synchronisation** : Bundle web recompilé (`build-bundle.cjs`), synchronisation Capacitor (`npx cap sync android`) et compilation APK Android (`PediaDrill.apk`) réussies.
- **Déploiement** : Commit, tag `v1.6.8` et push vers GitHub (`main` + tag `v1.6.8`) pour déploiement Vercel et workflow GitHub Actions Release APK.
