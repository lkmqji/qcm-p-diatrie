# Historique des modifications - 2026-10-19

### 19:05 - Répétition espacée calibrée (50-100 questions et 50% finaux), restriction du compteur journalier aux seules bonnes réponses et verrouillage exclusif des modèles Flash Gemini
- **Répétition espacée calibrée (`src/services/queueEngine.js`)** :
  - **Réapparition normale après bonne réponse** : Lorsqu'une question est réussie et qu'il reste plusieurs paliers à valider (`st.target - st.current > 1`), la question réapparaît après **50 à 100 questions** (`pushDistance = Math.floor(Math.random() * 51) + 50`).
  - **Dernier palier avant élimination complète (50% dernières questions restantes)** : Lorsqu'il ne reste plus qu'une seule réponse correcte pour éliminer définitivement la question (`st.target - st.current === 1`), la question est désormais insérée aléatoirement au sein des **50% dernières questions totales restantes** de la file (`[Math.floor(remaining * 0.5), remaining]`).
  - **Information visuelle dans l'Arène (`src/app.js`)** : Affichage d'un message dédié dans la bannière de succès dès qu'une question atteint son avant-dernier palier : `"Dernier palier avant élimination ! 🎯 Validée X/Y fois. Placée parmi les 50% dernières questions restantes (+N cartes)."`.
- **Compteur journalier réservé exclusivement aux bonnes réponses (`src/app.js`)** :
  - Suppression de l'incrémentation du compteur (`queueEngine.incrementTodayCount()`) dans le gestionnaire d'erreurs (`handleAnswerFailure`).
  - Seules les réponses justes (`handleAnswerSuccess`) ajoutent désormais +1 au compteur journalier de questions à faire par jour.
  - La jauge d'objectif journalier reflète ainsi strictement le nombre réel de réussites validées dans la journée pour avancer vers l'échéance de l'examen.
- **Verrouillage strict et exclusif des modèles Flash pour Gemini (`src/services/gemini.js`)** :
  - Interdiction et filtrage de tout modèle non-flash dans l'ensemble de l'architecture Gemini.
  - Mise à jour de la cascade ordonnée de modèles Flash (`MODEL_CASCADE`) :
    1. `gemini-3.8-flash` (modèle principal de référence)
    2. `gemini-3.7-flash` (secours Flash standard)
    3. `gemini-3.6-flash` (secours Flash haute disponibilité - testé et fonctionnel)
    4. `gemini-3.5-flash` (secours Flash rapide - testé et fonctionnel)
    5. `gemini-3.5-flash-lite` (secours Flash Lite ultra-réactif - testé et fonctionnel)
    6. `gemini-flash-lite-latest` (secours Flash Lite dernière version)
    7. `gemini-3-flash-preview` (secours Flash Preview)
    8. `gemini-3.1-flash-lite` (secours Flash Lite de réserve)
  - Ajout d'une vérification de garde stricte dans `_callModel` : toute tentative d'invocation d'un modèle ne contenant pas `flash` lève immédiatement une exception explicite.
- **Compilation, synchronisation et APK** :
  - Exécution du script `build-bundle.cjs` pour synchroniser `src/app.bundle.js`, `index.html` et `dist/index.html`.
  - Synchronisation des assets natifs Android avec Capacitor (`cap sync android`).

### 19:10 - Décrémentation de la progression en cas d'erreur au plafond de 10 répétitions
- **Pénalité dégressive au palier maximal (`src/services/queueEngine.js`)** :
  - Tant que le seuil de répétition requis pour éliminer la question n'a pas atteint 10 (`st.target < 10`), toute faute continue d'augmenter le seuil cible jusqu'à un maximum de 10 (`st.target = Math.min(10, 3 + st.mistakes)`).
  - Dès que le palier maximal de 10 est atteint (`st.target >= 10`), le seuil cible ne pouvant plus monter, chaque réponse fausse diminue directement le nombre de réussites acquises : `st.current = Math.max(0, st.current - 1)` (par exemple : `7/10` devient `6/10`, `6/10` devient `5/10`, sans jamais descendre sous 0).
