# PédiaDrill — Master Product & Technical Context
*Dernière mise à jour : 2026-11-28 19:15:00 CET*
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
7. **Un tableau de bord analytique complet** articulé en deux sous-pages :
   - **Statistiques QCM** : 7 cartes KPI dynamiques (dont l'estimation du temps pour terminer), navigation jour par jour, heatmap GitHub d'activité calibrée sur 63 jours, graphique combiné SVG et colonne de complétion des 35 cours.
   - **Chronomètre & Suivi de cours** : chronomètre persistant avec démarrage décalé (offset), saisie directe de sessions a posteriori, 4 cartes KPI cours, histogramme SVG quotidien d'heures par jour, répartition par cours (Top 10) et matrice de complétion des 35 chapitres.
8. **Un sélecteur modulaire & cursus médical complet** : catalogue exhaustif de 6 années et 46 modules (fondé sur la base de données Mystidia Exams), avec la Pédiatrie comme module actif et les 45 autres modules présentés sous forme de squelettes grisés élégants.
9. **Une gestion dynamique de la date d'examen et du compte à rebours** : calcul en direct des jours restants (J-XX) et de la cadence requise (QCM/jour) avec affichage d'une bannière interactive sur le Dashboard.
10. **Une synchronisation multi-appareils temps réel (PWA / Mobile / Desktop)** adossée à Google Auth et Firebase Firestore, synchronisant la progression SRS, le chronomètre actif de cours en direct (`onSnapshot`), les sessions de travail et les notes partitionnées par paquets de 50 (Chunked Firestore Storage).
11. **Une distribution native Android (APK)** propulsée par Capacitor 8 et automatisée par un pipeline CI/CD GitHub Actions avec vérification et téléchargement in-app autonome des mises à jour.

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
│   │   ├── build.gradle                  # Configuration de compilation Android (versionCode 35, versionName 1.6.8)
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
│   └── ping.js                           # Endpoint de test de disponibilité réseau
├── dist/                                 # Dossier de production web & assets natifs Capacitor
│   ├── index.html                        # Application complète autonome avec datasets intégrés
│   ├── manifest.json                     # Manifeste PWA
│   ├── sw.js                             # Service Worker de cache hors-ligne (`pedia-drill-v1.6.4-r2`)
│   ├── vendor/                           # Bibliothèques tierces embarquées localement (offline-first)
│   │   ├── lucide.min.js                 # Lucide Icons UMD local
│   │   └── confetti.browser.min.js       # Canvas Confetti local
│   ├── icon-192.svg                      # Icône PWA 192x192
│   └── icon-512.svg                      # Icône PWA 512x512
├── public/                               # Assets statiques publics (favicons, icônes)
├── qcm-psy/                              # Fichiers sources JSON des 20 cours de psychiatrie (862 QCM)
├── src/
│   ├── data/
│   │   ├── chapters.js                   # Déclaration globale des 35 chapitres de pédiatrie
│   │   ├── chapters.json                 # Format JSON des chapitres de pédiatrie
│   │   ├── questions.js                  # Déclaration globale de la base pédiatrie (1905 questions)
│   │   ├── questions.json                # Format JSON brut des 1905 questions de pédiatrie
│   │   ├── psy_chapters.js               # Déclaration globale des 20 chapitres de psychiatrie
│   │   ├── psy_chapters.json             # Format JSON des chapitres de psychiatrie
│   │   ├── psy_questions.js              # Déclaration globale de la base psychiatrie (862 questions)
│   │   └── psy_questions.json            # Format JSON brut des 862 questions de psychiatrie
│   ├── services/
│   │   ├── moduleCatalog.js              # Référentiel du cursus (6 années, 46 modules, squelettes et dates + examDatesUpdatedAt)
│   │   ├── storageScope.js               # Partitionnement transparent des données d'étude par module
│   │   ├── translateService.js           # Service de traduction Google directe sans cache persistant + préférences langue/activation
│   │   ├── gemini.js                     # Service IA Gemini Flash (multi-clés utilisateur, round-robin, circuit-breaker, contexte dynamique, traduction/explication termes)
│   │   ├── queueEngine.js                # Algorithme de répétition espacée (SRS), file active, heure locale et persistance
│   │   ├── studyTracker.js               # Suivi du progrès journalier, chronométrage & sessions QCM
│   │   ├── lessonTracker.js              # Chronomètre persistant et suivi du temps d'étude multi-modules par cours
│   │   ├── firebaseSyncService.js        # Auth Google (native/web) & synchronisation temps réel / chunkée Firestore (verrou de login & timestamps profil)
│   │   └── updateService.js              # Détection des releases GitHub et déclenchement de mise à jour in-app
│   ├── state/
│   │   └── appState.js                   # État global partagé, instance queueEngine, navigation inter-vues et préférences
│   ├── utils/
│   │   ├── formatters.js                 # Formatage médical, nettoyage LaTeX, normalisation de dates, XSS escapeHtml & debounce
│   │   ├── selectionTranslator.js        # Bulle flottante de traduction au surlignage (Desktop/Mobile), garde anti-clic QCM & bascule Gemini
│   │   └── uiDialogs.js                  # Notifications Toast non-bloquantes, modale de confirmation (#modal-app-confirm), confettis & refreshLucide
│   ├── views/
│   │   ├── dashboardView.js              # Tableau de bord, sélecteur de modules, paramètres multi-clés Gemini & statut compte Google
│   │   ├── clinicalCaseView.js           # Résolution complète des cas cliniques (modes Séquentiel & Déroulant, bilan & synthèse IA)
│   │   ├── arenaView.js                  # Arène QCM/CROQ, médias floutés, historique 5 QCM, snooze & Tuteur IA
│   │   ├── notebookView.js               # Carnet de raisonnement IA avec pagination progressive (30 fiches) & sélection chapitres
│   │   ├── statsView.js                  # Vue analytique QCM (7 KPIs, heatmap, courbe de vélocité, progression cours)
│   │   └── lessonView.js                 # Suivi du temps par cours, chronomètre temps réel & matrice de couverture
│   ├── app.js                            # Orchestrateur principal, cycle de vie, raccourcis clavier & bouton Retour Android
│   ├── app.bundle.js                     # Bundle JS client unifié (IIFE autonome assemblée par build-bundle.cjs)
│   └── style.css                         # Feuille de styles principale (Design System sombre médical + animations réactives)
├── tests/                                # Suite de tests unitaires et d'intégration (`node --test`)
│   ├── helpers/mockDom.js                # Simulation DOM/localStorage sans dépendances externes
│   ├── formatters.test.js                # Tests échappement HTML/XSS, formatage médical, sessions, debounce
│   ├── gemini.test.js                    # Tests sécurité (0 clé en dur), multi-clés, fail-fast, fallback CROQ, LaTeX
│   ├── queueEngine.test.js               # Tests SRS, heure locale getTodayTracker, cas cliniques & snooze
│   ├── syncAndCatalog.test.js            # Tests totaux Year 5, merge timestamps Firestore & LessonTracker multi-modules
│   ├── translateService.test.js          # Tests traduction Google directe, découpage chunks longs, préférences, sync Firestore & garde sélection
│   └── bundleAndViews.test.js            # Tests d'intégrité bundle, zéro alert/confirm, assets offline, backButton Android & pagination
├── vendor/                               # Miroir racine des vendors locaux pour déploiement direct Vercel
├── template.html                         # Structure HTML maîtresse avec CSS synchronisé et #modal-app-confirm
├── index.html                            # Fichier racine autonome servi par Vercel (incluant agentation.bundle.js)
├── PediaDrill.apk                        # Exécutable natif Android produit à la racine
├── agentation.bundle.js                  # Outil d'annotation d'interface Agentation (inclus partout)
├── build.cjs                             # Script de copie vers vendor/ et dist/ (incluant agentation.bundle.js)
├── build-bundle.cjs                      # Script d'assemblage (CSS, 20 modules ES -> IIFE, datasets src/data/*.js, index.html, dist/)
├── server.cjs                            # Serveur HTTP statique autonome pour le développement local
├── lancer-app.bat                        # Script batch de compilation et lancement local en 1 clic
├── start-local.bat                       # Alias pour lancer-app.bat
├── build-apk.bat                         # Script d'automatisation de build natif Android (:app:assembleDebug)
├── capacitor.config.json                 # Configuration Capacitor (appId, appName, plugins auth & app)
├── google-services.json                  # Fichier Firebase Google Services racine
├── manifest.json                         # Configuration PWA Web App Manifest
├── sw.js                                 # Service Worker (Cache-First / Stale-While-Revalidate + vendors locaux)
├── vercel.json                           # Configuration de routage SPA Vercel
└── package.json                          # Métadonnées, dépendances (`@capacitor/app`, `lucide`, `canvas-confetti`) & scripts (`build`, `test`)
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
- **Système de Mise en Sommeil Journalière (« Passer pour aujourd'hui », `snoozeQuestionForToday`)** :
  - **Suspension temporaire sans pénalité** : Permet à l'étudiant en un clic (bouton `#btn-snooze-question` ou raccourci clavier `S`) d'écarter une question de sa session pour toute la journée en cours. La question n'est ni comptabilisée comme faute, ni pénalisée au niveau de sa progression (`st.target` et `st.current` restent intacts).
  - **Retrait immédiat de la file active** : La question est retirée de `this.queue` et enregistrée dans le dictionnaire `this.snoozedQuestions[uid] = todayStr`.
  - **Réintégration automatique au changement de jour (Rollover)** : Dès le lendemain (`dateStr !== todayStr`), la méthode `cleanExpiredSnoozes()` purge automatiquement la suspension, réintégrant naturellement la question dans la file de répétition espacée.
  - **Sécurité et flexibilité d'annulation (Undo & Réintégration)** :
    - Notification Toast immédiate avec bouton « Annuler » permettant de restaurer instantanément la question en cas de clic involontaire.
    - Pastille interactive `#arena-snooze-pill` dans l'Arène et bannière `#dashboard-snoozed-alert` sur le Dashboard affichant le nombre de questions suspendues avec option de réintégration immédiate en 1 clic (`unsnoozeAllForToday`).
- **Persistance locale & Cloud** : Tout l'état (`activeQueue`, `stats`, `cursor`, `snoozedQuestions`, `reasoningNotes`, `todayTracker`, `selectedChapterIds`, `selectedChaptersUpdatedAt`) est sauvegardé dans `localStorage` sous la clé `pedia_drill_state_v1` et synchronisé via `FirebaseSyncService`.
- **Synchronisation multi-appareils des cours sélectionnés** : Chaque modification de la sélection des cours met à jour un horodatage précis (`selectedChaptersUpdatedAt`). Lors de la fusion d'états (`mergeStates`), la sélection la plus récente entre l'appareil local et le cloud est automatiquement retenue et appliquée, déclenchant la ré-initialisation dynamique de la file et la mise à jour immédiate de l'interface sur tous les écrans connectés.
- **Indexation O(1) Haute Performance (`this.questionsMap` & `getQuestionsMap`)** :
  - La file d'attente et l'hydratation des notes s'appuient sur une table de hachage `Map<uid, Question>` pré-indexée à la volée.
  - Toutes les opérations de recherche (`getCurrentQuestion`, `hydrateNote`) sont exécutées en $O(1)$ au lieu d'un parcours linéaire de tableau $O(N)$ sur les 1 905 questions, éliminant tout blocage du thread principal lors des validations de réponses.
- **Mémoïsation des Métriques (`_cachedMetrics`)** :
  - Les calculs statistiques du tableau de bord (`getDashboardMetrics`) sont mis en cache en mémoire et invalidés uniquement lors d'une mutation de l'état SRS (`saveState()`), évitant des recalculs redondants lors des navigations d'interface.

---

### 3.2. Évaluation IA & Raisonnement Clinique (`src/services/gemini.js`)
- **Sécurité & Architecture Multi-Clés Utilisateur (BYOK, 0 clé codée en dur)** :
  - **Aucune clé API dans le dépôt** : Suppression intégrale des anciennes clés codées en dur (`GEMINI_KEY_REGISTRY`, `DEFAULT_GEMINI_KEYS`, `DEFAULT_GEMINI_KEY`, `OLD_DEFAULT_GEMINI_KEY`) pour éliminer toute exposition de secrets dans le bundle public.
  - **Saisie Multi-Clés Utilisateur (`#settings-gemini-key`)** : Zone de texte multi-lignes dans les Paramètres acceptant une ou plusieurs clés API Google Gemini (séparées par retours à la ligne, virgules `,` ou points-virgules `;`), masquée par défaut (`.is-masked`) avec bouton de bascule afficher/masquer et compteur en direct (`#settings-gemini-keys-count`).
  - **Persistance locale & synchronisation Firestore** : Sauvegardée en local sous `gemini_api_key` (sérialisée sur plusieurs lignes) et synchronisée via le profil Google Firestore (`settings.geminiApiKey` + `pedia_settings_updated_at`).
  - **Fail-fast explicite & Fallback local** : Sans clé configurée, `callWithFallback()` échoue immédiatement avec l'erreur explicite `NO_API_KEY_CONFIGURED` guidant l'utilisateur vers *Paramètres > Clés API Google Gemini*, tandis que `evaluateCroq()` et `generateReasoningNote()` basculent automatiquement sur le moteur sémantique local hors-ligne.
  - **Contextualisation Multi-Modules Dynamique (`resolveAiModuleContext`)** : Tous les prompts système (`evaluateCroq`, `generateReasoningNote`, `generateClinicalCaseSynthesisNote`, `askAboutQuestion`) adaptent automatiquement la spécialité, le titre de tuteur et le contexte clinique au module actif ou à la question (`Pédiatrie`, `Psychiatrie`, ou tout futur module).
  - **Rotation Round-Robin (`this.keyIndex`)** : Chaque requête est successivement attribuée à la clé suivante du pool utilisateur afin d'équilibrer la charge et de prévenir tout dépassement de quota unitaire.
  - **Hot Failover par Clé & Résilience** :
    - En cas d'erreur `429` (`RESOURCE_EXHAUSTED`), mise en quarantaine de la clé pendant 15 minutes et bascule immédiate sur la clé suivante.
    - En cas d'erreur `404`, bascule sur la clé suivante ou le modèle suivant sans bloquer le pipeline.
    - En cas d'erreur `503` (surcharge temporaire Google), tentative sur une autre clé du pool avant d'appliquer une quarantaine courte de 60 secondes.
  - **Sécurité et détection défensive des clés non autorisées (403 / 401)** : Détection immédiate des erreurs d'API désactivée ou d'autorisation (`PERMISSION_DENIED`) avec mise en quarantaine automatique de 24h sans bloquer la boucle d'exécution.
  - **Persistance et assainissement du Circuit-Breaker dans `localStorage`** : Sauvegarde des dictionnaires de quarantaine (`pedia_gemini_quarantined_keys` et `pedia_gemini_quarantined_models`) avec purge automatique des quarantaines expirées ou obsolètes (> 60s).
- **Modèles 100% Flash Exclusifs & Cascade de résilience ultra-rapide** :
  - Verrouillage strict et absolu : **seuls les modèles Flash de Gemini** sont autorisés dans l'application. Tout modèle non-flash est systématiquement bloqué et rejeté.
  - Priorité absolue accordée à `gemini-2.5-flash` (stabilité maximale, insensible aux congestions 503 mondiales de la série 3).
  - Cascade automatique ordonnée garantissant la continuité sans blocage :
    1. `gemini-3-flash-preview` (modèle principal Génération 3 ultra-rapide, testé à ~1.9s - 4.6s)
    2. `gemini-flash-lite-latest` (secours Génération 3 ultra-véloce, ~2.6s)
    3. `gemini-2.5-flash` (roc de stabilité absolue en cas de pic 503 sur la série 3, débloqué via `PediaDrill4`)
    4. `gemini-3.5-flash-lite` (secours Flash Lite haute disponibilité)
    5. `gemini-3.1-flash-lite` (secours Flash Lite secours)
    6. `gemini-3.8-flash` (secours Flash secours)
- **Architecture Circuit-Breaker & Mémorisation Dynamique** :
  - **Mémorisation du modèle actif (`lastSuccessfulModel`)** : Dès qu'un modèle Flash réussit, le service l'utilise immédiatement comme modèle prioritaire pour tous les appels suivants, évitant de rejouer la cascade depuis le début.
  - **Quarantaine automatique des erreurs de quota 429 (`RESOURCE_EXHAUSTED`)** : Tout modèle dont l'ensemble des clés a retourné 429 est automatiquement placé en quarantaine pour 15 minutes.
  - **Désactivation des pensées cachées** : Injection de `thinkingConfig: { thinkingBudget: 0 }` sur les modèles compatibles (`gemini-2.5-flash`, `gemini-3-flash-preview`), évitant la génération inutile de 500+ tokens de réflexion interne et divisant le temps de réponse par 2.
- **Paramètres de génération calibrés & Timeouts adaptatifs** :
  - `temperature: 0.2` (haute rigueur médicale et reproductibilité).
  - `maxOutputTokens: 1024` pour l'évaluation CROQ, `2500` pour la démarche clinique complète, et `1500` pour le tuteur IA.
  - **Timeout adaptatif intelligent** : calibré à 7 secondes pour les requêtes courtes (évaluation CROQ, tuteur IA) et étendu à **18 secondes** pour les notes cliniques exhaustives (2500 tokens), éliminant les avortements intempestifs tout en assurant l'exhaustivité des justifications (5 000 à 7 500 caractères).
  - **Optimisation de latence dans les prompts** : consigne stricte de rédiger directement l'analyse sans formule de politesse ni introduction, économisant 150 tokens et 2 secondes par appel.
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

### 3.5. Cas Cliniques : Numérotation, Consultation & Moteur de Résolution Complète (`#view-arena`)
- **Numérotation Contextuelle des Sous-Questions (`#arena-subquestion-badge`)** :
  - Pour toute question issue d'un cas clinique (`q.clinical_case` présent, `q.id` au format `CaseNumber.QuestionNumber` comme `37.4`), un badge néon stylisé violet/cyan est injecté au-dessus de l'énoncé.
  - Libellé automatique : `Cas Clinique {X} • Question {Y}/{Total}` (ex: « Cas Clinique 37 • Question 4/10 »).
  - Masquage automatique pour les QCM autonomes isolés.
- **Volet Accordéon de Consultation Complète (`.clinical-case-box` / `#arena-clinical-questions-accordion`)** :
  - **En-tête enrichi** : La boîte du cas clinique intègre un en-tête flex (`.clinical-case-header`) avec titre stéthoscope et un bouton interactif `#btn-toggle-clinical-questions` affichant dynamiquement le nombre de sous-questions (ex: *« Voir les 10 questions du cas »*).
  - **Consultation sans quitter le drill** : Le clic sur le bouton déplie un volet accordéon animé sous le texte du cas sans recharger la page ni altérer la position dans la file SRS.
  - **Rendu en lecture seule** : Chaque sous-question est présentée avec son numéro, son énoncé médical formaté (`formatMedicalContent`), ses propositions de réponse (A à E) ou sa pastille CROQ, et un badge distinctif `Question en cours` sur la question active.
- **Moteur de Résolution Complète du Cas Clinique (`startClinicalCaseRun`, `ClinicalCaseRunController`)** :
  - **Déclenchement direct** : Bouton néon violet/cyan `#btn-start-clinical-case` (*« 🎯 Résoudre le cas complet (X Q) »*) positionné dans l'en-tête du cas à côté de l'accordéon.
  - **Indicateur de questions à nettoyer (`#clinical-uncleaned-badge` / `updateClinicalUncleanedBadge`)** : Pastille placée directement à côté du bouton `#btn-start-clinical-case` affichant en temps réel le ratio `X/Y à nettoyer` (nombre de sous-questions pas encore maîtrisées `!st.done` sur le nombre total de questions du cas), avec passage automatique en style émeraude (`.is-all-cleaned`) à `0/Y à nettoyer`, mise à jour immédiate lorsqu'une question est éliminée en mode drill, et masquage pendant un run actif.
  - **Deux modes d'affichage complémentaires et commutables en direct** :
    1. **Mode Séquentiel (Étape par étape, 1 par 1)** :
       - Résolution question par question avec bandeau du cas fixé en haut et barre de progression animée (`#arena-clinical-progress-track`).
       - Stepper de navigation (`#arena-clinical-sequential-stepper`) avec boutons `[← Précédente]` et `[Suivante →]` (et raccourcis flèches clavier) pour revoir ou ajuster ses sélections à tout moment.
       - **Double système d'actions ergonomique dans `.arena-actions-right`** :
         - **Option Principale par défaut (`#btn-submit-answer` / `#btn-submit-croq`)** : Grand bouton cyan bien visible. Libellé initial *« Vérifier la réponse »* (ou *« Évaluer par IA (Gemini) »* pour CROQ). Au clic ou `Entrée`, évalue immédiatement la sous-question courante : surbrillance visuelle des options (`.correct-highlight` en vert, `.wrong-highlight` en rouge), verrouillage des choix, affichage de l'explication officielle dans `#arena-explanation-box`, et bascule automatique du bouton en *« Question suivante ➔ »* (ou *« 🏁 Voir le Bilan Final »* sur la dernière question).
         - **Option Secondaire compacte à gauche (`#btn-clinical-save-next`)** : Bouton compact stylé `.btn-clinical-save-step` placé à gauche du bouton principal. Libellé *« Enregistrer & Suivant »* (ou *« Enregistrer & Bilan »* sur la dernière question). Permet d'enregistrer le choix sans dévoiler la correction ni l'explication et de passer immédiatement à l'étape suivante. Se masque automatiquement si la question a déjà été vérifiée.
       - **Option d'Explication IA par Question (`renderClinicalExplanationArea` & `requestClinicalSubQuestionAiExplanation`)** :
         - Dès la validation de la sous-question, affichage du statut (succès/échec) et de l'explication officielle si disponible (ou encadré d'avertissement stylisé si absente de la base).
         - Bouton d'action IA intégré : *« Générer l'explication IA (Gemini Flash) »* si l'explication officielle est manquante, ou *« Approfondir avec l'explication IA »* pour enrichir l'analyse.
         - Génère une note de raisonnement clinique complète en 4 volets alimentée par le contexte du cas, affichée dans `#arena-ai-explanation-box` et persistée dans le Carnet de notes.
       - À la dernière question vérifiée ou enregistrée, bascule vers la validation globale et la modale de synthèse.
    2. **Mode Déroulant (Liste scrollable tout-en-un)** :
       - Conteneur déroulant `#arena-clinical-scroll-container` présentant l'ensemble des sous-questions du cas sous forme de fiches modulaires (`.clinical-card`).
       - **Validation unitaire avec retour immédiat & Explication IA (`.clinical-card-feedback`)** : Bouton *« Vérifier cette question »* (`.btn-clinical-card-validate`) sur chaque carte dévoilant immédiatement si la sous-question est juste ou fausse, avec surbrillance dynamique des options, encadré d'explication officielle, et bouton unitaire `.btn-card-gen-ai-exp` pour générer l'explication IA contextualisée directement au sein de la carte.
       - **Barre d'action maître sticky** (`.clinical-scroll-master-actions`) au bas de l'écran affichant le décompte des questions renseignées et le bouton maître *« Valider tout le cas clinique & Voir le Bilan »*.
  - **Bascule instantanée & Paramètres** :
    - Commutateur à boutons pilules `#btn-mode-sequential` et `#btn-mode-scroll` dans la barre active `#arena-clinical-run-bar` pour permuter de mode à tout moment sans perte des réponses saisies.
    - Sélecteur de mode par défaut dans les Paramètres (`#settings-clinical-mode-select`) avec persistance dans `localStorage` (`pedia_clinical_case_mode`).
  - **Règle Stricte « Tout ou Rien » & Repositionnement Groupé SRS (`QueueEngine`)** :
    - **100% de réussite (0 faute)** : Toutes les sous-questions actives du cas avancent (+1 palier SRS, `handleClinicalCaseSuccess`), marquage maîtrisé si seuil `target` atteint. **Règle d'intégrité du compteur journalier** : seules les sous-questions qui n'étaient **pas encore nettoyées** sont créditées au compteur quotidien (`incrementTodayCount(activeCreditedCount)`), évitant tout gonflement artificiel des statistiques par des questions déjà acquises. Déclenchement des confettis de célébration.
    - **En cas d'échec (≥ 1 faute)** : **0 question n'est créditée comme juste** (aucun succès enregistré), pénalités de répétition appliquées aux questions ratées, et l'intégralité des questions du cas est retirée de la file et **réinsérée de façon groupée et contiguë dans 5 à 7 cartes** (`insertIndex = cursor + 5..7`), garantissant que le cas clinique réapparaît complet en bloc lors de la prochaine révision.
  - **Modale de Bilan & Synthèse IA Consolidée (`#modal-clinical-case-summary`)** :
    - Modale plein écran avec bannière de verdict (Émeraude en succès, Rose/Ambre en échec), récapitulatif détaillé de chaque sous-question et impact sur la file SRS.
    - En cas d'échec, appel automatique à `geminiService.generateClinicalCaseSynthesisNote` produisant une démarche clinique consolidée en 4 sections (Synthèse du cas, analyse des questions échouées, stratégie diagnostique/thérapeutique, et règle d'or concours), sauvegardée dans le Carnet de Raisonnement.

