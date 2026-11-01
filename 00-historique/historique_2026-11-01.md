# Journal des Modifications — 2026-11-01

## 20:15:00 CET — Intégration de la numérotation des sous-questions et de l'accordéon de consultation des cas cliniques

### Contexte & Besoin Utilisateur
Certaines questions de la base de données correspondent à des sous-questions issues d'un même cas clinique (ex: cas clinique 37 comportant 10 questions numérotées `37.1` à `37.10`). L'utilisateur a demandé :
1. L'ajout d'une numérotation claire de chaque sous-question avant l'énoncé (ex: `Cas Clinique 2 • Question 4/5`).
2. L'ajout d'un bouton interactif permettant d'afficher/déplier l'ensemble des questions appartenant au même cas clinique pour en avoir une vision complète sans quitter le drill.

### Modifications apportées
1. **Structure HTML (`template.html` & `index.html`)** :
   - Ajout d'un en-tête structuré `.clinical-case-header` dans `.clinical-case-box` avec titre `Cas Clinique` et bouton interactif `#btn-toggle-clinical-questions` muni d'une icône `list-ordered` et d'un chevron rotatif.
   - Ajout du conteneur accordéon déroulant `#arena-clinical-questions-accordion` sous le texte du cas clinique.
   - Ajout du badge stylisé `#arena-subquestion-badge` (`Cas Clinique X • Question Y/N`) positionné immédiatement au-dessus de l'énoncé `#arena-question-text`.

2. **Feuille de styles (`src/style.css`)** :
   - `.clinical-case-header` : alignement flexbox `justify-content: space-between; align-items: center;`.
   - `.btn-toggle-clinical-accordion` : bouton compact violet néon avec hover, shadow et rotation fluide du chevron à 180° à l'ouverture.
   - `.clinical-case-accordion` : volet déroulant avec séparateur en pointillés, animation `fadeInAccordion`.
   - `.clinical-accordion-item` : cartes de sous-questions compactes avec bordure et fond différencié, et surbrillance `.is-current` pour la question active.
   - `.subquestion-badge` : badge dégradé violet / cyan néon avec icône et typographie soignée.

3. **Logique applicative (`src/app.js`)** :
   - `getClinicalCaseSubQuestions(question)` : extrait les questions associées au même cas clinique et même chapitre, triées par ordre séquentiel.
   - `updateClinicalCaseUI(q)` : fonction unifiée appelée dans `renderQuestion` (mode drill actif) et `renderHistoryQuestion` (mode historique), calculant le numéro de la sous-question et le total, et mettant à jour le badge et le bouton.
   - `window.toggleClinicalQuestionsAccordion()` : gère l'ouverture/fermeture du volet accordéon et génère le rendu des sous-questions en lecture seule avec propositions et badge `Question en cours`.

4. **Compilation & Déploiement** :
   - Exécution de `node build-bundle.cjs` : synchronisation du CSS dans `template.html`, compilation de `src/app.bundle.js`, mise à jour de `index.html` et du dossier de distribution `dist/`.
   - Validation syntaxique `node -c src/app.js` et `node -c src/app.bundle.js` réussie (0 erreur).

---

## 20:18:00 CET — Ajout des scripts batch de lancement local (`lancer-app.bat` & `start-local.bat`)

### Contexte & Besoin Utilisateur
L'utilisateur a demandé un fichier `.bat` permettant de lancer l'application en local facilement (en 1 double-clic).

### Modifications apportées
1. **Serveur HTTP autonome (`server.cjs`)** :
   - Serveur statique Node.js natif sans dépendance externe, avec support complet des types MIME (`.html`, `.js`, `.css`, `.json`, `.svg`, etc.), gestion de port automatique (fallback incrémental si 3000 occupé), et ouverture automatique du navigateur (`start http://localhost:PORT`).
2. **Scripts batch Windows (`lancer-app.bat` et `start-local.bat`)** :
   - Compile automatiquement les derniers bundles via `build-bundle.cjs`.
   - Lance le serveur local `server.cjs` et ouvre directement l'application dans le navigateur par défaut de l'utilisateur.
3. **Mise à jour `package.json`** :
   - Ajout des raccourcis `"dev": "node server.cjs"` et `"start": "node server.cjs"`.

---

## 20:28:00 CET — Release v1.4.9 (versionCode 16) — Déploiement Vercel & Release Android

### Version & Statut
- **Version sémantique** : `v1.4.9` (incrémentée depuis `v1.4.8`).
- **Android versionCode** : `16` (incrémenté depuis `15`).
- **Statut Vercel** : Bundle compilé et prêt pour déploiement automatique via `git push origin main`.
- **Statut Android** : `build-apk.bat` compilé avec succès (`PediaDrill.apk` synchronisé à la racine), tag `v1.4.9` prêt pour le déclenchement de la release GitHub Actions.

### Résumé des changements
1. **Numérotation des sous-questions de cas clinique** : Badge contextuel dynamique `#arena-subquestion-badge` (`Cas Clinique X • Question Y/N`).
2. **Accordéon de consultation intégrale du cas** : Bouton `#btn-toggle-clinical-questions` et tiroir déroulant animé `#arena-clinical-questions-accordion` pour réviser l'ensemble des questions d'un cas sans quitter le drill.
3. **Lancement local autonome** : Ajout de `lancer-app.bat`, `start-local.bat`, et `server.cjs` pour un démarrage en un clic avec auto-build et ouverture du navigateur.


