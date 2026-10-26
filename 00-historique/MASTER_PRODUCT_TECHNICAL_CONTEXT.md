# PédiaDrill — Master Product & Technical Context
*Dernière mise à jour : 2026-10-23 10:10:00 CET*
*Source unique de vérité technique et fonctionnelle du projet PédiaDrill.*

---

## 1. Vision du Produit & Résumé Exécutif
**PédiaDrill** est une Progressive Web App (PWA) médicale et autonome d'entraînement intensif au résidanat et aux examens de 5ème année de médecine en pédiatrie. Elle combine :
1. **Un moteur de répétition espacée adaptatif (Spaced Repetition System)** calibré pour l'ancrage mnésique concours.
2. **Une évaluation sémantique par Intelligence Artificielle (exclusivement Gemini 3.8 Flash)** pour noter les questions à réponses ouvertes courtes (CROQ / QROC) et formuler une méthode de raisonnement clinique approfondie.
3. **Une arène de quiz minimaliste sans distraction** avec support de la sélection multiple (A, B, C...) et affichage en temps réel des explications officielles.
4. **Un carnet de raisonnement clinique interactif** regroupé par chapitres avec fiches d'erreur complètes (énoncé, cas clinique, propositions colorées avec texte intégral, explication de cours et fiches IA).
5. **Une synchronisation multi-appareils (PWA / Mobile / Desktop)** adossée à Google Auth et Firebase Firestore.

---

## 2. Architecture Globale & Arborescence du Projet

```
qcm-p-diatrie/
├── 00-historique/
│   ├── historique_2026-10-18.md          # Journal quotidien des modifications horodatées
│   └── MASTER_PRODUCT_TECHNICAL_CONTEXT.md # Contexte technique global (source unique de vérité)
├── dist/                                  # Bundle de production prêt pour déploiement (Vercel / Web)
│   ├── index.html                        # Application complète autonome avec assets embarqués
│   ├── manifest.json                     # Manifeste PWA
│   ├── sw.js                             # Service Worker de cache hors-ligne
│   ├── icon-192.svg                      # Icône PWA 192x192
│   └── icon-512.svg                      # Icône PWA 512x512
├── src/
│   ├── data/
│   │   ├── chapters.js                   # Métadonnées des 35 chapitres de pédiatrie
│   │   └── questions.js                  # Base de données des questions (QCM & CROQ)
│   ├── services/
│   │   ├── gemini.js                     # Service IA Gemini 3.8 Flash (évaluation & raisonnement)
│   │   ├── queueEngine.js                # Algorithme de file active et répétition espacée
│   │   ├── studyTracker.js               # Suivi du progrès journalier, chronométrage & sessions QCM
│   │   ├── lessonTracker.js              # Chronomètre persistant et suivi du temps d'étude par leçon
│   │   ├── firebaseSyncService.js        # Auth Google & synchronisation bidirectionnelle Firestore
│   │   └── syncService.js                # Service de synchronisation générique
│   ├── app.js                            # Contrôleur d'interface, gestion des vues et événements
│   ├── app.bundle.js                     # Bundle JS client unifié (IIFE sans imports ES)
│   └── style.css                         # Feuille de styles principale (Design System médical)
├── template.html                         # Structure HTML et CSS embarqué pour la génération
├── index.html                            # Version racine autonome de l'application (4.4 MB)
├── build.cjs                             # Script de copie vers le dossier dist/
├── build-bundle.cjs                      # Script d'assemblage automatique (CSS, bundle JS, index.html)
├── vercel.json                           # Configuration de routage et headers de cache Vercel
├── manifest.json                         # Configuration PWA Web App Manifest
├── sw.js                                 # Service Worker (Cache-First / Stale-While-Revalidate)
└── package.json                          # Métadonnées du projet Node.js
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
  - Les erreurs (`handleAnswerFailure`) n'incrémentent plus ce compteur, garantissant que l'objectif journalier reflète fidèlement le nombre de validations acquises vers l'échéance de l'examen du 10/11.
- **Persistance locale & Cloud** : Tout l'état (`activeQueue`, `stats`, `cursor`, `reasoningNotes`, `todayTracker`, `selectedChapterIds`, `selectedChaptersUpdatedAt`) est sauvegardé dans `localStorage` sous la clé `pedia_drill_state_v1` et synchronisé via `FirebaseSyncService`.
- **Synchronisation multi-appareils des cours sélectionnés** : Chaque modification de la sélection des cours met à jour un horodatage précis (`selectedChaptersUpdatedAt`). Lors de la fusion d'états (`mergeStates`), la sélection la plus récente entre l'appareil local et le cloud est automatiquement retenue et appliquée, déclenchant la ré-initialisation dynamique de la file et la mise à jour immédiate de l'interface sur tous les écrans connectés.

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

### 3.4. Sélection Multiple Systématique
- La restriction sur les types de questions a été levée dans `toggleOptionSelection` : toutes les questions permettent de cocher librement une ou plusieurs options (ex: A + B + C) simultanément.
- Le bouton de validation est activé dès qu'au moins une proposition est sélectionnée.

### 3.5. Explication Directe en Arène (`#arena-explanation-box`)
- Dès qu'une réponse est validée avec succès, l'explication officielle issue de la base de données s'affiche directement dans l'arène sous la bannière de succès, permettant un rappel immédiat avant de passer à la question suivante.

### 3.6. Carnet de Raisonnement IA : Système de Tri Multi-Critères & Modes de Vue (`view-notebook`)
- **Tri Multi-Critères Complet (Croissant & Décroissant)** :
  - **Critères disponibles (`notebookSortBy`)** :
    - 📅 **Date de la faute (`date`)** : Tri par horodatage de la dernière tentative (`latestTimestamp`).
    - ⚠️ **Nombre d'erreurs (`mistakes`)** : Tri par nombre cumulé de fautes (`totalMistakes = Math.max(attemptsCount, stats.mistakes)`).
    - 📚 **Cours (`chapter`)** : Tri alphabétique des chapitres de pédiatrie.
    - 🎯 **Score d'évaluation CROQ (`score`)** : Tri par score obtenu pour cibler les questions les plus difficiles.
  - **Inversion de l'ordre en 1 clic (`notebookSortOrder`)** :
    - Bouton interactif `#btn-toggle-sort-order` basculant instantanément entre **Décroissant ⬇** (Max ➔ Min / Plus récent / Plus d'erreurs) et **Croissant ⬆** (Min ➔ Max / Plus ancien / Moins d'erreurs).
