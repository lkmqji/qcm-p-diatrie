# Historique des modifications - 2026-10-26

### 13:10 - Affichage de la date/session du QCM, persistance des explications IA en Arène et synchronisation multi-appareils des cours sélectionnés

- **Affichage de la date et session du QCM (`#arena-chapter-title`)** :
  - Création de la fonction d'extraction sémantique `extractQuestionDateOrSession(q)` dans `src/app.js` qui détecte automatiquement les métadonnées de date, année, session de concours (`P 2020`, `P1 2021`, `R 2019`, `EMD 2022`, `Session 2021`, `Principale 2020`, `Rattrapage 2022`) ou source de diapositive/référentiel (`Diapo 2024`, `Diapositive 2026`, `iKb 2024`, `Guide 2022`).
  - Lorsque la date ou session n'est pas explicitement mentionnée dans le libellé ou l'explication, l'application applique la pastille de session par défaut `P? 20??`.
  - Intégration de la pastille `.question-date-pill` avec icône calendrier `calendar` dans le titre du chapitre (`#arena-chapter-title > .chapter-title-text`) aussi bien en mode drill actif (`loadNextArenaQuestion`) qu'en mode révision d'historique (`renderHistoryQuestion`).
  - Respect du flou anti-spoiler : la pastille de date est floutée avec le nom du cours tant que la question n'a pas été répondue ou défloutée manuellement par l'étudiant.

- **Sauvegarde et persistance des explications IA pour les questions précédentes (`view-arena > .question-container`)** :
  - Création du composant dédié `#arena-ai-explanation-box` (`.arena-ai-explanation-card`) inséré directement dans le conteneur de question sous l'explication officielle.
  - Implémentation du système de cache local persistant (`pedia_ai_explanations_cache`) et interconnexion avec les fiches du Carnet de Raisonnement (`queueEngine.getReasoningNotes()`) et les snapshots de l'historique (`answeredHistory`).
  - Lors de la consultation des questions précédentes (`renderHistoryQuestion`), l'explication clinique IA déjà générée est automatiquement restaurée et affichée dans la carte avec le badge du modèle (`Gemini 3.8 Flash`).
  - Si aucune explication IA n'avait été générée lors du premier passage (ex: question répondue juste du premier coup), une boîte d'action invite l'étudiant avec un bouton `[Générer l'explication clinique IA (Gemini Flash)]` (`window.requestArenaAiExplanation`), qui génère la note, l'enregistre dans le carnet et déclenche la synchronisation cloud.
  - Sauvegarde et persistance des échanges du Tuteur IA par question (`questionChatHistories[effQ.uid]`) : les messages échangés avec le tuteur dans `#arena-ai-chatbox` sont désormais conservés par identifiant de question et restaurés fidèlement lors de chaque retour en arrière.

- **Synchronisation en direct des cours sélectionnés entre les appareils (`#btn-open-chapters`)** :
  - Ajout du suivi d'horodatage `selectedChaptersUpdatedAt` dans `QueueEngine` (`constructor`, `initSession`, `loadState`, `saveState`, `getStateObject`, `applyMergedState`).
  - Refonte de la logique de fusion `mergeStates` dans `src/services/firebaseSyncService.js` et `src/services/syncService.js` : comparaison des timestamps `local.selectedChaptersUpdatedAt` vs `remote.selectedChaptersUpdatedAt` pour que la dernière sélection effectuée sur un appareil (mobile ou PC) s'applique fidèlement sur tous les autres appareils.
  - Dans `applyChapterSelection()`, mise à jour de l'horodatage et déclenchement automatique d'un push cloud immédiat (`firebaseSyncService.triggerAutoPush()`).
  - Lors de la réception en temps réel de nouveaux cours sélectionnés via Firestore, `applyMergedState` réinitialise dynamiquement la file de travail et met à jour en direct le libellé du bouton `#btn-open-chapters` sur le dashboard.

