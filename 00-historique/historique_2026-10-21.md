# Historique des modifications - 2026-10-21

### 07:38 - Correction du blocage de synchronisation Firestore (dépassement du quota de taille de 1 Mo par document)

- **Problème diagnostiqué** :
  - Lors de la synchronisation automatique ou manuelle vers Google Cloud Firestore, un message d'erreur bloquant apparaissait :
    `Document 'projects/qcm-pediatr/databases/(default)/documents/users/.../pedia/progress' cannot be written because its size (1,121,429 bytes) exceeds the maximum allowed size of 1,048,576 bytes.`
  - **Cause racine** :
    1. Cloud Firestore impose une limite matérielle stricte de **1 048 576 octets (1 MiB)** par document individuel.
    2. L'application enregistrait l'intégralité des données dans un seul et unique document Firestore (`users/{uid}/pedia/progress`) :
       - L'état complet de la file SRS (`stats` des 1 905 questions, `queue`, `cursor`, `todayTracker`).
       - L'ensemble des 146 notes d'analyse d'erreur du Carnet IA (`reasoningNotes`).
    3. Chaque fiche d'erreur dupliquait en texte brut l'énoncé de la question, le cas clinique complet, les 5 propositions avec leurs textes intégraux, les médias et l'explication officielle de cours (~6 à 8 Ko par note).
    4. Avec 146 notes accumulées, le document atteignait 1 121 429 octets, franchissant le plafond Firestore de 1 Mo et rejetant toute écriture.

- **Architecture de la solution implémentée** :

  1. **Allègement sémantique et hydratation dynamique des notes (`slimNote` & `hydrateNote`)** :
     - *Dans `src/services/queueEngine.js`* :
       - **`slimNote(note)`** : Ne conserve que les données générées par la tentative de l'étudiant (`id`, `questionUid`, `userAnswer`, `userAnswerLetters`, `correctAnswer`, `score`, `isCroq`, `reasoningNote`, `modelUsed`, `timestamp`). Les champs statiques redondants (`questionText`, `clinicalCase`, `options`, `officialExplanation`, `media_urls`) sont purgés car ils sont déjà présents de façon permanente dans la base embarquée `PEDIA_QUESTIONS`.
       - L'empreinte d'une note passe de ~7 Ko à ~1.2 Ko (**réduction de 85% à 90%**).
       - **`hydrateNote(note, questionsList)`** : Dès qu'une note est consultée ou manipulée par l'interface utilisateur (`getReasoningNotes()`), elle est automatiquement ré-enrichie avec les champs complets de la question issue de `allQuestions`. Zéro perte d'information, rétrocompatibilité et cohérence absolue.

  2. **Assainissement automatique de la mémoire locale (`sanitizeReasoningNotesStorage`)** :
     - À chaque chargement de l'application (`loadState`), un scan détecte les éventuelles notes volumineuses héritées dans le `localStorage` du téléphone et les convertit immédiatement au format allégé.
     - Plus de 800 Ko d'espace mémoire sont instantanément libérés sur le terminal mobile.

  3. **Stockage Firestore partitionné par paquets (`Chunked Firestore Storage`)** :
     - *Dans `src/services/firebaseSyncService.js`* :
       - **Document principal `pedia/progress` épuré** : Ne contient désormais que l'état SRS (`queue`, `cursor`, `selectedChapterIds`, `totalMistakesCount`, `todayTracker`, `userEmail`, `notesCount`, `notesChunksCount`) et compacte `stats` en omettant les questions non encore touchées. Crucialement, le champ `reasoningNotes` y est écrasé par un tableau vide `[]` afin d'éliminer immédiatement l'ancien payload lourd stocké sur Firestore. Poids : **~15 à 20 Ko (50 fois sous le plafond)**.
       - **Documents de partitionnement `pedia/notes_0`, `notes_1`, `notes_2`...** : Les notes sont découpées en paquets homogènes de 50 notes maximum. Chaque document de notes ne pèse que ~50 à 75 Ko (**15 fois sous le plafond de 1 Mo**).
       - **Écriture atomique par lot (`db.batch()`)** : La sauvegarde du document `progress` et de l'ensemble des paquets de notes s'effectue en une seule transaction Firestore atomique sans délai additionnel.
       - **Nettoyage automatique** : Suppression des éventuels anciens paquets orphelins si le nombre total de notes venait à être réduit.
       - **Récupération parallèle (`fetchRemoteNotes`)** : Téléchargement simultané de tous les paquets via `Promise.all` avec fallback sur l'ancien format si présent.
       - **Règles d'erreur conviviales (`getFriendlyFirestoreError`)** : Ajout d'une gestion explicite du cas de taille Firestore.

  4. **Adaptation du script de bundling (`build-bundle.cjs`) & de l'UI (`src/app.js`)** :
     - Normalisation de `cleanModuleCode` dans `build-bundle.cjs` pour retirer proprement à la fois `import` et `export` de tous les modules lors de la génération du bundle client IIFE.
     - Sécurisation du moteur de recherche et de regroupement du Carnet IA (`groupNotesByChapterAndQuestion` et `renderNotebookUI`) pour vérifier systématiquement `fullQ` en fallback.

- **Compilation & Validation** :
  - Validation de la syntaxe Node.js sur l'ensemble des fichiers source (`node -c`).
  - Tests unitaires automatisés validant la réduction de 90% de la taille des notes et la non-régression de `mergeStates`.
  - Recompilation réussie du bundle web autonome (`node build-bundle.cjs`).
  - Synchronisation Capacitor et recompilation de l'APK natif Android (`build-apk.bat`).
