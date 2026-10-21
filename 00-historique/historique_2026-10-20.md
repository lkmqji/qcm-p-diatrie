# Historique des modifications - 2026-10-20

### 23:19 - Recompilation native et mise à jour de l'APK Android (`PediaDrill.apk`)
- **Action effectuée** :
  - Exécution du script automatisé `build-apk.bat` intégrant l'ensemble des récentes modifications :
    1. Assemblage du bundle web de production (`build-bundle.cjs`).
    2. Synchronisation des assets natifs Capacitor (`npx cap sync android`).
    3. Compilation native Gradle (`:app:assembleDebug`) avec le JDK officiel d'Android Studio.
  - Copie automatique du binaire résultant à la racine sous [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk) (taille : 7.70 Mo, généré le 20/10/2026 à 23:18:54).
- **Fonctionnalités intégrées dans ce build** :
  - Navigation retour sur les 5 derniers QCM répondus en Arène (`[◀]` / `[▶]`) avec mode consultation en lecture seule.
  - Synchronisation dynamique du Tuteur IA sur les QCM passés.
  - Floutage anti-spoiler du nom du cours dans le Tuteur IA avant validation de la réponse.
  - Suppression de l'option « Réinitialiser la session » du Dashboard et centrage du raccourci vers le Carnet IA.

### 22:52 - Suppression de l'option « Réinitialiser la session » du Dashboard
- **Retour utilisateur (Agentation)** :
  - Sur `#app-main > #view-dashboard > .quick-links-row > #btn-reset-session` : demande de suppression directe de cette option.
- **Modifications appliquées** :
  - **Structure HTML (`template.html`)** : Suppression du bouton `#btn-reset-session` au sein du conteneur `.quick-links-row`.
  - **Styles CSS (`src/style.css`)** : Mise à jour de la classe `.quick-links-row` avec `justify-content: center` pour centrer harmonieusement le bouton restant (« Ouvrir le Carnet de Raisonnement IA »).
  - **Logique applicative (`src/app.js`)** : Retrait du gestionnaire d'événement click associé à `#btn-reset-session` dans `setupEventListeners()`.
- **Compilation & Déploiement** :
  - Recompilation réussie du bundle web autonome (`node build-bundle.cjs`).
  - Synchronisation réussie des assets natifs Android (`npx cap sync android`).

### 21:07 - Floutage du nom de cours dans le Tuteur IA avant validation de la réponse (Anti-Spoiler)
- **Retour utilisateur (Agentation)** :
  - Sur `#chatbox-messages-list > .chat-bubble > p > strong` : l'étudiant a demandé de « flouter car c'est le nom du cours aussi jusqu'à ce que je réponde ».
  - En effet, afficher l'intitulé du chapitre dans le message de bienvenue ou dans l'en-tête du Tuteur IA donnait prématurément le diagnostic avant même que l'étudiant n'ait répondu à la question.
- **Règles d'affichage & Cycle de vie (`src/app.js`)** :
  - **État `isCurrentQuestionAnswered`** :
    - Initialisé à `false` à chaque nouvelle question (`loadNextArenaQuestion`).
    - Bascule à `true` dès que l'étudiant soumet sa réponse (`handleAnswerSuccess` ou `handleAnswerFailure`), ou lorsqu'il consulte une question passée dans l'historique (`historyCursor >= 0`).
  - **Helper `isArenaChapterRevealed()`** :
    - Détermine en temps réel si le nom du cours doit être visible ou flouté, en harmonie avec l'état du badge de la carte (`#arena-chapter-title`).
  - **Rendu du Tuteur IA (`renderChatWelcome` & `updateArenaChatContext`)** :
    - Tant que la question n'a pas été répondue, le nom du cours dans le message d'accueil et dans le sous-titre de l'en-tête est affiché avec la classe `.chatbox-chapter-blurred.is-blurred`.
    - Dès que la réponse est validée ou échouée, le flou est automatiquement levé (`.is-revealed`).
    - L'étudiant peut également cliquer manuellement sur le texte flouté à tout moment pour l'afficher ou le masquer (`window.toggleArenaChapterTitle()`).
  - **Synchronisation bidirectionnelle (`window.toggleArenaChapterTitle`)** :
    - Un clic sur le badge de chapitre de la carte de question ou sur la mention floutée dans le chatbox bascule simultanément les deux éléments pour une cohérence visuelle parfaite.
- **Design System & Styles CSS (`src/style.css`)** :
  - Ajout des classes `.chatbox-chapter-blurred`, `.is-blurred` (`filter: blur(5.5px); opacity: 0.38;`) et `.is-revealed` (`filter: none; opacity: 1; color: var(--cyan);`).
