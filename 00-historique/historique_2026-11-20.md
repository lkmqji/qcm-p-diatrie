# Historique des Modifications — 20 Novembre 2026

## 09:00:00 — Intégration de l'Explication IA par Question dans les Cas Cliniques & Contexte Clinique Enrichi pour le Tuteur IA

### Contexte & Objectif
1. **Génération d'explication IA par sous-question dans les Cas Cliniques** :
   - Dans les cas cliniques, lorsqu'un étudiant résout les questions une par une (en mode séquentiel ou en mode déroulant / scroll), l'explication officielle est parfois absente de la base ou incomplète.
   - Ajout d'une option directe pour générer à la demande une explication et un raisonnement clinique détaillé par IA (Gemini Flash), avec persistance dans le cache et le Carnet de notes (`aiExplanationsCache` / `saveAiExplanationForQuestion`).
2. **Contextualisation intégrale du Cas Clinique dans le Chatbox Tuteur IA (`#arena-ai-chatbox`)** :
   - Lorsque l'étudiant pose une question au tuteur IA alors qu'il se trouve sur une sous-question d'un cas clinique (par exemple la question 3/5), le chatbox reçoit désormais comme contexte enrichi :
     1. L'énoncé complet du cas clinique (la vignette clinique).
     2. L'historique chronologique de toutes les sous-questions de 1 jusqu'à la question courante $k$, avec leurs intitulés, propositions (A-E ou CROQ), réponses de l'étudiant, réponses correctes et explications officielles/IA.

---

### Actions Réalisées

#### 1. Service Gemini (`src/services/gemini.js`)
- **Extension de `generateReasoningNote`** :
  - Accepte désormais un paramètre optionnel `clinicalCaseContext`.
  - Quand un contexte clinique est fourni, le prompt IA intègre le dossier clinique complet, le numéro de la sous-question au sein du cas, ainsi que l'historique chronologique des étapes diagnostiques et thérapeutiques franchies pour une explication contextualisée et ultra-précise.
- **Extension de `askAboutQuestion`** :
  - Accepte désormais un paramètre optionnel `clinicalCaseContext`.
  - Injecte dans le prompt du Tuteur IA la structure complète du cas clinique :
    - Énoncé / vignette clinique initial(e).
    - Chronologie des sous-questions 1 à $k$ avec propositions, choix de l'étudiant, corrigé officiel et explications.
  - Permet au tuteur IA de comprendre parfaitement l'évolution du patient (anamnèse, examen physique, paraclinique, diagnostic, thérapeutique) avant de répondre aux questions de l'étudiant.

#### 2. Logique Applicative (`src/app.js`)
- **Fonction utilitaire `buildClinicalCaseContext(question)`** :
  - Détecte si la question courante appartient à une session de cas clinique active (`clinicalRunState`) ou à un cas clinique standard du paquet.
  - Reconstitue le dossier complet : énoncé du cas, liste ordonnée des sous-questions de $1$ à l'index courant $k$, réponses fournies par l'utilisateur, statuts de validation et explications associées.
- **Rendu unifié de l'explication séquentielle `renderClinicalExplanationArea(subQ, isCorrect, correctLettersStr)`** :
  - Gère l'en-tête de validation (bonne / mauvaise réponse).
  - Affiche l'explication officielle si présente, ou un avertissement stylisé si manquante.
  - Affiche le bouton d'action IA :
    - Si non générée : « Générer l'explication IA (Gemini Flash) » (ou « Approfondir avec l'explication IA » si une explication officielle existe).
    - Si déjà générée : bandeau persistant avec lien « Régénérer ».
  - Appelle `renderArenaAiExplanation(subQ)` pour afficher de manière persistante le bloc détaillé IA (`#arena-ai-explanation-box`).
- **Générateurs interactifs IA** :
  - `window.requestClinicalSubQuestionAiExplanation(forceRegen)` : génère l'explication IA de la sous-question courante en mode séquentiel, persiste le résultat dans le cache/carnet et met à jour l'arène.
  - `window.requestClinicalCardAiExplanation(idx, forceRegen)` : génère l'explication IA pour une carte spécifique en mode déroulant / scroll, avec loader animé, persistance et actualisation visuelle immédiate.