- **Retour visuel contextualisé dans la modale d'erreur (`src/app.js`)** :
  - Adaptation dynamique de l'en-tête de pénalité de la modale d'erreur :
    - Si le palier de 10 est actif et que le score diminue : affichage de `Plafond de 10 atteint : progression diminuée (7/10 ➔ 6/10)` et explication claire du recul d'un point.
    - Si le score est déjà à 0/10 : affichage du maintien à 0/10 avec réapparition dans 5 à 7 cartes.
- **Recompilation & Synchronisation** :
  - Mise à jour du bundle autonome via `build-bundle.cjs` (`src/app.bundle.js`, `index.html`, `dist/index.html`).
  - Synchronisation Capacitor et régénération de l'APK natif Android [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk).

### 19:20 - Installation et intégration de la barre d'outils visuelle Agentation
- **Installation du paquet officiel (`package.json`)** :
  - Ajout de la dépendance de développement `"agentation": "^3.1.2"`.
- **Intégration du bundle autonome officiel (`agentation.bundle.js`)** :
  - Conformément aux règles strictes du skill Agentation pour les applications Vanilla JS / HTML / PWA sans React ni bundler externe :
    - Copie du bundle officiel complet (`C:\Users\Lenovo\.gemini\config\skills\agentation\agentation.bundle.js`) vers la racine du projet `agentation.bundle.js`.
    - Mise à jour de `build.cjs` pour copier automatiquement `agentation.bundle.js` dans le dossier de production `dist/`.
    - Injection de la balise `<script src="agentation.bundle.js"></script>` dans le pipeline de génération `build-bundle.cjs` (avant la balise fermante `</body>`).
  - La barre d'outils visuelle s'auto-monte automatiquement sur `#agentation-root` avec la pilule officielle, le mode inspection d'éléments, l'annotation en direct, le mode wireframe/layout et les pastilles de feedback.
- **Serveur MCP Agentation (`mcp_config.json`)** :
  - Serveur MCP d'ores et déjà configuré avec `npx -y agentation-mcp server` pour la synchronisation bidirectionnelle en direct avec l'environnement IDE.
- **Synchronisation Capacitor & Déploiement** :
  - Synchronisation des assets web avec `npx cap sync android` et recompilation de l'APK autonome [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk).

### 19:30 - Médias et iconographies médicales masqués, rétractés et floutés par défaut (Spoiler Protection & Visionneuse HD)
- **Objectif utilisateur** : Garantir que les photos et clichés médicaux ne divulguent pas immédiatement des éléments de réponse ou ne perturbent pas la concentration lors du drill. Les médias doivent être rétractés (petites vignettes compactes) et floutés par défaut, et ne se révéler clairement qu'à l'action explicite de l'utilisateur (clic/toucher).
- **Design & Styles CSS (`src/style.css`)** :
  - **État rétracté & flouté (`.medical-media-card.is-collapsed`)** :
    - Vignette miniature carrée de 96x96px (84x84px sur smartphone).
    - Image protégée par un filtre `filter: blur(9px) brightness(0.72)` avec `transform: scale(1.12)` pour éliminer tout artefact de bordure floue.
    - Overlay interactif `.medical-media-spoiler-overlay` avec badge stylisé néon `Toucher pour afficher` et sous-titre `Photo floutée`.
  - **État déplié & net (`.medical-media-card.is-expanded`)** :
    - Déploiement fluide avec transition cubique (`cubic-bezier(0.16, 1, 0.3, 1)`).
    - Image défloutée (`filter: none`), taille dynamique jusqu'à 420px de hauteur avec préservation stricte du ratio d'aspect (`object-fit: contain`).
    - Barre d'action avec bouton d'agrandissement en plein écran `Plein écran HD` et bouton d'action `Réduire & flouter`.
  - **Visionneuse plein écran Lightbox (`.media-lightbox-overlay`)** :
    - Modal plein écran haute définition avec flou d'arrière-plan (`backdrop-filter: blur(10px)`), centrage automatique, bouton de fermeture circulaire et gestion de la fermeture au clic sur l'arrière-plan ou via la touche `Échap`.
