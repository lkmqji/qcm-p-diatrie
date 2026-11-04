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

## 11:08:00 CET — Release v1.5.0 (versionCode 17) — Déploiement Vercel & Release Android

### Numéros de version
- **Version sémantique** : `v1.5.0` (incrémentée depuis `v1.4.9`)
- **Android versionCode** : `17` (incrémenté depuis `16`)

### Résumé des changements intégrés
1. **Graphiques de statistiques (QCM & Cours)** :
   - Affichage par défaut de l'historique sur 7 jours dans les graphiques SVG (`#stats-activity-chart` et `#lesson-daily-chart-container`) lorsque la vue est sur « Aujourd'hui ».
   - Préservation stricte du bilan journalier sur les cartes KPI et sections analytiques associées.
   - Synchronisation complète de l'ensemble de la page dès qu'une période différente est sélectionnée en haut (14j, 28j/30j, Tout, Personnalisé).
2. **Synchronisation Capacitor & Build Android** :
   - Compilation locale `PediaDrill.apk` avec Gradle Wrapper 9.2.0 et Android SDK 36.
   - Synchronisation des assets web dans `android/app/src/main/assets/public/`.
3. **Déploiement Vercel & GitHub Actions** :
   - Push sur la branche `main` pour mise à jour automatique sur Vercel.
   - Création et push du tag `v1.5.0` pour déclencher le workflow GitHub Actions (`.github/workflows/build-and-release.yml`) et publier la release avec l'APK téléchargeable.


