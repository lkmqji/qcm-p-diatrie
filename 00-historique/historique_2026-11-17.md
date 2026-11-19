# Historique des Modifications — 17 Novembre 2026

## 07:32:00 — Alignement par Défaut du Module dans le Suivi des Cours sur le Module Actif du Dashboard

### Contexte & Retour Utilisateur
À la suite de la remarque utilisateur :
> *« dans l'onglet de suivi des cours par défaut le module sélectionné dans le dashbord est sélectionné par défaut dans les suivi pas l'onglet tous »*
- Par défaut, les 4 panneaux de l'onglet de suivi des cours (`#stats-subpage-lessons`) doivent présélectionner le module actif en cours sur le Dashboard (ex: Pédiatrie ou Psychiatrie) au lieu de l'onglet « Tous ».
- L'utilisateur conserve la possibilité de cliquer à tout moment sur « Tous les cours » pour afficher la totalité des modules.

---

### Changements Effectués

#### 1. Logique Applicative (`src/app.js`)
- **Initialisation dynamique des variables d'état** :
  - `lessonDistModuleFilter`, `lessonMatrixModuleFilter`, `lessonSummaryModuleFilter` et `lessonRecentModuleFilter` sont désormais initialisés dynamiquement avec `(typeof getActiveModuleId === 'function' ? getActiveModuleId() : 'pediatrie')`.
  - Si l'utilisateur a sélectionné la Psychiatrie sur le Dashboard, le suivi des cours démarre directement en mode Psychiatrie. Si la Pédiatrie est active, il démarre en mode Pédiatrie.
- **Synchronisation dynamique lors du changement de module (`switchActiveModule`)** :
  - Dès que l'utilisateur permute de module médical (depuis le header du Dashboard ou la modale des Paramètres), les 4 filtres de cours sont automatiquement réalignés sur le nouvel identifiant de module actif (`mod.id`).

#### 2. Gabarit HTML (`template.html`)
- Alignement de la classe `.active` par défaut dans les 4 sélecteurs à boutons pilules (`#lesson-dist-module-filter`, `#lesson-matrix-module-filter`, `#lesson-summary-module-filter`, `#lesson-recent-module-filter`) sur le module par défaut (`data-mod="pediatrie"`) au lieu de `data-mod="all"`.

#### 3. Compilation & Synchronisation
- Exécution réussie de `build-bundle.cjs` :
  - `src/style.css` synchronisé dans `template.html`.
  - `src/app.bundle.js` régénéré avec succès (428 Ko).
  - `index.html` (6.49 Mo) et `dist/index.html` (6.67 Mo) synchronisés.
- Synchronisation Capacitor Android validée (`npx cap sync android`).
- Contrôle de syntaxe JavaScript `node -c` validé à 100%.


---

## 09:56:00 — Release v1.5.7 (versionCode 24) : Déploiement Vercel & Publication GitHub Release

### Contexte & Objectif
- Publication de la mise à jour faisant suite à la commande utilisateur **« update github »**.
- Intégration de la pré-sélection automatique du module actif du Dashboard dans l'onglet de suivi des cours (`#stats-subpage-lessons`) et synchronisation dynamique des filtres lors du changement de module.

---

### Actions Réalisées

#### 1. Incrémentation de Version & Alignement Multisupport
- Passage de la version applicative de `1.5.6` à **`1.5.7`** (+0.0.1).
- Incrémentation du `versionCode` Android de `23` à **`24`** (+1).
- Synchronisation rigoureuse dans :
  - `package.json` : `"version": "1.5.7"`
  - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.5.7'`
  - `android/app/build.gradle` : `versionCode 24`, `versionName "1.5.7"`
  - `template.html` : `#update-modal-curr-version` et `#update-modal-new-version` mis à jour en `v1.5.7`
  - `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md` : synchronisé avec `1.5.7` et `versionCode 24`.

#### 2. Assemblage & Compilation des Bundles
- Exécution de `node build-bundle.cjs` :
  - `src/style.css` injecté dans `template.html`.
  - `src/app.bundle.js` recompilé (428 Ko).
  - `index.html` (6.49 Mo) et `dist/index.html` (6.67 Mo) prêts pour déploiement Vercel.