- **Logique applicative (`src/app.js` & `template.html`)** :
  - Implémentation du composant dynamique `renderQuestionMedia(mediaUrls)`.
  - Contrôleurs globaux `window.toggleMedicalMedia(cardEl, event)`, `window.openMediaLightbox(url, event)` et `window.closeMediaLightbox()`.
  - Intégration dans l'Arène de QCM (`loadNextArenaQuestion` sur `#arena-media-wrap`).
  - Intégration dans la modale d'analyse d'erreur et le carnet de révision (`formatQuestionMistakeRecap` et `renderNotebookUI`).
  - Sauvegarde automatique du champ `media_urls` dans les fiches de révision enregistrées en local et synchronisées sur Google Firestore.
  - Fermeture automatique au raccourci clavier `Escape`.
- **Recompilation & Déploiement** :
  - Synchronisation et compilation du bundle via `build-bundle.cjs`.
  - Synchronisation Capacitor Android (`npx cap sync android`).
  - Régénération de l'APK natif Android via `build-apk.bat`.

### 19:50 - Masquage du titre du cours (Spoiler Chapitre) et boutons de fermeture / réduction de taille des médias
- **Masquage du titre du chapitre par flou interactif (`#arena-chapter-title`)** :
  - **Problématique** : L'affichage direct du chapitre (ex: *Cardiologie*, *Néphrologie*) oriente trop facilement l'étudiant et biaise la réflexion diagnostique du cas clinique.
  - **Comportement & Style CSS** :
    - Par défaut, à chaque nouvelle question chargée dans l'arène, le titre du chapitre est flouté (`filter: blur(6px); opacity: 0.38`).
    - Présence d'un badge interactif discret `Cours masqué` avec icône œil.
    - Un simple clic ou toucher sur le badge (`window.toggleArenaChapterTitle()`) retire immédiatement le flou (`is-revealed`) et révèle l'intitulé complet du cours. Un second clic permet de le reflouter.
- **Optimisation des médias médicaux (Photos) suite au retour utilisateur** :
  - **Réduction des dimensions** :
    - Vignette rétractée (repliée) : réduite de 96px à **74x74 px** (64x64 px sur smartphone) pour une compacité maximale.
    - Carte dépliée : hauteur maximale ramenée de 440px à **250 px** (210 px sur smartphone) et largeur maximale à 340 px, évitant d'occuper tout l'écran vertical (parfaitement calibré pour les résolutions type 1536×695).
  - **Boutons de fermeture dédiés après ouverture** :
    - **Bouton flottant circulaire `✕`** placé dans le coin supérieur droit de l'image dépliée (`.btn-media-card-close`) avec survol rouge.
    - **Bouton d'action explicite `✕ Fermer la photo`** (`.btn-media-close`) disposé dans la barre d'action sous l'image aux côtés du bouton `Plein écran HD`.
    - Le clic sur l'image elle-même reste également actif pour refermer et reflouter instantanément.
- **Recompilation, synchronisation & APK** :
  - Exécution de `build-bundle.cjs` pour synchroniser `src/app.bundle.js`, `index.html` et `dist/`.
  - Synchronisation Capacitor Android (`cap sync android`) et régénération de l'APK natif [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk).