---

### 3.6. Explication Directe en Arène (`#arena-explanation-box`)
- Dès qu'une réponse est validée avec succès, l'explication officielle issue de la base de données s'affiche directement dans l'arène sous la bannière de succès, permettant un rappel immédiat avant de passer à la question suivante.

---

### 3.7. Carnet de Raisonnement IA : Tri Multi-Critères, Auto-Guérison, Isolation Strictement Scopée & Navigation Inter-Modules (`view-notebook`)
- **Isolation Étanche des Notes & Statistiques par Module (`moduleCatalog.js`, `storageScope.js`, `queueEngine.js`)** :
  - Chaque module dispose de sa propre clé de stockage isolée (`pedia_drill_reasoning_notes_v1` / `pedia_drill_state_v1` pour la Pédiatrie, `mod_psychiatrie_reasoning_notes` / `mod_psychiatrie_drill_state` pour la Psychiatrie, etc.).
  - Utilitaires `resolveModuleIdForQuestionUid`, `doesQuestionBelongToModule` et `getAvailableModules` dans `src/services/moduleCatalog.js` déterminent l'appartenance exacte de chaque question/note.
  - `QueueEngine` mémorise `this.activeModuleId` afin que `saveState()` et `switchModule(newQuestions, newChapters, newModuleId)` sauvegardent toujours l'ancien module dans sa propre clé avant de charger le nouveau module (éliminant toute fuite d'état/fautes lors de l'appel à `setActiveModuleId` avant `switchModule`).
  - Au démarrage de l'application (`migrateReasoningNotesBetweenModules` + `migrateStatsBetweenModules`), toute note ou statistique de faute égarée dans un autre module est migrée proprement vers son module d'appartenance sans perte de données.
  - `autoHealNotesFromMistakes()`, `getRawReasoningNotes(moduleId)`, `getReasoningNotes(moduleId)`, `getModuleMistakesCount(moduleId)` et `applyMergedState(merged)` filtrent strictement par module : seules les notes et fautes du module sélectionné apparaissent dans le carnet, tout en sauvant les éventuelles notes d'un autre module issues d'un snapshot Firestore hérité vers leur propre stockage local.