- **Compilation et Déploiement** :
  - Exécution du script de bundling `build-bundle.cjs` : synchronisation du CSS dans `template.html`, compilation de `src/app.bundle.js`, assemblage d'un fichier autonome `index.html` et synchronisation vers le dossier de distribution `dist/`.

### 13:20 - Préparation et Publication de la Release v1.3.0
- **Incrémentation de version** : Passage à la version `v1.3.0` dans l'ensemble du projet :
  - `package.json` : `"version": "1.3.0"`
  - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.3.0'`
  - `android/app/build.gradle` : `versionCode 5`, `versionName "1.3.0"`
  - `template.html` : badge `#settings-current-app-version` passé à `v1.3.0`
- **Recompilation & Synchronisation** :
  - Régénération de `src/app.bundle.js`, `index.html` et `dist/index.html`.
  - Exécution de `build-apk.bat` avec synchronisation Capacitor Android et compilation Gradle native (`assembleDebug`) produisant `PediaDrill.apk` (6,88 Mo).
- **Publication GitHub & Mises à Jour Android** :
  - Enregistrement du commit et création du tag Git annoté `v1.3.0`.
  - Push vers GitHub (`main` et `v1.3.0`) déclenchant automatiquement le workflow CI/CD `.github/workflows/build-and-release.yml` pour publier la Release officielle sur GitHub Releases et permettre aux smartphones Android de télécharger la mise à jour directement depuis l'application.

### 13:35 - Correctif CI/CD du workflow de build Android sur GitHub Actions
- Mise à niveau de l'action `android-actions/setup-android` de `@v3` vers `@v4` dans `.github/workflows/build-and-release.yml` pour résoudre l'incompatibilité avec les versions récentes des SDK Command-line Tools de Google.
- Migration vers Java JDK 21 (`actions/setup-java@v4` avec `java-version: '21'`), requis par Capacitor 7/8 et la configuration de compilation `JavaVersion.VERSION_21`.
- Attribution des droits d'exécution sur le wrapper Gradle (`git update-index --chmod=+x android/gradlew` et étape explicite `chmod +x android/gradlew`) avant l'exécution de `npx cap sync android`.
- Intégration et versionnement du module `android/capacitor-cordova-android-plugins` dans Git (retrait du `.gitignore`) et sécurisation défensive dans `android/settings.gradle` et `android/app/build.gradle` (`findProject`) pour garantir que `npx cap sync android` s'exécute sans erreur sur tout runner CI/CD fraîchement cloné.
- Ajustement de la version du wrapper Gradle (`android/gradle/wrapper/gradle-wrapper.properties`) vers `gradle-9.2.0-bin.zip` pour corriger l'incompatibilité de l'Android Gradle Plugin 8.13.0 avec Gradle 9.7 (API interne `InternalProblems` retirée dans Gradle 9.6+).
- Synchronisation sur `main` et mise à jour du tag `v1.3.0` pour la publication automatique sur GitHub Releases.