### 20:00 - Système de tri multi-critères (Date, Nombre d'erreurs, Cours, Score) et modes de vue dans le Carnet de Raisonnement
- **Objectif utilisateur** : Permettre de trier les erreurs et notes de raisonnement clinique du carnet par date (récent/ancien), par nombre d'erreurs (fréquence de faute), par cours ou par score, avec inversion rapide entre ordre croissant et décroissant.
- **Barre d'outils enrichie (`template.html` & `src/style.css`)** :
  - **Ligne supérieure** : Barre de recherche textuelle globale (avec icône loupe) et sélecteur de filtrage par cours.
  - **Ligne inférieure interactive** :
    - **Sélecteur de critère (`#notebook-sort-by`)** :
      - 📅 *Date de la faute* (horodatage précis de l'erreur)
      - ⚠️ *Nombre d'erreurs* (cumul des tentatives ratées pour cibler les questions critiques)
      - 📚 *Cours* (ordre alphabétique des spécialités pédiatriques)
      - 🎯 *Score d'évaluation* (score CROQ / niveau de difficulté)
    - **Bouton d'inversion d'ordre (`#btn-toggle-sort-order`)** :
      - Bascule en 1 clic entre *Décroissant ⬇* et *Croissant ⬆* avec mise à jour immédiate de l'icône et de l'intitulé.
    - **Bascule de mode d'affichage (`#btn-view-mode-chapter` / `#btn-view-mode-flat`)** :
      - *📁 Par cours* : regroupe les questions dans des accordéons de chapitres, eux-mêmes ordonnés selon le critère et l'ordre sélectionnés.
      - *📄 Liste continue* : affiche l'ensemble des questions erronées de tout le programme sous forme de classement continu avec badge de rang (`#1`, `#2`, `#3`...), idéal pour réviser directement le Top des questions les plus ratées !
- **Badges statistiques sur chaque fiche de question** :
  - Badge d'erreurs : `⚠️ X faute(s)` (`stat-mistakes`).
  - Badge de date : `📅 JJ/MM HH:MM` (`stat-date`).
  - Badge de score CROQ : `Score : X%` (`stat-score`).
  - Badge de rang : `#N` en mode liste continue.
- **Synthèse dynamique en direct (`#notebook-summary-bar`)** :
  - Affichage clair du résumé : `X questions (Y analyses) • Tri : [Critère] ([Croissant/Décroissant])`.
- **Recompilation, synchronisation & APK** :
  - Synchronisation et recompilation du bundle via `build-bundle.cjs`.
  - Synchronisation Capacitor Android (`cap sync android`) et génération de l'APK natif [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk).

### 20:10 - Tuteur IA Interactif en direct dans l'Arène (Bouton flottant & Chatbox contextuelle sur le QCM en cours)
- **Objectif utilisateur** : Pouvoir interroger directement l'IA à tout moment pendant la résolution d'une question dans le Grand Mix (Arène) via un bouton circulaire flottant en bas à droite de l'écran, pour poser des questions libres ou obtenir des éclaircissements immédiats sur le QCM en cours.
- **Bouton flottant circulaire néon (`#btn-arena-ai-chat`)** :
  - Disposé de manière fixe en bas à droite (`bottom: 24px; right: 24px; z-index: 9999`).
  - Design cyber-médical premium avec dégradé cyan/violet (`linear-gradient(135deg, #00d4ff, #8b5cf6)`), halo lumineux pulsant doux (`animation: pulseAiBtn`) et icône animée `sparkles`.
  - Visible exclusivement lorsque l'utilisateur est dans l'Arène (`currentView === 'arena'`).
- **Boîte de dialogue contextuelle intelligente (`#arena-ai-chatbox`)** :
  - **Fenêtre flottante moderne** : Panneau en verre dépoli (`backdrop-filter: blur(20px)`), bordure cyan luminescente, adaptée aux écrans PC et se transformant en tiroir glissant (bottom sheet) sur mobile.
  - **En-tête contextuel** : Affiche le titre « Tuteur IA Pédiatrie », le modèle actif (« Gemini 3.8 Flash »), le sous-titre dynamique du chapitre et des boutons pour réinitialiser la conversation ou fermer le chat.
  - **Bannière de rappel du QCM actif** : Rappel en direct du cas clinique et de l'énoncé de la question en cours.
  - **Suggestions d'amorces en 1 clic (Prompt Chips)** :
    - 💡 *Démarche diagnostique*
    - 🔍 *Justification clé*
    - ⚠️ *Piège concours*
    - 💊 *Traitement & CAT*
  - **Zone de discussion fluide & Multi-tours** :
    - Bulles de messages différenciées (bleu gradient pour l'étudiant, bleu nuit médical pour l'IA).
    - Rendu Markdown soigné (gras, puces, formatage médical) via `formatMedicalContent`.
    - Indicateur de frappe animé pendant l'inférence Gemini Flash.
    - Mémoire conversationnelle multi-tours pour affiner la compréhension d'une notion sans perdre le fil.
- **Service Gemini Flash (`src/services/gemini.js`)** :
  - Nouvelle méthode `askAboutQuestion(question, conversationHistory, userMessage)` transmettant le contexte complet (énoncé, cas clinique, propositions A-E, réponses officielles et explication officielle).
  - Persona d'un professeur universitaire et chef de clinique en pédiatrie délivrant des explications ciblées, rigoureuses et concises.
  - Sécurité absolue : cascade exclusive de modèles Flash avec secours hors-ligne en cas de coupure réseau ou quota dépassé.
- **Recompilation, synchronisation & APK** :
  - Synchronisation et recompilation du bundle via `build-bundle.cjs`.
### 20:55 - Diagnostic et Résolution du blocage de déploiement GitHub / Vercel (Écran figé sur "--")
- **Diagnostic de la cause racine** :
  - Lors de l'ouverture du site déployé sur Vercel (`qcm-p-diatrie-coral.vercel.app`), l'écran restait figé avec des métriques à `--` (« QUESTIONS RESTANTES : -- », « ITÉRATIONS REQUISES : -- », « À FAIRE PAR JOUR : -- ») et aucun bouton interactif ne répondait.
  - L'analyse approfondie des scripts et du bundle via `node -c src/app.bundle.js` a révélé une erreur de syntaxe fatale : `SyntaxError: Unexpected identifier 'askAboutQuestion'`.
  - Dans [src/services/gemini.js](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/services/gemini.js), la nouvelle fonction `askAboutQuestion` avait été placée par mégarde après l'accolade fermante `}` de la classe `GeminiService`, provoquant une syntaxe non reconnue en Vanilla JS.
  - Vercel servant directement la page [index.html](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/index.html) contenant le bundle intégré, le navigateur web bloquait immédiatement l'exécution du JavaScript dès le parsing du fichier, avant même que `initApp()` et `updateDashboardUI()` ne puissent se déclencher, laissant affichées les valeurs par défaut brutes `--` du template HTML.
- **Correctifs apportés** :
  - **Correction structurelle dans `src/services/gemini.js`** : réintégration propre de la méthode `askAboutQuestion` à l'intérieur du corps de la classe `GeminiService`.
  - **Validation de la syntaxe de tous les modules** : exécution de `node -c` sur tous les fichiers JS source (`src/services/gemini.js`, `src/services/queueEngine.js`, `src/services/firebaseSyncService.js`, `src/app.js`). Tous valident sans erreur.
  - **Reconstruction intégrale des bundles** : exécution de `node build-bundle.cjs` mettant à jour `src/app.bundle.js`, le fichier de production racine déployé sur Vercel [index.html](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/index.html) et [dist/index.html](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/dist/index.html).
  - **Validation de syntaxe in-situ du HTML** : vérification par script Node VM de tous les blocs `<script>` inclus dans `index.html` (Script 0, 1 et 2 validés à 100% avec code 0).
  - **Synchronisation Capacitor Android** : exécution de `npx cap sync android` pour propager le correctif dans les assets natifs.
  - **Régénération de l'APK natif** : compilation de [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk) mis à jour.

### 21:15 - Élimination des syntaxes LaTeX illisibles (`\text{}`, `\mathbf{}`, `\times`) dans les réponses IA et formatage clinique naturel
- **Constat & Problème utilisateur** :
  - Dans les réponses générées par l'IA (notamment le Tuteur IA en direct dans l'Arène et les fiches de raisonnement clinique), certaines réponses comportaient des fragments de code LaTeX bruts et incompréhensibles tels que `14\text{ g/dl}`, `\mathbf{4}\text{ g/dl}`, `\mathbf{3}\text{ kg}` ou `\text{Volume} = \text{Déficit en Hb (en g/dl)} \times \mathbf{3}\text{ ml/kg}`.
  - Ces syntaxes LaTeX, couramment émises par les LLMs lorsqu'ils manipulent des grandeurs ou formules mathématiques, n'étaient pas interprétées et s'affichaient sous forme de balises cryptiques perturbant la concentration de l'étudiant.
