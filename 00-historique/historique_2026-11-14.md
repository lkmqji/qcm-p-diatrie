# Historique des Modifications — 14 Novembre 2026

## 17:25:00 — Release v1.5.5 (versionCode 22) : Synchronisation Complète Multi-Modules, Header Dashboard Épuré & Déploiements

### Contexte & Objectif
À la suite des retours utilisateurs sur l'intégration du module Psychiatrie et l'expérience visuelle du Dashboard :
1. Remplacement de l'ancienne bannière compte à rebours imposante par un en-tête compact et interactif affichant le nom du module actif (ex: Psychiatrie 5ème Année) et la date d'examen sélectionnée en texte discret avec badge dynamique (J-XX, Jour J, Passé), cliquable directement pour modifier la date ou basculer de module.
2. Synchronisation dynamique de la description métrique du Dashboard (`metric-desc`) avec la date d'examen effective du module choisi.
3. Synchronisation de la page de suivi de progression et d'analytique des leçons avec le module sélectionné (nombre dynamique de chapitres, réinitialisation de la leçon en cours lors du switch, libellés adaptés aux 20 cours de Psychiatrie ou 35 cours de Pédiatrie).
4. Déploiement Vercel et Release Android v1.5.5.

### Changements Effectués
1. **Header Dashboard Compact & Dynamique (`src/app.js`, `template.html`, `src/style.css`)** :
   - Remplacement de `.dashboard-exam-banner` par `.dashboard-module-header`.
   - Affichage épuré : Titre du module actif, badge d'année (`5ème Année`), date d'examen formatée et badge de compte à rebours discret (`J-XX`), avec bouton pilule `Changer de module`.
   - Interaction au clic ouvrant directement la modale des paramètres.

2. **Synchronisation Complète Multi-Modules de l'Analytique et du Suivi des Leçons (`src/app.js`)** :
   - Synchronisation dynamique des compteurs de chapitres (`${chTotalCount}`) dans la matrice de couverture, les badges de progression globale et les filtres.
   - Synchronisation des menus déroulants et sélecteurs manuels de leçons (`Chapitres (20) — Psychiatrie :` ou `Chapitres (35) — Pédiatrie :`).
   - Réinitialisation propre de la leçon sélectionnée (`currentLessonSelected`) lors d'un basculement de module pour éviter les collisions inter-modules.

3. **Incrémentation de Version & Traçabilité (v1.5.5, versionCode 22)** :
   - `package.json` : `version: "1.5.5"`
   - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.5.5'`
   - `android/app/build.gradle` : `versionCode 22`, `versionName "1.5.5"`
   - `template.html` : `#update-modal-curr-version` et `#update-modal-new-version` passés en `v1.5.5`
   - `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md` mis à jour.

4. **Compilation & Assemblage de Production** :
   - `build-bundle.cjs` exécuté avec succès (`src/app.bundle.js`, `index.html` et dossier `dist/`).
   - Synchronisation Capacitor Android (`npx cap sync android`).
   - Compilation locale native réussie de `PediaDrill.apk` (`BUILD SUCCESSFUL in 1m 33s`).

### Statut des Déploiements
- **Vercel** : Déploiement automatique du site web de production déclenché dès le push sur `main`.
- **Android Release (GitHub Actions)** : Compilation de l'APK natif et publication de la Release GitHub `v1.5.5` déclenchées dès le push du tag `v1.5.5`.
