# PédiaDrill — Master Product & Technical Context
*Dernière mise à jour : 2026-10-26 17:15:00 CET*
*Source unique de vérité technique et fonctionnelle du projet PédiaDrill.*

---

## 1. Vision du Produit & Résumé Exécutif
**PédiaDrill** est une Progressive Web App (PWA) médicale et autonome d'entraînement intensif au concours de résidanat et aux examens de 5ème année de médecine en pédiatrie. Elle combine :
1. **Un moteur de répétition espacée adaptatif (Spaced Repetition System)** calibré pour l'ancrage mnésique concours avec plafonnement dynamique à 10 paliers, pénalités d'erreurs dégressives et repositionnement calculé dans la file active.
2. **Une évaluation sémantique par Intelligence Artificielle (exclusivement Gemini 3.8 Flash & famille Flash)** pour noter les questions à réponses ouvertes courtes (CROQ / QROC) et formuler une méthode de raisonnement clinique approfondie structurée en 4 volets cliniques.
3. **Une arène de quiz sans distraction** avec sélection multiple universelle (A, B, C, D, E), protection anti-spoiler du cours par flou interactif, pastille de date/session d'annale normalisée (`P [Année]`, `Résidanat [Année]`, `Rattrapage [Année]`), clichés médicaux protégés et floutés par défaut, et affichage en temps réel des explications officielles.
4. **Une navigation rétrospective dans les 5 derniers QCM** permettant de revoir instantanément les questions précédentes, leurs choix de réponse et leurs explications sans altérer la file de répétition espacée, avec persistance des explications IA générées et du fil de discussion du Tuteur IA par question.
5. **Un tuteur IA interactif en direct** accessible en Arène via un bouton néon flottant, avec puces cliniques rapides, protection anti-spoiler du diagnostic et mémoire de conversation isolée par question.
6. **Un carnet de raisonnement clinique interactif** regroupé par chapitres ou en liste plate continue, avec tri multi-critères (date, erreurs, cours, score), accordéons repliables multi-niveaux et fiches d'erreur exhaustives.
7. **Un tableau de bord analytique complet** articulé en deux sous-pages (Statistiques QCM et Chronomètre de cours), avec 7 cartes KPI dynamiques (dont l'estimation du temps nécessaire pour terminer), navigation jour par jour dans l'historique, heatmap GitHub d'activité, graphique combiné SVG et colonne de suivi de complétion des 35 cours du programme.
8. **Une synchronisation multi-appareils (PWA / Mobile / Desktop)** adossée à Google Auth et Firebase Firestore, immunisée contre la limite de 1 Mo par document grâce à un partitionnement intelligent des notes par paquets de 50 (Chunked Firestore Storage) et à un horodatage précis de la sélection des cours.
9. **Une distribution native Android (APK)** propulsée par Capacitor 8 et automatisée par un pipeline CI/CD GitHub Actions avec vérification et téléchargement in-app autonome des mises à jour.

---

## 2. Architecture Globale & Arborescence du Projet

```
qcm-p-diatrie/
├── .github/
│   └── workflows/
│       └── build-and-release.yml         # CI/CD GitHub Actions (build Android, signature & publication Release)
├── 00-historique/
│   ├── historique_YYYY-MM-DD.md          # Journal quotidien des modifications horodatées
│   └── MASTER_PRODUCT_TECHNICAL_CONTEXT.md # Contexte technique global (source unique de vérité)
├── android/                              # Projet natif Android Capacitor 8
│   ├── app/
│   │   ├── build.gradle                  # Configuration de compilation Android (versionCode 8, versionName 1.3.3)
│   │   ├── debug.keystore                # Keystore de signature unifié (local & CI/CD)
│   │   ├── google-services.json          # Configuration Firebase Android (qcm-pediatr, com.pediadrill.app)
│   │   └── src/main/
│   │       ├── AndroidManifest.xml       # Permissions réseau et configuration d'activités
│   │       ├── assets/public/            # Assets web synchronisés par Capacitor
│   │       └── res/values/strings.xml    # Déclaration de default_web_client_id pour Google Auth
│   ├── build.gradle                      # Configuration Gradle racine (AGP 8.13.0, Google Services 4.4.4)
│   ├── gradle/wrapper/                   # Gradle Wrapper 9.2.0 (compatible Java 21 / 25 et AGP 8.13.0)
│   └── settings.gradle                   # Déclaration des modules natifs Capacitor
├── api/                                  # Fonctions Serverless Vercel
│   ├── ping.js                           # Endpoint de test de disponibilité réseau
│   ├── sync.js                           # Endpoint de relais de synchronisation
│   └── test.js                           # Endpoint de diagnostic
├── dist/                                 # Dossier de production web & assets natifs
│   ├── index.html                        # Application complète autonome avec datasets intégrés (4.7 Mo)
│   ├── agentation.bundle.js              # Barre d'annotation visuelle standalone
│   ├── manifest.json                     # Manifeste PWA
│   ├── sw.js                             # Service Worker de cache hors-ligne
│   ├── icon-192.svg                      # Icône PWA 192x192
│   └── icon-512.svg                      # Icône PWA 512x512
├── public/                               # Assets statiques publics (favicons, icônes)
├── src/
│   ├── data/
│   │   ├── chapters.js                   # Déclaration ES module des 35 chapitres de pédiatrie
│   │   ├── chapters.json                 # Format JSON des chapitres avec décompte de QCM
│   │   ├── questions.js                  # Déclaration ES module de la base de données (1905 questions)
│   │   └── questions.json                # Format JSON brut des 1905 questions
│   ├── services/
│   │   ├── gemini.js                     # Service IA Gemini Flash (cascade, circuit-breaker, CROQ & tuteur)
│   │   ├── queueEngine.js                # Algorithme de répétition espacée (SRS), file active et persistance
│   │   ├── studyTracker.js               # Suivi du progrès journalier, chronométrage & sessions QCM
│   │   ├── lessonTracker.js              # Chronomètre persistant et suivi du temps d'étude par cours
│   │   ├── firebaseSyncService.js        # Auth Google (native/web) & synchronisation par paquets Firestore
│   │   ├── syncService.js                # Service de synchronisation générique
│   │   └── updateService.js              # Détection des releases GitHub et déclenchement de mise à jour in-app
│   ├── app.js                            # Contrôleur d'interface principal, gestion des vues et événements
│   ├── app.bundle.js                     # Bundle JS client unifié (IIFE autonome sans imports ES)
│   └── style.css                         # Feuille de styles principale (Design System sombre médical)
├── template.html                         # Structure HTML maîtresse avec CSS synchronisé pour le bundleur
├── index.html                            # Fichier racine autonome servi par Vercel (4.7 Mo)
├── PediaDrill.apk                        # Exécutable natif Android produit à la racine (~7.8 Mo)
├── agentation.bundle.js                  # Outil d'annotation d'interface Agentation
├── build.cjs                             # Script de copie vers le dossier dist/
├── build-bundle.cjs                      # Script d'assemblage automatique (CSS, bundle JS, index.html)
├── build-apk.bat                         # Script d'automatisation de build natif Android (:app:assembleDebug)
├── capacitor.config.json                 # Configuration Capacitor (appId, appName, plugins auth)
├── google-services.json                  # Fichier Firebase Google Services racine
├── manifest.json                         # Configuration PWA Web App Manifest
├── sw.js                                 # Service Worker (Cache-First / Stale-While-Revalidate)
├── vercel.json                           # Configuration de routage SPA Vercel
└── package.json                          # Métadonnées, dépendances et scripts du projet Node.js
```

---

## 3. Spécifications Fonctionnelles & Règles Métier

### 3.1. Moteur de Répétition Espacée (`src/services/queueEngine.js`)
L'apprentissage repose sur une file d'attente circulaire dynamique (`activeQueue`) :
- **Seuil de maîtrise de base** : Une question doit être validée **3 fois consécutives** pour être définitivement éliminée (`permanentlyRemoved: true`).
- **Plafonnement maximal et décrémentation au palier 10** :
  - **Avant d'atteindre 10** (`st.target < 10`) : La cible de répétition (`target`) augmente à chaque faute selon la règle `st.target = Math.min(10, 3 + st.mistakes)`.
  - **Une fois le plafond de 10 atteint** (`st.target >= 10`) : Le seuil de répétition ne pouvant plus augmenter, chaque mauvaise réponse diminue directement le nombre de réussites acquises : `st.current = Math.max(0, st.current - 1)` (ex: `7/10` devient `6/10`, `6/10` devient `5/10`, etc.).
  - Le nombre maximal de réussites requises reste **strictement plafonné à 10**.
  - Tout état persistant antérieur ou fusionné depuis Firestore ayant un `target > 10` est automatiquement nettoyé et ramené à 10 lors du chargement.
- **Gestion des erreurs (`handleFailure`)** :
  - Incrémente le compteur de fautes de la question (`mistakes++`).
  - Pénalité dynamique :
    - Si `target < 10` : augmente le seuil cible (`target = Math.min(10, 3 + mistakes)`).
    - Si `target >= 10` : décrémente les réussites actuelles (`current = Math.max(0, current - 1)`).
  - **Repousse la question à une distance courte de 5 à 7 cartes** (`Math.floor(Math.random() * 3) + 5`) pour réactiver la mémoire immédiate.
- **Gestion des réussites (`handleSuccess`)** :
  - Incrémente les réussites (`current++`).
  - Si `current >= target` : la question est marquée maîtrisée (`done = true`) et retirée définitivement de la file.
  - Si `target - current === 1` (dernier palier avant élimination complète) : **la question apparaît aléatoirement au sein des 50% dernières questions totales restantes** de la file (`[Math.floor(remaining * 0.5), remaining]`).
  - Sinon (`target - current > 1`) : **la question réapparaît après 50 à 100 questions** (`Math.floor(Math.random() * 51) + 50`).
- **Compteur journalier d'itérations (`todayTracker`)** :
  - **Seules les réponses justes** (`handleAnswerSuccess`) ajoutent +1 au compteur de questions faites aujourd'hui (`todayTracker.count`).
  - Les erreurs (`handleAnswerFailure`) n'incrémentent pas ce compteur, garantissant que l'objectif journalier reflète fidèlement le nombre de validations acquises vers l'échéance du concours.
- **Persistance locale & Cloud** : Tout l'état (`activeQueue`, `stats`, `cursor`, `reasoningNotes`, `todayTracker`, `selectedChapterIds`, `selectedChaptersUpdatedAt`) est sauvegardé dans `localStorage` sous la clé `pedia_drill_state_v1` et synchronisé via `FirebaseSyncService`.
- **Synchronisation multi-appareils des cours sélectionnés** : Chaque modification de la sélection des cours met à jour un horodatage précis (`selectedChaptersUpdatedAt`). Lors de la fusion d'états (`mergeStates`), la sélection la plus récente entre l'appareil local et le cloud est automatiquement retenue et appliquée, déclenchant la ré-initialisation dynamique de la file et la mise à jour immédiate de l'interface sur tous les écrans connectés.

---

### 3.2. Évaluation IA & Raisonnement Clinique (`src/services/gemini.js`)
- **Modèles 100% Flash Exclusifs & Cascade de résilience ultra-rapide** :
  - Verrouillage strict et absolu : **seuls les modèles Flash de Gemini** sont autorisés dans l'application. Tout modèle non-flash est systématiquement bloqué et rejeté.
  - Priorité absolue accordée à `gemini-3-flash-preview` (position #1 de `MODEL_CASCADE`, testé et validé à ~1.25s).
  - Cascade automatique ordonnée garantissant la continuité sans blocage :
    1. `gemini-3-flash-preview` (modèle principal ultra-rapide, latence 1 à 2s)
    2. `gemini-flash-lite-latest` (secours Flash Lite dernière génération)
    3. `gemini-3.1-flash-lite` (secours Flash Lite haute disponibilité)
    4. `gemini-3.8-flash` (secours Flash haute fidélité si quota disponible)
    5. `gemini-3.7-flash` (secours Flash standard)
    6. `gemini-3.6-flash` (secours Flash secours)
    7. `gemini-3.5-flash` (secours Flash réserve)
  - Exclusion définitive du modèle `gemini-3.5-flash-lite` (qui générait des timeouts bloquants de 30s).
- **Architecture Circuit-Breaker & Mémorisation Dynamique** :
  - **Mémorisation du modèle actif (`lastSuccessfulModel`)** : Dès qu'un modèle Flash réussit, le service l'utilise immédiatement comme modèle prioritaire pour tous les appels suivants, évitant de rejouer la cascade depuis le début.
  - **Quarantaine automatique des erreurs de quota 429 (`RESOURCE_EXHAUSTED`)** : Tout modèle rencontrant un dépassement de quota journalier est automatiquement placé en quarantaine pour 15 minutes (`quarantinedModels`). Il est immédiatement ignoré en mémoire lors des requêtes suivantes, sans gaspiller de requêtes HTTP ni imposer de latence à l'utilisateur.
  - **Quarantaine des erreurs 503/404** : Mise en quarantaine temporaire de 5 minutes en cas de pic de charge ou de modèle temporairement indisponible.
  - **Désactivation des pensées cachées** : Injection de `thinkingConfig: { thinkingBudget: 0 }` sur les modèles compatibles (`gemini-3-flash-preview`), évitant la génération inutile de 500+ tokens de réflexion interne et divisant le temps de réponse par 2.
- **Paramètres de génération calibrés** :
  - `temperature: 0.2` (haute rigueur médicale et reproductibilité).
  - `maxOutputTokens: 1024` pour l'évaluation CROQ, `2500` pour la démarche clinique complète, et `1500` pour le tuteur IA.
  - Timeout d'attente réseau abaissé à 12 secondes par tentative (`AbortController`), permettant un basculement immédiat vers le secours sans figer l'interface.
- **Évaluation des CROQ (`evaluateCroq`)** :
  - Compare la réponse libre de l'étudiant à la réponse type officielle.
  - Retourne un score de 0 à 100%. Validation accordée si `score >= 75%`.
  - Fallback hors-ligne : analyse sémantique par sac de mots-clés normalisés.
- **Génération de la note de raisonnement clinique (`generateReasoningNote`)** :
  Organisée strictement en 4 sections cliniques avec parseur de mémo optimisé (`.reasoning-callout-quote`) :
  1. `🎯 PIÈGE CLINIQUE & ANALYSE DE L'ERREUR` : explication du piège et de la confusion médicale.
  2. `📋 JUSTIFICATION PROPOSITION PAR PROPOSITION (EXHAUSTIVE & COMPLÈTE)` : analyse systématique de TOUTES les options (A, B, C, D, E) avec texte intégral et justification de véracité.
  3. `🩺 DÉMARCHE DE RAISONNEMENT & CONDUITE CLINIQUE` : maître-symptôme, impact de l'âge de l'enfant, diagnostics différentiels.
  4. `💡 RÈGLE D'OR & MÉMO CONCOURS` : moyen mnémotechnique percutant pour le concours.

---

### 3.3. Affichage Complet des Erreurs (`formatQuestionMistakeRecap`)
Lorsqu'une réponse est incorrecte (dans la modale d'erreur ou dans le carnet) :
1. **Énoncé complet** : Cas clinique intégral (avec stéthoscope) + Question médicale intégrale mise en forme avec le parseur intelligent.
2. **Affichage adapté selon le format de question** :
   - **Pour les QCM / QCU** : Suppression du bloc comparatif supérieur redondant (« Ma réponse » / « Bonne(s) réponse(s) ») afin de ne pas dupliquer l'information. L'interface affiche directement la liste exhaustive des propositions (A à E) avec code couleur et badges :
     - 🔴 `Mon choix (Faux)` avec fond et bordure rouge (`opt-row-wrong`)
     - 🟢 `Mon choix (Juste)` avec fond et bordure verte (`opt-row-correct-chosen`)
     - 🟢 `Réponse juste attendue` avec bordure verte (`opt-row-correct-missed`)
     - ⚪ `Distracteur faux` neutre (`opt-row-neutral`)
   - **Pour les CROQ (questions rédactionnelles)** : Conservation du bloc comparatif en 2 boîtes :
     - ❌ `Votre proposition :` texte saisi par l'étudiant avec badge de score.
     - ✅ `Réponse type officielle :` réponse de référence concours découpée et structurée.
3. **Explication officielle de cours** : Encadré dédié reprenant `question.explanation` structuré avec titres, puces et sauts de ligne aérés.
4. **Surbrillance en direct dans l'arène** : Les cartes de l'arène sont immédiatement colorées (`wrong-highlight` en rouge, `correct-highlight` en vert).

---

### 3.4. Sélection Multiple Systématique
- Toutes les questions permettent de cocher librement une ou plusieurs options (A, B, C, D, E) simultanément via `toggleOptionSelection`.
- Le bouton de validation est activé dès qu'au moins une proposition est sélectionnée.

---

### 3.5. Explication Directe en Arène (`#arena-explanation-box`)
- Dès qu'une réponse est validée avec succès, l'explication officielle issue de la base de données s'affiche directement dans l'arène sous la bannière de succès, permettant un rappel immédiat avant de passer à la question suivante.

---

### 3.6. Carnet de Raisonnement IA : Tri Multi-Critères & Modes de Vue (`view-notebook`)
- **Tri Multi-Critères Complet (Croissant & Décroissant)** :
  - **Critères disponibles (`notebookSortBy`)** :
    - 📅 **Date de la faute (`date`)** : Tri par horodatage de la dernière tentative (`latestTimestamp`).
    - ⚠️ **Nombre d'erreurs (`mistakes`)** : Tri par nombre cumulé de fautes (`totalMistakes = Math.max(attemptsCount, stats.mistakes)`).
    - 📚 **Cours (`chapter`)** : Tri alphabétique des chapitres de pédiatrie.
    - 🎯 **Score d'évaluation CROQ (`score`)** : Tri par score obtenu pour cibler les questions les plus difficiles.
  - **Inversion de l'ordre en 1 clic (`notebookSortOrder`)** :
    - Bouton interactif `#btn-toggle-sort-order` basculant instantanément entre **Décroissant ⬇** (Max ➔ Min) et **Croissant ⬆** (Min ➔ Max).
- **Deux Modes d'Affichage Complémentaires (`notebookViewMode`)** :
  - **Mode Par cours (`chapter`)** : Regroupement par cours sous forme d'accordéons pliables/dépliables, avec compteurs de questions, d'analyses IA et de total des fautes par cours (`⚠️ X fautes`).
  - **Mode Liste continue (`flat`)** : Liste directe de toutes les questions du carnet classées globalement avec badge de rang (`#1`, `#2`, `#3`...).
- **Accordéons Interactifs & Repliage Multi-Niveaux** :
  - **Groupes de cours pliables (`.notebook-chapter-group`)** : Clic sur l'en-tête de cours pour masquer/afficher toutes ses questions.
  - **Fiches de questions individuelles pliables (`.grouped-question-card`)** : Clic sur l'en-tête pour replier la fiche en une prévisualisation compacte (`.question-collapsed-preview`).
  - **Bouton Maître « Tout replier / Tout déplier » (`.notebook-toggle-all-btn`)** : Replie ou déplie instantanément l'intégralité des chapitres et questions.
- **Barre de recherche & synthèse dynamique** :
  - Recherche instantanée par mot-clé sur énoncés, propositions, explications et raisonnements IA.
  - Synthèse `#notebook-summary-bar` reflétant le nombre de questions, d'analyses et le rappel du tri actif.

---

### 3.7. Suivi du Progrès d'Étude & Infographies Analytiques (`view-stats` & `src/services/studyTracker.js`)
La vue dédiée `view-stats` offre un tableau de bord analytique complet :
- **Chronométrage Intelligent & Gestion des Sessions (`StudyTracker`)** :
  - **Démarrage automatique** : Au chargement de chaque question dans l'arène (`loadNextArenaQuestion`), le chronomètre s'active.
  - **Pause automatique** : Si l'utilisateur change d'onglet ou verrouille son téléphone (`visibilitychange` / `document.hidden`), ou après 2 minutes d'inactivité, le chronomètre se met en pause.
  - **Détection des sessions** : Une nouvelle session d'étude est automatiquement comptabilisée dès qu'une pause dépasse 5 minutes (`SESSION_GAP_THRESHOLD_MS = 5 * 60 * 1000`).
  - **Plafonnement de sécurité** : Chaque question est plafonnée à 180 secondes maximum pour éviter toute dérive statistique.
- **Métriques Héroïques Périodiques (7 KPI Cards contextualisées)** :
  1. 🔥 **Study Streak** : Série de jours consécutifs d'entraînement, record historique et validation du travail accompli.
  2. 📝 **Questions Faites (`#kpi-total-questions`)** : Volume strict de questions répondues sur la période active avec détail (`X justes • Y fautes`).
  3. 🎯 **Taux de Précision (`#kpi-accuracy-pct`)** : Pourcentage de bonnes réponses calculé strictement sur la période (`correct / total * 100`).
  4. ✨ **Réussite 1er Passage (`#kpi-first-pass-pct`)** : Pourcentage de réussite lors de la première confrontation à une question (`pedia_first_pass_records_v2`).
     - **Reconstruction Option B** : L'amorçage initial croise `queueEngine.stats` et le carnet `reasoningNotes`. Toute question ayant au moins une faute (`st.mistakes > 0`) est identifiée comme ratée à la découverte (`false`). Toute question maîtrisée sans faute (`st.current > 0 && st.mistakes === 0`) est identifiée comme réussie (`true`). Les questions non entamées sont exclues.
     - **Affichage contextuel** : Si 0 question inédite sur la période, l'indicateur affiche `--%` et `0 inédit (que des révisions)`.
  5. ⏱️ **Temps d'Étude (`#kpi-total-time`)** : Temps exact passé sur la période (format `Xh Ym` ou `Xm Ys`) et nombre de sessions actives.
  6. ⚡ **Vélocité Moyenne (`#kpi-avg-speed`)** : Vitesse moyenne en secondes/QCM avec décomposition justes vs fautes.
  7. ⏳ **Temps Nécessaire pour Terminer (`#kpi-card-finish-time`)** :
     - **Onglet « Aujourd'hui »** : Temps restant pour achever l'objectif du jour (`remainingToday = Math.max(0, dailyTarget - todayTracker.count)` multiplié par la vitesse). S'actualise instantanément après chaque réponse.
     - **Autres onglets (« 7 jours », « 30 jours », « Tout », « Personnalisé »)** : Affiche à la fois le **temps par jour** et le **temps total** : `${formattedDailyTime}/j • ${formattedTotalTime} total`.
- **Sélecteur Temporel Multi-Périodes avec Navigation Rétroactive (`stats-range-toggle` & `stats-day-stepper-wrap`)** :
  - **Navigation jour par jour (`stats-day-stepper-wrap`)** : Boutons précédent/suivant et bouton central pour naviguer dans l'historique (« Hier », « Avant-hier », dates calendaires) et réinitialiser à « Aujourd'hui » en 1 clic.
  - **7 jours / 30 jours / Tout / Personnalisé 📅** : Filtres temporels glissants ou intervalle libre avec panneau rétractable `[Du] [Au]`.
- **Heatmap d'Activité Style GitHub (60 à 90 jours)** :
  - Grille SVG responsive de 7 lignes x 9 colonnes avec 5 paliers d'intensité de couleur (`#121d33` neutre, `#064e3b`, `#047857`, `#10b981`, `#00d4ff` intensif).
- **Graphique Combiné SVG Interactif (Bilan Journalier)** :
  - Barres empilées par date : Émeraude pour les réponses justes, Rose pour les fautes, avec courbe ambre de vitesse de réponse (secondes/QCM).
- **Projection Dynamique Concours J-28 (10/11)** :
  - Cadence observée (QCM/jour actif) et estimation de la date d'achèvement de l'ensemble du programme.
- **Suivi des Questions par Cours (`#stats-course-tracker-box`)** :
  - Deux modes commutables : **« Sur la période »** (volume, ratio justes/fautes, vitesse) vs **« Tous les cours (35) »** (complétion globale avec barres multi-segments).
  - Champ de recherche instantanée en direct (`#course-tracker-search`).
- **Journal Quotidien Détaillé (`renderStatsTimeline`)** :
  - Timeline ordonnée du plus récent au plus ancien listant exclusivement les jours d'entraînement de la période active.

---

### 3.8. Chronomètre & Suivi du Temps par Leçon (`src/services/lessonTracker.js` & `view-stats`)
- **Navigation Horizontale par Sous-Pages (`stats-subnav-pills`)** :
  - Bascule instantanée entre **Statistiques QCM** (`#stats-subpage-qcm`) et **Chronomètre Cours** (`#stats-subpage-lessons`), éliminant tout défilement vertical excessif.
  - Transitions glissantes CSS (`slide-from-left` et `slide-from-right`).
  - Pill chrono live dans l'onglet affichant le décompte en direct (`#subnav-active-lesson-time`) lorsqu'un chronomètre tourne.
- **Moteur de Chronométrage Persistant (`LessonTracker`)** :
  - Calcul persistant par delta d'horodatage (`startTimestamp` & `accumulatedMs`) : le temps continue de tourner en tâche de fond même si l'étudiant quitte la page ou ferme l'application.
  - Enregistrement des sessions sous `pedia_lesson_sessions_v1` et synchronisation Firestore.
  - Sélecteur intelligent filtrable parmi les 35 chapitres ou saisie 100% libre.
- **Mini-Badge Flottant dans le Header (`#active-lesson-header-badge`)** :
  - Visible sur tous les écrans dès qu'un chronomètre est actif, avec voyant vert pulsant, libellé abrégé et décompte digital. Clic redirigeant vers la sous-page Chronomètre.

---

### 3.9. Système de Mises à Jour Automatiques & GitHub Releases (`src/services/updateService.js` & CI/CD)
- **Service d'Orchestration des Mises à Jour (`UpdateService`)** :
  - Version déclarée : `CURRENT_APP_VERSION = '1.4.0'` synchronisée avec `package.json` et `build.gradle` (`versionCode 9`).
  - Comparaison sémantique universelle (`compareVersions`) ignorant les préfixes `v`.
  - Interrogation de l'API GitHub Releases (`https://api.github.com/repos/lkmqji/qcm-p-diatrie/releases/latest`) avec cooldown de 4 heures (`pedia_last_update_check_ts`).
  - Extraction de l'asset `.apk` direct (`PediaDrill.apk`). En environnement natif Android Capacitor, l'URL est ouverte via `_system` pour lancer le gestionnaire de téléchargement Android natif.
- **Interfaces Dédiées** :
  - Pastille verte pulsante sur l'icône Paramètres (`#badge-update-available`).
  - Carte Mises à Jour dans la modale Paramètres (`#modal-settings`) avec bouton de vérification manuelle.
  - Modale dédiée `#modal-app-update` avec comparatif de version, notes de version et bouton « Télécharger l'APK ».
- **Pipeline CI/CD Automatisé (`.github/workflows/build-and-release.yml`)** :
  - Déclencheurs : Push d'un tag git `v*` ou déclenchement manuel `workflow_dispatch`.
  - Environnement : Ubuntu Latest, Node.js 22, Java JDK 21 Temurin, Android SDK Platform 36 (build-tools 36.0.0 via `setup-android@v4`), Gradle Wrapper 9.2.0.
  - Compile le bundle web, synchronise Capacitor, compile `:app:assembleDebug`, copie sous `PediaDrill.apk` et publie une Release GitHub avec l'APK attaché.

---

### 3.10. Moteur de Formatage Médical Intelligent (`formatMedicalContent`)
- **Dégel des justifications de propositions (ex: `A-Vrai`, `A/ Vrai`, `B : Faux`, `1- Vrai`)** : Détection et conversion en listes à puces avec badges en gras (`- **A) Vrai** :`).
- **Dégel des colonnes multi-espaces de diapositives** : Détection des énumérations séparées par de multiples espaces insécables (`\u00A0`).
- **Séparation des phrases compactées** : Détection des mots et phrases collées sans espace (`(TCA).Amyotrophie`, `assurésB-Vrai`, `vaccinéContamination`).
- **Dégel des puces (`➢`, `⁃`, `•`, `►`, `▶`, `✔`, `✓`, `-`, `*`)** : Conversion en listes HTML `<ul class="medical-bullet-list">`.
- **Dégel des énumérations d'énoncés (ex: `1-`, `2-`)** : Listes ordonnées avec badges `<ul class="medical-num-list">`.
- **Mise en valeur des en-têtes médicaux** : Marqueurs clés (`Rappel :`, `Définition :`, `Remarque :`, `Source :`, `CAT :`, `Traitement :`, `Signes cliniques :`, `Biologie :`, `Physiopathologie :`) découpés avec badges thématiques `<div class="medical-section-title">` et icônes Lucide.
- **Application omni-présente** : Arène (`#arena-question-text`, `#arena-clinical-case-text`, `#arena-explanation-text`), Modale d'erreur (`formatQuestionMistakeRecap`) et fiches du Carnet.

---

### 3.11. Iconographie & Clichés Médicaux Protégés (Floutés par Défaut)
- **Objectif mnésique** : Éviter que les clichés d'imagerie ou radiographies ne divulguent prématurément le diagnostic.
- **Composant UI (`renderQuestionMedia`)** :
  - **État Rétracté & Flouté (`.medical-media-card.is-collapsed`)** : Miniature carrée compacte de **74x74 px** (64x64 px sur smartphone), flou prononcé `filter: blur(8px) brightness(0.72)` et overlay interactif `Toucher pour afficher`.
  - **État Déplié & Net (`.medical-media-card.is-expanded`)** : Largeur maximale **340 px** et hauteur **250 px** (210 px sur smartphone), image nette (`filter: none`), deux boutons de fermeture dédiés (bouton circulaire flottant `✕` et bouton bas `✕ Fermer la photo`).
  - **Visionneuse Plein Écran HD (Lightbox)** : Modal plein écran `#media-lightbox-modal` avec flou d'arrière-plan, fermable au clic ou via la touche `Échap`.

---

### 3.12. Masquage du Titre de Chapitre & Détection Canonique des Sessions d'Annales (`#arena-chapter-title`)
- **Objectif pédagogique** : Éviter que l'étudiant ne déduise le diagnostic d'un cas clinique par simple lecture de la spécialité pédiatrique (*Cardiologie*, *Infectiologie*...).
- **Fonctionnement du flou interactif** :
  - Par défaut au chargement (`loadNextArenaQuestion`), le badge passe en état masqué (`is-blurred`).
  - Le texte du cours est flouté (`filter: blur(6px); opacity: 0.38; user-select: none`) avec pastille `Cours masqué`.
  - Clic manuel (`window.toggleArenaChapterTitle()`) pour révéler ou reflouter à tout moment.
  - Défloutage automatique dès que l'étudiant répond (succès ou erreur) ou consulte l'historique (`historyCursor >= 0`).
- **Pastille de date et session du QCM (`.question-date-pill`) & Normalisation Canonique (`extractQuestionDateOrSession`)** :
  - Intégrée au sein de `.chapter-title-text`, floutée en parfaite synchronisation avec le nom du cours.
  - **Prise en charge exhaustive des 3 formats canoniques de sessions médicales** :
    - **Session Principale (`P [Année]`)** : Reconnaissance et normalisation de `P [Année]`, `P1 [Année]`, `P2 [Année]`, `Principale [Année]`, y compris avec années abrégées sur 2 chiffres (ex: `P 21` $\rightarrow$ `P 2021`, `P 2022`).
    - **Concours de Résidanat (`Résidanat [Ville] [Année]`)** : Reconnaissance de `Résidanat [Année]`, `Résidanat Alger [Année]`, `Residanat [Année]`.
    - **Session de Rattrapage (`Rattrapage [Année]`)** : Reconnaissance de `Rattrapage [Année]`, `Ratrapage [Année]`, `R [Année]` (ex: `R 2020` $\rightarrow$ `Rattrapage 2020`).
    - **Épreuves facultaires & Sources officielles** : Support des mentions `EMD [Année]` et des sources datées de cours (`Diapo 2024`, `Diapositive 2026`, `iKb 2024`).
  - **Filtrage strict anti-faux-positifs** : Exclusion stricte des abréviations anthropométriques ou biologiques médicales (`P50`, `P3`, `P 8 kg` pour le poids, `FR 68` pour la fréquence respiratoire, `CRP 120`, ou `rattrapage vaccinal` sans année).
  - **Suppression totale du repli factice** : Élimination définitive de l'ancien placeholder `P? 20??`. Si aucune session ou date n'est mentionnée pour la question, la pastille `.question-date-pill` n'est pas injectée dans le DOM, assurant un rendu sobre et épuré (`Pédiatrie — [Nom du cours]`).

---

### 3.13. Tuteur IA Interactif en Direct dans l'Arène & Mémoire de Conversation par Question (`#arena-ai-chatbox`)
- **Objectif clinique** : Permettre à l'étudiant de dialoguer en temps réel avec Gemini Flash sur la question active sans quitter l'Arène.
- **Protection Anti-Spoiler du Nom de Cours (`.chatbox-chapter-blurred`)** :
  - Tant que la question n'est pas répondue, l'intitulé du cours dans le message d'accueil et le sous-titre du chatbox est automatiquement flouté (`filter: blur(5.5px); opacity: 0.38`). Défloutage instantané dès la réponse.
- **Composants UI** :
  - Bouton circulaire flottant néon `#btn-arena-ai-chat` ancré en bas à droite avec dégradé cyan/violet et icône étincelle `sparkles`.
  - Panneau en verre dépoli avec amorces cliniques en 1 clic : 💡 *Démarche diagnostique*, 🔍 *Justification clé*, ⚠️ *Piège concours*, 💊 *Traitement & CAT*.
- **Persistance des conversations par question (`questionChatHistories[uid]`)** :
  - Les échanges avec le tuteur sont indexés par identifiant de question. Lors de la navigation dans l'historique ou du retour sur un QCM, la conversation spécifique à cette question est fidèlement restaurée.

---

### 3.14. Nettoyeur Universel de Formules & Élimination du LaTeX (`cleanLatexMath`)
- **Problématique résolue** : Élimine les syntaxes cryptiques générées par réflexe par les LLMs (`\text{ g/dl}`, `\mathbf{3}\text{ kg}`, `\times`, `\frac{A}{B}`).
- **Conversions appliquées** :
  - Déballage de texte : `\text{...}`, `\mathrm{...}`, `\operatorname{...}` $\rightarrow$ texte brut.
  - Typographie : `\mathbf{...}` et `\textbf{...}` $\rightarrow$ `**...**` (gras Markdown).
  - Opérateurs mathématiques : `\times` $\rightarrow$ `×`, `\cdot` $\rightarrow$ `·`, `\div` $\rightarrow$ `÷`, `\pm` $\rightarrow$ `±`, `\leq` $\rightarrow$ `≤`, `\geq` $\rightarrow$ `≥`, `\neq` $\rightarrow$ `≠`, `\approx` $\rightarrow$ `≈`, `\to` $\rightarrow$ `→`.
  - Unités & symboles : `\mu` / `\mum` $\rightarrow$ `µ` / `µm`, fractions `\frac{A}{B}` $\rightarrow$ `(A / B)`, racines `\sqrt{A}` $\rightarrow$ `√(A)`.
  - Exposants & indices : `^{2}` $\rightarrow$ `²`, `_{2}` $\rightarrow$ `₂`, `\^\\circ C` $\rightarrow$ `°C`.
  - Suppression des balises englobantes `$$...$$`, `$..$`, `\[...\]`, `\(...\)`.
- **Application transverse** : Dès réception API dans `src/services/gemini.js`, consigne négative dans les prompts système, et filet de sécurité dans `formatMedicalContent` et `formatReasoningNote`.

---

### 3.15. Navigation dans l'Historique des 5 Derniers QCM & Explications IA Persistantes (`view-arena`)
- **Buffer Glissant des 5 Derniers QCM (`answeredHistory`)** :
  - À chaque réponse validée ou échouée, un instantané complet (`snapshot`) est injecté en tête de tableau, plafonné à **5 questions maximum**.
  - Capture : `question` clonée de manière immuable, `userAnswerLetters`, `isCorrect`, `score` (CROQ), `explanation` et `timestamp`.
- **Curseur de Navigation (`historyCursor`)** :
  - `historyCursor = -1` : Mode Drill Actif (question tirée de la file dynamique).
  - `historyCursor = 0` : Dernier QCM répondu (`QCM -1`).
  - `historyCursor = 1..4` : QCM répondus antérieurs jusqu'à 5 questions en arrière.
  - **Isolation stricte du SRS** : Aucun impact sur la file `queueEngine.queue`, aucun appel à `handleSuccess`/`handleFailure`, aucun impact sur le compteur du jour (`todayTracker`).
- **Interface & Rendu en Lecture Seule (`renderHistoryQuestion`)** :
  - Barre supérieure avec flèches de navigation `#btn-history-prev` / `#btn-history-next` et badge `Précédent X/N` en thème ambré (`is-past`).
  - Bannière dorée `#arena-history-consult-banner` avec bouton « Reprendre le drill ➔ ».
  - Options verrouillées en lecture seule avec surbrillance explicite (vert pour justes, rouge pour fautes).
  - **Carte d'Explication Clinique IA Persistante (`#arena-ai-explanation-box`)** : Restitue automatiquement l'explication IA structurée depuis le cache local (`pedia_ai_explanations_cache`), le Carnet ou Firestore.
  - **Bouton Régénérer en 1 clic (`#btn-arena-ai-regenerate`)** : Permet de relancer l'analyse Gemini Flash à tout moment.
  - **Génération à la demande** : Bouton `[Générer l'explication clinique IA]` si aucune explication n'avait été générée lors du premier passage.
  - **Sécurisation Anti-Race Conditions (`targetUid`, `targetQuestion`)** : Empêche toute désynchronisation entre l'explication IA et la question affichée lors des clics rapides.
  - **Validation sémantique (`isExplanationMatchingQuestion`) & Purge silencieuse au démarrage (`scrubCorruptedAiExplanations`)** : Nettoie toute note corrompue ou orpheline dès le lancement.
- **Raccourcis Clavier Dédiés** : <kbd>◀</kbd> reculer dans l'historique, <kbd>▶</kbd> avancer, <kbd>Entrée</kbd> reprendre le drill actif.

---

### 3.16. Barre d'Outils Visuelle & Annotations UI (Agentation)
- **Intégration Standalone (`agentation.bundle.js`)** :
  - Chargé via `<script src="agentation.bundle.js"></script>`, auto-montage sur `#agentation-root`.
  - Annotation visuelle en direct avec capture automatique du sélecteur CSS, hiérarchie DOM et styles calculés.
  - Mode Layout (`L`), pause micro-animations (`P`), export Markdown structuré (`C`) et nettoyage (`X`).
  - Interconnexion avec le serveur MCP local `agentation-mcp` (`mcp_config.json`).

---

## 4. Spécificités UI, Responsive & Optimisation Mode Portrait (Smartphones & Tablettes)

- **Design System Cyber-Médical** : Palette sombre (`#070b14` fond, `#121d33` cartes, `#00d4ff` cyan, `#10b981` émeraude, `#ef4444` rose, `#f59e0b` ambre, `#8b5cf6` violet).
- **Typographie** : `Outfit` (titres, métriques, badges numérotés) et `Inter` (corps médical, sémiologie, listes à puces), interligne aéré `1.6`.

### 4.1. Architecture Adaptative Spécifique au Mode Portrait (`@media (max-width: 768px), (orientation: portrait) and (max-width: 850px)`)
- **Header Global (`.app-header`)** :
  - Masquage automatique du sous-titre `.brand-subtitle` pour libérer l'espace horizontal sur les écrans étroits (360px - 412px).
  - Compactage du logo `.brand-logo` à `34px × 34px` et réduction proportionnelle du titre `.brand-title` à `1.15rem`.
  - Boutons d'actions `.header-actions` resserrés avec gap de `4px` et boutons `.icon-btn` tactiles à `34px × 34px`.
  - Bouton Google (`.btn-google-header`) : masquage du texte `Compte Google` pour n'afficher que l'icône Google officielle.
  - Badge profil (`.user-profile-badge`) : masquage du prénom pour afficher uniquement l'avatar rond (`20px`) avec le point vert de synchronisation cloud en temps réel.
  - Mini-chronomètre flottant (`#active-lesson-header-badge`) : masquage de l'intitulé de cours et conservation de l'icône timer, de l'horloge digitale et de la pulsation.
- **Arène de Quiz (`.arena-top-bar`) — Layout Double Étage Symétrique** :
  - **Étage 1 (`.arena-top-bar-left`)** : Pleine largeur (`justify-content: space-between`), positionnant le bouton retour à gauche et le module d'historique (`.arena-history-nav`) à droite.
  - **Étage 2 (`.arena-pills-wrap`)** : Grille CSS à 3 colonnes égales (`grid-template-columns: repeat(3, 1fr)`), centrant les pastilles `QCU/QCM`, `Progression 0/3` et `Objectif quotidien` avec équilibre visuel parfait.
  - Barre d'action basse (`.arena-actions-bar`) : Masquage du rappel des touches clavier physiques (`#keyboard-shortcuts-hint`), boutons de validation et d'évaluation à 100% de largeur pour une validation ergonomique au pouce.
- **Suivi & Statistiques (`view-stats`) — Défilement Horizontal Tactile** :
  - Barre supérieure `.stats-top-bar` organisée en 2 rangées : ligne 1 (`.stats-top-bar-header`) avec retour Dashboard et titre, ligne 2 (`.stats-range-wrap`) avec conteneur de défilement horizontal fluide `.stats-range-toggle` (`overflow-x: auto; white-space: nowrap; -webkit-overflow-scrolling: touch; scrollbar-width: none`).
  - Onglets de sous-pages (`#stats-subnav-toggle`) et filtres de cours (`.course-tracker-pills`) équilibrés en deux boutons de largeur égale (50%/50%).
  - Grille analytique des 7 KPI (`.stats-kpi-grid`) configurée en 2 colonnes (`repeat(2, 1fr)`) sur petits écrans pour un aperçu synthétique sans défilement vertical excessif.
- **Carnet de Raisonnement Clinique (`view-notebook`)** :
  - En-tête `.notebook-top-bar` compacté avec titre aligné à droite et bouton retour concis.
  - Barre d'outils `.notebook-toolbar` restructurée : recherche et sélecteur de chapitre pleine largeur, groupe de tri adaptatif avec sélecteur flex, et bascule de mode d'affichage « Par cours » / « Liste continue » en 50%/50%.
- **Modales & Tiroirs en Mode Bottom-Sheet** :
  - Alignement des modales en bas d'écran (`.modal-overlay { align-items: flex-end; }`) avec coins supérieurs arrondis (`border-radius: 20px 20px 0 0`) et hauteur maîtrisée (`max-height: 90dvh`).
  - **Modale de sélection des cours (`#modal-chapters`)** :
    - Stylisation de `.chapter-select-item` avec hauteur minimale tactile de 44px (recommandation WCAG/Material Design), surbrillance active cyan et décompte QCM.
    - Barre de filtre `.modal-chapters-actions-bar` combinant recherche et bouton « Tout cocher ».
    - Bouton d'action principal « Valider la sélection » fixé au bas de la modale (`position: sticky; bottom: 0; z-index: 5`) avec ombre protectrice pour une validation immédiate sans scroller les 35 cours.
- **Tuteur IA (`.arena-ai-chatbox`)** :
  - Tiroir pleine largeur (`100vw × 78dvh`) ancré au bas de l'écran avec pastilles de suggestions cliniques (`.chatbox-chips`) défilables horizontalement.

---

## 5. Synchronisation Multi-Appareils, Firebase & Architecture Anti-Dépassement de Quota

- **Fournisseur & Services Cloud** : Firebase Auth (Google Provider) & Cloud Firestore (Base de données NoSQL distribuée).
- **Authentification Hybride (Web / Mobile)** :
  - **Sur Android (APK natif)** : Utilisation de `@capacitor-firebase/authentication` (version 8.5.2) qui déclenche la boîte de dialogue native Android Google Play Services (`FirebaseAuthentication.signInWithGoogle()`). Cela évite les ouvertures de navigateur externe et résout l'erreur `missing initial state`. Le jeton d'identité `idToken` est ensuite transmis à `signInWithCredential` du SDK Web pour maintenir la session Firestore active.
  - **Sur Web / Desktop (Vercel)** : Utilisation de `window.firebase.auth().signInWithPopup(provider)` avec fallback `signInWithRedirect`.
- **Architecture Anti-Dépassement de Quota Firestore (Limite stricte de 1 Mo / 1 048 576 octets)** :
  - **Problématique résolue** : Cloud Firestore rejette formellement toute écriture dépassant 1 Mo par document. Lorsque l'étudiant accumule plus de ~120 notes d'analyse d'erreur IA, le document monolithique unique `pedia/progress` dépassait 1,12 Mo.
  - **1. Allègement sémantique des notes (`slimNote` / `hydrateNote`)** :
    - `slimNote(note)` : Purgée de tous les champs statiques déjà présents dans `PEDIA_QUESTIONS` (`questionText`, `clinicalCase`, `options`, `officialExplanation`, `media_urls`), une note ne conserve que les données générées par la tentative de l'étudiant (`id`, `questionUid`, `userAnswer`, `userAnswerLetters`, `correctAnswer`, `score`, `isCroq`, `reasoningNote`, `modelUsed`, `timestamp`).
    - L'empreinte passe de ~7 Ko à ~1.2 Ko (**réduction de 85% à 90%**).
    - `hydrateNote(note, questionsList)` : Dès la lecture ou le rendu dans l'interface, chaque note est enrichie à la volée avec l'objet question complet de `allQuestions` (aucun impact visuel, intégrité totale).
    - `sanitizeReasoningNotesStorage()` : Migration automatique en mémoire locale (`localStorage`) dès le démarrage de l'app, libérant plus de 800 Ko sur l'appareil.
  - **2. Partitionnement par paquets de 50 notes (`Chunked Firestore Storage`)** :
    - **Document `pedia/progress` épuré** : Stocke uniquement l'état SRS (`queue`, `cursor`, `selectedChapterIds`, `selectedChaptersUpdatedAt`, `totalMistakesCount`, `todayTracker`, `userEmail`, `notesCount`, `notesChunksCount`) et compacte `stats` (omission des QCM non touchés). Le champ `reasoningNotes` y est vidé (`[]`) pour écraser le vieux payload lourd de Firestore. Poids : **~15 à 20 Ko (50 fois sous la limite)**.
    - **Documents de partitionnement `pedia/notes_0`, `notes_1`, `notes_2`...** : Chaque document contient 50 notes allégées maximum, pesant ~50 à 75 Ko (**15 fois sous la limite de 1 Mo**).
    - **Écriture atomique (`db.batch()`)** : Sauvegarde conjointe du document de progression et des paquets de notes en une seule transaction réseau.
    - **Nettoyage automatique** : Suppression automatique des anciens paquets orphelins si le nombre total de notes diminue.
    - **Récupération parallèle (`fetchRemoteNotes`)** : Téléchargement simultané de tous les paquets via `Promise.all` avec fallback sur l'ancien format si présent.
- **Protocole de fusion bidirectionnelle (`mergeStates`)** :
  - Compare l'horodatage client et serveur.
  - Fusionne les compteurs de maîtrise au maximum (`Math.max(local, remote)`).
  - Déduplique l'ensemble des notes par identifiant unique stable sans suppression intempestive.
  - Synchronisation des cours sélectionnés : compare `local.selectedChaptersUpdatedAt` vs `remote.selectedChaptersUpdatedAt`, la sélection la plus récente l'emporte et s'applique dynamiquement.
- **Déclencheurs de synchronisation** :
  - **Auto-push temporisé** (`triggerAutoPush`, délai 1 500 ms) après chaque réponse validée ou erreur enregistrée.
  - **Pull automatique à la connexion** (`syncOnLogin`).
  - **Écoute en temps réel** (`setupFirestoreListener`) via `onSnapshot` sur le document `progress` pour répercuter instantanément les modifications effectuées depuis un autre appareil (PC ↔ Smartphone).
  - **Boutons manuels de sauvegarde et récupération** dans la modale `#modal-sync`.

---

## 6. Architecture Mobile Native Android & Capacitor

### 6.1. Configuration Capacitor (`capacitor.config.json`) & Android
- **Package Id** : `com.pediadrill.app`
- **Nom de l'application** : `PédiaDrill`
- **Version native** : `versionName 1.4.0` (`versionCode 9`)
- **Empreinte SHA-1 (Debug Keystore Gradle & GitHub Actions)** : `87:31:A9:DF:46:90:4F:A3:3C:C0:79:DC:45:C5:BD:69:95:0B:A2:76`
- **Empreinte SHA-256 (Debug Keystore Gradle & GitHub Actions)** : `98:3A:55:73:39:BC:3B:5F:0C:BC:6C:3F:33:60:DF:E6:06:59:96:0C:74:BC:A0:BC:CB:50:D0:41:80:EF:C9:6E`
- **Keystore unifié** : `android/app/debug.keystore` (Alias : `AndroidDebugKey`, mot de passe `android`, garantissant une empreinte cryptographique identique entre les compilations locales et la CI/CD GitHub Actions).
- **Dossier web racine (`webDir`)** : `dist`
- **Fichier de configuration Firebase Android** : `android/app/google-services.json` (Projet `qcm-pediatr`, Package `com.pediadrill.app`).
- **Plugin Gradle Google Services** : `com.google.gms.google-services` (version `4.4.4`) activé automatiquement à la présence de `android/app/google-services.json`.
- **Configuration des plugins Capacitor (`capacitor.config.json`)** :
  - `plugins.FirebaseAuthentication` : `skipNativeAuth: false`, `providers: ["google.com"]` (requis pour instancier le handler natif Android `GoogleAuthProviderHandler`).
- **Ressources natives Android (`strings.xml`)** : `default_web_client_id` explicitement déclaré avec l'ID client Web OAuth Google (`1028938391462-hfo44kaj789r1ruovt4b4v59he6jvarq.apps.googleusercontent.com`).
- **Dépendances natives** : `@capacitor/core` (8.5.3), `@capacitor/cli` (8.5.3), `@capacitor/android` (8.5.3), `@capacitor-firebase/authentication` (8.5.2).

### 6.2. Environnement Android Studio & Toolchain
- **Emplacement Android Studio** : `C:\Program Files\Android\Android Studio` (`bin\studio64.exe`).
- **JDK / JVM utilisée** : OpenJDK JBR 25 embarqué dans Android Studio (`C:\Program Files\Android\Android Studio\jbr`) ou JDK 21 Temurin en CI/CD.
- **Android SDK** : `C:\Users\Lenovo\AppData\Local\Android\Sdk` (plateformes `android-34`, `android-36`, `android-37.0` avec build-tools `34.0.0`, `35.0.0`, `36.0.0`).
- **Moteur Gradle** : Gradle 9.2 (`gradle-9.2.0-bin`), entièrement compatible avec Java 21/25 et Android Gradle Plugin (AGP 8.13.0).

### 6.3. Génération & Emplacements de l'APK
- **Script automatisé** : `build-apk.bat` (exécutable via `npm run build:apk`). Pipeline complet automatisé : 1) build bundle web (`build-bundle.cjs`), 2) sync native Capacitor (`npx cap sync android`), 3) compilation native Gradle (`:app:assembleDebug`) et copie sous `PediaDrill.apk`.
- **Cible Gradle optimisée** : `:app:assembleDebug` (permet de compiler directement l'application et de générer l'APK sans surcharge d'extraction d'annotations ou de construction d'AAR de bibliothèques).
- **Fichier APK racine (accès direct utilisateur)** : `PediaDrill.apk` (taille : ~7.8 Mo).
- **Fichier APK de build Android** : `android/app/build/outputs/apk/debug/app-debug.apk`.
- **Ouverture dans l'IDE Android Studio** : `npm run open:android` ou lancement de `studio64.exe android`.

---

## 7. Pipeline de Compilation, Déploiement & Intégrité

- **Compilation Web PWA** : `node build.cjs` (prépare `dist/index.html` autonome avec datasets, styles et scripts).
- **Déploiement Web Cloud (Vercel & GitHub)** :
  - **Fichier servi par Vercel** : Conformément à `vercel.json` (`"routes": [{ "src": "/(.*)", "dest": "/index.html" }]`), Vercel sert directement le fichier racine `index.html`.
  - **Assemblage obligatoire** : Toute modification apportée aux sources dans `src/` doit être compilée via `node build-bundle.cjs` qui synchronise à la fois `src/app.bundle.js`, `index.html` (racine pour Vercel) et `dist/index.html` (pour le build mobile et PWA).
  - **Protocole de validation syntaxique pré-déploiement** :
    1. Validation des sources : `node -c src/services/gemini.js`, `node -c src/services/queueEngine.js`, `node -c src/services/studyTracker.js`, `node -c src/services/lessonTracker.js`, `node -c src/services/firebaseSyncService.js`, `node -c src/services/updateService.js`, `node -c src/app.js`.
    2. Validation du bundle généré : `node -c src/app.bundle.js`.
    3. Validation des balises `<script>` intégrées dans `index.html` via script Node VM.
    4. Cela garantit un chargement sans erreur (`SyntaxError`) évitant le blocage de l'initialisation du DOM et des métriques.
- **Compilation Mobile Android (APK)** :
  1. `node build-bundle.cjs` : assemble le code client et synchronise le CSS dans `template.html`, `src/app.bundle.js` et `dist/index.html`.
  2. `npx cap sync android` : synchronise les assets web et plugins dans `android/app/src/main/assets/public/`.
  3. `build-apk.bat` : exécute `:app:assembleDebug` avec le JDK Android Studio et copie automatiquement l'APK généré sous `PediaDrill.apk` à la racine du projet.
- **Scripts `package.json` disponibles** :
  - `npm run build` : génération de `dist/`.
  - `npm run start` : prévisualisation locale du dossier `dist/` via `npx serve`.
  - `npm run build:apk` : build web + sync Capacitor + génération du fichier `.apk`.
  - `npm run open:android` : ouverture du projet natif dans l'interface graphique Android Studio.