- **Actions et Correctifs appliqués (Approche à double niveau)** :
  1. **Niveau 1 : Moteur universel de conversion et nettoyage LaTeX (`cleanLatexMath`)** :
     - Implémentation de la fonction `cleanLatexMath(str)` dans [src/services/gemini.js](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/services/gemini.js) et exposée globalement sur `window.cleanLatexMath`.
     - Déballage automatique et récursif de toutes les balises de texte : `\text{...}`, `\mathrm{...}`, `\operatorname{...}`, `\textrm{...}` ➔ texte clair.
     - Conversion des styles gras/italique LaTeX : `\mathbf{...}` et `\textbf{...}` ➔ `**...**` (rendu Markdown gras immédiat).
     - Remplacement des opérateurs et symboles : `\times` ➔ `×`, `\cdot` ➔ `·`, `\leq` ➔ `≤`, `\geq` ➔ `≥`, `\pm` ➔ `±`, `\mu` ➔ `µ`, `\to` ➔ `→`, etc.
     - Conversion des fractions : `\frac{A}{B}` ➔ `(A / B)` et racines `\sqrt{A}` ➔ `√(A)`.
     - Conversion des exposants et indices : `^{2}` ➔ `²`, `_{2}` ➔ `₂`.
     - Suppression de tous les délimiteurs `$`, `$$`, `\[`, `\]`, `\(`, `\)`.
     - Filtrage à la source : appliqué directement à chaque appel modèle dans `_executeModelCall`, `askAboutQuestion`, `generateReasoningNote` et `evaluateCroq`.
     - Intégration dans le moteur de rendu : appliqué systématiquement dans `parseMarkdownInline`, `formatMedicalContent` et `formatReasoningNote`.
  2. **Niveau 2 : Durcissement strict des consignes système Gemini** :
     - Ajout d'une règle d'interdiction formelle du LaTeX dans le prompt système du Tuteur IA (`askAboutQuestion`), de la génération de raisonnement (`generateReasoningNote`) et de l'évaluation des CROQ (`evaluateCroq`).
     - Consigne explicite d'écrire impérativement les doses, calculs, formules pédiatriques et unités en français clair et direct (ex : "14 g/dl", "Poids = 3 kg", "Déficit = 4 g/dl", "×" au lieu de "\times", "/" au lieu de "\frac").
  3. **Amélioration du parseur de listes médicales (`formatMedicalContent`)** :
     - Normalisation préalable des tirets suivis de puces numérotées (`- 1. ...` ➔ `1. ...`) pour éliminer l'apparition de pastilles de liste vides.
