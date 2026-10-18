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
