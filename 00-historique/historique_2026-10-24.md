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

### 20:30 - Intégration du Système de Vérification et Téléchargement des Mises à Jour depuis GitHub Releases

- **Besoin Exprimé par l'Utilisateur** :
  - Permettre à l'APK installé sur smartphone Android de vérifier automatiquement les mises à jour publiées sur GitHub, d'afficher les nouveautés et de télécharger / installer la dernière version en un clic.
  - Automatiser la création des releases sur GitHub avec le fichier `PediaDrill.apk` prêt au téléchargement.

- **Composants & Solutions Développés** :
  1. **Nouveau Service Dédié (`src/services/updateService.js`)** :
     - Définition de la version courante (`CURRENT_APP_VERSION = '1.3.0'`) et du dépôt cible (`lkmqji/qcm-p-diatrie`).
     - Algorithme de comparaison sémantique (`compareVersions`) gérant les préfixes `v` et les versions à 3 niveaux (ex. `1.3.1` > `1.3.0`).
     - Méthode `checkForUpdates(manual = false)` interrogeant l'API publique `https://api.github.com/repos/lkmqji/qcm-p-diatrie/releases/latest`.
     - Cooldown automatique de 4 heures en arrière-plan pour éviter de saturer les quotas de requêtes GitHub.
     - Extraction automatique de l'asset direct `PediaDrill.apk` (`browser_download_url`) ou redirection de secours vers la page de release.
     - Méthode de téléchargement native (`downloadAndInstall`) : déclenche le gestionnaire de téléchargement Android via `_system` en environnement Capacitor natif.
     - Notifications toast stylisées (`pedia-toast-alert`) pour les retours utilisateurs immédiats.

  2. **Interface Utilisateur & Expérience Visuelle (`template.html` & `src/style.css`)** :
     - **Bouton Header & Badge Pulsant** : Ajout d'une puce verte animée (`#badge-update-available`) sur le bouton Paramètres du header alertant discrètement l'étudiant dès qu'une mise à jour est disponible.
     - **Section Mises à Jour dans la Modale Paramètres (`#modal-settings`)** :
       - Badge de version installée actuelle (`v1.3.0`).
       - Statut d'état en direct et bouton manuel `Vérifier les mises à jour maintenant` avec icône tournante (`spin-animation`).
     - **Modale de Mise à Jour Dédiée (`#modal-app-update`)** :
       - Entête avec icône sparkles émeraude.
       - Bannière comparative des versions : `v1.3.0 ➔ v1.4.0` et date de publication.
       - Conteneur défilant des notes de mise à jour et correctifs (Markdown mis en forme).
       - Boutons d'action : `Plus tard` et `Télécharger l'APK`.

  3. **Pipeline CI/CD GitHub Actions (`.github/workflows/build-and-release.yml`)** :
     - Création d'un workflow GitHub Actions automatisé s'exécutant sur chaque tag `v*` (ex: `v1.3.1`) ou déclenchable manuellement en 1 clic via `workflow_dispatch`.
     - Étapes : Checkout, Node 20, Java 17 Temurin, Android SDK, build du bundle web, `cap sync android`, compilation Gradle native (`:app:assembleDebug`), génération de `PediaDrill.apk` et publication instantanée sur GitHub Releases avec release notes automatiques et APK attaché.

  4. **Assemblage & Synchronisation (`build-bundle.cjs` & `src/app.js`)** :
     - Intégration de `updateService.js` dans le bundle client unifié `src/app.bundle.js`.
     - Initialisation automatique en arrière-plan 3 secondes après le lancement de l'application.
     - Synchronisation de `package.json` sur la version `1.3.0`.

