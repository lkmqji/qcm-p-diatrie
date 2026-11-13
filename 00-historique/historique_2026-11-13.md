# Historique des Modifications — 13 Novembre 2026

## 11:45:00 — Refonte de la Page des Paramètres, Sélecteur de Module (Squelette Cursus) et Date d'Examen Dynamique

### Contexte & Objectif
Rénovation intégrale de la modale des Paramètres afin de permettre à l'étudiant de choisir son module médical d'étude ainsi que la date de son examen/concours. Intégration de l'arborescence médicale squelettique complète (6 années et 46 modules extraits de la base Mystidia Exams) avec la Pédiatrie comme seul module actif et les 45 autres modules présentés sous forme de squelettes grisés élégants en attente de leurs questions.

### Changements Effectués
1. **Création du Service Catalogue Médical (`src/services/moduleCatalog.js`)** :
   - Déclaration de l'arbre exhaustif des 6 années d'études (PCEM 1 à DCEM 4) et des 46 modules répertoriés avec le décompte réel de leurs cours et QCM.
   - Configuration de la Pédiatrie (5ème année) comme module disponible et actif (`available: true`, 35 cours, 1 905 QCM).
   - Configuration des 45 autres modules en statut squelette bloqué (`available: false`).
   - Fonctions d'accès : `getActiveModule()`, `setActiveModuleId()`, `getExamDate()`, `setExamDate()`, `getExamCountdown()`.

2. **Création du Service de Partitionnement (`src/services/storageScope.js`)** :
   - Isolation des données d'étude par module (`mod_${moduleId}_...`).
   - Pont de rétrocompatibilité transparent vers les clés historiques (`pedia_today_tracker`, `pedia_first_pass_records_v1`, `pedia_lesson_tracker_v1`) garantissant 0% de perte de données pour les sessions de pédiatrie existantes.

3. **Refonte de la Modale Paramètres (`template.html` & `src/style.css`)** :
   - Structure en 4 sections claires :
     - **Section 1 : Module Actif & Cursus Médical** : Accordéons dépliables par année (1ère à 6ème) avec grille de cartes de modules. Carte active néon pour la Pédiatrie et cartes squelettes grisées avec badge "Bientôt", cadenas et animation de secousse (*shake*) en cas de tentative de clic.
     - **Section 2 : Date d'Examen & Compte à Rebours** : Champ sélecteur de date (`input[type="date"]`), prévisualisation en temps réel du badge "J-XX", "Jour J" ou "Examen passé", et bouton d'effacement.
     - **Section 3 : Moteur IA** : Clé API Gemini et cascade Flash.
     - **Section 4 : Mises à jour** : Détection GitHub Releases.

4. **Bannière Dynamique Compte à Rebours sur le Dashboard (`src/app.js` & `template.html`)** :
   - Ajout d'une bannière néon au sommet du Dashboard indiquant le module actif, les jours restants (J-XX) et le calcul précis du rythme quotidien recommandé (QCM/jour) pour terminer l'ensemble des questions avant l'examen.
   - Lien direct "Changer date / module" ouvrant instantanément la modale des paramètres.

5. **Assemblage & Compilation des Bundles (`build-bundle.cjs`)** :
   - Intégration de `moduleCatalog.js` et `storageScope.js` dans le pipeline de compilation.
   - Régénération réussie de `src/app.bundle.js` et `dist/index.html` (4.8 Mo autonome).


## 13:55:00 — Release v1.5.3 (versionCode 20) & Déploiement Vercel / GitHub Actions

### Incrémentation & Préparation
- **Nouvelle version** : `v1.5.3` (Patch +0.0.1).
- **Code de version Android** : `versionCode 20` (+1).
- **Fichiers synchronisés** :
  - `package.json`
  - `src/services/updateService.js`
  - `android/app/build.gradle`
  - `template.html`
  - `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md`

### Statut des Déploiements
- **Vercel** : Déploiement automatique du site web de production déclenché dès le push sur `main`.
- **Android Release (GitHub Actions)** : Compilation de l'APK natif et publication de la Release GitHub déclenchées dès le push du tag `v1.5.3`.

## 15:30:00 — Intégration Complète du Module Psychiatrie (20 Cours, 862 QCM) & Commutation Dynamique

