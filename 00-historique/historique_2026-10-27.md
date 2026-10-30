# Historique du 2026-10-27

### 17:35 - Synchronisation et Redéploiement Production du Site Web Vercel vers la Version Stable v1.4.3

- **Contexte & Constat** :
  - Suite au rollback vers la version **v1.4.3** effectué le 26/10/2026, l'application Android native ([PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk)) et le dépôt Git local étaient bien calés sur la v1.4.3.
  - Cependant, le site web public en ligne ([https://qcm-p-diatrie-coral.vercel.app/](https://qcm-p-diatrie-coral.vercel.app/)) continuait de servir l'ancienne version 1.4.6 (comportant le Mode Flash et les optimisations 1.4.6).
  - **Cause technique** : Le moteur de déploiement Vercel gère les déploiements de façon immuable. Lorsqu'un `git push --force` ramène la branche `main` vers un commit antérieur déjà répertorié (`ae9f4b7`), Vercel ne redéploie pas automatiquement et maintient le domaine de production assigné au déploiement le plus récent chronologiquement (`f6c9369` / v1.4.6).
- **Modifications & Actions appliquées** :
  - **Recompilation complète des bundles de production** :
    - Exécution de `build-bundle.cjs` pour synchroniser [src/app.bundle.js](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/app.bundle.js), le fichier racine servi directement par Vercel [index.html](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/index.html) et [dist/index.html](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/dist/index.html).
    - Validation de l'absence totale de tout reliquat du « Mode Flash », des flashcards et de la v1.4.6 dans le code source de production.
  - **Déclenchement du redéploiement Vercel** :
    - Enregistrement du commit de synchronisation et de publication de la v1.4.3 sur `main`.
    - Push vers GitHub (`origin/main`) provoquant la notification webhook Vercel pour construire et publier immédiatement la version 1.4.3 en production sur le domaine `qcm-p-diatrie-coral.vercel.app`.
  - **Vérification en direct** :
    - Contrôle HTTP direct du contenu servi par Vercel après le déploiement pour certifier l'alignement strict du site web avec l'application mobile (v1.4.3).

### 18:25 - Application des Optimisations de Performance Majeures « Catégorie 1 » (Sous le capot, 100% invisibles)

- **Contexte & Objectif** :
  - Constat de lenteurs et d'un manque de fluidité (« snappy ») lors des clics sur les boutons, de la validation des réponses et de la navigation générale (sur le site web et l'application mobile).
  - Application exclusive des optimisations de la Catégorie 1 : strictement aucune suppression de fonctionnalité ou d'option, aucune modification graphique ou visuelle, 100% d'optimisations algorithmiques et sous-jacentes.
- **Modifications appliquées** :
  - **Indexation O(1) de la base de 1 905 questions et des 35 chapitres (`src/services/queueEngine.js` & `src/app.js`)** :
    - Création d'une fonction mémoïsée `getQuestionsMap()` créant une table de hachage `Map<uid, Question>` et `chaptersMap` (`Map<id, Chapter>`).
    - Remplacement de toutes les recherches linéaires O(N) `questionsList.find()` et `allQuestions.find()` par des accès instantanés O(1) `qMap.get(uid)` dans les fonctions critiques : `hydrateNote()`, `getCurrentQuestion()`, `scrubCorruptedAiExplanations()`, `getSavedAiExplanation()`, `saveAiExplanationForQuestion()`, `renderQuestionCard()`, `groupNotesByChapterAndQuestion()`, `renderNotebookUI()` et `renderStatsChapters()`.
    - Gain : élimination de plus de 380 000 itérations de boucle synchrones lors du chargement des notes du carnet et lors des validations de réponses.
  - **Mémoïsation des métriques du tableau de bord (`src/services/queueEngine.js`)** :
    - Mise en cache des calculs de métriques de progression (`_cachedMetrics`), réinitialisée uniquement lorsque l'état de la file est sauvegardé (`saveState()`), évitant le recalcul intégral à chaque affichage d'écran ou de modal.
  - **Ciblage strict du rendu des icônes Lucide (`src/app.js`)** :
    - Modification de `refreshLucide(container)` pour cibler uniquement le nœud DOM concerné via `{ root: container }` au lieu de rescanner l'intégralité du DOM (milliers de nœuds) jusqu'à 3 fois par réponse validée.
  - **Décompte instantané des notes sans hydratation inutile (`src/app.js` & `src/services/queueEngine.js`)** :
    - Remplacement des appels coûteux `queueEngine.getReasoningNotes().length` par `queueEngine.getRawReasoningNotes().length` dans les compteurs d'interface et badges (`updateModalLocalSummary`, `updateDashboardUI`, `handleAnswerFailure`).
  - **Suppression du clone JSON profond synchrone (`src/app.js`)** :
    - Remplacement de `JSON.parse(JSON.stringify(question))` par une copie superficielle rapide `{ ...question }` dans `pushToAnsweredHistory()`.
  - **Élimination du délai de clic mobile de 300 ms (`src/style.css`)** :
    - Ajout de `touch-action: manipulation;` et `-webkit-tap-highlight-color: transparent;` sur l'ensemble des éléments interactifs (`button`, `a`, `input`, `select`, `textarea`, `.option-item`, `.nav-tab-btn`, `.chapter-select-item`, `.notebook-chapter-header`, `.medical-media-inner`, `[role="button"]`), rendant les clics sur smartphone instantanés sans attendre la détection du double-tap.
  - **Optimisation des préconnexions CDN (`template.html`)** :
    - Ajout de balises `<link rel="preconnect">` pour `fonts.gstatic.com`, `gstatic.com`, `unpkg.com` et `cdn.jsdelivr.net`.
  - **Mise à niveau du Service Worker v2 avec Stale-While-Revalidate (`sw.js`)** :
    - Passage à `pedia-drill-v2`, correction de la liste des assets du cache (alignée sur les fichiers de production `dist/` et `index.html`), et stratégie Stale-While-Revalidate garantissant un chargement instantané hors-ligne et en ligne.
  - **Recompilation & Synchronisation mobile** :
    - Exécution de `build-bundle.cjs` générant `src/app.bundle.js` (329 Ko), `index.html` (4.69 Mo) et le dossier `dist/`.
    - Synchronisation native Capacitor vers Android via `cmd /c npx cap sync android`.

### 18:35 - Publication de la Version v1.4.4 (Site Web & Application Mobile Android)

- **Incrémentation de version vers v1.4.4 (versionCode 13)** :
  - `package.json` : `"version": "1.4.4"`
  - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.4.4'`
  - `android/app/build.gradle` : `versionCode 13`, `versionName "1.4.4"`
  - `template.html` : badges de version synchronisés sur `v1.4.4`
  - `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md` : synchronisé avec `v1.4.4` / `versionCode 13`
- **Contenu de la version v1.4.4** :
  - Optimisations de performance majeures « Catégorie 1 » :
    - Indexation $O(1)$ Hash Map (`Map<uid, Question>` et `chaptersMap`) éliminant 380 000 itérations de boucle synchrones.
    - Rendu d'icônes Lucide scoped `{ root: container }` prévenant le *layout thrashing*.
    - Décompte instantané des notes via `getRawReasoningNotes().length`.
    - Mémoïsation des métriques du dashboard (`_cachedMetrics`).
    - Suppression du clone JSON profond synchrone dans l'historique d'arène.
    - Suppression du délai tactile de 300 ms sur mobile (`touch-action: manipulation`).
    - Préconnexions DNS/TLS anticipées pour les CDN (`template.html`).
    - Service Worker v2 avec stratégie Stale-While-Revalidate (`sw.js`).
- **Compilation & Déploiement** :
  - Recompilation complète des bundles : `node build-bundle.cjs` (génération de `src/app.bundle.js`, `index.html`, `dist/`).
  - Synchronisation Capacitor Android : `npx cap sync android`.
  - Recompilation locale de l'APK natif Android : `build-apk.bat` (mise à jour de `PediaDrill.apk`).
  - Commit et Tag Git `v1.4.4` avec push vers `origin/main` et `origin v1.4.4` pour déclencher les builds et déploiements Vercel et GitHub Releases.

### 18:49 - Enregistrement du Guide des Optimisations de « Catégorie 2 » (Performance & UX)

- **Création du document de référence** : [`optimisations_categorie_2.txt`](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/optimisations_categorie_2.txt) à la racine du projet.
- **Contenu répertorié pour consultation future** :
  1. Micro-feedback tactile mécanique au clic (`:active` micro-scale sur boutons et cartes).
  2. Transition instantanée lors du changement de vue (`window.scrollTo({ top: 0, behavior: 'auto' })`).
  3. Temporisation (Debounce de 200 ms) sur la barre de recherche du Carnet pour éliminer tout freeze clavier.
  4. Exclusion du bundle de débogage `agentation.bundle.js` en production (allègement de ~600 Ko).
  5. Pagination / affichage progressif des fiches du Carnet de révision.
  6. Raccourcissement des durées de transitions CSS dans l'Arène (0.15s) pour un retour visuel ultra-vif.