- **Recompilation, tests et synchronisation** :
  - Validation par script de test automatisé sur le cas réel d'ictère néonatal et calcul de culot globulaire : 100% des balises LaTeX éliminées et transformées en typographie médicale parfaite.
  - Recompilation complète du bundle (`build-bundle.cjs`) et des fichiers `index.html` et `dist/index.html`.
  - Synchronisation Capacitor Android (`npx cap sync android`).
  - Régénération de l'APK natif [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk).

### 21:25 - Montée de version native Android & Génération de l'APK v1.1 (versionCode 2)
- **Objectif & Nécessité d'Upgrade** :
  - Pour permettre une mise à jour transparente de l'APK directement sur le smartphone de l'utilisateur sans conflit de package ou refus du gestionnaire d'installation Android (« L'application n'a pas été installée car le package semble non valide »), la version de l'application a été formellement incrémentée.
- **Modifications apportées (`android/app/build.gradle`)** :
  - `versionCode` : incrémenté de `1` à `2`.
  - `versionName` : incrémenté de `"1.0"` à `"1.1"`.
- **Pipeline d'assemblage & Compilation** :
  - Synchronisation intégrale du bundle web dans `dist/` via `build-bundle.cjs`.
  - Synchronisation native Capacitor via `npx cap sync android`.
  - Compilation native Gradle (`:app:assembleDebug`) et copie sous [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk).

### 21:30 - Intégration de `google-services.json` et Activation du Plugin Google Services dans l'APK
- **Emplacement du fichier de configuration Firebase Android** :
  - Déplacement et copie de [google-services.json](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/google-services.json) vers l'emplacement officiel du module Android : [android/app/google-services.json](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/android/app/google-services.json).
- **Projet Firebase ciblé** :
  - `project_id` : `qcm-pediatr`
  - `package_name` : `com.pediadrill.app`
  - `project_number` : `1028938391462`
- **Activation automatique dans Gradle (`android/app/build.gradle`)** :
  - Détection automatique de `file('google-services.json')` et application du plugin `com.google.gms.google-services` via la dépendance racine `classpath 'com.google.gms:google-services:4.4.4'`.
- **Recompilation & Validation de l'APK** :
  - Compilation native réussie avec intégration des métadonnées Firebase dans l'APK [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk).

