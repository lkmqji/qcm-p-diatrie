# Historique des modifications - 2026-10-18

### 18:30 - Rework complet de l'affichage des réponses complètes, du moteur de répétition et de l'IA clinique
- **Gemini 3.8 Flash exclusif** : Verrouillage strict de `MODEL_CASCADE = ["gemini-3.8-flash"]` dans `src/services/gemini.js` pour toutes les évaluations sémantiques CROQ et synthèses cliniques. Augmentation du `maxOutputTokens` à 4096 et du timeout à 25s pour garantir des réponses exhaustives sans coupure.
- **Affichage complet des erreurs (Étape 2)** :
  - Création et intégration du composant de récapitulatif d'erreur complet (`formatQuestionMistakeRecap`).
  - Affichage de l'énoncé intégral du cas clinique et de la question médicale.
  - Ajout d'une grille comparative en deux blocs distincts avec le texte intégral de chaque proposition :
    - ❌ **Ma réponse** : lettres sélectionnées accompagnées du libellé complet de chaque proposition cochée, avec badge rouge d'erreur.
    - ✅ **Bonne(s) réponse(s) attendue(s)** : lettres correctes accompagnées du libellé intégral de chaque bonne réponse, avec badge vert.
  - Affichage exhaustif de toutes les propositions (A à E) avec le texte complet et des badges d'état (Mon choix faux, Mon choix juste, Réponse juste attendue, Distracteur faux).
  - Affichage de l'explication officielle de cours issue de la base de données.
- **Explication complète à l'étape 2 du raisonnement clinique** : Renforcement du prompt système IA exigeant que la section 2 ("📋 JUSTIFICATION PROPOSITION PAR PROPOSITION") détaille impérativement chaque option (A, B, C, D, E) une par une avec son texte et sa justification médicale complète sans aucune coupure.
- **Compatibilité mobile et écrans portrait** : Ajustement de la typographie (-15%), des marges et espacements (`@media (max-width: 768px)`), et élargissement de la modale d'erreur à `max-width: min(780px, 94vw)` pour une lecture aérée sans débordement.
- **Sélection multiple systématique** : Suppression du verrouillage à choix unique dans `toggleOptionSelection`, permettant de cocher plusieurs propositions simultanément (ex: A, B, C).
- **Affichage de l'explication en cas de bonne réponse** : Ajout d'un bloc d'explication officielle en direct dans l'Arène (`#arena-explanation-box`) qui s'affiche dès la validation d'une bonne réponse, avec mise en surbrillance verte des options correctes.
- **Rework du Carnet de Raisonnement IA** : Réorganisation complète avec regroupement par cours et fiches exhaustives affichant l'énoncé, le cas clinique, les propositions colorées, l'explication officielle et les 4 cartes d'analyse IA.
- **Calibration des intervalles de répétition espacée** :
  - En cas d'erreur : réapparition calibrée entre **5 et 7 cartes** (`queueEngine.handleFailure`).
  - En cas de succès : réapparition calibrée entre **30 et 40 cartes** (`queueEngine.handleSuccess`).
- **Synchronisation et compilation autonome** : Création du script `build-bundle.cjs`, génération du bundle `src/app.bundle.js` sans erreurs de syntaxe, mise à jour de `template.html`, `index.html` et `dist/index.html`.

