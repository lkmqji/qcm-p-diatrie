# Historique des Modifications — 21 Novembre 2026

## 00:05:00 — Release v1.6.2 (versionCode 29) : Déploiement Vercel & Publication GitHub Release

### Contexte & Objectif
- Publication officielle de la version **v1.6.2** (versionCode 29) suite à la commande utilisateur **« update github »**.
- Déploiement de la refonte intégrale du système de synchronisation multi-appareils (PWA / Mobile / Desktop).
- Résolution définitive du cloisonnement inter-modules et de l'ancien écrasement sur Firestore : passage d'un schéma monolithique `pedia` à une architecture distribuée moderne **Profil Racine + Sous-Collections Modulaires Chunkées**.

---

### Actions Réalisées

#### 1. Incrémentation de Version & Alignement Multisupport
- Passage de la version applicative de `1.6.1` à **`1.6.2`** (+0.0.1).
- Incrémentation du `versionCode` Android de `28` à **`29`** (+1).
- Synchronisation rigoureuse dans :
  - `package.json` : `"version": "1.6.2"`
  - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.6.2'`
  - `android/app/build.gradle` : `versionCode 29`, `versionName "1.6.2"`
  - `template.html` : `#update-modal-curr-version`, `#update-modal-new-version` et `#settings-current-app-version` en `v1.6.2`.
  - `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md` : synchronisé avec `1.6.2` et `versionCode 29`.

#### 2. Fonctionnalités Embarquées dans cette Release (v1.6.2)
- **Synchronisation Universelle du Profil Étudiant (`users/{uid}/profile/state`)** :
  - Dates d'examen de TOUS les modules (`getAllExamDates`, `setAllExamDates`) synchronisées en direct avec calcul du compte à rebours J-XX et cadence partagée.
  - Module actif synchronisé entre appareils en temps réel avec commutation intelligente (Smart Context Switch) sans interruption intempestive en pleine Arène.
  - Préférences de résolution des cas cliniques (Séquentiel vs Déroulant) partagées.
  - Clé API Google Gemini Flash sauvegardée et synchronisée avec le profil sécurisé.
  - Chronomètre de révision de cours en direct (`activeLessonTimer`) et historique des sessions multi-modules.
- **Isolation Étanche des Modules Médicaux (`users/{uid}/modules/{moduleId}`)** :
  - Chaque module (Pédiatrie, Psychiatrie, et les 44 prochains modules du cursus) dispose de son propre document isolé.
  - Synchronisation complète de l'état SRS, des erreurs, de la file active et du Premier Passage (`firstPassRecords`).
  - Partitionnement automatique des notes IA d'erreur en sous-collections chunkées (`notes_chunks/chunk_{i}`) par paquets de 50 items (~60 Ko), éliminant tout risque de dépassement de la limite de 1 Mo de Firestore.
- **Migration Automatique Rétro-compatible (`checkAndMigrateLegacyData`)** :
  - Détection automatique au premier lancement de l'ancien format `pedia/progress` et migration transparente vers la nouvelle architecture sans aucune perte de données.
- **Double Écouteur & Anti-Boucle Infinie** :
  - Écouteurs `onSnapshot` découplés pour le profil et pour le module actif.
  - Drapeau `isApplyingRemoteSnapshot` neutralisant tout re-push automatique lors de la réception d'une notification Firestore (élimination des boucles ping-pong).
  - Déclenchement automatique de la synchronisation dès le clic sur « Enregistrer les paramètres ».
  - Alignement déterministe de la date locale (`getLocalDateStr()`) dans `mergeStates` éliminant tout décalage UTC/CET sur le compteur du jour (`todayTracker`).

#### 3. Compilation, Synchronisation & Assemblage
- Exécution de `node build-bundle.cjs` :
  - Styles `src/style.css` synchronisés dans `template.html`.
  - Bundle modulaire `src/app.bundle.js` recompilé avec succès.
  - `index.html` et `dist/index.html` synchronisés pour le déploiement continu Vercel.
