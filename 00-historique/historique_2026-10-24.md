# Historique des modifications - 2026-10-24

### 19:35 - Synchronisation stricte de l'ensemble des KPIs et graphiques de statistiques avec la période sélectionnée

- **Problème identifié (Retour Utilisateur)** :
  - Sur la page des statistiques (`#view-stats`), lors du changement de filtre temporel (notamment « Aujourd'hui », « 7 jours », « 30 jours » ou « Personnalisé »), plusieurs cartes KPI affichaient encore les données globales cumulées de tout l'historique :
    - Le temps d'étude affichait le temps total global cumulé (ex. 1h 33m et 11 sessions) au lieu du temps réel de la journée ou période choisie.
    - La vitesse moyenne (s/QCM) et la décomposition Justes vs Fautes affichaient la moyenne de l'historique complet au lieu de la vitesse sur la période sélectionnée.
    - Les questions faites et le taux de précision reflétaient également des données globales.
    - Les panneaux de vélocité, projection de révision, top chapitres et le journal timeline n'étaient pas synchronisés avec la plage de dates active.

- **Modifications apportées & Solutions techniques** :
  1. **Extension du service `StudyTracker` (`src/services/studyTracker.js`)** :
     - Ajout de la méthode `getAnalyticsForDays(days)` qui agrège et calcule de manière autonome toutes les métriques pour n'importe quel tableau de dates :
       - Total questions, justes, fautes, taux de précision %.
       - Temps total cumulé en secondes (`totalTimeSeconds`) et nombre de sessions actives (`totalSessions`).
       - Vitesse moyenne globale (`avgTimePerQuestion`), vitesse sur réponses justes (`avgTimeCorrect`) et vitesse sur réponses fausses (`avgTimeWrong`).
       - Calcul précis des temps par type de réponse avec rétro-compatibilité sur les anciens enregistrements.
       - Ventilation des chapitres / cours travaillés spécifiquement sur cet ensemble de jours (`chapterTotals`).
       - Métriques de 1er passage / découverte inédits sur la sélection (`firstPass`).
     - Refactorisation de `getGlobalAnalytics()` pour réutiliser `getAnalyticsForDays(allDays)` avec `firstPass` global, garantissant une cohérence absolue des règles de calcul.

  2. **Structure HTML & Identifiants dynamiques (`template.html`)** :
     - Remplacement du libellé statique `Temps Total d'Étude` par `Temps d'Étude` dans la carte KPI accent-purple.
     - Ajout d'identifiants précis sur tous les libellés de cartes KPI (`#kpi-streak-label`, `#kpi-questions-label`, `#kpi-accuracy-label`, `#kpi-firstpass-label`, `#kpi-time-label`, `#kpi-speed-label`) afin de permettre leur contextualisation dynamique selon la période choisie.

  3. **Moteur d'Affichage & Logique Applicative (`src/app.js`)** :
     - Refonte complète de `renderStatsUI()` :
       - Récupération des jours filtrés (`rangeDays`) selon `currentStatsRange` ('today', '7', '30', 'all', 'custom').
       - Calcul des métriques de la période via `studyTracker.getAnalyticsForDays(rangeDays)`.
       - Mise à jour dynamique de tous les 6 Hero KPI Cards :
         - **Série d'étude (Streak)** : affiche le streak actuel, le record, et indique si l'entraînement est validé aujourd'hui ou le nombre de jours actifs sur la période.
         - **Questions Faites** : libellé adapté (ex. *Questions (Aujourd'hui)* ou *Questions (7 jours)*), total strict de la période et sous-titre détaillé (`X justes • Y fautes`).
         - **Taux de Précision** : précision calculée sur les QCM de la période sélectionnée (ou `--%` si 0 QCM).
         - **1er Passage (Inédit)** : réussite sur les questions découvertes pour la 1ère fois au cours de la période.
         - **Temps d'Étude** : libellé contextualisé (ex. *Temps (Aujourd'hui)*), durée exacte passée sur la période et nombre de sessions de la période.
         - **Vitesse Moyenne** : cadence moyenne calculée uniquement sur la période sélectionnée, avec vitesses distinctes pour les réponses justes et fautes de cette même période.
       - Synchronisation des panneaux dérivés :
         - `renderStatsVelocityAndProjection(periodAnalytics, rangeLabel)` : cadence observée et projection concours basées sur la cadence de la période.
         - `renderStatsChapters(periodAnalytics.chapterTotals, rangeLabel)` : affichage exclusif des cours travaillés sur la période.
         - `renderStatsTimeline(rangeDays)` : affichage exclusif des sessions et journées appartenant à la période sélectionnée.
       - Amélioration de l'interaction « Personnalisé » : application et affichage immédiats lors du clic sur le bouton de plage personnalisée.

  4. **Compilation & Déploiement** :
     - Exécution réussie de `node build-bundle.cjs` : synchronisation du CSS, régénération de `src/app.bundle.js`, mise à jour d'`index.html` et copie dans `dist/index.html`.
     - Tests unitaires automatisés validant l'isolation stricte des métriques journalières et la conservation de l'agrégation globale.