### 20:55 - Mise en page intelligente et aérée des énoncés et des explications médicales
- **Moteur de formatage médical intelligent (`formatMedicalContent`)** : Création d'un parseur sémantique avancé dans `src/app.js` qui corrige automatiquement les textes collés et compacts :
  - **Dégel automatique des puces et listes** : Détection et séparation automatique des puces collées (`➢`, `⁃`, `•`, `►`, `▶`, `✔`, `✓`, `-`, `*`), création de listes HTML stylisées (`.medical-bullet-list`, `.medical-bullet-item`).
  - **Dégel des items numérotés d'énoncés QCM** : Détection des énumérations médicales (ex: `1- ... 2- ... 3- ...`, `1. ... 2. ...`), génération de listes numérotées élégantes avec badges colorés (`.medical-num-list`, `.medical-num-badge`).
  - **Dégel des en-têtes médicaux** : Détection et mise en valeur des titres de sections (`Rappel :`, `Définition :`, `Question 01 :`, `Question 02 :`, `Remarque :`, `Source :`, `NB :`, `Attention :`, `Conduite à tenir :`, `CAT :`, `Traitement :`, `Diagnostic :`) avec des badges thématiques et icônes dédiées (`.medical-section-title`).
  - **Nettoyage des caractères parasites** : Élimination des BOM (`\uFEFF`, zero-width spaces) et conversion des blocs d'espaces insécables (`\u00A0`) en retours à la ligne structurés.
  - **Paragraphes aérés** : Encapsulation de chaque idée dans un paragraphe dédié (`.medical-paragraph`) avec une hauteur de ligne (`line-height: 1.6`) et un espacement vertical confortable.
- **Application généralisée sur l'interface** :
  - Énoncé de la question dans l'Arène (`#arena-question-text`).
  - Cas clinique dans l'Arène (`#arena-clinical-case-text`).
  - Explication officielle en direct dans l'Arène (`#arena-explanation-text`).
  - Énoncé, cas clinique et explication officielle dans la modale d'erreur (`formatQuestionMistakeRecap`).

### 21:05 - Plafonnement strict du nombre maximal de répétitions à 10 en cas d'erreurs répétées
- **Plafonnement de la pénalité de répétition (`queueEngine.js`)** :
  - Modification de la formule d'augmentation du seuil cible en cas d'erreur dans `handleFailure` : `st.target = Math.min(10, 3 + st.mistakes)`.
  - Le nombre de réussites requises pour éliminer définitivement une question ne peut désormais plus dépasser **10** (auparavant la pénalité augmentait indéfiniment `3 + mistakes`).
  - Ajout d'une vérification de garde dans `getQuestionStats(uid)` et dans la désérialisation du stockage local `loadState()` pour ramener automatiquement tout historique antérieur supérieur à 10 à la valeur plafond de 10.
- **Synchronisation cloud sécurisée (`firebaseSyncService.js`)** :
  - Mise à jour de l'algorithme de fusion d'états `mergeStates` pour borner les cibles issues du cloud ou d'autres appareils à 10 maximum : `target: Math.min(10, Math.max(l.target || 3, r.target || 3))`.
- **Retour visuel dans la modale d'erreur (`app.js`)** :
  - Adaptation dynamique du titre de pénalité : affichage explicite de `"Pénalité maximale : seuil plafonné à 10 réussites requises"` dès que le palier maximal de 10 est atteint.
- **Recompilation & Déploiement** :
  - Exécution du script `build-bundle.cjs` pour mettre à jour `src/app.bundle.js`, `index.html` et `dist/index.html`.

### 21:10 - Simplification visuelle du récapitulatif d'erreur pour les QCM
- **Suppression du bloc comparatif supérieur redondant pour les QCM (`src/app.js`)** :
  - Dans `formatQuestionMistakeRecap`, suppression des deux boîtes supérieures « Ma réponse » et « Bonne(s) réponse(s) attendue(s) » pour tous les QCM et QCU.
  - L'affichage se concentre désormais directement et exclusivement sur la liste complète des propositions (A à E) avec le code couleur immersif et les badges de statut explicites (vert pour les bonnes réponses et choix justes, rouge pour les erreurs commises, neutre pour les distracteurs).
  - Préservation intégrale du bloc comparatif (« Votre proposition » vs « Réponse type officielle ») pour les questions rédactionnelles CROQ, où la comparaison textuelle reste indispensable.