- **Deux Modes d'Affichage Complémentaires (`notebookViewMode`)** :
  - **Mode Par cours (`chapter`)** : Regroupement par spécialités médicales sous forme d'accordéons pliables/dépliables, avec compteurs de questions, d'analyses IA et de total des fautes par cours (`⚠️ X fautes`). Les chapitres eux-mêmes sont classés selon le critère et l'ordre sélectionnés.
  - **Mode Liste continue (`flat`)** : Liste directe et continue de toutes les questions du carnet classées de façon globale avec badge de rang (`#1`, `#2`, `#3`...). Ce mode permet d'accéder instantanément au Top national personnel des questions les plus échouées.
- **Badges contextuels sur chaque fiche de question** :
  - Badge de rang : `#N` (en mode continu).
  - Badge de fautes : `⚠️ X faute(s)` (`stat-mistakes`).

### 3.7. Suivi du Progrès d'Étude & Infographies Analytiques (`view-stats` & `src/services/studyTracker.js`)
La vue dédiée `view-stats` offre un tableau de bord analytique complet pour mesurer la progression vers le concours :
- **Chronométrage Intelligent & Gestion des Sessions (`StudyTracker`)** :
  - **Démarrage automatique** : Au chargement de chaque question dans l'arène (`loadNextArenaQuestion`), le chronomètre s'active.
  - **Pause automatique** : Si l'utilisateur change d'onglet ou verrouille son téléphone (`visibilitychange` / `document.hidden`), ou après 2 minutes d'inactivité, le chronomètre se met en pause.
  - **Détection des sessions** : Une nouvelle session d'étude est automatiquement comptabilisée dès qu'une pause dépasse 5 minutes (`SESSION_GAP_THRESHOLD_MS = 5 * 60 * 1000`).
  - **Plafonnement de sécurité** : Chaque question est plafonnée à 180 secondes maximum pour éviter toute dérive statistique si le terminal reste allumé sans interaction.
