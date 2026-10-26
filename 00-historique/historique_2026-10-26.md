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
  - Déploiement sur GitHub (`main` et tag `v1.3.3`) pour mise à disposition de la release.