- **Recompilation & Déploiement** :
  - Mise à jour du bundle autonome `src/app.bundle.js`, `index.html` et `dist/index.html`.

### 21:30 - Activation de la cascade multi-modèles de résilience & Rendu soigné du Mémo Concours
- **Cascade intelligente de résilience Gemini (`src/services/gemini.js`)** :
  - Priorité absolue accordée à `gemini-3.8-flash` en position #1 de la cascade (`MODEL_CASCADE`).
  - Ajout d'une cascade ordonnée de modèles de secours haute disponibilité en cas d'épuisement de quota (HTTP 429) ou d'erreur réseau : `gemini-3.7-flash` -> `gemini-3.5-flash-lite` -> `gemini-3.1-flash-lite` -> `gemini-flash-lite-latest` -> `gemini-3-flash-preview`.
  - Si le quota quotidien gratuit de `gemini-3.8-flash` (20 requêtes/jour) est saturé, l'application bascule automatiquement et de manière transparente sur `gemini-3.5-flash-lite` (quota actif et vitesse de génération exceptionnelle de ~4s pour ~6 500 caractères).
  - Enrichissement du fallback local hors-ligne : si l'appareil est complètement déconnecté d'Internet, le système génère désormais les 4 sections structurées complètes et spécifiques au dossier (analyse du piège, statut vrai/faux de chaque option A à E, démarche clinique ciblée et mémo de concours contextualisé).
- **Formatage élégant du Mémo et des règles d'or (`src/app.js` & `src/style.css`)** :
  - Nettoyage des caractères parasites de citation (`>`) et des traits d'union `---` générés par les modèles.
  - Encapsulation des citations de règles d'or dans des blocs stylisés dédiés `.reasoning-callout-quote` avec bordure ambre, fond chaleureux et ombrage doux.
  - Nettoyage et conversion automatique des indices mathématiques et gazimétriques médicaux (`SpO₂`, `PaO₂`, `PaCO₂`) dans `parseMarkdownInline`.
- **Recompilation & Déploiement** :
  - Recompilation réussie avec `build-bundle.cjs` (`src/app.bundle.js`, `index.html`, `dist/index.html`).

### 21:35 - Découpage et mise en page aérée des explications de cours
- **Dégel approfondi des explications médicales (`formatMedicalContent`)** :
  - Résolution des textes d'explications compacts et sans retours à la ligne issus de diapositives de cours ou d'extractions OCR :
    - **Justifications de propositions A-E** : Détection et séparation automatique des justifications collées (`A-Vrai`, `A/ Vrai`, `A : Faux`, `1- Vrai`, `1-Perplexe`, etc.) en listes à puces aérées avec badges en gras (`- **A) Vrai** :`).
    - **Dégel des colonnes multi-espaces** : Conversion automatique des listes bactériennes et tableaux de diapositives séparés par de multiples espaces insécables (`\u00A0`) en listes à puces distinctes.
    - **Séparation des phrases collées** : Détection des frontières de phrases compactes (`(TCA).Amyotrophie`, `assurésB-Vrai`, `interstitiel.B/ Vrai`, `vaccinéContamination`, `hyperpigmentationBiologie`) avec insertion de ponctuation et sauts de lignes adaptés.
    - **Découpage des titres de sections et du contenu associé** : Lorsqu'un en-tête médical figure sur la même ligne que son texte (ex: `Question 01 : ...`, `Signes cliniques: ...`, `Biologie: ...`, `Rappel : ...`), séparation immédiate du titre dans son badge dédié et placement du texte dans un paragraphe fluide.
    - **Prise en charge étendue des titres médicaux** : Ajout de styles et badges Lucide pour la biologie (`.title-bio`), la sémiologie (`.title-clinical`), les définitions, examens, classifications et physiopathologie.
- **Recompilation & Déploiement** :
  - Recompilation complète via `build-bundle.cjs` (`src/app.bundle.js`, `index.html`, `dist/index.html`).
