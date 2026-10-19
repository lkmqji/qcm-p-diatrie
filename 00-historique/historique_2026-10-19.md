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
  - Synchronisation Capacitor Android (`cap sync android`) et régénération de l'APK natif [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk).