- Synchronisation Capacitor Android exécutée avec succès (`cmd.exe /c npx.cmd cap sync android`).
- Compilation de l'APK via `build-apk.bat` (`PediaDrill.apk` à la racine).
- Déclenchement automatique de la GitHub Release via le tag `v1.6.2` et le workflow GitHub Actions CI/CD (`.github/workflows/build-and-release.yml`).

---

## 00:52:00 — Résolution Intégrale : Restauration et Affichage des Notes du Carnet en Psychiatrie

### Contexte & Problème Signalé
- **Retour Utilisateur** : *« pourquoi le carnet des notes est vides comme j'ai jms rate une qst de psy »* (Pourquoi le carnet de raisonnement est vide comme si je n'avais jamais raté une question de psychiatrie ?).
- **Constat** : L'étudiant s'est entraîné et a commis des erreurs sur le module Psychiatrie, mais l'onglet Carnet de Raisonnement (`#view-notebook`) affichait un état désespérément vide avec la mention *« Aucune note de raisonnement pour le moment... »*.

### Causes Racines Identifiées (Root Causes)
1. **Filtre de Chapitre Rémanent (`notebookSelectedChapter`)** : Lors du changement de module via `switchActiveModule('psychiatrie')`, `notebookSelectedChapter` n'était pas réinitialisé. Si un chapitre de pédiatrie était sélectionné précédemment, toutes les notes de psychiatrie étaient systématiquement masquées par le filtre de chapitre.
2. **Cloisonnement du Stockage Local sans Migration Rétroactive** : Les notes d'erreurs de psychiatrie créées avant le partitionnement multi-modules étaient stockées dans la clé globale `'pedia_drill_reasoning_notes_v1'`. En passant sur la clé compartimentée `'mod_psychiatrie_reasoning_notes'`, le carnet apparaissait vide.
3. **Pertes Silencieuses & Purge Involontaire (`scrubCorruptedAiExplanations`)** : La fonction de diagnostic nettoyait le cache et les notes du carnet en utilisant les clés hardcodées de pédiatrie (`'pedia_ai_explanations_cache'`, `'pedia_drill_reasoning_notes_v1'`) et le dictionnaire `questionsMap` du module actif, rejetant ou écrasant les notes d'autres spécialités.
4. **Hardcodage du Fallback de Chapitre `'Pédiatrie Générale'`** : Dans `hydrateNote` et `renderNotebookUI`, tout QCM dont le chapitre n'était pas résolu immédiatement héritait de `'Pédiatrie Générale'`, faussant le classement et les filtres pour la psychiatrie.
5. **Absence d'Auto-Guérison (Self-Healing) pour les Questions Échouées** : Si la génération IA avait échoué (réseau, saut de modal ou timeout), la question était bien comptabilisée en faute (`stats[uid].mistakes >= 1`) dans le SRS Spaced Repetition, mais aucun mémo n'était inséré dans le carnet de notes.

### Correctifs & Améliorations Apportés

1. **Migration Automatique Cross-Modules des Notes (`migrateReasoningNotesBetweenModules`)** :
   - Implémenté dans [`src/services/storageScope.js`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/services/storageScope.js).
   - Détecte au démarrage de l'application toutes les notes de psychiatrie (`psy_...`) résiduelles dans `'pedia_drill_reasoning_notes_v1'` et les rapatrie de manière transparente et sécurisée dans `'mod_psychiatrie_reasoning_notes'`.
   - Rapatrie également toute note de pédiatrie égarée dans le stockage psychiatrie.