- **Intégration dans `renderClinicalScrollView`** :
  - Chaque carte évaluée affiche désormais le retour d'évaluation officiel (et CROQ le cas échéant), ainsi que l'explication IA (bloc complet si existant, ou bouton pour la générer d'un simple clic).
- **Intégration dans le Chatbox de l'Arène (`executeSendMessage`, `updateArenaChatContext`, `renderChatWelcome`)** :
  - Transmission systématique de `buildClinicalCaseContext(effQ)` au service Gemini pour que toutes les interactions avec le Tuteur IA prennent en compte le déroulement complet du cas clinique jusqu'à la sous-question actuelle.

#### 3. Styles & Design Cyber-Médical (`src/style.css`)
- Stylisation du bouton `.btn-card-gen-ai-exp` (dégradé néon cyan/violet, effet hover glow, état désactivé avec loader).
- Stylisation du conteneur `.clinical-card-ai-note` (fond sombre vitré, bordure cyan, scrollbar fine).
- Stylisation des en-têtes et boutons de régénération (`.clinical-card-ai-header`, `.clinical-card-ai-title`, `.btn-card-regen-ai`, `.clinical-card-ai-body`).

#### 4. Compilation & Vérification
- Validation syntaxique réussie (`node -c src/app.js`, `node -c src/services/gemini.js`, `node -c src/app.bundle.js`).
- Compilation des bundles de production via `node build-bundle.cjs` (génération de `dist/index.html` et `index.html`).
- Synchronisation Capacitor Android exécutée avec succès (`npx cap sync android`).

---

## 10:30:00 — Release v1.6.0 (versionCode 27) : Déploiement Vercel & Publication GitHub Release

### Contexte & Objectif
- Publication officielle de la version **v1.6.0** (versionCode 27) suite à la commande utilisateur **« update github »**.
- Intégration de l'option de génération d'explication IA par sous-question dans les Cas Cliniques (modes séquentiel et déroulant).
- Enrichissement du contexte clinique complet (dossier initial + historique chronologique des questions 1 à $k$) dans le Tuteur IA en direct (`#arena-ai-chatbox`).

---

### Actions Réalisées

#### 1. Incrémentation de Version & Alignement Multisupport
- Passage de la version applicative de `1.5.9` à **`1.6.0`** (+0.0.1).
- Incrémentation du `versionCode` Android de `26` à **`27`** (+1).
- Synchronisation rigoureuse dans :
  - `package.json` : `"version": "1.6.0"`
  - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.6.0'`
  - `android/app/build.gradle` : `versionCode 27`, `versionName "1.6.0"`
  - `template.html` : `#update-modal-curr-version`, `#update-modal-new-version` et `#settings-current-app-version` en `v1.6.0`.
  - `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md` : synchronisé avec `1.6.0` et `versionCode 27`.

#### 2. Fonctionnalités Embarquées dans cette Release (v1.6.0)
- **Génération d'Explication IA par Sous-Question (Cas Cliniques)** :
  - Bouton dynamique *« Générer l'explication IA (Gemini Flash) »* / *« Approfondir avec l'explication IA »* en mode séquentiel et scroll.
  - Alerte visuelle claire en cas d'explication officielle manquante dans la base de questions.
  - Démarche de raisonnement en 4 volets cliniques générée par Gemini Flash et persistée dans le Carnet de notes (`aiExplanationsCache`).
- **Contextualisation Intégrale dans le Tuteur IA (`#arena-ai-chatbox`)** :
  - Transmission au tuteur IA de l'énoncé du cas clinique et de la totalité des sous-questions de 1 à $k$ (énoncé, propositions, réponses de l'étudiant, corrigé officiel et explications).
  - Élimination des contradictions et prise en compte de toute l'évolution du patient au fil du dossier pédiatrique.

