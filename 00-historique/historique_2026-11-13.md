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
