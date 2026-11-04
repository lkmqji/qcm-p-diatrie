# Journal des Modifications — 2026-11-04

## 10:35:00 CET — Affichage de 7 jours par défaut uniquement sur les graphiques d'activité (QCM et Cours)

### Contexte & Besoin Utilisateur
Dans la vue des Statistiques (`#view-stats`), la période sélectionnée par défaut est « Aujourd'hui » afin de présenter un bilan ciblé de la journée (KPIs héro, vélocité, chapitres, chronomètre). Cependant, les graphiques d'activité (`#stats-activity-chart` pour les QCM et `#lesson-daily-chart-container` pour les cours) n'affichaient auparavant qu'une seule barre isolée pour la journée sélectionnée, ce qui ne permettait pas de visualiser l'évolution ou la tendance récente sans devoir changer la période globale.
L'utilisateur a demandé :
1. Que les graphiques (et uniquement les graphiques) affichent par défaut les 7 derniers jours d'activité afin d'avoir une vision claire de l'évolution hebdomadaire.
2. Que les cartes de synthèse (KPIs) et sections de détail continuent d'afficher la journée sélectionnée par défaut (« Aujourd'hui » ou jour décalé).
3. Si l'utilisateur modifie la période globale en haut (ex: 14 jours, 30 jours, tout, personnalisé), tous les composants sans exception (KPIs, chapitres, timeline et graphiques) se synchronisent sur la période sélectionnée.

### Modifications apportées
1. **Logique du Graphique d'Activité QCM (`src/app.js` - `renderStatsUI` & `renderStatsActivityChart`)** :
   - Lorsque `currentStatsRange === 'today'`, le graphique d'activité reçoit désormais les 7 jours glissants (`studyTracker.getDaysByRange('7')` ou 7 jours se terminant au jour sélectionné via le stepper).
   - Les cartes KPI, la projection concours, la répartition par cours et la timeline restent strictement focalisées sur le jour sélectionné (`rangeDays`).
   - Le titre du graphique affiche automatiquement `Activité des 7 derniers jours (Volume, Justes vs Fautes & Vélocité)` en mode défaut, ou s'adapte à la période choisie dès que l'utilisateur clique sur un filtre (14j, 30j, tout, personnalisé).
   - Dès qu'une période différente de `today` est choisie en haut, le graphique se synchronise immédiatement sur la même période (`chartDays = rangeDays`).

2. **Logique du Graphique Quotidien des Cours (`src/app.js` - `renderLessonAnalytics` & `getLessonRangeDailyData`)** :
   - Prise en compte du paramètre `offset` dans `getLessonRangeDailyData` pour les plages chiffrées (`7`, `14`, etc.) avec libellés intelligents (`Auj.`, `Hier`, `jour`).
   - Lorsque `currentLessonStatsRange === 'today'`, le graphique des cours affiche par défaut les 7 derniers jours (`chartDailyData = getLessonRangeDailyData('7', selectedLessonDayOffset)`), tandis que les 4 KPI cards restent basées sur la journée sélectionnée (`periodSessions`).
   - Le titre du graphique et le badge d'en-tête indiquent `Historique Quotidien d'Étude des Cours (7 derniers jours)` et `7 jours`.
   - Si l'utilisateur clique sur un bouton de période en haut (14 jours, 28 jours, tout, personnalisé), l'ensemble de la sous-page (KPIs et graphique) passe sur cette période.

3. **Gabarit HTML (`template.html`)** :
   - Mise à jour des libellés par défaut dans les en-têtes des panneaux :
     - `#activity-chart-title` : `Activité des 7 derniers jours (Volume, Justes vs Fautes & Vélocité)`.
     - `#lesson-daily-chart-title` : `Historique Quotidien d'Étude des Cours (7 derniers jours)`.
     - `#lesson-chart-period-badge` : `7 jours`.

4. **Assemblage & Vérification (`build-bundle.cjs`)** :
   - Exécution de `node build-bundle.cjs` : mise à jour de `src/app.bundle.js`, `index.html` et `dist/`.
   - Contrôle syntaxique réussi : `node -c src/app.js` et `node -c src/app.bundle.js` sans aucune erreur.

---

## 13:35:00 CET — Release v1.5.1 (versionCode 18) — Correctif Cache Service Worker & Rendu Visuel 7 Jours

### Numéros de version
- **Version sémantique** : `v1.5.1` (incrémentée depuis `v1.5.0`)
- **Android versionCode** : `18` (incrémenté depuis `17`)