#### 3. Compilation, Synchronisation & Assemblage
- Exécution réussie de `node build-bundle.cjs` :
  - Styles `src/style.css` synchronisés dans `template.html`.
  - Bundle modulaire `src/app.bundle.js` recompilé avec succès.
  - `index.html` et `dist/index.html` synchronisés pour le déploiement continu Vercel.
- Synchronisation Capacitor Android exécutée avec succès (`cmd.exe /c npx.cmd cap sync android`).
- Compilation locale de l'APK via `build-apk.bat` (`PediaDrill.apk` à la racine).
- Déclenchement automatique de la GitHub Release via le tag `v1.6.0` et GitHub Actions.

---

## 20:20:00 — Ajustement Règle Cas Cliniques : Exclusion des Questions Déjà Nettoyées du Compteur Journalier

### Contexte & Feedback Utilisateur
- Retour utilisateur : *« non ça est faux normalement tu ne compte pas les question déjas nettoiyé »*.
- **Règle métier ajustée** : Lorsqu'un étudiant résout un cas clinique complet contenant des sous-questions déjà préalablement nettoyées / éliminées (`st.done === true`), ces questions ne doivent pas être recomptées dans le quota quotidien d'entraînement.
- **Principe d'intégrité de la progression** : Seules les sous-questions **actives** (qui n'étaient pas encore nettoyées) font avancer le compteur journalier (`incrementTodayCount(activeCreditedCount)`).

### Actions Réalisées
1. **Moteur SRS (`src/services/queueEngine.js` - `handleClinicalCaseSuccess`)** :
   - Détection systématique de `wasAlreadyDone = !!st.done` pour chaque question du cas.
   - Les questions déjà nettoyées ne subissent plus de fausse incrémentation de leur score (`st.current`) et ne sont pas recomptées dans `activeCreditedCount`.
   - Seules les questions actives avancent (`st.current += 1`) et déclenchent si éligibles le statut maîtrisé (`newlyMasteredCount++`).
   - Retourne `activeCreditedCount`, `alreadyMasteredCount` et `newlyMasteredCount`.
2. **Contrôleur de l'Arène (`src/app.js` - `validateAllClinicalSubQuestions` & `showClinicalCaseSummaryModal`)** :
   - Capture de la liste des questions déjà nettoyées avant validation (`alreadyCleanedUids`).
   - Appel conditionnel : `if (activeCreditedCount > 0) queueEngine.incrementTodayCount(activeCreditedCount)`.
   - Modale de bilan : affichage clair de la distinction entre les questions actives ayant progressé et celles déjà nettoyées, avec pastilles distinctes dans la liste des résultats (`Déjà nettoyée` vs `+1 au jour`).
3. **Compilation & Intégrité** :
   - Synchronisation et recompilation via `node build-bundle.cjs`.
   - Validation syntaxique `node -c src/services/queueEngine.js`, `node -c src/app.js`, `node -c src/app.bundle.js` sans aucune erreur.

---

## 20:35:00 — Release v1.6.1 (versionCode 28) : Déploiement Vercel & Publication GitHub Release

### Contexte & Objectif
- Publication officielle de la version **v1.6.1** (versionCode 28) faisant suite à la commande utilisateur **« update github »**.
- Intégration de la règle stricte de non-recomptabilisation des questions déjà nettoyées dans les Cas Cliniques (seules les questions encore actives sont ajoutées au compteur journalier).
- Affichage transparent dans la modale de bilan des questions actives créditées (`+1 au jour`) et des questions déjà maîtrisées (`Déjà nettoyée`).

---

### Actions Réalisées

#### 1. Incrémentation de Version & Alignement Multisupport
- Passage de la version applicative de `1.6.0` à **`1.6.1`** (+0.0.1).
- Incrémentation du `versionCode` Android de `27` à **`28`** (+1).
- Synchronisation rigoureuse dans :
  - `package.json` : `"version": "1.6.1"`
  - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.6.1'`
  - `android/app/build.gradle` : `versionCode 28`, `versionName "1.6.1"`
  - `template.html` : `#update-modal-curr-version`, `#update-modal-new-version` et `#settings-current-app-version` en `v1.6.1`.
  - `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md` : synchronisé avec `1.6.1` et `versionCode 28`.