### 21:45 - Résolution de l'erreur Android « unable to process request due to missing initial state » via l'Authentification Google Native
- **Diagnostic de la cause racine** :
  - Sur Android, l'utilisation de `signInWithPopup` ou `signInWithRedirect` du SDK Web Firebase basculait l'utilisateur dans le navigateur externe (Chrome).
  - Le stockage de session (`sessionStorage` et cookies) étant totalement compartimenté et inaccessible entre Chrome et la WebView Capacitor, le serveur de rappel d'authentification Firebase ne retrouvait pas le jeton d'état initial généré par l'application : `"unable to process request due to missing initial state"`, bloquant l'application sur *"Connexion en cours..."*.
- **Solution Native Capacitor (@capacitor-firebase/authentication)** :
  - Installation et synchronisation du plugin natif officiel `@capacitor-firebase/authentication` (version 8.5.2, 100% compatible Capacitor 8).
  - Modification de `signInWithGoogle` dans [src/services/firebaseSyncService.js](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/services/firebaseSyncService.js) :
    - Détection automatique de la plateforme native (`Capacitor.isNativePlatform()`).
    - Appel direct à `FirebaseAuthentication.signInWithGoogle()` ouvrant la boîte de dialogue native Android Google Play Services (choix direct du compte sans ouvrir de navigateur).
    - Pont automatique du jeton d'identité `idToken` vers `signInWithCredential` pour que la base Firestore bénéficie de l'authentification active.
    - Préservation du flux Web standard avec fallback sur PC / Vercel.
  - Gestion explicite des erreurs Android dans `getFriendlyAuthError` (Code 10 : rappel d'ajouter l'empreinte SHA-1 dans Firebase).
- **Recompilation & Validation** :
  - Synchronisation Capacitor et compilation native Gradle de l'APK [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk).

### 21:58 - Résolution de l'erreur « Google sign-in provider is not enabled » & Déploiement de l'APK v1.2
- **Cause du blocage** :
  - Le plugin natif `@capacitor-firebase/authentication` exige que les providers activés soient explicitement déclarés dans la section `plugins.FirebaseAuthentication.providers` du fichier de configuration Capacitor (`capacitor.config.json`).
  - En l'absence de cette déclaration, le handler natif `googleAuthProviderHandler` n'était pas instancié au démarrage de l'app, affichant la boîte de dialogue d'alerte : *"Google sign-in provider is not enabled. Make sure to add the provider to the 'providers' list in the Capacitor configuration."*.
- **Corrections apportées** :
  1. **Configuration Capacitor (`capacitor.config.json`)** :
     - Ajout de la section `plugins.FirebaseAuthentication` avec `skipNativeAuth: false` et `providers: ["google.com"]`.
  2. **Ressource String Native Android (`android/app/src/main/res/values/strings.xml`)** :
     - Déclaration explicite de `default_web_client_id` avec la valeur `1028938391462-hfo44kaj789r1ruovt4b4v59he6jvarq.apps.googleusercontent.com` afin de garantir la disponibilité immédiate du client OAuth pour Google Play Services.
  3. **Incrémentation de version (`android/app/build.gradle`)** :
     - `versionCode` : incrémenté de `2` à `3`.
     - `versionName` : incrémenté de `"1.1"` à `"1.2"`.
- **Assemblage et Validation** :
  - Synchronisation complète des assets et de la configuration native avec `cmd.exe /c "npx cap sync android"`.
  - Compilation native réussie (`BUILD SUCCESSFUL in 47s`).
  - Génération et mise à disposition de l'APK v1.2 : [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk).

### 22:05 - Diagnostic de l'erreur « [16] Account reauth failed » & Extraction des Empreintes Réelles du Keystore Debug
- **Cause exacte identifiée** :
  - L'erreur `[16] Account reauth failed` correspond au rejet immédiat par Google Play Services lors de la vérification cryptographique de la signature de l'APK.
  - L'empreinte SHA-1 qui avait été enregistrée dans la console Firebase (`8F:FC:...`) provenait d'un autre environnement.
  - L'exécution de la tâche Gradle officielle `signingReport` sur le fichier de signature réel (`C:\Users\Lenovo\.android\debug.keystore`, alias `AndroidDebugKey`) a révélé les véritables empreintes générées lors de la compilation de `PediaDrill.apk` :
    - **SHA-1 réel** : `87:31:A9:DF:46:90:4F:A3:3C:C0:79:DC:45:C5:BD:69:95:0B:A2:76`
    - **SHA-256 réel** : `98:3A:55:73:39:BC:3B:5F:0C:BC:6C:3F:33:60:DF:E6:06:59:96:0C:74:BC:A0:BC:CB:50:D0:41:80:EF:C9:6E`