### Cause racine identifiée & Correctifs apportés
1. **Invalidation du cache PWA / Service Worker (`sw.js`)** :
   - Le Service Worker (`sw.js`) utilisait auparavant une stratégie stale-while-revalidate aveugle sur toutes les requêtes du même domaine, y compris le document racine `/` et `index.html`.
   - Lors d'une navigation ou d'un rechargement en ligne, le navigateur servait systématiquement le document HTML mis en cache de l'ancienne version (`v1.4.9`), ce qui empêchait l'utilisateur de recevoir le nouveau code des graphiques 7 jours.
   - **Correctif** : Migration vers une stratégie stricte **Network-First** pour les requêtes HTML/navigation (`event.request.mode === 'navigate'` ou `destination === 'document'`). En ligne, le navigateur charge instantanément la dernière version déployée sur Vercel et met à jour le cache. En hors-ligne, le cache local prend le relais de façon transparente.
   - Incrémentation du nom de cache en `pedia-drill-v1.5.1` et purge automatique de tous les anciens caches lors de l'activation.
   - Ajout d'écouteurs d'événements dans `src/app.js` (`controllerchange` et `updatefound`) pour recharger automatiquement le client dès qu'un nouveau Service Worker prend le contrôle.

2. **Rendu visuel et lisibilité des 7 jours dans les graphiques SVG (`src/app.js`)** :
   - Dans les graphiques QCM (`#stats-activity-chart`) et Cours (`#lesson-daily-chart-container`), les jours sans activité (`total === 0` ou `daySeconds === 0`) étaient dessinés avec une barre de 3px à 4% d'opacité, ce qui les rendait presque invisibles à l'œil nu sur fond sombre lorsque l'utilisateur n'avait d'activité qu'aujourd'hui.
   - **Correctif** :
     - Ajout d'une colonne guide d'arrière-plan (`chart-col-bg`) sur chaque colonne pour structurer visuellement les 7 jours de la période.
     - Affichage d'un socle de base visible avec bordure (`rgba(255,255,255,0.18)`) et indicateur textuel explicite (`0` pour les QCM, `—` pour les cours) sur chaque jour vide.
     - Affichage direct du volume de questions ou de la durée au-dessus des barres actives.
     - Libellés d'axes X harmonisés en français (`dim. 29`, `lun. 30`, ..., `Hier`, `Auj.`) avec mise en valeur du jour actif en cyan (`#00d4ff`) et en gras.
     - Sécurisation de la constitution de l'échantillon des 7 jours sans mutation indésirable de `studyTracker.history`.

3. **Déploiements Vercel & GitHub Actions Release Android** :
   - Compilation locale `PediaDrill.apk` (`versionCode 18`, `versionName 1.5.1`).
   - Push sur la branche `main` pour publication Vercel.
   - Tag git `v1.5.1` poussé pour déclencher la release GitHub Actions.

---

## 13:50:00 CET — Release v1.5.2 (versionCode 19) — Déploiement Vercel & Release Android

### Numéros de version
- **Version sémantique** : `v1.5.2` (incrémentée depuis `v1.5.1`)
- **Android versionCode** : `19` (incrémenté depuis `18`)

### Actions & Déploiements réalisés
1. **Incrémentation des versions de référence** :
   - `package.json` : `"version": "1.5.2"`
   - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.5.2'`
   - `android/app/build.gradle` : `versionCode 19`, `versionName "1.5.2"`
   - `template.html` : `#update-modal-curr-version` et `#update-modal-new-version` mis à jour en `v1.5.2`
   - `sw.js` : Invalidation du cache PWA (`CACHE_NAME = 'pedia-drill-v1.5.2'`)
   - `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md` : Synchronisation des versions et du versionCode

2. **Compilation et Assemblage de Production** :
   - Exécution de `node build-bundle.cjs` : synchronisation du CSS, assemblage de `src/app.bundle.js`, compilation de `index.html` et mise à jour de `dist/`.
   - Synchronisation des assets natifs Capacitor (`npx cap sync android`).
   - Compilation locale de l'APK Android (`PediaDrill.apk`).

3. **Validation & Intégrité** :
   - Vérification de la syntaxe Node.js sur `src/app.js`, `src/app.bundle.js` et `src/services/updateService.js`.

4. **Déploiements Vercel & GitHub Actions Release Android** :
   - Push sur la branche `main` pour publication immédiate sur Vercel.
   - Tag git `v1.5.2` créé et poussé pour déclencher le workflow GitHub Actions de compilation et release APK.




