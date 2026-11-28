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