### 14:15 - Ajout de la carte KPI « Temps Nécessaire pour Terminer » & Publication de la Release v1.3.1
- **Nouvelle carte KPI (#kpi-card-finish-time)** dans la grille analytique `#app-main > #view-stats > #stats-subpage-qcm > .stats-kpi-grid` :
  - **Comportement en onglet « Aujourd'hui »** :
    - Calcule automatiquement le temps restant pour atteindre l'objectif du jour : `tempsRestant = vitesseMoyenneSec × questionsRestantesAujourdhui`.
    - `questionsRestantesAujourdhui = Math.max(0, dailyTarget - todayTracker.count)`.
    - Valeur formatée lisiblement (`Xm Ys` ou `0 min ✓ Terminé` avec badge vert lorsque l'objectif est accompli).
    - Sous-titre dynamique affichant les questions restantes et la vitesse de référence (`~X QCM restants auj. • Ys/QCM`).
    - **Actualisation live en temps réel** : Déclenchement automatique de `renderStatsUI()` dans `handleAnswerSuccess` et `handleAnswerFailure` dès qu'un QCM est répondu dans l'arène.
  - **Comportement sur les autres onglets (« 7 jours », « 30 jours », « Tout », « Personnalisé »)** :
    - Affiche simultanément le **temps nécessaire par jour** et le **temps total** : `${formattedDailyTime}/j • ${formattedTotalTime} total`.
    - `tempsTotalRequis = totalIterationsRestantes × vitesseMoyenneSec`.
    - `tempsParJourRequis = dailyIterationsRequired × vitesseMoyenneSec` (cadence nécessaire pour boucler le programme avant l'échéance concours du 10/11).
    - Sous-titre contextualisé indiquant le volume total restant et le compte à rebours (`Total : Zh Wm (N QCM • J-X)`).
  - **Design & Styles (`src/style.css`)** :
    - Nouvelle variante de style `.stat-kpi-card.accent-indigo` avec dégradé indigo premium (`rgba(99, 102, 241, ...)`), bordure luminescente et effet hover 3D.
    - Typographie adaptée `.kpi-dual-values` pour un affichage net et compact sur mobiles et écrans larges.
- **Incrémentation de version v1.3.1 (versionCode 6)** :
  - `package.json` : `"version": "1.3.1"`
  - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.3.1'`
  - `android/app/build.gradle` : `versionCode 6`, `versionName "1.3.1"`
  - `template.html` : badge `#settings-current-app-version` passé à `v1.3.1`
- **Recompilation & Génération APK** :
  - Exécution de `build-bundle.cjs` (génération de `src/app.bundle.js`, `index.html` et `dist/index.html`).
  - Exécution de `build-apk.bat` : synchronisation Capacitor et build Gradle Android natif produisant `PediaDrill.apk` (6,88 Mo).
- **Publication GitHub** : Commit, tag `v1.3.1`, push sur GitHub et déclenchement de la CI/CD pour mise à disposition de l'APK dans GitHub Releases.

### 14:25 - Résolution de l'erreur Google Sign-In `[16] Account reauth failed` & Release v1.3.2
- **Diagnostic de la cause racine** :
  - L'erreur `[16] Account reauth failed.` survenant sur Android depuis la version `v1.3` était due à une divergence d'empreinte cryptographique (SHA-1 / SHA-256) entre les builds locaux et les builds CI/CD GitHub Actions.
  - Avant la v1.3, les builds étaient générés localement avec le keystore `C:\Users\Lenovo\.android\debug.keystore`, dont l'empreinte SHA-1 (`87:31:A9:DF:46:90:4F:A3:3C:C0:79:DC:45:C5:BD:69:95:0B:A2:76`) est déclarée dans la console Google Cloud / Firebase.
  - À partir de la v1.3, le workflow GitHub Actions (`ubuntu-latest`) compilait l'APK avec un keystore debug temporaire généré à la volée par Ubuntu, dont l'empreinte SHA-1 aléatoire n'était pas enregistrée dans Firebase, provoquant le rejet immédiat par Google Play Services avec l'erreur `[16]`.
- **Correctif appliqué** :
  - Intégration directe du keystore officiel dans le dépôt : `android/app/debug.keystore`.
  - Configuration explicite du bloc `signingConfigs.debug` dans `android/app/build.gradle` pointant vers `file('debug.keystore')` avec alias `AndroidDebugKey`, appliqué aux variantes `debug` et `release`.
  - Vérification par `gradlew signingReport` : tous les builds (locaux et GitHub Actions) signent désormais avec l'empreinte officielle SHA-1 `87:31:A9:DF...` et SHA-256 `98:3A:55:73...` certifiée Firebase.
- **Incrémentation de version v1.3.2 (versionCode 7)** :
  - `package.json` : `"version": "1.3.2"`
  - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.3.2'`
  - `android/app/build.gradle` : `versionCode 7`, `versionName "1.3.2"`
  - Recompilation du bundle web et de l'APK natif `PediaDrill.apk`.
  - Déploiement sur GitHub (`main` et tag `v1.3.2`) pour mise à disposition automatique de la mise à jour corrective.

### 14:38 - Navigation rétroactive par jour (Hier / Avant-hier) & Tracker complet des questions par cours (Release v1.3.3)
- **Flèches de navigation rapide par jour (`#stats-day-stepper-wrap`)** :
  - Intégration d'un groupe compact avec flèches de navigation sur le bouton "Aujourd'hui" :
    - Bouton précédent `#btn-stats-prev-day` (`chevron-left`) : recule d'un jour (`selectedDayOffset--`), mettant à jour le libellé en « Hier », « Avant-hier », « Ven. 24/10 »...
    - Bouton suivant `#btn-stats-next-day` (`chevron-right`) : avance d'un jour jusqu'à « Aujourd'hui » (désactivé au jour J).
    - Bouton central `#btn-range-day` : affiche le jour sélectionné et permet de réinitialiser instantanément au jour en cours en 1 clic.
  - Toutes les métriques analytiques de l'écran (7 KPI cards, temps, questions faites, précision, vitesse, graphique combiné, timeline et suivi de cours) se synchronisent instantanément sur la journée exacte choisie.
  - La carte KPI 7 adapte son libellé en mode passé : affiche le bilan d'étude du jour ciblé (`formatDuration(totalTimeSeconds)`) et le volume des QCM répondus.
- **Nouveau panneau interactif « Suivi des Questions par Cours » (`#stats-course-tracker-box`)** :
  - Refonte complète de la colonne 2 de la grille analytique (`.stats-two-col-grid`) pour tracker exhaustivement les questions par cours.
  - **Mode « Sur la période »** : Décompte précis des questions traitées sur la fenêtre temporelle active (Aujourd'hui, Hier, 7j, etc.) :
    - Badge du volume de QCM faits par cours (`X QCM faits`).
    - Pourcentage de réussite et barre de progression dynamique.
    - Détail complet sous chaque cours : `✓ X justes`, `✗ Y fautes`, `⚡ Zs/QCM`, et ratio total (`N QCM au total dans ce cours`).
    - État vide bienveillant avec raccourci direct pour basculer vers la vue d'ensemble globale si aucun QCM n'a été fait sur la journée sélectionnée.
  - **Mode « Tous les cours (35) »** : Suivi de l'avancement global sur l'intégralité des 35 chapitres du programme :
    - Compteur de maîtrise : `X/Y maîtrisés` et pourcentage global de validation.
    - Jauge multi-segments visuelle : vert émeraude (maîtrisés), ambre (en cours d'apprentissage), sombre (restants).
    - Synthèse détaillée par cours : `🏆 X acquis`, `🔄 Y en cours`, `⚪ Z restants`, `⚠️ N fautes`.
  - **Champ de recherche instantanée (`#course-tracker-search`)** : Filtrage en direct de la liste des cours lors de la frappe.
  - **Badge de synthèse automatique (`#course-tracker-summary-badge`)** : Affiche en temps réel le nombre de cours affichés et le total cumulé des questions.
- **Incrémentation de version v1.3.3 (versionCode 8)** :
  - `package.json` : `"version": "1.3.3"`
  - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.3.3'`
  - `android/app/build.gradle` : `versionCode 8`, `versionName "1.3.3"`
  - Recompilation du bundle web autonome (`build-bundle.cjs`) et synchronisation APK natif Android (`build-apk.bat`).
### 16:30 - Diagnostic complet et correction du décalage des explications IA (Race Conditions & Validation Sémantique)

- **Diagnostic approfondi de la cause racine du décalage** :
  - **1. Race Condition asynchrone sur `currentQuestion` (`handleAnswerFailure`)** :
    - Lorsqu'un étudiant rate une question Q1 (`icteres_du_nouveau-ne_19`), la modale d'erreur s'ouvre et lance la génération asynchrone de l'explication IA (`geminiService.generateReasoningNote`).
    - Si l'étudiant clique immédiatement sur « Continuer (Entrée/Espace) » sans attendre la fin du chargement, `closeErrorModalAndContinue()` réassigne la variable globale `currentQuestion` au QCM suivant Q2 (`tuberculose_47`).
    - Lorsque la promesse de Gemini résolvait enfin 2 à 4 secondes plus tard, le code sauvegardait la note de Q1 avec `currentQuestion.uid` (qui était devenu Q2) dans `aiExplanationsCache['tuberculose_47']` et dans le Carnet de Raisonnement (`queueEngine.saveReasoningNote`).
    - Résultat : la question Q2 héritait de façon permanente de l'explication clinique détaillée, des propositions A-E et du thème médical de Q1.
  - **2. Désynchronisation de navigation en Arène (`requestArenaAiExplanation` & Chatbox)** :
    - Si l'étudiant demandait la génération ou envoyait un message au Tuteur IA puis naviguait dans l'historique (`< Précédent 1/5 >`) pendant le temps de calcul, la réponse IA était injectée aveuglément dans le conteneur DOM de la question désormais affichée à l'écran.
  - **3. Absence de validation sémantique et de bouton de rafraîchissement** :
    - `getSavedAiExplanation` renvoyait sans aucun contrôle de cohérence toute note enregistrée sous un UID, même si le texte traitait d'un cours complètement étranger (ex: *Ictères du nouveau-né* sur un QCM de *Tuberculose*).
    - L'interface ne proposait aucun bouton pour forcer la régénération d'une explication erronée.

- **Mesures correctives appliquées** :
  - **1. Verrouillage strict et immuable du contexte asynchrone (`handleAnswerFailure`, `requestArenaAiExplanation`, `executeSendMessage`)** :
    - Capture locale immédiate en constante : `const targetQuestion = currentQuestion; const targetUid = targetQuestion.uid;`.
    - Association de la modale d'erreur à l'UID cible : `modals.error.dataset.questionUid = targetUid;`.
    - Sauvegarde et persistance garanties sous `targetUid` et `targetQuestion`, quelle que soit la navigation de l'étudiant.
    - Mise à jour du DOM conditionnée à la présence active de la question : `if (currentEffQ && currentEffQ.uid === targetUid)`.
  - **2. Algorithme de validation sémantique automatique (`isExplanationMatchingQuestion(noteText, question)`)** :
    - **Contrôle croisé du thème médical** : Si la note contient `Thème clé : *XYZ*`, vérification de la concordance lexicale avec `question.chapterTitle`. En cas de discordance flagrante sans aucun mot commun significatif, la note est rejetée.
    - **Contrôle croisé des propositions et de l'énoncé** : Analyse de la présence des mots-clés spécifiques des propositions A-E ou de l'énoncé dans le corps de l'explication.
  - **3. Détection et purge automatique au démarrage (`scrubCorruptedAiExplanations()`)** :
    - Exécuté systématiquement lors de `initApp()` : scanne et nettoie silencieusement toutes les entrées corrompues ou désynchronisées dans `localStorage` (`pedia_ai_explanations_cache`) et dans le carnet (`pedia_drill_reasoning_notes_v1`).
    - Purge instantanée à la volée dans `getSavedAiExplanation` si une note discordante est détectée, rétablissant l'état propre invitant à générer.
  - **4. Ajout de la méthode `deleteReasoningNotesByQuestionUid` dans `QueueEngine`** : Permet la suppression ciblée et propre de toutes les fiches d'un UID donné.
  - **5. Nouveau bouton « Régénérer » (`#btn-arena-ai-regenerate`) dans la carte d'explication IA** :
    - Intégré directement dans le header `.arena-ai-explanation-header` à côté du badge du modèle.
    - Permet à l'étudiant en un seul clic (`window.regenerateArenaAiExplanation()`) de purger la note actuelle et de relancer Gemini Flash pour obtenir une nouvelle explication certifiée conforme.
    - Style dédié `.btn-refresh-arena-ai` avec micro-interaction hover/active fluide.

### 16:50 - Optimisation ergonomique complète de tous les menus pour les écrans en mode portrait (Smartphones & Tablettes)

- **Diagnostic des anomalies d'affichage en mode portrait** :
  - **1. Header global (`.app-header`) saturé** : Le sous-titre de marque « Répétition Espacée & Raisonnement IA » (~210px) et les actions d'en-tête (badge Google, mini-chronomètre de cours, 3 boutons d'icônes) dépassaient 480px, provoquant des chevauchements, des retours à la ligne disgracieux et un débordement horizontal sur les écrans mobiles de 360px à 412px.
  - **2. Barre supérieure d'Arène (`.arena-top-bar`) étriquée** : Le groupe gauche (bouton Dashboard + navigation historique 5 QCM) et le groupe droit (3 pastilles QCU, progression, objectif quotidien) étaient alignés sur une seule ligne flex (`justify-content: space-between`). En mode portrait, ils entraient en collision et cassaient la mise en page.
  - **3. Barre de statistiques (`#view-stats .arena-top-bar`) hypertrophiée** : Le bouton retour, le grand titre « Suivi & Statistiques d'Étude » et le sélecteur de plages de dates (stepper Jour + 7j + 30j + Tout + Personnalisé) totalisaient plus de 730px sur une seule ligne flex, débordant largement hors écran.
  - **4. Modale de sélection des cours (`#modal-chapters`) brute et non stylisée** : Absence de règles CSS sur `.chapters-list`, `.chapter-select-item` et la barre d'action, rendant les cibles tactiles trop petites (< 30px) et obligeant l'utilisateur à scroller l'intégralité des 35 cours pour atteindre le bouton de validation au bas de la modale.
  - **5. Raccourcis clavier physiques inadaptés en Arène** : La mention `[1-5] options, [Entrée] valider` encombrait inutilement la barre d'action mobile en mode portrait tactile.

- **Mesures d'optimisation appliquées** :
  - **1. Refonte adaptative du Header Global (`.app-header`) en mode portrait** :
    - Masquage automatique du sous-titre long (`.brand-subtitle { display: none !important; }`) pour offrir un dégagement maximal aux actions.
    - Compactage du logo (`34px × 34px`) et réduction fluide du titre (`1.15rem`).
    - Bouton Google compact en portrait (`.btn-google-header span { display: none; }`) : conserve uniquement l'icône Google colorée pour un look épuré style barre de recherche mobile.
    - Profil utilisateur (`.user-profile-badge`) : masque le prénom en mode portrait pour n'afficher que l'avatar rond avec le point vert de pulsation cloud en direct.
    - Mini-chronomètre flottant (`#active-lesson-header-badge`) : masque le nom du cours en portrait et conserve l'icône timer, le décompte digital et le point de pulsation.
    - Boutons d'icônes optimisés (`.icon-btn` à `34px × 34px` avec espacement resserré à `4px`).
  - **2. Transformation de l'Arène (`.arena-top-bar`) en layout double étage ergonomique** :
    - **Étage 1** : Bouton retour « Dashboard » à gauche et mini-navigation historique des 5 derniers QCM (`.arena-history-nav`) parfaitement calée à droite.
    - **Étage 2** : Grille symétrique à 3 colonnes (`grid-template-columns: repeat(3, 1fr)`) pour les 3 pastilles de statut (`QCU/QCM`, `Score 0/3`, `🎯 Objectif quotidien`), chacune centrée avec texte équilibré.
    - Masquage du rappel clavier `#keyboard-shortcuts-hint` et boutons d'action d'arène pleine largeur (`.btn-validate`, `.btn-croq-eval`, `.btn-resume-drill` à `width: 100%`).
  - **3. Réorganisation étagée et défilement horizontal fluide des Statistiques (`#view-stats`)** :
    - Création du sous-groupe `.stats-top-bar-header` combinant le bouton retour et le titre « Suivi & Statistiques » sur la première ligne.
    - Déportation de la barre de filtres temporels (`.stats-range-wrap`) sur une seconde ligne pleine largeur avec défilement horizontal tactile fluide (`overflow-x: auto; white-space: nowrap; -webkit-overflow-scrolling: touch; scrollbar-width: none;`).
    - Onglets de sous-pages (`#stats-subnav-toggle`) et modes de cours (`.course-tracker-pills`) équilibrés en 50%/50% pour un confort tactile optimal du pouce.
    - Grille des 7 cartes KPI ajustée en 2 colonnes équilibrées (`repeat(2, 1fr)`) sur petits écrans pour éviter les blocs verticaux infinis.
  - **4. Optimisation ergonomique de la sélection des cours (`#modal-chapters`) & Modales en mode Bottom-Sheet** :
    - Transformation des modales en mode portrait en « Bottom-Sheet » moderne ancrée au bas de l'écran avec bords arrondis supérieurs (`border-radius: 20px 20px 0 0`) et hauteur maîtrisée (`max-height: 90dvh`).
    - Stylisation cyber-médicale de `.chapter-select-item` avec hauteur minimale tactile ergonomique (44px), effet hover/active cyan, surbrillance luminescente et pastille de décompte QCM.
    - Barre de recherche et bouton « Tout cocher » intégrés dans `.modal-chapters-actions-bar` avec champ flex et bouton non sécable.
    - Bouton « Valider la sélection » fixé au bas de la modale (`position: sticky; bottom: 0; z-index: 5;`) avec ombre portée protectrice, accessible instantanément sans devoir faire défiler la liste des 35 cours.
  - **5. Carnet de Raisonnement IA (`#view-notebook`) & Tuteur IA** :
    - Toolbar réorganisée en portrait : recherche et sélecteur de cours pleine largeur, contrôle de tri avec sélecteur flex, et bascule de mode d'affichage « Par cours » / « Liste continue » à 50%/50%.
    - Chatbox Tuteur IA configurée en tiroir mobile plein écran (`100vw × 78dvh`) avec pastilles de suggestions défilables horizontalement.

### 17:10 - Correction de la pastille de date/session du QCM (suppression du repli factice « P? 20?? » et prise en charge exhaustive P / Résidanat / Rattrapage)

- **Correction de l'extraction et normalisation de session (`extractQuestionDateOrSession`)** :
  - Suppression définitive du repli `P? 20??` qui s'affichait sur 97% des questions n'ayant pas de date explicite.
  - Suppression de la pastille statique `P? 20??` initialement présente dans `template.html` (`#arena-chapter-title > .chapter-title-text`).
  - Prise en charge exhaustive des 3 types canoniques de sessions et concours médicaux algériens :
    - **Session Principale (`P [Année]`)** : Détection et normalisation automatique des formats `P [Année]`, `P1 [Année]`, `P2 [Année]`, `Principale [Année]`, y compris avec années abrégées sur 2 chiffres (ex: `P 21` -> `P 2021`, `P 2022`).
    - **Concours de Résidanat (`Résidanat [Ville] [Année]`)** : Détection et normalisation automatique des mentions `Résidanat [Année]`, `Résidanat Alger [Année]`, `Residanat [Année]`.
    - **Session de Rattrapage (`Rattrapage [Année]`)** : Détection et normalisation automatique des mentions `Rattrapage [Année]`, `Ratrapage [Année]`, `R [Année]` (ex: `R 2020` -> `Rattrapage 2020`).
    - **Évaluations et Sources officielles** : Maintien du support des épreuves facultaires (`EMD [Année]`, `EMD1 [Année]`) et des sources médicales datées (`Diapo 2024`, `Diapositive 2026`, `iKb 2024`, `Guide 2022`).
  - Filtrage strict anti-faux-positifs évitant la capture erronée de constantes cliniques (`P50`, `P3`, `P 8 kg` pour le poids, `CRP 120`, `FR 68`, ou `rattrapage vaccinal` sans année).
  - Comportement d'affichage épuré : si un QCM ne comporte aucune mention de session ou date dans la base, la pastille `.question-date-pill` n'est pas insérée dans le DOM, permettant un affichage net et professionnel du titre du cours (`Pédiatrie — [Nom du cours]`) sans faux badge ni points d'interrogation trompeurs.
- **Synchronisation & Recompilation** :
  - Exécution du bundleur unifié `build-bundle.cjs` générant `src/app.bundle.js`, `index.html` et `dist/index.html`.
  - Recompilation native Android via `build-apk.bat` mettant à jour `PediaDrill.apk`.

### 17:20 - Audit exhaustif, actualisation et enrichissement du Contexte Technique Global (`MASTER_PRODUCT_TECHNICAL_CONTEXT.md`)

- **Audit complet et mise à jour de la documentation maîtresse** :
  - Synchronisation de la date d'actualisation (`2026-10-26 17:15:00 CET`) et du numéro de version applicative officiel (`v1.4.0`, `versionCode 9`).
  - **Enrichissement de l'arborescence du projet (Section 2)** : Ajout des dossiers manquants (`android/`, `api/` serverless Vercel, `.github/workflows/` CI/CD GitHub Actions, `dist/`, scripts d'assemblage et assets natifs).
  - **Actualisation des règles métier de session (Section 3.12)** : Documentation détaillée de la détection et normalisation canonique des sessions de concours médical algérien (`P [Année]`, `Résidanat [Année]`, `Rattrapage [Année]`), suppression du placeholder `P? 20??` et omission propre de la pastille en l'absence de date.
  - **Actualisation de l'architecture responsive portrait (Section 4)** : Synthèse exhaustive de toutes les adaptations d'écran mobile portrait (Header compact, Arène double étage, modales en bottom-sheet avec cibles tactiles 44px WCAG, défilement horizontal fluide des stats).
  - **Vérification technique de conformité** : Exécution de la suite de validation syntaxique (`node -c`) sur l'ensemble des modules JS du projet avec zéro erreur détectée.

### 17:25 - Publication de la Release v1.4.0 (GitHub & Android APK)

- **Incrémentation de version vers v1.4.0 (édition 1.4)** :
  - `package.json` : `"version": "1.4.0"`
  - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.4.0'`
  - `android/app/build.gradle` : `versionCode 9`, `versionName "1.4.0"`
  - `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md` : synchronisé avec `v1.4.0` / `versionCode 9`.
- **Recompilation & Assemblage** :
  - Exécution de `build-bundle.cjs` générant `src/app.bundle.js` et le bundle autonome `index.html` / `dist/index.html`.
  - Exécution de `build-apk.bat` avec synchronisation Capacitor Android et compilation native Gradle (`:app:assembleDebug`) produisant le package officiel `PediaDrill.apk` (~7.8 Mo).
- **Déploiement GitHub** :
  - Commit des modifications avec message conventionnel `feat(release): v1.4.0`.
  - Création du tag annoté `v1.4.0`.
  - Push vers GitHub (`main` et `v1.4.0`) déclenchant automatiquement le workflow CI/CD GitHub Actions pour publier la Release avec l'APK attaché en téléchargement direct pour les mises à jour in-app.