- **Résolution** :
  - Mise à jour du Master Context avec les empreintes exactes de compilation.
  - Invitation de l'utilisateur à enregistrer cette empreinte SHA-1 exacte dans la console Firebase pour débloquer immédiatement l'authentification Google Play Services.

### 22:15 - Correction du bouton « Tout replier » et repliage interactif des questions du Carnet de Raisonnement
- **Diagnostic du dysfonctionnement signalé** :
  - Dans la barre de statistiques du Carnet (`#notebook-summary-bar`), le clic sur le bouton `.notebook-toggle-all-btn` ("Tout replier") ajoutait bien la classe CSS `.collapsed` sur chaque bloc `.notebook-chapter-group`.
  - Cependant, la règle CSS ciblait exclusivement `.notebook-chapter-group.collapsed .notebook-chapter-questions { display: none; }`, alors que l'élément conteneur généré dans `src/app.js` portait la classe `.notebook-chapter-body`. En raison de cette divergence de nommage, les questions restaient visibles à l'écran.
- **Modifications apportées** :
  1. **Alignement CSS (`src/style.css`)** :
     - Mise à jour du sélecteur pour masquer simultanément `.notebook-chapter-body` et `.notebook-chapter-questions` avec `display: none !important;` en état `.collapsed`.
  2. **Harmonisation HTML (`src/app.js`)** :
     - Ajout explicite des deux classes sur le corps du chapitre : `<div class="notebook-chapter-body notebook-chapter-questions">`.
  3. **Accordéon individuel pour chaque carte de question (`.grouped-question-card`)** :
     - Ajout d'une gestion de repli interactif au niveau de chaque question individuelle (`window.toggleQuestionCard(cardId, event)`).
     - Intégration d'un chevron rotatif `<i data-lucide="chevron-down" class="question-chevron"></i>` dans l'en-tête cliquable.
     - Affichage d'un aperçu compact de l'énoncé de la question (`.question-collapsed-preview`) dès que la carte est repliée, masquant les panneaux lourds d'options et d'analyse IA.
  4. **Bouton « Tout replier / Tout déplier » unifié et étendu (`window.toggleAllChapters`)** :
     - Le bouton bascule désormais à la fois les groupes de chapitres ET toutes les fiches de questions.
     - Disponibilité du bouton dans les deux modes d'affichage (vue accordéon par chapitre et vue liste plate sans cours).
- **Synchronisation & Build** :
  - Validation syntaxique Node (`node -c src/app.js`).
  - Compilation complète du bundle autonome via `build-bundle.cjs` (`src/app.bundle.js`, `index.html`, `dist/index.html`).
  - Synchronisation Capacitor Android (`npx cap sync android`).

### 22:20 - Pipeline Automatisé de Mise à Jour de l'APK & Déploiement de l'APK v1.3 (versionCode 4)
- **Objectif** :
  - Garantir que toute modification du code source (CSS, JS, assets) met systématiquement et infailliblement à jour l'APK autonome [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk) à la racine du projet.
- **Automatisation du script de build (`build-apk.bat`)** :
  - Intégration séquentielle automatique des 3 étapes au sein de `build-apk.bat` :
    1. Assemblage du bundle web de production (`node build-bundle.cjs`).
    2. Synchronisation des assets natifs Capacitor (`npx.cmd cap sync android`).
    3. Compilation native Gradle (`:app:assembleDebug`) avec le JDK officiel d'Android Studio et copie directe sous [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk).
- **Montée de version native (`android/app/build.gradle`)** :
  - `versionCode` : incrémenté de `3` à `4`.
  - `versionName` : incrémenté de `"1.2"` à `"1.3"`.
- **Validation** :
  - Compilation complète réussie (`BUILD SUCCESSFUL in 1m 8s`).
  - Fichier [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk) généré et prêt pour installation directe sur smartphone.