#### 2. Fonctionnalités Embarquées dans cette Release (v1.6.1)
- **Intégrité du Compteur Journalier pour les Cas Cliniques** :
  - `handleClinicalCaseSuccess` distingue les questions déjà nettoyées (`wasAlreadyDone = !!st.done`) et n'incrémente plus le compteur quotidien que pour les questions actives (`activeCreditedCount`).
  - Élimination des faux incréments et du gonflement artificiel des statistiques sur des questions déjà maîtrisées.
- **Rendu Visuel Détaillé du Bilan** :
  - Modale de synthèse mise à jour : décompte précis des questions actives ajoutées (`+X question(s) ajoutée(s) au compteur du jour`) et rappel des sous-questions déjà acquises.
  - Étiquettes explicites sur chaque item : `+1 au jour` (vert émeraude) ou `Déjà nettoyée` (gris neutre).

#### 3. Compilation, Synchronisation & Assemblage
- Exécution réussie de `node build-bundle.cjs` :
  - Styles `src/style.css` synchronisés dans `template.html`.
  - Bundle modulaire `src/app.bundle.js` recompilé avec succès.
  - `index.html` et `dist/index.html` synchronisés pour le déploiement continu Vercel.
- Synchronisation Capacitor Android exécutée avec succès (`cmd.exe /c npx.cmd cap sync android`).
- Compilation locale de l'APK via `build-apk.bat` (`PediaDrill.apk` à la racine).
- Déclenchement automatique de la GitHub Release via le tag `v1.6.1` et GitHub Actions.

---

## 23:59:00 — Refonte Intégrale de la Synchronisation Multi-Appareils (Profil Global, Multi-Modules & Anti-Écrasement Firestore)

### Contexte & Objectif
- L'audit approfondi du système de synchronisation inter-appareils a mis en évidence plusieurs failles majeures dans le modèle historique :
  1. Le chemin Firestore était figé en dur sur `users/{uid}/pedia/progress`, provoquant l'écrasement de la progression de pédiatrie dès qu'un étudiant révisait en psychiatrie.
  2. Les dates d'examen (`pediadrill_exam_date_*`), le module actif (`pediadrill_active_module_id`), le mode de résolution des cas cliniques (`pedia_clinical_case_mode`) et la clé API Gemini (`pedia_gemini_key`) étaient cantonnés au `localStorage` de chaque machine sans aucune synchronisation inter-appareils.
  3. Le dictionnaire de découverte au premier passage (`firstPassRecords`) n'était jamais synchronisé avec le Cloud.
  4. L'historique et le cumul de travail quotidien (`todayTracker`, `studyHistory`) étaient restreints au seul module actif.
- Déploiement de l'architecture d'élite **Profil Racine + Sous-Collection Modulaire Chunkée** garantissant la synchronisation totale en temps réel de toutes les données du profil étudiant entre PC, Smartphone Android et Tablette.

---

### Actions Réalisées

#### 1. Catalogue Médical (`src/services/moduleCatalog.js`)
- Ajout de `getAllExamDates()` : exporte l'ensemble des dates d'examen configurées pour tous les modules sous forme de dictionnaire `{ [moduleId]: "YYYY-MM-DD" }`.
- Ajout de `setAllExamDates(datesMap)` : applique et sauvegarde de manière non destructive toutes les dates d'examen distantes reçues du Cloud.
- Export dans `window.ModuleCatalog`.

#### 2. Suivi d'Étude & Premier Passage (`src/services/studyTracker.js`)
- Ajout de `getRawFirstPassRecords()` : extrait le dictionnaire des réussites/échecs à la première confrontation du module actif.
- Ajout de `mergeFirstPassRecords(remoteRecords)` : fusionne intelligemment les enregistrements de premier passage (une réussite confirmée sur un appareil l'emporte, aucune perte d'historique).