- **Navigation Rapide Inter-Modules dans la Barre Supérieure (`#notebook-module-nav`)** :
  - `renderNotebookModuleNav()` dans `src/views/notebookView.js` affiche des boutons pilules compacts (`.notebook-module-pill`) pour chaque module disponible avec son compteur de notes dédié, ainsi qu'un petit bouton de bascule rapide `#btn-notebook-cycle-module` (`arrow-left-right`).
  - Le clic sur une pilule ou sur le bouton de bascule déclenche `switchToModule(modId)` (enregistré dans `src/state/appState.js`) et recharge instantanément le Carnet de Raisonnement avec uniquement les cours, notes et fautes du module sélectionné.
- **Moteur d'Auto-Guérison des Notes d'Erreurs (`autoHealNotesFromMistakes`)** :
  - Si une question du module actif a été manquée lors des séries d'entraînement (`stats[uid].mistakes >= 1`) mais que la note IA n'avait pas pu être enregistrée (saut de modal, coupure réseau, timeout), `QueueEngine` reconstruit automatiquement une note clinique de base complète à partir de l'énoncé, de l'explication officielle et de la réponse type de la base de données du module actif uniquement.
  - Garantit que **100% des questions manquées par l'étudiant dans le module sélectionné apparaissent immédiatement dans son Carnet de Raisonnement**, avec possibilité de relancer une analyse approfondie Gemini Flash à tout moment.