- **Métriques Héroïques Périodiques (6 KPI Cards contextualisées selon la plage temporelle choisie)** :
  1. 🔥 **Study Streak** : Série de jours consécutifs d'entraînement, record historique et validation du travail accompli aujourd'hui ou nombre de jours actifs sur la période.
  2. 📝 **Questions Faites (`#kpi-total-questions`)** : Volume strict de questions répondues au cours de la période sélectionnée (libellé dynamique : *Questions (Aujourd'hui)*, *Questions (7 jours)*, etc.) et sous-titre détaillé (`X justes • Y fautes`).
  3. 🎯 **Taux de Précision (`#kpi-accuracy-pct`)** : Pourcentage de bonnes réponses calculé strictement sur la période (`correct / total * 100` ou `--%` si 0 QCM sur la période).
  4. ✨ **Réussite 1er Passage (Inédit / Découverte) (`#kpi-first-pass-pct`)** : Pourcentage de réussite lors de la toute première confrontation à une question (`pedia_first_pass_records_v2`), calculé sur les questions découvertes pour la 1ère fois au sein de la période sélectionnée.
     - **Reconstruction Option B** : L'amorçage initial (`seedFirstPassFromExistingStats`) croise l'état de `queueEngine.stats` et le carnet d'erreurs IA `reasoningNotes`. Toute question ayant au moins une faute enregistrée (`st.mistakes > 0` ou présente dans le carnet) est identifiée comme ratée à la découverte (`false`). Toute question maîtrisée sans aucune faute (`st.current > 0 && st.mistakes === 0`) est identifiée comme réussie (`true`). Les questions encore non entamées sont exclues. En cours de jeu, chaque nouvelle découverte enregistre fidèlement le résultat live.
     - **Affichage contextuel** : En vue périodique ("Aujourd'hui", "7j", "30j", "Personnalisé") où aucune question inédite n'a été découverte, l'indicateur affiche clairement `--%` et `0 inédit (que des révisions)` pour éviter de fausser la lecture avec le cumul global.
  5. ⏱️ **Temps d'Étude (`#kpi-total-time`)** : Temps exact passé à étudier sur la période sélectionnée (format lisible `Xh Ym` ou `Xm Ys`), libellé contextualisé (*Temps (Aujourd'hui)*, *Temps d'Étude (7 jours)*, etc.) et nombre de sessions actives de cette période.
  6. ⚡ **Vélocité Moyenne (`#kpi-avg-speed`)** : Vitesse moyenne en secondes par QCM calculée strictement sur la période sélectionnée, avec décomposition précise de la cadence sur les réussites (`avgTimeCorrect`) vs sur les erreurs (`avgTimeWrong`) de la période.
- **Sélecteur Temporel Multi-Périodes (`stats-range-toggle` & `custom-range-picker`)** :
  - **Aujourd'hui** : Isole strictement les métriques, le temps passé, les sessions et l'activité de la journée en cours.
  - **7 jours** / **30 jours** : Fenêtre glissante hebdomadaire ou mensuelle.
  - **Tout** : Historique global complet depuis le premier jour d'entraînement.
  - **Personnalisé 📅** : Panneau rétractable avec sélecteurs de dates `[Du] [Au]` permettant d'analyser n'importe quel intervalle calendaire, avec application et affichage immédiats.
- **Moteur d'Agrégation Temporelle (`StudyTracker.getAnalyticsForDays(days)`)** :
  - Calcule dynamiquement et sans effet de bord l'intégralité des métriques (questions, temps, sessions, moyennes justes/fautes, chapitres, premier passage) pour un sous-ensemble arbitraire de jours.
  - `getGlobalAnalytics()` réutilise cette logique en fournissant la totalité des jours de l'historique, garantissant une cohérence arithmétique parfaite entre filtres périodiques et historique global.
- **Heatmap d'Activité Style GitHub (60 à 90 jours)** :
  - Grille SVG responsive de 7 lignes (jours de la semaine) x 9 colonnes (semaines) avec 5 paliers d'intensité de couleur (`#121d33` neutre, `#064e3b`, `#047857`, `#10b981`, `#00d4ff` intensif).
  - Infobulles contextuelles `<title>` affichant la date, le nombre de questions, les réussites et le temps passé.
- **Graphique Combiné SVG Interactif (Bilan Journalier)** :
  - Barres empilées par date : Émeraude pour les réponses justes, Rose pour les fautes.
  - Courbe ambre superposée pour l'évolution de la vitesse de réponse (secondes/QCM).
  - Titre dynamique et mise à l'échelle automatique selon la période choisie (journée seule, personnalisée, 7j, 30j ou historique complet).
- **Projection Dynamique Concours J-28 (10/11)** :
  - Calcule automatiquement la cadence observée (QCM/jour actif) sur la période sélectionnée et estime la date d'achèvement de l'ensemble du programme.
  - Alerte de motivation : félicite si la cadence est supérieure à l'objectif ou indique le nombre de QCM/jour à maintenir pour être prêt le 10/11.
- **Analyse Clinique par Chapitres (`renderStatsChapters`)** :
  - Filtrée sur les chapitres travaillés au sein de la période sélectionnée : classement des cours par taux de maîtrise avec barres de progression colorées.
- **Journal Quotidien Détaillé (`renderStatsTimeline`)** :
  - Timeline ordonnée (du plus récent au plus ancien) listant exclusivement les jours d'entraînement appartenant à la période sélectionnée, avec badge « Aujourd'hui », volume, justes, fautes, durée et sessions.
- **Synchronisation Cloud Multi-Appareils (`studyHistory` & `firstPassRecords`)** :
  - Stockage local dans `localStorage` sous `pedia_study_history_v1` et `pedia_first_pass_records_v2`.
  - Synchronisation bidirectionnelle automatique dans Google Cloud Firestore (`users/{uid}/pedia/progress`).
  - Fusion non destructive (`mergeHistory`) assurant la conservation des sessions entre PC, tablette et smartphone Android.
  - Badge de date : `📅 JJ/MM HH:MM` (`stat-date`).
  - Badge de score CROQ : `Score : X%` (`stat-score`).
  - Sélecteur d'historique de tentatives multiples avec dates, scores et switch instantané d'onglets.
- **Accordéons Interactifs & Repliage Multi-Niveaux** :
  - **Groupes de cours pliables (`.notebook-chapter-group`)** : Clic sur l'en-tête de cours pour masquer/afficher toutes ses questions (`.notebook-chapter-body`, `.notebook-chapter-questions`), avec rotation du chevron.
  - **Fiches de questions individuelles pliables (`.grouped-question-card`)** : Clic sur l'en-tête de chaque question pour la replier individuellement. En état replié, les panneaux lourds d'options et d'analyse IA sont masqués (`display: none !important`), laissant place à une prévisualisation aérée et compacte de l'énoncé (`.question-collapsed-preview`).
  - **Bouton Maître « Tout replier / Tout déplier » (`.notebook-toggle-all-btn`)** : Présent dans la barre de synthèse, il replie ou déplie instantanément l'intégralité des chapitres et des questions en un seul clic, aussi bien en vue par cours qu'en vue liste plate.
- **Barre de recherche & synthèse dynamique** :
  - Recherche instantanée par mot-clé sur les questions, propositions, explications et raisonnements IA.
  - Synthèse `#notebook-summary-bar` reflétant en direct le nombre de questions, d'analyses et le rappel du tri actif (`Tri : [Critère] ([Croissant/Décroissant])`).

### 3.8. Chronomètre & Suivi du Temps par Leçon (`src/services/lessonTracker.js` & `view-stats`)
Module dédié au chronométrage autonome de l'apprentissage par cours (polycopiés, fiches, cours magistraux) intégré dans la page de statistiques via une navigation horizontale par sous-pages :
- **Architecture de Navigation Horizontale par Sous-Pages (`stats-subnav-pills`)** :
  - **Barre d'onglets segmentée en haut de `view-stats`** : Permet de basculer instantanément d'un simple clic entre deux sous-vues dédiées, éliminant tout défilement vertical fastidieux (évitant un scroll monolithique de 2640px) :
    1. **Statistiques QCM** (`#stats-subpage-qcm`) : 6 Hero KPI Cards, Heatmap GitHub, Graphique combiné SVG, analyse de vélocité/projection J-28, Top spécialités et timeline quotidienne d'arène. Le sélecteur de période temporelle (`#stats-qcm-range-wrap`) y est associé.
    2. **Chronomètre Cours** (`#stats-subpage-lessons`) : Espace dédié au chronométrage par cours, affichage digital grand format, tableau récapitulatif par leçon et historique des sessions de révision. Le sélecteur temporel s'y masque automatiquement pour épurer l'interface.
  - **Animations glissantes fluides** : Transitions horizontales par translations CSS (`slide-from-left` et `slide-from-right`), procurant une sensation de fluidité native sans rechargement.
  - **Pill chrono live dans l'onglet** : L'onglet « Chronomètre Cours » affiche en direct un badge vert pulsant avec le décompte du temps écoulé (`#subnav-active-lesson-time`) lorsqu'un chronomètre est actif, même si l'étudiant consulte l'onglet QCM.
- **Moteur de Chronométrage Persistant (`LessonTracker`)** :
  - **Chronomètre progressif (Stopwatch)** : Compteur dynamique `00:00:00` avec fonctions Démarrer, Pause, Reprendre, Terminer & Enregistrer, et Annuler.
  - **Calcul persistant par delta d'horodatage (`startTimestamp` & `accumulatedMs`)** : Même si l'étudiant quitte la page de stats, navigue dans l'arène ou ferme temporairement l'application, le temps continue de tourner en tâche de fond sans décalage ni perte de secondes.
  - **Enregistrement des sessions** : Clé locale `pedia_lesson_sessions_v1` avec `{ id, lessonName, chapterId, startTime, endTime, durationSeconds, dateStr }`.
  - **Agrégation analytique par leçon (`getLessonSummaries`)** : Cumul total du temps passé par cours, nombre de sessions effectuées, date de dernière révision et calcul de part relative.
- **Sélecteur Intelligent avec Barre de Recherche** :
  - Recherche instantanée filtrable parmi les 35 chapitres officiels de pédiatrie avec compteurs de QCM associés.
  - Prise en charge de la saisie 100% libre permettant de nommer n'importe quel cours ou sous-thème spécifique (ex: « Polycopié Asthme », « Fiche Prise en charge Déshydratation »).
- **Mini-Badge Flottant dans le Header (`#active-lesson-header-badge`)** :
  - Visible automatiquement dès qu'un chronomètre est actif sur n'importe quel écran de l'application.
  - Affiche un voyant vert pulsant, le nom abrégé de la leçon et le chronomètre digital qui s'incrémente en direct.
  - Clic interactif redirigeant automatiquement l'étudiant directement vers la sous-page « Cours » dans `view-stats`.
- **Restitution & Tableaux de Bord** :
  - **Tableau récapitulatif par leçon** : Nom du cours, temps total cumulé sous forme de badge digital, nombre de sessions, date de dernière session, et barre de progression visuelle émeraude/cyan.
  - **Historique des sessions récentes** : Liste chronologique des dernières sessions avec horodatage détaillé, durée et bouton de suppression individuelle pour éliminer les sessions parasites.
- **Synchronisation Cloud Firestore (`lessonSessions`)** :
  - Synchronisation atomique dans `users/{uid}/pedia/progress`.
  - Fusion bidirectionnelle non destructive (`mergeSessions`) pour consolider l'historique d'étude entre PC, smartphone et tablette.

### 3.9. Système de Mises à Jour Automatiques & GitHub Releases (`src/services/updateService.js` & CI/CD)
L'application intègre un sous-système complet de vérification, d'alerte et de téléchargement autonome des nouvelles versions de l'APK depuis GitHub Releases :
- **Service d'Orchestration des Mises à Jour (`UpdateService`)** :
  - **Version actuelle déclarée** : `CURRENT_APP_VERSION = '1.3.0'` synchronisée avec `package.json` et `build.gradle`.
  - **Comparaison sémantique universelle (`compareVersions`)** : Compare fidèlement les versions de type `v1.3.1` vs `1.3.0` ou `2.0` en ignorant les préfixes et en évaluant chaque niveau de version.
  - **Interrogation de l'API GitHub Releases** : Requête HTTP vers `https://api.github.com/repos/lkmqji/qcm-p-diatrie/releases/latest`.
  - **Cooldown d'arrière-plan (4 heures)** : Évite toute surconsommation de quota d'API GitHub lors des démarrages répétés de l'application via `pedia_last_update_check_ts`.
  - **Extraction directe de l'APK** : Recherche prioritaire de l'asset `.apk` (ex: `PediaDrill.apk`) pour fournir le lien direct de téléchargement (`browser_download_url`).
  - **Installation Native Android** : En environnement Capacitor mobile (`Capacitor.isNativePlatform()`), l'URL de téléchargement direct est ouverte dans le navigateur système (`_system`), déclenchant le gestionnaire de téléchargement Android et la notification d'installation.
- **Expérience Utilisateur & Interfaces Dédiées** :
  - **Pastille Pulsante Header (`#badge-update-available`)** : Discrète puce verte animée sur l'icône Paramètres du header, visible uniquement lorsqu'une version plus récente a été détectée.
  - **Carte Mises à Jour dans la Modale Paramètres (`#modal-settings`)** : Affiche le numéro de version installée, le statut de vérification et un bouton manuel avec icône rotative (`spin-animation`).
  - **Modale Complète de Mise à Jour (`#modal-app-update`)** : Présentation soignée avec icône émeraude, comparatif `vActuelle ➔ vNouvelle`, date de publication, notes de mise à jour / changelog défilant et bouton d'action principal « Télécharger l'APK ».
- **Pipeline CI/CD Automatisé (`.github/workflows/build-and-release.yml`)** :
  - **Déclencheurs** : Push d'un tag git `v*` (ex: `v1.3.1`) ou déclenchement manuel en 1 clic via `workflow_dispatch`.
  - **Environnement de build** : Ubuntu Latest avec Node.js 22, Java JDK 21 Temurin, Android SDK Platform 36 (build-tools 36.0.0 via `android-actions/setup-android@v4`) et Gradle Wrapper 9.2.0 (compatible Android Gradle Plugin 8.13.0).
  - **Compilation & Publication** : Exécute `build-bundle.cjs`, synchronise Capacitor (`npx @capacitor/cli sync android`), compile `:app:assembleDebug`, copie et renomme l'APK produit en `PediaDrill.apk` et publie automatiquement une Release GitHub complète (`v1.3.0`) avec notes de version générées et l'APK attaché en téléchargement direct pour les mises à jour in-app Android.

### 3.10. Moteur de Formatage Médical Intelligent (`formatMedicalContent`)
Pour résoudre les problèmes de textes compacts ou collés sans sauts de lignes issus de l'extraction de cours :
- **Dégel des justifications de propositions (ex: `A-Vrai`, `A/ Vrai`, `B : Faux`, `1- Vrai`, `1-Perplexe`)** : Détection et conversion systématique en listes à puces avec badges en gras (`- **A) Vrai** :`).
- **Dégel des colonnes multi-espaces de diapositives** : Détection des énumérations séparées par de multiples espaces insécables (`\u00A0`) et conversion en éléments de liste à puces individuels.
- **Séparation des phrases compactées** : Détection des mots et phrases collées sans espace ou sans point (`(TCA).Amyotrophie`, `assurésB-Vrai`, `interstitiel.B/ Vrai`, `vaccinéContamination`, `hyperpigmentationBiologie`).
- **Dégel des puces (`➢`, `⁃`, `•`, `►`, `▶`, `✔`, `✓`, `-`, `*`)** : Détection regex et insertion de retours à la ligne avec génération de listes HTML `<ul class="medical-bullet-list">` et puces stylisées.
- **Dégel des énumérations d'énoncés (ex: `1-`, `2-`, `1.`, `2.`)** : Rendu sous forme de listes ordonnées avec badges colorés `<ul class="medical-num-list">` et `<span class="medical-num-badge">`.
- **Mise en valeur et découpage des en-têtes médicaux** : Détection des marqueurs clés (`Rappel :`, `Définition :`, `Question 01 :`, `Remarque :`, `Source :`, `NB :`, `Attention :`, `CAT :`, `Traitement :`, `Diagnostic :`, `Signes cliniques :`, `Biologie :`, `Physiopathologie :`, `Tableau clinique :`, `Examens :`) avec découpage immédiat du titre et de son paragraphe associé, badges thématiques `<div class="medical-section-title">` et icônes Lucide.
- **Nettoyage et espacement** : Élimination des BOM (`\uFEFF`) et des blocs d'espaces insécables (`\u00A0`), découpage en paragraphes espacés `<p class="medical-paragraph">` avec `line-height: 1.6`.
- **Application omni-présente** :
  - Arène : Énoncé (`#arena-question-text`), Cas clinique (`#arena-clinical-case-text`), Explication officielle en direct (`#arena-explanation-text`).
  - Modale d'erreur : Énoncé complet, cas clinique et explication officielle dans `formatQuestionMistakeRecap`.
  - Carnet : Rendu fidèle et aéré dans toutes les fiches d'historique.

### 3.8. Barre d'Outils Visuelle & Annotations UI (Agentation)
- **Intégration Standalone (`agentation.bundle.js`)** :
  - Copie du bundle officiel autonome à la racine et dans `dist/` via le pipeline `build.cjs`.
  - Chargement automatique via `<script src="agentation.bundle.js"></script>` injecté par `build-bundle.cjs`.
  - Auto-montage sur `#agentation-root` avec la pilule d'interaction, les marqueurs d'annotations, les pastilles bleues et la palette d'outils.
- **Fonctionnalités activées** :
  - **Annotation visuelle en direct** : clic sur n'importe quel élément UI de l'arène, du dashboard ou du carnet pour déposer une note avec capture automatique du sélecteur CSS, de la hiérarchie DOM et des styles calculés.
  - **Mode wireframe / Layout (`L`)** : manipulation et disposition de blocs pour prévisualiser des réorganisations d'interface.
  - **Mode pause animations (`P`)** : fige les micro-animations pour une inspection sereine.
  - **Copie structurée (`C`) & Nettoyage (`X`)** : export direct des annotations au format markdown pour transmission immédiate à l'agent.
- **Serveur MCP en temps réel** :
  - Connecté via `agentation-mcp` (`mcp_config.json`) sur le port local pour transmission bidirectionnelle transparente.

### 3.9. Iconographie & Clichés Médicaux Protégés (Rétractés & Floutés par Défaut)
- **Objectif mnésique & ergonomique** : Pour éviter que les clichés d'imagerie, radiographies ou photos cliniques ne divulguent prématurément la réponse ou ne perturbent la lecture de l'énoncé, tous les médias associés aux questions (`media_urls`) sont **rétractés et floutés par défaut**.
- **Composant UI (`renderQuestionMedia`)** :
  - **État Rétracté & Flouté (`.medical-media-card.is-collapsed`)** :
    - Vignette miniature carrée ultra-compacte de **74x74 px** (64x64 px sur smartphone).
    - Flou prononcé `filter: blur(8px) brightness(0.72)` avec compensation d'échelle `transform: scale(1.15)` pour supprimer les franges de flou aux bords.
    - Overlay interactif `.medical-media-spoiler-overlay` arborant le badge cyan `Toucher pour afficher` et le rappel `Photo floutée`.
  - **État Déplié & Net (`.medical-media-card.is-expanded`)** :
    - Déploiement fluide animé en CSS.
    - Dimensions adaptées aux résolutions d'écran d'ordinateur et mobile : largeur maximale **340 px** et hauteur maximale **250 px** (210 px sur smartphone), garantissant que l'image ne pousse pas les options hors du champ visuel.
    - Image en pleine netteté (`filter: none`) avec préservation stricte du ratio d'aspect (`object-fit: contain`).
    - **Deux boutons de fermeture dédiés** :
      1. Bouton flottant circulaire `✕` (`.btn-media-card-close`) au coin supérieur droit de l'image.
      2. Bouton d'action explicite `✕ Fermer la photo` (`.btn-media-close`) sous l'image aux côtés de `Plein écran HD`.
    - Un clic direct sur l'image dépliée la referme et la refloute également.
  - **Visionneuse Plein Écran HD (Lightbox)** :
    - Modal plein écran `#media-lightbox-modal` avec flou d'arrière-plan (`backdrop-filter: blur(10px)`).
    - Image centrée en résolution maximale sans altération.
    - Fermeture au clic sur le fond noir, via le bouton de fermeture ou par la touche clavier `Échap`.
- **Intégration transverse** :
  - **Arène de Quiz** : Rendu dynamique sous l'énoncé dans `#arena-media-wrap`.
  - **Modale d'Erreur & Explication** : Intégration systématique dans la fiche d'erreur `formatQuestionMistakeRecap`.
  - **Carnet de Révision** : Préservation et restitution intégrale dans les fiches de révision sauvegardées localement et synchronisées sur Google Firestore.

### 3.10. Masquage du Titre de Chapitre par Flou Interactif (`#arena-chapter-title`)
- **Objectif pédagogique** : Éviter que l'étudiant ne déduise le diagnostic d'un cas clinique complexe par simple lecture de la spécialité pédiatrique (ex: *Cardiologie*, *Gastroentérologie*, *Infectiologie*).
- **Fonctionnement & Ergonomie** :
  - Par défaut, à chaque chargement de question (`loadNextArenaQuestion`), le badge de chapitre passe en état masqué (`is-blurred`).
  - Le texte du cours est flouté (`filter: blur(6px); opacity: 0.38; user-select: none`) et accompagné d'un badge interactif `Cours masqué`.
  - **Pastille de date et session du QCM (`.question-date-pill`)** : Intégrée au sein de `.chapter-title-text`, elle affiche dynamiquement l'année, la session de concours (`P 2020`, `P1 2021`, `R 2019`, `EMD 2022`, `Session 2021`, etc.) ou la source du cours (`Diapo 2024`, `Diapositive 2026`) via `extractQuestionDateOrSession(q)`. En l'absence de date spécifique dans les données, elle affiche le repli `P? 20??`.
  - **Floutage coordonné** : La pastille de date est floutée en parfaite harmonie avec le nom du cours pour éviter tout indice diagnostique avant la réponse.
  - Un simple clic sur le badge (`window.toggleArenaChapterTitle()`) retire le flou (`is-revealed`) et révèle l'intitulé du chapitre ainsi que la date de la question.
  - Un second clic permet de le reflouter à tout moment.
  - **Défloutage automatique à la réponse** : Dès que l'étudiant valide ou échoue la question (`handleAnswerSuccess` ou `handleAnswerFailure`), ou consulte un QCM d'historique (`historyCursor >= 0`), le titre et la pastille de date sont automatiquement défloutés en clair.

### 3.11. Tuteur IA Interactif en Direct dans l'Arène & Protection Anti-Spoiler du Cours
- **Objectif mnésique & clinique** : Permettre à l'étudiant de questionner l'IA en temps réel sur n'importe quel aspect de la question en cours de résolution dans l'Arène (demande d'explication d'un signe sémiologique, physiopathologie d'un distracteur, posologie pédiatrique ou piège d'internat).
- **Protection Anti-Spoiler du Nom de Cours jusqu'à la Réponse (`.chatbox-chapter-blurred`)** :
  - **Problématique** : L'affichage direct du nom du chapitre dans le message de bienvenue du Tuteur IA (`<strong>${chapTitle}</strong>`) ou dans le sous-titre de l'en-tête dévoilait le diagnostic de la question avant même que l'étudiant n'ait répondu.
  - **Floutage dynamique conditionnel** :
    - Tant que la question n'a pas été répondue (`!isCurrentQuestionAnswered` et `historyCursor === -1`), l'intitulé du cours dans le message d'accueil et le sous-titre est automatiquement flouté (`filter: blur(5.5px); opacity: 0.38`).
    - Dès que l'étudiant répond (succès ou erreur), le cours est immédiatement révélé en clair.
    - L'étudiant peut également cliquer manuellement sur le texte flouté à tout moment pour le révéler ou le reflouter.
    - Synchronisation bidirectionnelle : tout basculement (dans la carte ou dans le chatbox) synchronise instantanément les deux zones via `window.toggleArenaChapterTitle()`.
- **Architecture & Composants UI** :
  - **Bouton Circulaire Flottant Néon (`#btn-arena-ai-chat`)** : Ancré en bas à droite (`bottom: 24px; right: 24px; z-index: 9999`) avec dégradé cyan/violet, halo pulsant doux et icône étincelle `sparkles`. Visible exclusivement lors de la session de quiz dans l'Arène.
  - **Fenêtre de Chat Moderne (`#arena-ai-chatbox`)** : Panneau en verre dépoli (`backdrop-filter: blur(20px)`), avec barre d'en-tête (titre, modèle actif `Gemini Flash`, sous-titre de cours, boutons réinitialiser et fermer), bannière de rappel de l'énoncé du QCM, conteneur de messages défilant, puces de suggestions rapides en 1 clic et barre de saisie avec touche <kbd>Entrée</kbd>.
  - **Amorces Cliniques Rapides (Chips)** :
    - 💡 *Démarche diagnostique*
    - 🔍 *Justification clé*
    - ⚠️ *Piège concours*
    - 💊 *Traitement & CAT*
### 3.12. Nettoyeur Universel de Formules & Élimination du LaTeX (`cleanLatexMath`)
- **Problématique clinique & UX** : Les modèles de langage (LLMs) génèrent fréquemment par réflexe des balises LaTeX (`\text{ g/dl}`, `\mathbf{3}\text{ kg}`, `\times`, `\frac{A}{B}`) lors des calculs de posologies, déficits en hémoglobine, bilans liquidiens ou réhydratation. Sans moteur d'affichage mathématique lourd, ces syntaxes s'affichaient sous forme de code cryptique (`%texte`, `\mathbf`).
- **Moteur de nettoyage & conversion bidirectionnel (`cleanLatexMath`)** :
  - **Déballage récursif du texte brut** : `\text{...}`, `\mathrm{...}`, `\operatorname{...}`, `\textrm{...}` ➔ texte clair direct.
  - **Conversion des styles typographiques** : `\mathbf{...}` et `\textbf{...}` ➔ `**...**` (gras Markdown natif immédiat).
  - **Conversion des opérateurs mathématiques** : `\times` ➔ `×`, `\cdot` ➔ `·`, `\div` ➔ `÷`, `\pm` ➔ `±`, `\leq` ➔ `≤`, `\geq` ➔ `≥`, `\neq` ➔ `≠`, `\approx` ➔ `≈`, `\to` ➔ `→`, `\implies` ➔ `⇒`.
  - **Unités pédiatriques & lettres grecques** : `\mu` / `\mum` ➔ `µ` / `µm`, `\alpha`, `\beta`, `\Delta`, `\Omega`.
  - **Formules de calculs fractionnaires & racines** : `\frac{A}{B}` ➔ `(A / B)`, `\sqrt{A}` ➔ `√(A)`.
  - **Exposants & indices** : `^{2}` ➔ `²`, `_{2}` ➔ `₂`, `\^\\circ C` ➔ `°C`.
  - **Suppression des délimiteurs** : Élimination de `$$...$$`, `$..$`, `\[...\]`, `\(...\)`.
- **Application et double protection** :
  - **Au niveau de l'API (`src/services/gemini.js`)** : Toutes les réponses brutes issues de Gemini Flash sont systématiquement épurées dès la réception (`_executeModelCall`, `askAboutQuestion`, `generateReasoningNote`, `evaluateCroq`).
  - **Au niveau du Prompt Engineering** : Consigne stricte interdisant formellement l'usage du LaTeX dans tous les prompts système, imposant un formatage textuel médical direct (ex: `14 g/dl`, `3 kg`, `× 3 ml/kg`).
  - **Au niveau du Moteur de Rendu (`src/app.js`)** : Déclenché automatiquement dans `formatMedicalContent`, `formatReasoningNote` et `parseMarkdownInline`.

### 3.13. Navigation dans l'Historique des 5 Derniers QCM & Synchronisation Dynamique du Tuteur IA (`view-arena`)
- **Problématique & Intention Pédagogique** : En cours de session intensive dans l'Arène, l'étudiant ressent le besoin fréquent de revenir sur les questions immédiatement précédentes pour relire une subtilité d'énoncé, vérifier pourquoi une proposition était fausse, ou **interroger le Tuteur IA spécifiquement sur le QCM précédent**.
- **Architecture de Données & Mécanique Interne (`src/app.js`)** :
  - **Buffer Glissant des 5 Derniers QCM (`answeredHistory`)** :
    - À chaque réponse validée (`handleAnswerSuccess`) ou échouée (`handleAnswerFailure`), un instantané complet (`snapshot`) est injecté en tête de tableau (`answeredHistory.unshift(snapshot)`), plafonné strictement à **5 éléments maximum** (`slice(0, 5)`).
    - Métadonnées capturées : `question` clonée de manière immuable, `userAnswerLetters`, indicateur booléen `isCorrect`, `score` (pour les CROQ), `explanation` officielle et `timestamp`.
  - **Curseur de Consultation (`historyCursor`)** :
    - `historyCursor = -1` : Mode Drill Actif (question en cours d'évaluation tirée de la file dynamique).
    - `historyCursor = 0` : Dernier QCM répondu (`QCM -1`).
    - `historyCursor = 1..4` : QCM répondus antérieurs jusqu'à 5 questions en arrière.
  - **Herméticité & Préservation Stricte du SRS** :
    - La navigation dans l'historique est **rigoureusement isolée de la répétition espacée**.
    - Aucune modification de `queueEngine.queue`, aucun appel à `handleSuccess` ou `handleFailure`, et aucun impact sur le compteur du jour (`todayTracker`).
- **Interface Utilisateur & Rendu Visuel Dédié (`template.html`, `src/style.css`)** :
  - **Barre Supérieure avec Flèches de Navigation (`.arena-history-nav`)** :
    - Flèche gauche `[◀]` (`#btn-history-prev`) : remonte vers les questions antérieures.
    - Badge central (`#arena-history-badge`) : affiche `Actuel (N)` en mode drill normal, ou `Précédent X/N` avec thème ambré (`is-past`) et contour distinctif en mode consultation.
    - Flèche droite `[▶]` (`#btn-history-next`) : redescend vers les questions plus récentes et réenclenche le drill actif quand `historyCursor === 0`.
  - **Bannière d'Avertissement Dorée (`#arena-history-consult-banner`)** :
    - S'affiche en haut de la carte pour rappeler clairement que le QCM est en consultation.
    - Comprend un bouton saillant « Reprendre le drill ➔ » (`.btn-resume-drill`).
  - **Rendu en Lecture Seule (`renderHistoryQuestion`)** :
    - Options désactivées (`.option-item.read-only`), boutons de validation masqués.
    - Surbrillance explicite des choix : propositions justes en vert (`correct-highlight`), choix erronés de l'utilisateur en rouge (`wrong-highlight`).
    - Chapitre déflouté d'emblée (`is-revealed`) avec badge ambré `QCM Répondu` et pastille de date/session.
    - Boîte d'explication officielle ouverte automatiquement en bas de carte.
    - **Carte d'Explication Clinique IA Persistante (`#arena-ai-explanation-box`)** : Affichée sous l'explication officielle dans le conteneur de question (`.question-container`). Elle restitue automatiquement l'explication structurée en 4 volets (Piège, Justification détaillée proposition par proposition A-E, Démarche clinique, Règle d'or & Mémo concours) issue du cache local (`pedia_ai_explanations_cache`), du Carnet de Raisonnement ou de Firestore.
    - **Génération IA à la demande en 1 clic** : Si aucune explication IA n'avait été générée antérieurement, un bouton d'action `[Générer l'explication clinique IA (Gemini Flash)]` (`window.requestArenaAiExplanation`) permet de déclencher l'analyse complète sans quitter l'Arène, l'enregistrant instantanément pour toutes les consultations futures.
    - Bouton bas de page « Reprendre le drill en cours ➔ » (`#btn-history-resume-action`).
- **Synchronisation Temps Réel & Persistance du Tuteur IA (`questionChatHistories`)** :
  - Le tuteur IA cible toujours la question effectivement visualisée (`getEffectiveArenaQuestion`).
  - **Préservation des conversations par question** : Les échanges avec le Tuteur IA dans `#arena-ai-chatbox` sont désormais indexés par identifiant de question (`questionChatHistories[effQ.uid]`). Lorsque l'étudiant revient sur un QCM précédent, l'intégralité de sa conversation antérieure avec l'IA est fidèlement restaurée dans le chatbox.
- **Raccourcis Claviers Dédiés (`setupKeyboardShortcuts`)** :
  - <kbd>◀ Flèche Gauche</kbd> : remonter d'un QCM dans l'historique.
  - <kbd>▶ Flèche Droite</kbd> : avancer d'un QCM vers le drill actif.
  - <kbd>Entrée</kbd> en mode consultation : reprendre immédiatement le drill actif.
  - Désactivation automatique lorsque le focus est dans un champ texte (recherche, chat ou CROQ).

---

## 4. Spécificités UI, Responsive & Mobile First

- **Design System** : Palette médicale sombre moderne (fond `#070b14`, cartes `#121d33`, accents cyan `#00d4ff`, émeraude `#10b981`, rose `#ef4444`, ambre `#f59e0b`, violet `#8b5cf6`).
- **Typographie Médicale Structurée** :
  - `Outfit` : Titres de sections, badges numérotés et badges de métriques.
  - `Inter` : Corps de texte médical, justifications sémiologiques et listes à puces.
  - Hauteur de ligne aérée (`line-height: 1.55` à `1.6`) avec espacement entre paragraphes pour une lecture sans fatigue oculaire.
- **Adaptation Mobile & Portrait (`@media (max-width: 768px)`)** :
  - Réduction générale d'échelle de ~15% pour une densité optimale sans défilement excessif.
  - Padding ajusté (`10px 8px 18px 8px`), marges et gap réduits.
  - Modale d'erreur : largeur responsive `max-width: min(780px, 94vw)` et `max-height: 88vh` avec défilement interne fluide.

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
    - **Document `pedia/progress` épuré** : Stocke uniquement l'état SRS (`queue`, `cursor`, `selectedChapterIds`, `totalMistakesCount`, `todayTracker`, `userEmail`, `notesCount`, `notesChunksCount`) et compacte `stats` (omission des QCM non touchés). Le champ `reasoningNotes` y est vidé (`[]`) pour écraser le vieux payload lourd de Firestore. Poids : **~15 à 20 Ko (50 fois sous la limite)**.
    - **Documents de partitionnement `pedia/notes_0`, `notes_1`, `notes_2`...** : Chaque document contient 50 notes allégées maximum, pesant ~50 à 75 Ko (**15 fois sous la limite de 1 Mo**).
    - **Écriture atomique (`db.batch()`)** : Sauvegarde conjointe du document de progression et des paquets de notes en une seule transaction réseau.
    - **Nettoyage automatique** : Suppression automatique des anciens paquets orphelins si le nombre total de notes diminue.
    - **Récupération parallèle (`fetchRemoteNotes`)** : Téléchargement simultané de tous les paquets via `Promise.all` avec fallback sur l'ancien format si présent.
- **Protocole de fusion bidirectionnelle (`mergeStates`)** :
  - Compare l'horodatage client et serveur.
  - Fusionne les compteurs de maîtrise au maximum (`Math.max(local, remote)`).
  - Déduplique l'ensemble des notes par identifiant unique stable sans suppression intempestive.
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
- **Version native** : `versionName 1.3` (`versionCode 4`)
- **Empreinte SHA-1 (Debug Keystore local Gradle)** : `87:31:A9:DF:46:90:4F:A3:3C:C0:79:DC:45:C5:BD:69:95:0B:A2:76`
- **Empreinte SHA-256 (Debug Keystore local Gradle)** : `98:3A:55:73:39:BC:3B:5F:0C:BC:6C:3F:33:60:DF:E6:06:59:96:0C:74:BC:A0:BC:CB:50:D0:41:80:EF:C9:6E`
- **Keystore utilisé** : `C:\Users\Lenovo\.android\debug.keystore` (Alias : `AndroidDebugKey`)
- **Dossier web racine (`webDir`)** : `dist`
- **Fichier de configuration Firebase Android** : `android/app/google-services.json` (Projet `qcm-pediatr`, Package `com.pediadrill.app`).
- **Plugin Gradle Google Services** : `com.google.gms.google-services` (version `4.4.4`) activé automatiquement à la présence de `android/app/google-services.json`.
- **Configuration des plugins Capacitor (`capacitor.config.json`)** :
  - `plugins.FirebaseAuthentication` : `skipNativeAuth: false`, `providers: ["google.com"]` (requis pour instancier le handler natif Android `GoogleAuthProviderHandler`).
- **Ressources natives Android (`strings.xml`)** : `default_web_client_id` explicitement déclaré avec l'ID client Web OAuth Google (`1028938391462-hfo44kaj789r1ruovt4b4v59he6jvarq.apps.googleusercontent.com`).
- **Dépendances natives** : `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor-firebase/authentication` (version 8.x).

### 6.2. Environnement Android Studio & Toolchain
- **Emplacement Android Studio** : `C:\Program Files\Android\Android Studio` (`bin\studio64.exe`).
- **JDK / JVM utilisée** : OpenJDK JBR 25 embarqué dans Android Studio (`C:\Program Files\Android\Android Studio\jbr`).
- **Android SDK** : `C:\Users\Lenovo\AppData\Local\Android\Sdk` (plateformes `android-34`, `android-36`, `android-37.0` avec build-tools `34.0.0`, `35.0.0`, `36.0.0`).
- **Moteur Gradle** : Gradle 9.2 (`gradle-9.2.0-bin`), entièrement compatible avec Java 25 et Android Gradle Plugin (AGP 8.13.0).

### 6.3. Génération & Emplacements de l'APK
- **Script automatisé** : `build-apk.bat` (exécutable via `npm run build:apk`). Pipeline complet automatisé : 1) build bundle web (`build-bundle.cjs`), 2) sync native Capacitor (`cap sync android`), 3) compilation native Gradle (`:app:assembleDebug`) et copie sous `PediaDrill.apk`.
- **Cible Gradle optimisée** : `:app:assembleDebug` (permet de compiler directement l'application et de générer l'APK sans surcharge d'extraction d'annotations ou de construction d'AAR de bibliothèques).
- **Fichier APK racine (accès direct utilisateur)** : `PediaDrill.apk` (taille : ~7.70 Mo).
- **Fichier APK de build Android** : `android/app/build/outputs/apk/debug/app-debug.apk`.
- **Ouverture dans l'IDE Android Studio** : `npm run open:android` ou lancement de `studio64.exe android`.

---

## 7. Pipeline de Compilation & Déploiement

- **Compilation Web PWA** : `node build.cjs` (prépare `dist/index.html` autonome avec datasets, styles et scripts).
- **Déploiement Web Cloud (Vercel & GitHub)** :
  - **Fichier servi par Vercel** : Conformément à `vercel.json` (`"routes": [{ "src": "/(.*)", "dest": "/index.html" }]`), Vercel sert directement le fichier racine `index.html`.
  - **Assemblage obligatoire** : Toute modification apportée aux sources dans `src/` doit être compilée via `node build-bundle.cjs` qui synchronise à la fois `src/app.bundle.js`, `index.html` (racine pour Vercel) et `dist/index.html` (pour le build mobile et PWA).
  - **Protocole de validation syntaxique pré-déploiement** :
    1. Validation des sources : `node -c src/services/gemini.js`, `node -c src/services/queueEngine.js`, `node -c src/services/studyTracker.js`, `node -c src/services/firebaseSyncService.js`, `node -c src/app.js`.
    2. Validation du bundle généré : `node -c src/app.bundle.js`.
    3. Validation des balises `<script>` intégrées dans `index.html` via script Node VM.
    4. Cela garantit un chargement sans erreur (`SyntaxError`) évitant le blocage de l'initialisation du DOM et des métriques (`--`).
- **Compilation Mobile Android (APK)** :
  1. `npm run build` : génère les fichiers finaux dans `dist/`.
  2. `npx cap sync android` : synchronise les assets web et plugins dans `android/app/src/main/assets/public/`.
  3. `cmd /c build-apk.bat` : exécute `:app:assembleDebug` avec le JDK Android Studio et copie automatiquement l'APK généré sous `PediaDrill.apk` à la racine du projet.
- **Scripts `package.json` disponibles** :
  - `npm run build` : génération de `dist/`.
  - `npm run start` : prévisualisation locale du dossier `dist/`.
  - `npm run build:apk` : build web + sync Capacitor + génération du fichier `.apk`.
  - `npm run open:android` : ouverture du projet natif dans l'interface graphique Android Studio.