#### 3. Chronomètre & Sessions de Cours (`src/services/lessonTracker.js`)
- Rénovation de `mergeSessions(remoteSessions)` : partitionne automatiquement les séances de révision synchronisées dans leurs espaces respectifs (`pedia_lesson_sessions_v1` ou `mod_psychiatrie_lesson_sessions`) grâce à `identifySessionModule()`, évitant tout mélange ou écrasement de séances.
- Sécurisation défensive de `this.lastTimerClearedAt` pour les environnements de test / SSR headless sans `localStorage`.

#### 4. Service de Synchronisation Firebase (`src/services/firebaseSyncService.js` - Refactorisation Complète)
- **Architecture Distribuée Firestore** :
  - `users/{uid}/profile/state` : regroupe le module actif, les dates d'examen de tous les modules, le mode de cas clinique, la clé API Gemini, le chronomètre actif en direct, les sessions globales et le cumul du jour.
  - `users/{uid}/modules/{moduleId}` : document dédié par module pour les statistiques SRS, la file d'attente circulaire, le curseur, les cours sélectionnés, les questions mises en sommeil, l'historique d'entraînement et le premier passage.
  - `users/{uid}/modules/{moduleId}/notes_chunks/chunk_{i}` : sous-collection partitionnant les notes de raisonnement IA par blocs de 50 items (~60 Ko), éliminant tout risque de dépassement du plafond de 1 Mo de Firestore.
- **Migration Automatique Rétro-compatible (`checkAndMigrateLegacyData`)** :
  - Détecte l'ancien format `pedia/progress` lors de la première connexion.
  - Migre automatiquement et sans perte toutes les données et les paquets de notes vers `profile/state` et `modules/pediatrie`. Conserve l'ancien document comme sauvegarde de secours.
- **Double Écouteur Temps Réel & Anti-Boucle Infinie** :
  - `setupProfileListener()` : écoute les modifications de profil (module actif, dates, réglages, chronomètre).
  - `setupModuleListener(moduleId)` : écoute dynamiquement la progression du module en cours.
  - Drapeau `isApplyingRemoteSnapshot = true` : neutralise tout re-push automatique lors de la réception d'un événement distant, éliminant les boucles ping-pong de synchronisation.
- **Synchronisation du Module Actif à la Volée** :
  - Détection du basculement de module distant (`onRemoteModuleSwitch`) : bascule en douceur l'affichage de l'appareil récepteur s'il est sur le Dashboard/Stats, ou affiche une notification non intrusive s'il est en train de répondre à une question dans l'Arène.

#### 5. Contrôleur Principal (`src/app.js`)
- `new FirebaseSyncService(...)` : enrichi avec le gestionnaire `onRemoteModuleSwitch`.
- `switchActiveModule(modId, fromRemote)` : synchronise dynamiquement l'écouteur Firestore vers le nouveau module sélectionné et notifie le Cloud en arrière-plan.
- `btnSaveSettings.onclick` : appelle immédiatement `firebaseSyncService.pushProfileToFirestore()` dès l'enregistrement des paramètres, répercutant instantanément les dates d'examen, la clé Gemini et le mode de cas clinique sur tous les appareils connectés.

#### 6. Assemblage & Tests de Validation
- Exécution de `node build-bundle.cjs` :
  - Bundle unifié `src/app.bundle.js` généré avec succès (523 903 octets).
  - Fichier de déploiement `index.html` (6,59 Mo) et `dist/index.html` synchronisés.
- Validation syntaxique Node (`node -c`) sur l'ensemble des sources (`moduleCatalog.js`, `studyTracker.js`, `lessonTracker.js`, `firebaseSyncService.js`, `app.js`, `app.bundle.js`).
- Validation VM de l'ensemble des 5 balises `<script>` intégrées dans `dist/index.html`.
- Test unitaire d'intégrité de la fusion non-destructive (`mergeStates`) exécuté avec succès sous Node.js.