2. **Moteur d'Auto-Guérison et Reconstitution des Notes (`autoHealNotesFromMistakes`)** :
   - Implémenté dans [`src/services/queueEngine.js`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/services/queueEngine.js).
   - Parcourt `this.stats` lors du chargement, du changement de module et de la fusion Firestore.
   - Dès qu'une question présente des erreurs (`mistakes >= 1`) mais ne possède pas encore de note enregistrée, le moteur reconstitue automatiquement une note structurée complète à partir de l'explication officielle de la base de données, avec rappel du piège, réponse officielle et options.
   - Les questions manquées en psychiatrie sont ainsi **immédiatement visibles à 100% dans le Carnet de Raisonnement**, avec possibilité de relancer une analyse approfondie Gemini Flash à tout moment.

3. **Hydratation Robuste et Multi-Modules (`hydrateNote`)** :
   - Dans [`src/services/queueEngine.js`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/services/queueEngine.js), si la question n'est pas dans le dictionnaire actif, recherche de secours dans `window.PSY_QUESTIONS` ou `window.PEDIA_QUESTIONS`.
   - Fallback dynamique de chapitre : `'Psychiatrie Générale'` pour les questions `psy_`, `'Pédiatrie Générale'` pour les questions de pédiatrie.

4. **Réinitialisation Systématique des Filtres au Changement de Module (`switchActiveModule`)** :
   - Dans [`src/app.js`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/app.js), remise à zéro de `notebookSelectedChapter = ''`, du sélecteur `#notebook-chapter-filter` et du champ de recherche `#notebook-search-input`.
   - Rechargement instantané du cache IA scoped (`aiExplanationsCache = loadAiExplanationsCache()`).

5. **Diagnostic et Nettoyage Sécurisé (`scrubCorruptedAiExplanations`)** :
   - Dans [`src/app.js`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/app.js), utilisation de clés dynamiques `resolveStorageKey('reasoning_notes')` et `resolveStorageKey('ai_cache')`.
   - Résolution cross-modules des questions évitant toute suppression par erreur des fiches d'autres spécialités.

6. **Prompts Gemini Flash Dédiés à la Psychiatrie** :
   - Dans [`src/services/gemini.js`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/services/gemini.js), détection automatique de la spécialité : le prompt injecte *« Professeur de psychiatrie et pédopsychiatrie... confusion fréquente en psychiatrie... critères nosographiques DSM/CIM »* au lieu de figer la pédiatrie.

### Validation & Intégrité
- Syntaxe validée avec succès sur tous les modules (`storageScope.js`, `queueEngine.js`, `gemini.js`, `app.js`, `app.bundle.js`).
- Test unitaire automatisé avec environnement Node.js simulant la migration et l'auto-guérison : 100% de succès.
- Compilation de production réexécutée avec succès via `node build-bundle.cjs` (`src/app.bundle.js`, `index.html`, `dist/`).

---

## 00:58:00 — Release v1.6.3 (versionCode 30) : Déploiement Vercel & Publication GitHub Release

### Contexte & Objectif
- Publication officielle de la version **v1.6.3** (versionCode 30) suite à la commande utilisateur **« update github »**.
- Déploiement de la restauration complète du Carnet de Raisonnement en Psychiatrie, du moteur d'auto-guérison des notes depuis les statistiques d'erreurs, de la migration automatique cross-modules et des prompts IA dédiés à la psychiatrie.

### Déploiement & Assemblage
- Version sémantique incrémentée : `1.6.2` ➔ **`1.6.3`**.
- Android `versionCode` incrémenté : `29` ➔ **`30`**.
- Fichiers synchronisés :
  - `package.json` : `"version": "1.6.3"`
  - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.6.3'`
  - `android/app/build.gradle` : `versionCode 30`, `versionName "1.6.3"`
  - `template.html` : `v1.6.3`
  - `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md` : version `1.6.3` (versionCode 30).
- Bundles de production assemblés via `build-bundle.cjs` (`src/app.bundle.js`, `index.html`, `dist/`).
- Synchronisation Capacitor Android exécutée via `npx cap sync android`.
- APK Android compilé localement avec succès via `build-apk.bat` (`PediaDrill.apk` à la racine).
- Déclenchement automatique de la GitHub Release via le tag annoté `v1.6.3` et déploiement continu Vercel via la branche `main`.