- Synchronisation Capacitor Android exécutée (`cmd.exe /c npx.cmd cap sync android`).
- Compilation locale de l'APK via `build-apk.bat` (`PediaDrill.apk` à la racine).

#### 3. Déploiement
- Push sur la branche `main` déclenchant le déploiement continu Vercel.
- Tag `v1.5.7` poussé déclenchant le workflow GitHub Actions `build-and-release.yml` pour la publication de la Release GitHub avec l'APK Android.

---

## 21:40:00 — Moteur de Résolution Complète des Cas Cliniques (Modes Séquentiel & Déroulant, Règle Stricte Tout ou Rien, Repositionnement Groupé SRS & Synthèse IA)

### Contexte & Demande Utilisateur
Suite à la demande formulée avec les compétences `/new-features-by-wail` et `/agent-par-wail` :
> *« quand je réponds sur les question des fois les question on un extrait de cas clinique ajouter l'option de répondre sur tous le cas clinique (et tous les question sont compté quand je réponds tous juste mais quand je réponds sur une seule réponse faute le cas se considére comme faux et réaparait et aucune réponse est considérer comme juste ) »*

Après audit approfondi et interview proactive PO via `ask_question`, les spécifications suivantes ont été arrêtées et validées :
1. **Activation ergonomique** : Ajout d'un bouton néon violet/cyan `#btn-start-clinical-case` (« 🎯 Résoudre le cas complet (X questions) ») dans l'en-tête du cas clinique de l'Arène.
2. **Deux modes d'affichage avec commutateur** :
   - **Mode 1 (Séquentiel étape par étape)** : Résolution question par question avec bandeau du cas fixé, progression en direct et barre de navigation précédente/suivante.
   - **Mode 2 (Liste déroulante tout-en-un)** : Toutes les sous-questions présentées sur une seule page scrollable, avec possibilité de vérifier les questions une par une avec retour immédiat, complétée par un bouton d'action maître sticky au bas de page pour valider l'ensemble du cas.
3. **Sélecteur de mode par défaut** : Ajout d'une section dédiée dans les Paramètres (`#settings-clinical-mode-select`) et de boutons de bascule rapide instantanés (`#btn-mode-sequential`, `#btn-mode-scroll`) dans la barre de run.
4. **Règle stricte « Tout ou Rien »** :
   - **Si 100% juste (0 faute)** : Toutes les sous-questions avancent (+1 palier SRS), marquage maîtrisé si palier atteint, et crédit intégral de +N questions au compteur journalier.
   - **Si au moins 1 faute** : **0 question n'est créditée de succès**, pénalités d'erreur appliquées aux questions ratées, et l'intégralité des questions du cas est retirée et **réinsérée de manière groupée et contiguë dans 5 à 7 cartes** pour une révision groupée.
5. **Synthèse IA Consolidée** : Génération d'une note clinique unique par l'IA Gemini Flash résumant le cas, décortiquant les pièges des questions ratées et fournissant une règle d'or concours, sauvegardée dans le Carnet.

---

### Modifications Techniques Apportées

#### 1. Moteur de Répétition Espacée (`src/services/queueEngine.js`)
- **`handleClinicalCaseSuccess(uids)`** :
  - Retire les questions du cas de leur position actuelle.
  - Incrémente le niveau de maîtrise `st.current += 1` pour chaque question du cas.
  - Marque les questions maîtrisées (`st.done = true`) si le seuil `target` est atteint.
  - Repositionne les questions restantes selon la logique SRS (50 à 100 cartes ou 50% restantes si avant-dernier palier).
- **`handleClinicalCaseFailure(allCaseUids, failedUids)`** :
  - Règle stricte : 0 question ne reçoit de succès.
  - Incrémente les fautes et ajuste le seuil cible (ou décrémente `current` au palier 10) pour chaque question ratée.
  - Retire l'intégralité des questions du cas de la file active `this.queue`.
  - Réinsère l'ensemble des questions du cas clinique sous forme de **bloc contigu groupé** à un décalage de **5 à 7 cartes** (`insertIndex = cursor + 5..7`).