- **Réinitialisation Dynamique des Filtres (`switchActiveModule`)** :
  - Lors du passage d'un module à un autre, le filtre de chapitre mémorisé (`notebookSelectedChapter`), la valeur du sélecteur `#notebook-chapter-filter` et le champ de recherche `#notebook-search-input` sont automatiquement réinitialisés, évitant de masquer les notes du nouveau module.
- **Hydratation Multi-Modules Sécurisée (`hydrateNote`)** :
  - En cas d'absence de la question dans le dictionnaire actif, recherche de secours automatique dans `window.PSY_QUESTIONS` ou `window.PEDIA_QUESTIONS`.
  - Fallback dynamique du libellé de cours : `'Psychiatrie Générale'` pour les questions de psychiatrie, `'Pédiatrie Générale'` pour la pédiatrie.
- **Tri Multi-Critères Complet (Croissant & Décroissant)** :
  - **Critères disponibles (`notebookSortBy`)** :
    - 📅 **Date de la faute (`date`)** : Tri par horodatage de la dernière tentative (`latestTimestamp`).
    - ⚠️ **Nombre d'erreurs (`mistakes`)** : Tri par nombre cumulé de fautes (`totalMistakes = Math.max(attemptsCount, stats.mistakes)`).
    - 📚 **Cours (`chapter`)** : Tri alphabétique des chapitres de la spécialité active.
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
- **Barre de recherche, debounce & pagination progressive (`notebookView.js`)** :
  - Recherche instantanée avec debounce de `200 ms` (`debounce(..., 200)`) sur énoncés, propositions, explications et raisonnements IA.
  - Pagination progressive (`NOTEBOOK_PAGE_SIZE = 30`) affichant au maximum 30 fiches au chargement initial (modes Par cours et Liste continue) avec bouton `.btn-notebook-load-more` (*« Charger les N fiches suivantes »*) afin d'éviter la saturation DOM lorsque des centaines d'erreurs sont cumulées.
  - Synthèse `#notebook-summary-bar` reflétant le module actif (`.notebook-active-mod-badge`), le nombre de questions, d'analyses, le cumul de fautes du module et le rappel du tri actif.

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
  - **Onglet actif par défaut (« Aujourd'hui », `currentStatsRange = 'today'`)** : L'onglet journalier `#btn-range-day` est sélectionné et illuminé par défaut à l'ouverture des statistiques, centrant l'analyse sur le travail du jour (ou du jour sélectionné dans le passé).
  - **Navigation jour par jour (`stats-day-stepper-wrap`)** : Boutons précédent/suivant et bouton central pour naviguer dans l'historique (« Hier », « Avant-hier », dates calendaires) et réinitialiser à « Aujourd'hui » en 1 clic.
  - **7 jours / 14 jours / 21 jours / 28 jours / 30 jours / Tout / Personnalisé 📅** : Filtres temporels multi-périodes avec boutons dédiés et panneau rétractable `[Du] [Au]` enrichi de mini-calendriers interactifs (`.date-input-box`, `.date-calendar-icon`, déclenchement de `showPicker()`). Synchronisation dynamique de la classe `.active` sur l'ensemble des boutons et mise à jour automatique des métriques et du graphique d'activité.
- **Heatmap d'Activité Style GitHub (Calibration Calendaire Exacte)** :
  - **Alignement strict calendrier GitHub** : Grille SVG de 9 colonnes (semaines) x 7 lignes (jours de la semaine). La date de départ est strictement calée sur le lundi de la 9ème semaine passée (`startMonday = now - 8*7 + todayDayOfWeek`), et la dernière colonne (colonne 8) s'achève sur le jour d'aujourd'hui (`row = (now.getDay() + 6) % 7`).
  - **Correspondance stricte des libellés de jours** : La ligne 0 correspond strictement au Lundi (« Lun »), la ligne 2 au Mercredi (« Mer »), la ligne 4 au Vendredi (« Ven ») et la ligne 6 au Dimanche (« Dim »), éliminant tout décalage entre les étiquettes et les cellules.
  - **Paliers d'intensité de couleur** : 5 niveaux visuels (`#121d33` neutre, `#064e3b` 1-14 QCM, `#047857` 15-39 QCM, `#10b981` 40-79 QCM, `#00d4ff` 80+ QCM) avec infobulles détaillées au survol.
- **Graphique Combiné SVG Interactif (Bilan Journalier & Tendance Hebdomadaire)** :
  - **Affichage de 7 jours par défaut** : Par défaut (quand le sélecteur est sur « Aujourd'hui »), le graphique présente automatiquement les 7 derniers jours d'activité (`studyTracker.getDaysByRange('7')` ou 7 jours glissants selon l'offset), tandis que les cartes KPI, la projection et la timeline restent centrées sur la journée active.
  - **Synchronisation dynamique multi-périodes** : Si l'utilisateur sélectionne une période en haut (14j, 21j, 28j, 30j, Tout, Personnalisé), l'intégralité de la vue (KPIs, chapitres, timeline et graphique) bascule sur cette période.
  - Barres empilées par date : Émeraude pour les réponses justes, Rose pour les fautes, avec courbe ambre de vitesse de réponse (secondes/QCM).
- **Projection Dynamique Concours J-28 (10/11)** :
  - Cadence observée (QCM/jour actif) et estimation de la date d'achèvement de l'ensemble du programme.
- **Suivi des Questions par Cours (`#stats-course-tracker-box`)** :
  - Deux modes commutables : **« Sur la période »** (volume, ratio justes/fautes, vitesse) vs **« Tous les cours (35) »** (complétion globale avec barres multi-segments).
  - Champ de recherche instantanée en direct (`#course-tracker-search`).
- **Journal Quotidien Détaillé (`renderStatsTimeline`)** :
  - Timeline ordonnée du plus récent au plus ancien listant exclusivement les jours d'entraînement de la période active.

---

### 3.8. Chronomètre, Suivi du Temps de Cours & Suite Analytique (`src/services/lessonTracker.js` & `view-stats`)
- **Navigation Horizontale par Sous-Pages (`stats-subnav-pills`) & Sélecteur Universel de Période** :
  - Bascule instantanée entre **Statistiques QCM** (`#stats-subpage-qcm`) et **Statistiques Cours** (`#stats-subpage-lessons`), éliminant tout défilement vertical excessif.
  - Transitions glissantes CSS (`slide-from-left` et `slide-from-right`).
  - Pastille chrono live dans l'onglet affichant le décompte en direct (`#subnav-active-lesson-time`) lorsqu'un chronomètre tourne.
  - **Barre Universelle de Sélection de Période dans le Header (`.arena-top-bar.stats-top-bar`)** :
    - Sur l'onglet QCM : `#stats-qcm-range-wrap` contrôle les statistiques d'entraînement.
    - Sur l'onglet Cours : `#stats-lesson-range-wrap` s'affiche automatiquement avec la même ergonomie et les mêmes fonctionnalités :
      - *Stepper journalier* (`#stats-lesson-day-stepper-wrap`) pour naviguer jour par jour (*Aujourd'hui*, *Hier*, *Avant-hier*...).
      - *Boutons de plages prédéfinies* : 7 jours, 14 jours, 21 jours, 28 jours, 30 jours, Tout.
      - *Sélecteur personnalisé* (`#custom-lesson-range-picker`) avec saisie de dates « Du » / « Au » et mini-calendriers interactifs.
      - *Styles dédiés* avec accentuation émeraude sur le bouton actif (`#stats-lesson-range-toggle .range-btn.active`).
- **Moteur de Chronométrage Persistant & Synchronisation Multi-Appareils en Temps Réel (`LessonTracker`)** :
  - **Calcul par delta d'horodatage (`startTimestamp` & `accumulatedMs`)** : le temps continue de tourner en tâche de fond même si l'étudiant quitte la page ou ferme l'application.
  - **Synchronisation Firestore bidirectionnelle (`activeLessonTimer` & `activeLessonTimerUpdatedAt`)** :
    - L'état complet du chronomètre actif (leçon, heure de départ, état pause/marche, décalage) est synchronisé dans le document Firestore `progress`.
    - Le listener temps réel `onSnapshot` (`setupFirestoreListener`) et la fusion `mergeActiveTimer()` propagent instantanément l'état du chronomètre : un chronomètre lancé sur smartphone tourne en direct sur PC et vice-versa.
    - Déclenchement automatique de `triggerAutoPush(true)` lors de chaque action (démarrer, pause, reprendre, enregistrer, annuler, supprimer).
  - **Démarrage avec Décalage Initial (Offset Horaire)** :
    - Prise en charge de `startTimer(lessonName, chapterId, offsetSeconds)` pour reprendre une séance déjà entamée.
    - Bandeau interactif « Démarrer à partir de : » sur la carte chronomètre avec pastilles rapides (`00:00`, `+15 min`, `+30 min`, `+1 h`, `+2 h`) et champ personnalisé (Heures/Minutes). L'écran digital reflète immédiatement le temps de départ sélectionné.
- **Saisie Directe de Sessions A Posteriori (`#modal-manual-lesson-session` & `addManualSession`)** :
  - Bouton dédié **« + Session directe »** dans l'en-tête de la section cours.
  - Modale épurée permettant d'enregistrer une session d'étude effectuée hors ligne :
    - Recherche et sélection rapide parmi les 35 chapitres du programme ou nom libre.
    - Durée avec sélecteurs Heures/Minutes et raccourcis tactiles (`30 min`, `1 h 00`, `1 h 30`, `2 h 00`, `3 h 00`).
    - Date de la session (par défaut aujourd'hui).
    - Sauvegarde locale sous `pedia_lesson_sessions_v1` et synchronisation cloud immédiate.
- **Suite Analytique Complète du Suivi des Cours (`renderLessonAnalytics`)** :
  - **Réactivité totale à la période sélectionnée en haut** :
    - Le titre (`#lesson-daily-chart-title`) et le badge de l'en-tête de panneau (`#lesson-chart-period-badge`) s'actualisent instantanément en fonction de la période choisie (Aujourd'hui, Hier, 7j, 14j, 21j, 28j, 30j, Tout, Personnalisé).
  - **4 Cartes KPI Cours (`.lesson-kpi-grid`) synchronisées** :
    1. ⏱️ **Temps Total Cours** : Heures cumulées sur la période choisie et décompte des sessions (avec total historique en sous-titre).
    2. 📅 **Aujourd'hui & 7j** : Temps d'étude de la journée et volume des 7 derniers jours.
    3. ⏳ **Moyenne / Session** : Durée moyenne de concentration par session sur la période.
    4. 📚 **Couverture Programme** : Décompte et pourcentage des 35 chapitres travaillés.
  - **Histogramme SVG d'Étude Journalière Réactif (`#lesson-daily-chart-container`)** :
    - Graphique interactif à barres SVG avec dégradé cyan/émeraude (`#lessonBarGrad`), étiquettes d'heures au-dessus des barres, info-bulles au survol et lignes de repère horaires.
    - **Affichage de 7 jours par défaut** : Par défaut (sélecteur sur « Aujourd'hui »), le graphique affiche les 7 derniers jours d'étude des cours (`getLessonRangeDailyData('7', offset)`), tandis que les 4 KPI cards restent basées sur le jour sélectionné.
    - **Synchronisation dynamique** : Si l'utilisateur clique sur une autre période en haut (14 jours, 28 jours, tout, personnalisé), toutes les statistiques et l'histogramme basculent sur la période demandée.
    - Génération dynamique des données :
      - *Jour unique* (si filtré spécifiquement) : barre centrée proéminente (largeur 64px) avec durée exacte et mention du jour.
      - *Plages multi-jours* (7, 14, 21, 28, 30 jours, Tout, Personnalisé) : barres proportionnelles, étiquetage intelligent de l'axe X pour éviter les chevauchements, et message d'état si aucune session n'est enregistrée.
  - **Sélecteurs de Module Dédiés & Indépendants par Section (`lesson-module-pills`)** :
    - Conformément aux retours ergonomiques, chaque partie de la page dispose de son propre sélecteur modulaire (`course-tracker-pills`) pré-sélectionnant par défaut le module actif en cours sur le Dashboard (`getActiveModuleId()`, ex: Pédiatrie ou Psychiatrie) au lieu de l'onglet global « Tous », tout en permettant de basculer à tout moment sur « Tous les cours » :
      1. **Répartition du Temps par Cours (Top 10)** (`#lesson-dist-module-filter`) : Boutons `[Tous]`, `[Pédiatrie]`, `[Psychiatrie]`. En mode global, chaque cours arbore une pastille néon (`Pédia` cyan ou `Psy` violet).
      2. **Matrice de Couverture du Programme** (`#lesson-matrix-module-filter`) : Boutons `[Tous (55)]`, `[Pédiatrie (35)]`, `[Psychiatrie (20)]`. En mode `Tous (55)`, les chapitres sont scindés en deux blocs titrés distincts (`Programme Pédiatrie (35 cours)` et `Programme Psychiatrie (20 cours)`).
      3. **Tableau Récapitulatif du Cumul par Leçon** (`#lesson-summary-module-filter`) : Boutons `[Tous les cours]`, `[Pédiatrie (35)]`, `[Psychiatrie (20)]`. En mode `Tous les cours`, une colonne dédiée `Module` affiche la pastille stylisée (`.session-module-pill`).
      4. **Sessions Récentes Enregistrées** (`#lesson-recent-module-filter`) : Boutons `[Tous les cours]`, `[Pédiatrie]`, `[Psychiatrie]` avec badge d'appartenance sur chaque ligne de session.
  - **Moteur d'Attribution & Agrégation Multi-Modules (`src/services/lessonTracker.js`)** :
    - Fonction `identifySessionModule(sess)` garantissant une attribution déterministe par métadonnée explicite (`sess.moduleId`) ou par correspondance croisée des catalogues de cours (`PEDIA_CHAPTERS` et `PSY_CHAPTERS`).
    - Méthode `getAllSessions()` agrégeant et dédupliquant de façon étanche les partitions locales (`pedia_lesson_sessions_v1` et `mod_psychiatrie_lesson_sessions`).
    - Méthodes de requêtage filtrées `getSessions(filterModuleId)` et `getLessonSummaries(filterModuleId)`.
- **Mini-Badge Flottant dans le Header (`#active-lesson-header-badge`)** :
  - Visible sur tous les écrans dès qu'un chronomètre est actif, avec voyant vert pulsant, libellé abrégé et décompte digital. Clic redirigeant vers la sous-page Chronomètre.

---

### 3.9. Système de Mises à Jour Automatiques & GitHub Releases (`src/services/updateService.js` & CI/CD)
- **Service d'Orchestration des Mises à Jour (`UpdateService`)** :
  - Version déclarée : `CURRENT_APP_VERSION = '1.6.8'` synchronisée avec `package.json` et `build.gradle` (`versionCode 35`).
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
- **Règle d'Automatisation « update github » (`GEMINI.md`, `AGENTS.md`, `.agents/rules/update_github.md`)** :
  - Déclenchée dès que l'utilisateur prononce la commande « update github » :
    1. *Incrémentation de version* : `+0.0.1` sur la version sémantique (ex: `1.4.7` ➔ `1.4.8`) et `+1` sur `versionCode` Android dans `package.json`, `src/services/updateService.js`, `android/app/build.gradle` et `template.html`.
    2. *Compilation & Bundling* : `node build-bundle.cjs` (génération de `index.html` pour Vercel, synchronisation CSS et copie dans `dist/`), puis `npx cap sync android` et compilation locale de l'APK via `build-apk.bat`.
    3. *Traçabilité* : Journalisation horodatée dans `00-historique/historique_YYYY-MM-DD.md` et mise à jour du Master Context.
    4. *Validation* : Contrôle de syntaxe Node (`node -c`).
    5. *Push GitHub & Déploiement* : `git add -A`, `git commit`, `git tag vX.Y.Z`, `git push origin main` (mise à jour instantanée du site sur Vercel) et `git push origin vX.Y.Z` (déclenchement automatique de la compilation Android et publication de la GitHub Release avec l'APK).

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
  - **Boutons d'action globale (« Tout afficher » et « Tout fermer », `window.toggleAllMedicalMedia`)** : En-tête `.medical-media-header` doté de deux contrôles rapides :
    - `[ 👁️ Tout afficher ]` (`.btn-media-expand-all`) : déplie et affiche simultanément toutes les photos médicales de la question active en clair.
    - `[ 🚫 Tout fermer ]` (`.btn-media-collapse-all`) : replie et masque d'un coup toutes les photos en mode miniature floutée.
    - Fonction `window.toggleAllMedicalMedia(forceExpand)` : supporte un booléen forcé ou une bascule dynamique intelligente (si au moins une photo est repliée, déplie tout ; sinon, replie tout).
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
- **Contextualisation Intégrale des Cas Cliniques (`buildClinicalCaseContext`)** :
  - Lorsque la question active appartient à un cas clinique (en mode séquentiel ou scroll), le Tuteur IA reçoit comme contexte d'arrière-plan :
    1. L'énoncé complet du cas clinique (la vignette clinique initiale).
    2. L'historique chronologique ordonné de toutes les sous-questions de 1 jusqu'à la sous-question courante $k$ : énoncés, propositions A-E / saisie CROQ, réponses de l'étudiant, corrigé officiel et explications.
  - Permet à l'IA de raisonner avec toute l'évolution du patient sans répétition ni contradiction avec les étapes cliniques déjà franchies.
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

### 3.16. Barre d'Outils Visuelle & Annotations UI (Agentation — Actif Partout)
- **Inclusion Permanente (`build-bundle.cjs` & `build.cjs`)** :
  - L'outil `agentation.bundle.js` (605 Ko) est **inclus dans tous les builds** (`node build-bundle.cjs` / `npm run build`), injecté dans `index.html` et `dist/index.html`, copié dans `dist/agentation.bundle.js` et pré-caché dans `sw.js` pour fonctionner en local, sur Vercel et dans l'APK Android.

---

### 3.17. Cursus Médical Complet (Arbre 6 Années / 46 Modules), Squelettes Grisés & Date d'Examen Dynamique
- **Référentiel Cursus Médical (`src/services/moduleCatalog.js`)** :
  - Cartographie exhaustive issue de l'extraction certifiée de **Mystidia Exams** couvrant 6 années de médecine (PCEM 1 à DCEM 4), 46 modules/unités d'enseignement et 1 161 cours.
  - **Statut de Disponibilité** :
    - **Pédiatrie (5ème Année)** : `available: true`, 35 cours et 1 905 questions.
    - **Psychiatrie & Pédopsychiatrie (5ème Année)** : `available: true`, 20 cours et 862 questions.
    - **44 Autres Modules** : `available: false`, rendus visuellement sous forme de cartes squelettes grisées (`.skeleton-disabled`) avec badge sombre *"Bientôt"*, curseur interdit (`not-allowed`) et micro-animation de secousse (*shake*) en cas de tentative d'accès avec infobulle pédagogique.
- **Modale Paramètres Reworkée (`#modal-settings`)** :
  - Section 1 : Accordéon hiérarchique par année d'études avec compteurs de cours et de QCM. La 5ème année est dépliée par défaut avec les cartes actives néon pour Pédiatrie et Psychiatrie.
  - Section 2 : Datepicker natif stylisé avec prévisualisation en temps réel du badge dynamique (`J-XX`, `Jour J !`, ou `Examen passé`).
  - Section 3 : Clé API Google Gemini & cascade Flash automatique.
  - Section 4 : Gestion des versions et vérification GitHub Releases.
- **En-tête Épuré du Module Actif & Date (`#dashboard-exam-banner-container` -> `.dashboard-module-header`)** :
  - Composant compact et élégant remplaçant l'ancienne bannière volumineuse : affiche le titre du module sélectionné (ex: *Psychiatrie & Pédopsychiatrie*), son badge d'année (*5ème Année*), et en sous-texte discret la date d'examen sélectionnée (ex: *Date d'examen : 10 novembre 2026 • J-28* ou invitation à fixer une date).
  - Équipé d'un bouton discret « Changer » ouvrant instantanément la modale des paramètres pour permuter de module ou éditer la date.
  - Synchronisation dynamique des métriques Hero du Dashboard (`#stat-remaining-desc` sur le nombre exact de cours du module actif et `#stat-iterations-desc` synchronisé avec la date d'échéance réelle au format court).
- **Synchronisation Dynamique du Suivi de Progression (`view-stats`)** :
  - La page de suivi s'adapte en temps réel au module actif : la matrice de chapitres (`#lesson-chapters-matrix`) et le KPI de couverture (`#kpi-lesson-coverage-val`) exploitent dynamiquement `allChapters` (20 cours pour la Psychiatrie, 35 pour la Pédiatrie).
  - Bouton de bascule globale `#btn-cmode-global` et libellés des listes déroulantes de cours actualisés selon le module sélectionné.

## 3.18. Moteur Multi-Modules Dynamique & Partitionnement de Stockage Étanche
- **Commutation Dynamique Sans Rechargement (`src/app.js` -> `switchActiveModule`)** :
  - Charge dynamiquement les banques de données correspondantes :
    - `pediatrie` -> `window.PEDIA_QUESTIONS` / `window.PEDIA_CHAPTERS`
    - `psychiatrie` -> `window.PSY_QUESTIONS` / `window.PSY_CHAPTERS`
  - Reconfigure à chaud les singletons :
    - `queueEngine.switchModule(newQuestions, newChapters)` : recalcule la file active, recharge l'état SRS et le journal du jour.
    - `studyTracker.reloadForModule()` : réinitialise l'historique de sessions et le premier passage (First Pass).
    - `lessonTracker.reloadForModule()` : recharge les chronomètres de cours et le cumul du temps d'étude par chapitre.
  - Réactualise instantanément toutes les vues UI : Dashboard (métriques, anneaux de complétion, bannière J-XX), Sélecteur de chapitres de l'Arène, Carnet de Raisonnement / Erreurs et Écran Statistiques avec toast d'alerte néon.
- **Partitionnement Sécurisé des Données (`src/services/storageScope.js`)** :
  - Prévient tout conflit entre modules (`mod_${moduleId}_...`) tout en assurant une rétrocompatibilité à 100% avec les clés existantes de la Pédiatrie (`pedia_today_tracker`, `pedia_first_pass_records_v1`, etc.) garantissant zéro perte de données.
  - Clés partitionnées pour la Psychiatrie : `mod_psychiatrie_drill_state`, `mod_psychiatrie_today_tracker`, `mod_psychiatrie_first_pass_records`, `mod_psychiatrie_lesson_tracker`, `mod_psychiatrie_reasoning_notes`, `mod_psychiatrie_study_history`, `mod_psychiatrie_lesson_sessions`.

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

## 5. Synchronisation Multi-Appareils, Firebase & Architecture Multi-Modules Distribuée

- **Fournisseur & Services Cloud** : Firebase Auth (Google Provider) & Cloud Firestore (Base de données NoSQL distribuée).
- **Authentification Hybride (Web / Mobile)** :
  - **Sur Android (APK natif)** : Utilisation de `@capacitor-firebase/authentication` (version 8.5.2) qui déclenche la boîte de dialogue native Android Google Play Services (`FirebaseAuthentication.signInWithGoogle()`). Cela évite les ouvertures de navigateur externe et résout l'erreur `missing initial state`. Le jeton d'identité `idToken` est ensuite transmis à `signInWithCredential` du SDK Web pour maintenir la session Firestore active.
  - **Sur Web / Desktop (Vercel)** : Utilisation de `window.firebase.auth().signInWithPopup(provider)` avec fallback `signInWithRedirect`.
- **Architecture Distribuée : Profil Racine & Sous-Collections Modulaires (`users/{uid}/...`)** :
  - **1. Document Profil Global (`users/{uid}/profile/state`)** :
    - Regroupe l'intégralité des préférences globales et métadonnées transversales :
      - `activeModuleId` & `activeModuleUpdatedAt` : module d'étude actif (ex: `pediatrie`, `psychiatrie`), synchronisé en temps réel inter-appareils.
      - `examDates` & `examDatesUpdatedAt` : dictionnaire exhaustif des dates d'examen `{ [moduleId]: "YYYY-MM-DD" }` partagé entre tous les appareils.
      - `settings` : mode par défaut des cas cliniques (`clinicalCaseMode`: 'sequential' | 'scroll') et clé API Google Gemini (`geminiApiKey`) chiffrée/sauvegardée.
      - `activeLessonTimer` & `activeLessonTimerUpdatedAt` : chronomètre persistant de cours en direct (`onSnapshot`).
      - `lessonSessions` : tableau consolidé de toutes les sessions d'étude de cours multi-modules.
      - `globalTodayTracker` : total cumulé des QCM effectués aujourd'hui à l'échelle du compte.
  - **2. Documents Modulaires Dédiés (`users/{uid}/modules/{moduleId}`)** :
    - Chaque module médical (Pédiatrie, Psychiatrie, et les 44 prochains modules) dispose de son propre document isolé :
      - État SRS complet : `stats` (compactées aux questions touchées), `queue`, `cursor`, `totalMistakesCount`, `snoozedQuestions`.
      - Chapitres sélectionnés : `selectedChapterIds` et `selectedChaptersUpdatedAt`.
      - Historique d'entraînement : `studyHistory` propre au module.
      - Premier passage : `firstPassRecords` `{ [questionUid]: boolean }` synchronisé pour préserver le taux de découverte intact sur tout nouvel appareil.
      - Compteur journalier du module : `todayTracker`.
      - Métadonnées de chunking : `notesCount`, `notesChunksCount`.
  - **3. Sous-Collections de Notes IA Chunkées (`users/{uid}/modules/{moduleId}/notes_chunks/chunk_{i}`)** :
    - Découpage strict des notes de raisonnement clinique par blocs de 50 items (~60 Ko par sous-document).
    - Garantit que chaque écriture et chaque document reste 25 fois sous le plafond légal de 1 Mo (1 048 576 octets) de Firestore.
  - **4. Migration Automatique et Transparente (`checkAndMigrateLegacyData`)** :
    - Lors de la première connexion avec la nouvelle architecture, détection automatique de l'ancien format `users/{uid}/pedia/progress`.
    - Transfère automatiquement l'ensemble des données, statistiques et paquets de notes vers `profile/state` et `modules/pediatrie` sans aucune perte d'historique ni perturbation utilisateur, tout en conservant l'ancien document par précaution.
- **Protocole de Fusion Bidirectionnelle Non Destructif (Convergence CRDT)** :
  - `mergeStates(local, remote)` :
    - Niveau de maîtrise : `Math.max(local.current, remote.current)`.
    - Seuil cible et fautes : `Math.max(local.target, remote.target)` plafonné à 10.
    - Statut maîtrisé : `local.done || remote.done`.
    - Notes IA : union complète sans doublon par ID stable, ordonnées de la plus récente à la plus ancienne.
    - Premier passage : fusion sécurisée `mergeFirstPassRecords(remoteRecords)` (une réussite confirmée prévaut).
    - Cours sélectionnés : la sélection avec le timestamp `selectedChaptersUpdatedAt` le plus récent est automatiquement appliquée.
  - `mergeSessions(remoteSessions)` :
    - Répartition automatique de chaque session dans sa partition locale (`pedia_lesson_sessions_v1` ou `mod_psychiatrie_lesson_sessions`) via `identifySessionModule()`.
- **Double Écouteur Temps Réel & Protection Anti-Boucle Infinie** :
  - `setupProfileListener()` : écouteur `onSnapshot` sur le profil racine répercutant instantanément les changements de dates d'examen, de clé Gemini et de chronomètre live.
  - `setupModuleListener(moduleId)` : écouteur dynamique sur la progression du module actif.
  - **Garde-fou `isApplyingRemoteSnapshot = true`** : neutralise tout re-push automatique lors de la réception d'une notification Firestore, éliminant tout risque de boucle infinie (ping-pong) entre appareils.
  - **Smart Context Switch** : si un autre appareil bascule de module, l'application bascule automatiquement si l'utilisateur est sur le Dashboard/Stats, ou affiche une notification toast non disruptive s'il est en plein QCM dans l'Arène.
- **Déclencheurs de Synchronisation** :
  - **Auto-push temporisé** (`triggerAutoPush`, délai 1 200 ms) après chaque réponse validée ou erreur enregistrée.
  - **Push immédiat des paramètres** (`pushProfileToFirestore`) au clic sur « Enregistrer les paramètres » dans `#modal-settings`.
  - **Bascule de module** (`switchListeningModule`) reconnectant immédiatement le listener Firestore.
  - **Pull complet à la connexion** (`syncOnLogin`).
  - **Boutons manuels de sauvegarde et récupération** dans la modale `#modal-sync`.

---

## 6. Architecture Mobile Native Android & Capacitor

### 6.1. Configuration Capacitor (`capacitor.config.json`) & Android
- **Package Id** : `com.pediadrill.app`
- **Nom de l'application** : `PédiaDrill`
- **Version native** : `versionName 1.6.8` (`versionCode 35`)
- **Empreinte SHA-1 (Debug Keystore Gradle & GitHub Actions)** : `87:31:A9:DF:46:90:4F:A3:3C:C0:79:DC:45:C5:BD:69:95:0B:A2:76`
- **Empreinte SHA-256 (Debug Keystore Gradle & GitHub Actions)** : `98:3A:55:73:39:BC:3B:5F:0C:BC:6C:3F:33:60:DF:E6:06:59:96:0C:74:BC:A0:BC:CB:50:D0:41:80:EF:C9:6E`
- **Keystore unifié** : `android/app/debug.keystore` (Alias : `AndroidDebugKey`, mot de passe `android`, garantissant une empreinte cryptographique identique entre les compilations locales et la CI/CD GitHub Actions).
- **Dossier web racine (`webDir`)** : `dist`
- **Fichier de configuration Firebase Android** : `android/app/google-services.json` (Projet `qcm-pediatr`, Package `com.pediadrill.app`).
- **Plugin Gradle Google Services** : `com.google.gms.google-services` (version `4.4.4`) activé automatiquement à la présence de `android/app/google-services.json`.
- **Configuration des plugins Capacitor (`capacitor.config.json`)** :
  - `plugins.FirebaseAuthentication` : `skipNativeAuth: false`, `providers: ["google.com"]` (requis pour instancier le handler natif Android `GoogleAuthProviderHandler`).
- **Ressources natives Android (`strings.xml`)** : `default_web_client_id` explicitement déclaré avec l'ID client Web OAuth Google (`1028938391462-hfo44kaj789r1ruovt4b4v59he6jvarq.apps.googleusercontent.com`).
- **Dépendances natives & UI embarquées** : `@capacitor/core` (8.5.3), `@capacitor/cli` (8.5.3), `@capacitor/android` (8.5.3), `@capacitor/app` (8.1.2 — bouton Retour matériel Android), `@capacitor-firebase/authentication` (8.5.2), `lucide` (1.13.0) et `canvas-confetti` (1.9.4) copiées localement dans `vendor/` et `dist/vendor/`.
- **Ergonomie Native & Dialogues Non-Bloquants (`uiDialogs.js`, `setupNativeCapacitorBackButton`)** :
  - Suppression de 100% des `alert()` et `confirm()` bloquants au profit de Toasts colorés (`showAppToast`) et d'une modale asynchrone in-app `#modal-app-confirm` (`showConfirmModal`).
  - Gestion hiérarchique du bouton Retour matériel Android (`backButton`) : fermeture prioritaire des confirmations / lightbox / chatbox Tuteur IA / modales ouvertes -> retour vers le Dashboard depuis les vues secondaires -> `exitApp()` uniquement sur le Dashboard racine.

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

- **Compilation Web PWA** : `node build-bundle.cjs` / `npm run build` (prépare `index.html`, `vendor/` et `dist/` en incluant `agentation.bundle.js` partout).
- **Déploiement Web Cloud (Vercel & GitHub)** :
  - **Fichier servi par Vercel** : Conformément à `vercel.json` (`"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]`), Vercel sert directement le fichier racine `index.html` et `./vendor/*`.
  - **Assemblage obligatoire** : Toute modification apportée aux sources dans `src/` doit être compilée via `node build-bundle.cjs` qui synchronise `template.html`, `src/app.bundle.js`, `index.html`, `vendor/` et `dist/`.
  - **Protocole de validation pré-déploiement** :
    1. Validation des sources & du bundle généré : `node -c src/app.js` et `node -c src/app.bundle.js`.
    2. Exécution complète des tests automatisés : `npm test` (`node --test tests/*.test.js`).
    3. Vérification de l'assemblage : pas de CDN bloquants et `agentation.bundle.js` présent dans `dist/` et `index.html`.
- **Compilation Mobile Android (APK)** :
  1. `node build-bundle.cjs` : assemble le code client et synchronise le CSS dans `template.html`, `src/app.bundle.js`, `vendor/` et `dist/`.
  2. `npx cap sync android` : synchronise les assets web (`dist/`) et les plugins natifs (`@capacitor/app`, `@capacitor-firebase/authentication`) dans `android/`.
  3. `build-apk.bat` : exécute `:app:assembleDebug` avec le JDK Android Studio et copie automatiquement l'APK généré sous `PediaDrill.apk` à la racine du projet.
- **Scripts `package.json` disponibles** :
  - `npm run build` : assemblage complet (`node build-bundle.cjs`) en mode production.
  - `npm run build:dev` : assemblage incluant `agentation.bundle.js` pour inspection UI.
  - `npm test` : suite de tests automatisés (`node --test tests/*.test.js`).
  - `npm run start` : prévisualisation locale du dossier `dist/` via `npx serve`.
  - `npm run build:apk` : build web + sync Capacitor + génération du fichier `.apk`.
  - `npm run open:android` : ouverture du projet natif dans l'interface graphique Android Studio.

---

## 8. Architecture de Performance & Optimisations « Sous le capot » (Catégorie 1)

Dans le respect absolu de l'intégrité de l'application (zéro modification visuelle, zéro fonctionnalité supprimée), un ensemble d'optimisations algorithmiques et structurelles a été déployé pour garantir une réactivité instantanée (« snappy ») sur le site web et l'application mobile :

### 8.1. Indexation Hash Map O(1) du Dataset Médical
- **Problématique résolue** : L'accès aux 1 905 questions et aux 35 chapitres était historiquement géré par des parcours linéaires `Array.prototype.find()` répétés ($O(N)$). Lors de l'hydratation d'un carnet contenant 200 notes d'erreurs, l'application exécutait jusqu'à $200 \times 1\,905 = 381\,000$ itérations bloquant le thread d'exécution principal.
- **Architecture de hachage** :
  - Création de `questionsMap` (`Map<uid, Question>`) et `chaptersMap` (`Map<id, Chapter>`) mémoïsées.
  - Résolution immédiate en $O(1)$ dans tous les points névralgiques : `hydrateNote()`, `getCurrentQuestion()`, `scrubCorruptedAiExplanations()`, `getSavedAiExplanation()`, `saveAiExplanationForQuestion()`, `renderQuestionCard()`, `groupNotesByChapterAndQuestion()`, `renderNotebookUI()` et `renderStatsChapters()`.
  - Temps d'accès réduit de plusieurs centaines de millisecondes à moins de 0.01 ms.

### 8.2. Rendu Ciblé et Scope DOM du Moteur d'Icônes Lucide (`refreshLucide`)
- **Problématique résolue** : L'appel de `window.lucide.createIcons()` sans argument forçait le navigateur à rescanner l'intégralité du DOM (arbre de milliers de nœuds) jusqu'à 3 fois par réponse validée, causant des micro-gels (layout thrashing).
- **Solution** : Support d'un paramètre de conteneur racine `refreshLucide(container)` utilisant l'option native `{ root: container }`. Seul le composant ou la carte concernée est scanné et transformé en SVG, éliminant tout recalcul global de layout.

### 8.3. Décompte d'Éléments Léger sans Hydratation (`getRawReasoningNotes`)
- Pour alimenter les pastilles numériques, compteurs du dashboard et badges récapitulatifs, l'appel à `getReasoningNotes().length` provoquait l'hydratation et la désérialisation complète de toutes les notes stockées.
- Remplacement systématique par `getRawReasoningNotes().length` qui lit directement la taille du tableau brut sans boucle ni instanciation d'objets.

### 8.4. Mémoïsation des Métriques Statistiques (`_cachedMetrics`)
- Les calculs statistiques du tableau de bord (taux de maîtrise, temps restant estimé, questions éliminées) sont mis en cache dans l'instance `QueueEngine` et conservés tant que l'état SRS ne subit pas de nouvelle mutation (`saveState()`), accélérant drastiquement le passage entre les vues de l'application.

### 8.5. Suppression du Clone JSON Profond Synchrone
- Dans `pushToAnsweredHistory()`, le clone lourd `JSON.parse(JSON.stringify(question))` a été remplacé par une copie superficielle immuable `{ ...question }`, évitant la sérialisation / désérialisation d'une structure de données médicale complexe à chaque validation de question.

### 8.6. Réactivité Tactile Mobile & Suppression du Délai de 300 ms
- Application de la règle CSS universelle `touch-action: manipulation;` et `-webkit-tap-highlight-color: transparent;` sur tous les sélecteurs interactifs (`button`, `a`, `input`, `select`, `textarea`, `.option-item`, `.nav-tab-btn`, `.chapter-select-item`, `.notebook-chapter-header`, `.medical-media-inner`, `[role="button"]`).
- Annule l'attente native de 300 ms du navigateur mobile pour détecter un éventuel double-tap pour zoomer, rendant le retour tactile instantané dès l'effleurement du doigt.

### 8.7. Vendors Locaux Embarqués & Indépendance CDN (`vendor/` & `dist/vendor/`)
- Suppression des dépendances CDN externes bloquantes (`unpkg.com/lucide`, `cdn.jsdelivr.net/npm/canvas-confetti`) dans `template.html` au profit des fichiers UMD locaux `vendor/lucide.min.js` et `vendor/confetti.browser.min.js`, copiés automatiquement depuis `node_modules/` par `build.cjs` vers `vendor/` (Vercel) et `dist/vendor/` (Capacitor APK & PWA).

### 8.8. Service Worker & Pré-Cache Offline Enrichi (`sw.js`)
- Rénovation du cache PWA (`CACHE_NAME = 'pedia-drill-v1.6.4-r2'`) ciblant avec exactitude tous les fichiers compilés de production (`./`, `./index.html`, `./manifest.json`, `./icon-192.svg`, `./icon-512.svg`, `./vendor/lucide.min.js`, `./vendor/confetti.browser.min.js`).
- Implémentation du pattern `Stale-While-Revalidate` pour les ressources locales et `Network-First` pour le document HTML, assurant un fonctionnement 100% hors-ligne y compris pour toutes les icônes SVG et animations de célébration.

### 8.9. Architecture Modulaire, Hygiène & Performance UI (Catégorie 2)
- **Modularisation ESM (`src/utils/`, `src/state/`, `src/views/`, `src/app.js`)** : Découpage de l'ancien monolithe `app.js` (8 511 lignes) en 6 vues dédiées (`dashboardView`, `clinicalCaseView`, `arenaView`, `notebookView`, `statsView`, `lessonView`), un état partagé (`appState.js`) et des utilitaires purs (`formatters.js`, `uiDialogs.js`), assemblés en un bundle unique IIFE par `build-bundle.cjs` directement depuis `src/data/*.js`.
- **Fluidité visuelle (`0.14s`, `behavior: 'auto'`)** : Transitions CSS raccourcies à `0.14s`, micro-échelle tactile `:active { transform: scale(0.985) }` sur boutons et cartes d'options, et remplacement des défilements `behavior: 'smooth'` lents par `behavior: 'auto'`.
- **Sécurité XSS & Rendu Markdown dans les propositions** : Utilisation systématique de `escapeHtml()` et `parseMarkdownInline()` dans le rendu des options QCM/Arène/Historique/Cas cliniques/Modale chapitres pour afficher correctement les inégalités médicales (`<`, `>`) sans casser le DOM.
- **Modale de Confirmation Non-Bloquante (`#modal-app-confirm`, `showConfirmModal`)** : Utilise `.modal-content.confirm-modal-card` avec `z-index: 10500` (au-dessus des éléments flottants de l'arène), en-tête `.modal-title-group` et fermeture `.close-btn.btn-icon-close`, permettant notamment de quitter proprement un cas clinique en cours via `#btn-quit-clinical-run` (`teardownClinicalRunView` réinitialisant `isClinicalRunActive`, `clinicalRunState` et `isEvaluating`).
- **Suite de Tests Automatisés (`npm test` -> `node --test tests/*.test.js`)** : 36 tests automatisés couvrant formatage/XSS, sécurité Gemini & multi-clés, algorithme SRS & fuseau local, fusion Firestore & chronomètre multi-modules, traduction directe & préférences/sync, intégrité du bundle IIFE, pagination 30 fiches du Carnet, badge des questions à nettoyer en cas clinique, sortie du cas clinique après réponse à la 1ère question et bouton Retour Android.

---

### 3.12. Traduction Instantanée au Surlignage (`translateService.js` & `selectionTranslator.js`)
- **Déclenchement universel sur les contenus médicaux** : Actif par défaut sur `#view-arena`, `#view-notebook`, `#modal-error`, `#modal-clinical-case-summary` et `#arena-ai-chatbox` (incluant énoncés, cas cliniques, options A–E grâce à `.option-text { user-select: text; }`, explications et réponses du Tuteur IA). Une garde `hasActiveTextSelection()` dans `arenaView.js` et `clinicalCaseView.js` empêche de cocher/décocher une proposition QCM lors d'un surlignage.
- **Moteur Google Traduction direct sans cache persistant** : `translateWithGoogle()` interroge directement `https://translate.googleapis.com/translate_a/single` avec annulation par `AbortController` et découpage automatique en segments (`splitTextIntoTranslateChunks`) afin d'accepter les sélections de toute longueur sans troncature.
- **4 Langues cibles** : Arabe (`ar`, défaut avec `dir="rtl"`), Anglais (`en`), Français (`fr`), Allemand (`de`), commutables en direct dans la bulle flottante `#selection-translate-popover` ou via les Paramètres.
- **Résilience hors-ligne & Enrichissement Gemini IA** : En cas d'erreur réseau ou d'absence de connexion (`OFFLINE_ERROR`), la bulle affiche un message d'erreur explicite avec un bouton manuel **« Traduire avec Gemini IA »** (`geminiService.translateWithGemini`). Un bouton permanent **« 💡 Sens médical (IA) »** (`geminiService.explainMedicalTerm`) complète la traduction par une explication clinique contextualisée au module actif.
- **Activation / Désactivation & Sync Cloud** : Le panneau Paramètres (`#modal-settings`) intègre le bouton `#btn-toggle-translate-enabled` (permettant d'activer ou désactiver la traduction au surlignage en 1 clic) et le sélecteur `#settings-translate-lang`, tous deux persistés en local (`pedia_translate_enabled`, `pedia_translate_lang`) et synchronisés via Firestore (`remoteProfile.settings.highlightTranslateEnabled`, `highlightTranslateLang`) selon `settingsUpdatedAt`.
- **Ergonomie & Fermeture** : Bulle flottante positionnée près de la sélection sur Desktop et Mobile (bornée au viewport), zone de résultat scrollable (`max-height: 235px`), bouton Copier, et fermeture automatique au clic extérieur, touche `Échap`, bouton Retour matériel Android, changement de vue ou passage à la question suivante.