- **Compilation & Déploiement** :
  - Exécution réussie de `build-bundle.cjs` et synchronisation Android via `npx cap sync android`.

### 20:25 - Navigation dans les 5 derniers QCM répondus en Arène et synchronisation dynamique du Tuteur IA
- **Besoins & Contexte** :
  - L'utilisateur souhaitait pouvoir revenir en arrière sur les questions déjà répondues dans le mode principal (« Arène »), jusqu'aux 5 derniers QCM, via de petites flèches en haut de l'interface (`[◀]` / `[▶]`), notamment pour relire les énoncés, revoir le corrigé et interroger le Tuteur IA sur les questions précédentes sans altérer la file de révision active.
- **Architecture de l'Historique en Arène (`src/app.js`)** :
  - **Buffer circulaire en mémoire (`answeredHistory`)** : Conservation automatique d'un snapshot complet des 5 derniers QCM répondus (justes ou faux), incluant l'objet question découpé, les réponses de l'utilisateur, l'état de réussite, le score éventuel, l'explication officielle et l'horodatage.
  - **Curseur de navigation (`historyCursor`)** :
    - `-1` : Mode Drill Actif (question en cours d'évaluation, options interactives, raccourcis claviers 1-5 / A-E actifs).
    - `0` : Dernier QCM répondu (`QCM -1`).
    - `1` à `4` : QCM antérieurs jusqu'au 5ème précédent (`QCM -2` à `QCM -5`).
  - **Isolation stricte de la répétition espacée** : La consultation des questions antérieures s'effectue en lecture seule absolue (`read-only`), sans jamais modifier l'état d'apprentissage (`handleSuccess` / `handleFailure`), ni toucher aux compteurs du jour ou à la position dans la file.
- **Interface & Expérience Utilisateur (`template.html`, `src/style.css`)** :
  - **Contrôles de navigation compacts dans la barre supérieure (`.arena-top-bar`)** :
    - Bouton flèche gauche `[◀]` (`#btn-history-prev`) avec infobulle contextuelle et désactivation automatique lorsque l'historique est vide ou au plus ancien (5 max).
    - Badge central indicateur (`#arena-history-badge`) affichant l'état en temps réel (`Actuel (N)` en mode drill, `Précédent X/N` en mode consultation avec surbrillance dorée/ambrée).
    - Bouton flèche droite `[▶]` (`#btn-history-next`) pour revenir pas-à-pas vers les questions plus récentes ou réintégrer le drill actif.
  - **Bannière d'alerte dorée en mode révision (`#arena-history-consult-banner`)** :
    - Notification bienveillante rappelant que le QCM est en mode consultation.
    - Bouton d'action directe « Reprendre le drill ➔ » (`.btn-resume-drill`) pour revenir immédiatement à la question active en 1 clic.
  - **Rendu en lecture seule et corrigé direct (`renderHistoryQuestion`)** :
    - Propositions en surbrillance : verte (`correct-highlight`) pour les bonnes réponses officielles et rouge (`wrong-highlight`) pour les choix erronés de l'utilisateur.
    - Badge du cours affiché immédiatement en clair sans floutage avec mention « QCM Répondu ».
    - Boîte d'explication officielle ouverte automatiquement sous les propositions.
    - Bouton « Reprendre le drill en cours ➔ » (`#btn-history-resume-action`) visible dans la barre d'action inférieure.
- **Synchronisation dynamique du Tuteur IA (`updateArenaChatContext`, `renderChatWelcome`, `executeSendMessage`)** :
  - Helper `getEffectiveArenaQuestion()` : Renvoie dynamiquement la question d'historique sélectionnée lorsque `historyCursor >= 0`, ou la question active lorsque `historyCursor === -1`.
  - Le chat contextuel du Tuteur IA, son message de bienvenue et les prompts soumis à Gemini Flash ciblent avec précision le QCM actuellement sous les yeux de l'étudiant.
- **Raccourcis Clavier Intelligents (`setupKeyboardShortcuts`)** :
  - Touche `Flèche Gauche` (<kbd>◀</kbd>) : Remonter vers les QCM répondus précédents.
  - Touche `Flèche Droite` (<kbd>▶</kbd>) : Avancer vers les QCM plus récents / drill actif.
  - Touche <kbd>Entrée</kbd> en mode consultation : Reprendre instantanément le drill actif.
  - Neutralisation des raccourcis de sélection d'options (1-5, A-E) en mode historique et exclusion systématique lorsque le focus est dans un champ de texte (chat ou CROQ).
- **Compilation, synchronisation et déploiement** :
  - Script `node build-bundle.cjs` exécuté avec succès : synchronisation de `template.html`, compilation de `src/app.bundle.js` et reconstruction de `index.html` et `dist/index.html`.
  - Synchronisation Android via Capacitor (`npx cap sync android`).

### 19:45 - Optimisation majeure de la latence IA : Circuit-Breaker, mise en quarantaine des quotas (429), mémorisation du modèle actif et passage de 38s à 1.5s
- **Diagnostic approfondi de la latence IA (`src/services/gemini.js`)** :
  - Identification de la cause racine des temps d'attente excessifs (30 à 38 secondes) ressentis par l'utilisateur :
    - Les modèles `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash` et `gemini-3.5-flash` renvoyaient immédiatement une erreur HTTP `429 RESOURCE_EXHAUSTED` (quota de 20 requêtes/jour dépassé sur le tier gratuit de la clé par défaut).
    - L'absence de mémorisation du dernier modèle fonctionnel obligeait chaque nouvelle requête (CROQ, erreur QCM, tuteur) à rejouer tous les échecs depuis le début de la liste.
    - Le modèle `gemini-3.5-flash-lite` en 5ème position subissait une latence anormale de plus de 30 secondes, bloquant la boucle jusqu'au timeout maximal de 25s (`AbortError`).
    - L'absence de configuration de désactivation des pensées cachées générait plus de 500 tokens de "thoughts" invisibles avant de renvoyer le texte.
- **Réorganisation ultra-rapide de la cascade Flash (`MODEL_CASCADE`)** :
  - Promotion en priorité #1 de `gemini-3-flash-preview` (temps de réponse mesuré à 1.25s pour un ping et 1.57s pour une évaluation CROQ complète).
  - Établissement de la nouvelle cascade de résilience :
    1. `gemini-3-flash-preview` (Priorité #1 : modèle Flash ultra-rapide validé à 1.25s)
    2. `gemini-flash-lite-latest` (Secours #2 : Flash Lite dernière génération)
    3. `gemini-3.1-flash-lite` (Secours #3 : Flash Lite haute disponibilité)
    4. `gemini-3.8-flash` (Secours #4 : Flash haute fidélité si quota disponible)
    5. `gemini-3.7-flash` (Secours #5 : Flash standard)
    6. `gemini-3.6-flash` (Secours #6 : Flash secours)
    7. `gemini-3.5-flash` (Secours #7 : Flash réserve)
  - Exclusion définitive du modèle bloquant `gemini-3.5-flash-lite`.
- **Circuit-Breaker & Quarantaine dynamique anti-latence (`src/services/gemini.js`)** :
  - **Mémorisation du modèle fonctionnel** : Stockage du dernier modèle ayant réussi (`this.lastSuccessfulModel`). Toute nouvelle requête tente directement ce modèle en premier sans repasser par les modèles en échec.
  - **Quarantaine automatique des erreurs de quota** : Lorsqu'un modèle renvoie une erreur 429 (`RESOURCE_EXHAUSTED`), il est placé en quarantaine pour 15 minutes (`this.quarantinedModels`). Lors des appels suivants, le système le saute immédiatement en mémoire sans effectuer d'appel réseau pénalisant.
  - **Quarantaine des erreurs 503/404** : Mise en quarantaine temporaire de 5 minutes en cas de pic de charge ou de modèle indisponible.
  - **Réduction du timeout par tentative** : Abaissement du timeout d'attente par modèle de 25s à 12s pour basculer instantanément au secours si un serveur Google tarde à répondre.
  - **Désactivation des pensées cachées** : Injection conditionnelle de `thinkingConfig: { thinkingBudget: 0 }` sur `gemini-3-flash-preview`, divisant le temps de génération par 2 sans altérer la qualité médicale des réponses.
  - **Calibration des tokens** : Plafond ajusté à 1024 tokens pour les évaluations CROQ et 2500 tokens pour les notes cliniques structurées.
- **Modernisation des libellés UI (`src/app.js`)** :
  - Remplacement des libellés fixes "Gemini 3.8 Flash" par des mentions dynamiques "IA Flash" dans la bannière de chargement et le carnet d'erreurs, le modèle réel utilisé étant fidèlement reflété par le badge dynamique (`modelUsed`).
- **Compilation, synchronisation et APK** :
  - Compilation réussie du bundle web autonome via `build-bundle.cjs` (`src/app.bundle.js`, `template.html`, `index.html`, `dist/index.html`).
  - Synchronisation des assets natifs Android avec Capacitor (`npx.cmd cap sync android`).
  - Régénération de l'exécutable natif [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk).