- **`incrementTodayCount(amount = 1)`** :
  - Paramètre optionnel `amount` permettant le crédit par lot de N questions réussies lors d'un cas clinique parfait.

#### 2. Service d'Intelligence Artificielle Flash (`src/services/gemini.js`)
- **`generateClinicalCaseSynthesisNote(clinicalCaseText, subQuestions, results, chapterTitle)`** :
  - Déclenche un prompt structuré de synthèse médicale universitaire sur Gemini Flash (avec cascade et fallback hors-ligne).
  - Génère 4 volets cliniques : Synthèse du cas & pièges, analyse point par point des questions échouées, démarche diagnostique & thérapeutique globale, et règle d'or concours.

#### 3. Interface HTML (`template.html`)
- Ajout du bouton néon `#btn-start-clinical-case` dans l'en-tête flex du cas clinique (`.clinical-case-header`).
- Ajout de la barre active de cas clinique `#arena-clinical-run-bar` avec badge, compteur de sous-questions, bascule de mode séquentiel/déroulant et bouton quitter.
- Ajout de la barre de progression animée `#arena-clinical-progress-track`.
- Ajout du conteneur scrollable `#arena-clinical-scroll-container` pour le Mode Déroulant.
- Ajout de la modale de bilan complet `#modal-clinical-case-summary` avec bannière de verdict (Succès 100% ou Échec avec bilan des questions), rappel SRS, liste détaillée et encadré de synthèse IA.
- Ajout de la section « Résolution des Cas Cliniques » dans la modale des Paramètres (`#modal-settings`).

#### 4. Styles CSS (`src/style.css`)
- Styles néon dark mode pour `.btn-start-clinical-case` avec dégradé violet/cyan et box-shadow.
- Barre d'action sticky `.clinical-scroll-master-actions` avec effet verre dépoli (backdrop-filter blur).
- Cartes de questions `.clinical-card` avec surbrillance dynamique verte/rouge (`.is-validated-correct`, `.is-validated-wrong`) et badges d'état.
- Stepper de navigation séquentielle `.clinical-sequential-stepper-wrap`.
- Bannières de verdict `.clinical-verdict-banner` (vert émeraude en succès, rose/ambre en échec).

#### 5. Contrôleur Applicatif (`src/app.js`)
- Orchestration du cycle de vie du cas complet via les fonctions dédiées :
  - `startClinicalCaseRun()`
  - `switchClinicalRunMode(mode)`
  - `renderClinicalSequentialView()` / `updateSequentialActionButtons()` / `navClinicalSequentialStep(delta)`
  - `renderClinicalScrollView()` / `toggleClinicalScrollOption()` / `validateClinicalCardSubQuestion()`
  - `validateAllClinicalSubQuestions()`
  - `showClinicalCaseSummaryModal()` / `closeClinicalCaseSummaryModal()` / `quitClinicalCaseRun()`
- Interception dans `handleSubmitQcm()` et `handleSubmitCroq()` pour avancer fluidement en mode séquentiel d'une question à l'autre sans recharger l'arène.
- Intégration des raccourcis clavier (flèches gauche/droite pour naviguer, Entrée pour valider/continuer).
- Synchronisation automatique avec `studyTracker`, `queueEngine` et `firebaseSyncService`.

#### 6. Validation & Tests
- Exécution de tests automatisés via script Node.js vérifiant :
  - Le non-crédit de points en cas d'erreur unique (0 succès).
  - La pénalité exclusive sur les questions échouées.
  - La réinsertion contiguë groupée des questions du cas clinique dans 5 à 7 cartes (indices consécutifs validés).
  - La validation totale et le crédit de +N questions au compteur lors d'un 100% de réussite.
- Compilation réussie du bundle web via `node build-bundle.cjs` (génération de `dist/index.html` et `src/app.bundle.js`).
- Synchronisation Capacitor Android validée (`npx cap sync android`).