### Contexte & Objectif
À la suite de l'ajout des fichiers JSON de questions de psychiatrie dans `qcm-psy/` par l'utilisateur, configuration et intégration intégrale du module Psychiatrie (5ème Année DCEM 3). Le module passe de l'état squelette grisé à l'état actif et sélectionnable. Toutes les fonctionnalités de l'application (Dashboard, Arène QCM, Carnet d'Erreurs/Raisonnement, Suivi des Leçons et Statistiques) s'adaptent dynamiquement avec un cloisonnement étanche des données d'étude.

### Changements Effectués
1. **Extraction & Normalisation des Données Psychiatrie (`build-psy-data.cjs`)** :
   - Analyse et conversion des 20 fichiers JSON du dossier `qcm-psy/`.
   - Normalisation rigoureuse de **862 QCM** et **20 chapitres** médicaux au schéma interne de l'application (énoncé, options, explications, tags, métadonnées).
   - Génération des jeux de données autonomes : `src/data/psy_chapters.json`, `src/data/psy_chapters.js` (`window.PSY_CHAPTERS`), `src/data/psy_questions.json`, `src/data/psy_questions.js` (`window.PSY_QUESTIONS`).

2. **Activation dans le Catalogue Médical (`src/services/moduleCatalog.js`)** :
   - Activation du module `psychiatrie` dans le cursus de 5ème année (`available: true`, `courses: 20`, `qcm: 862`).
   - Prise en charge des alias d'identifiants (`psychiatrie_5` -> `psychiatrie`) pour une compatibilité parfaite.

3. **Cloisonnement Étanche du Stockage (`src/services/storageScope.js`)** :
   - Extension de la table de routage des clés de stockage pour isoler l'ensemble des données par module (`mod_psychiatrie_drill_state`, `mod_psychiatrie_today_tracker`, etc.).
   - Maintien strict de la rétrocompatibilité pour le module `pediatrie` via les clés historiques existantes (zéro perte de progression).

4. **Dynamisation des Moteurs Métier (`queueEngine.js`, `studyTracker.js`, `lessonTracker.js`)** :
   - `queueEngine.js` : Résolution dynamique des clés de stockage et ajout de la méthode `switchModule(newQuestions, newChapters)` permettant de réinitialiser la file de questions et les états sans rafraîchir la page.
   - `studyTracker.js` & `lessonTracker.js` : Ajout des méthodes `reloadForModule()` pour recharger instantanément les historiques de révision et sessions propres au module sélectionné.

5. **Contrôleur d'Application (`src/app.js`)** :
   - Remplacement des variables statiques par le chargeur dynamique `getDatasetForModule(moduleId)` aiguillant vers Pédiatrie ou Psychiatrie.
   - Ajout de la fonction globale `switchActiveModule(moduleId)` orchestreur de la transition : mise à jour des datasets, réinitialisation des moteurs, réactualisation du Dashboard, du titre, de l'Arène, du Carnet de raisonnement et des Statistiques avec toast de confirmation.
   - Raccordement du sélecteur de module dans la modale des Paramètres : le clic sur la carte de Psychiatrie déclenche le basculement direct.

6. **Compilateur & Assembleur de Production (`build-bundle.cjs`)** :
   - Injection automatique des scripts `psy_chapters.js` et `psy_questions.js` dans le template autonome `index.html`.
   - Compilation et synchronisation de `src/app.bundle.js` (413 Ko) et `dist/index.html` (6.47 Mo).

## 16:30:00 — Release v1.5.4 (versionCode 21) & Déploiement Vercel / GitHub Actions

### Incrémentation & Préparation
- **Nouvelle version** : `v1.5.4` (Patch +0.0.1).
- **Code de version Android** : `versionCode 21` (+1).
- **Fichiers synchronisés** :
  - `package.json`
  - `src/services/updateService.js`
  - `android/app/build.gradle`
  - `template.html`
  - `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md`

### Nouveautés & Changements Embarqués
- **Intégration du Module Psychiatrie (DCEM 3)** : 20 cours et 862 QCM normalisés et disponibles.
- **Commutation Dynamique à Chaud** : Basculement instantané entre Pédiatrie et Psychiatrie sans rafraîchir la page.
- **Partitionnement Étanche du Stockage** : Isolement complet des progressions, historiques de révision et chronomètres de cours par module (`mod_psychiatrie_...`).
- **Préservation Intégrale de la Pédiatrie** : 100% de rétrocompatibilité garantie pour les données existantes.

### Statut des Déploiements
- **Vercel** : Déploiement automatique du site web de production déclenché dès le push sur `main`.
- **Android Release (GitHub Actions)** : Compilation de l'APK natif et publication de la Release GitHub déclenchées dès le push du tag `v1.5.4`.

