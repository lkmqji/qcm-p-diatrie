# Historique des Modifications — 19 Novembre 2026

## 19:25:00 — Release v1.5.8 (versionCode 25) : Déploiement Vercel & Publication GitHub Release

### Contexte & Objectif
- Publication de la mise à jour majeure faisant suite à la commande utilisateur **« update github »**.
- Intégration complète du **Moteur de Résolution Intégrale des Cas Cliniques** (Modes Séquentiel et Déroulant, règle stricte « Tout ou Rien », repositionnement contigu groupé SRS dans 5 à 7 cartes et synthèse clinique IA consolidée).

---

### Actions Réalisées

#### 1. Incrémentation de Version & Alignement Multisupport
- Passage de la version applicative de `1.5.7` à **`1.5.8`** (+0.0.1).
- Incrémentation du `versionCode` Android de `24` à **`25`** (+1).
- Synchronisation rigoureuse dans :
  - `package.json` : `"version": "1.5.8"`
  - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.5.8'`
  - `android/app/build.gradle` : `versionCode 25`, `versionName "1.5.8"`
  - `template.html` : `#update-modal-curr-version` et `#update-modal-new-version` mis à jour en `v1.5.8` (ainsi que `#settings-current-app-version`).
  - `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md` : synchronisé avec `1.5.8` et `versionCode 25`.

#### 2. Fonctionnalités Embarquées dans cette Release (v1.5.8)
- **Bouton d'Action Cas Clinique (`#btn-start-clinical-case`)** :
  - Bouton néon violet/cyan dans l'en-tête du cas : « 🎯 Résoudre le cas complet (X Q) ».
- **Mode 1 : Séquentiel (1 par 1)** :
  - Résolution question par question avec bandeau persistant du cas et barre de progression animée.
  - Stepper de navigation `[← Précédente]` / `[Suivante →]` (et touches fléchées clavier) pour réajuster ses réponses.
  - Transition fluide à chaque étape et bouton final « 🏁 Valider tout le cas clinique ».
- **Mode 2 : Liste Déroulante (Tout-en-un)** :
  - Rendu scrollable de toutes les sous-questions du cas sur une seule page.
  - Bouton unitaire « Vérifier cette question » sur chaque carte dévoilant immédiatement le verdict juste/faux et l'explication officielle sans quitter le cas.
  - Barre d'action sticky au bas de page avec bouton maître « Valider tout le cas clinique & Voir le Bilan ».
- **Sélecteur de Mode & Paramètres** :
  - Commutateur en direct `[1 par 1]` et `[Déroulant]` dans la barre d'action du cas.
  - Choix du mode par défaut dans les Paramètres (`#settings-clinical-mode-select`) avec persistance `localStorage`.
- **Règle Stricte « Tout ou Rien » & Repositionnement SRS (`QueueEngine`)** :
  - 100% de réussite : toutes les questions du cas avancent (+1 succès), marquage maîtrisé si seuil atteint, confettis et crédit intégral de +N questions au compteur journalier.
  - $\ge 1$ faute : **0 question n'est créditée**, pénalités d'erreur appliquées et réinsertion de l'intégralité du cas clinique **groupé et contigu dans 5 à 7 cartes**.
- **Synthèse Clinique IA Consolidée & Modale de Bilan (`#modal-clinical-case-summary`)** :
  - Modale complète avec bilan par question et impact SRS.
  - Génération d'une note de synthèse consolidée par Gemini Flash lors d'erreurs, enregistrée dans le Carnet.

#### 3. Compilation, Synchronisation & Assemblage
- Exécution réussie de `node build-bundle.cjs` :
  - `src/style.css` synchronisé dans `template.html`.
  - `src/app.bundle.js` recompilé avec succès (467 Ko).
  - `index.html` (6.54 Mo) et `dist/index.html` (6.72 Mo) synchronisés pour déploiement Vercel.
- Synchronisation Capacitor Android exécutée avec succès (`cmd.exe /c npx.cmd cap sync android`).
- Compilation locale de l'APK via `build-apk.bat` (`PediaDrill.apk` à la racine).

#### 4. Déploiement & Publication
- Push sur la branche `main` pour mise à jour automatique sur Vercel.
- Création et push du tag `v1.5.8` pour déclencher le workflow GitHub Actions (`.github/workflows/build-and-release.yml`), compilant l'APK signé et publiant la GitHub Release.

---

## 20:05:00 — Mode Cas Clinique Séquentiel (1 par 1) : Double Action « Vérifier la réponse » (Principal) & « Enregistrer & Suivant » (Secondaire Gauche)

### Contexte & Feedback Utilisateur
- Retour utilisateur sur l'arène (`#arena-default-actions`) :
  1. *« dans le mode 1 par 1 je peux enregister les réponse pour les valider à la fin ajoute l'option de vérifier la réponse un par un »*
  2. *« mets l'option de vérifier comme l'option principale par défaut et l'option enregistrer et passé aux suivant comme la secondaire place la à gauche sa taille et petite par rapport aux bouton par défaut »*

### Modifications Apportées
1. **Bouton Principal par Défaut (`#btn-submit-answer` / `#btn-submit-croq`)** :
   - Style : `.btn-validate` / `.btn-croq-eval` (taille normale, couleur cyan lumineuse avec lueur, raccourci clavier `Entrée`).
   - État initial (question non vérifiée) : Libellé **« Vérifier la réponse »** (ou « Évaluer par IA (Gemini) » pour CROQ). Évalue immédiatement la question courante :
     - Affiche les surlignages visuels `.correct-highlight` (vert) sur les bonnes réponses et `.wrong-highlight` (rouge) sur les erreurs.
     - Affiche l'explication officielle complète et formatée dans `#arena-explanation-box` avec bandeau de statut (« Bonne réponse ! » ou « Réponse incorrecte »).
     - Verrouille les options (`pointer-events: none`).
     - Enregistre l'évaluation dans `clinicalRunState.cardEvaluations[subQ.uid]`.
   - État vérifié : Le bouton se transforme automatiquement en **« Question suivante ➔ »** (ou **« 🏁 Voir le Bilan Final »** sur la dernière question du cas). Au clic ou `Entrée`, il passe à la sous-question suivante ou ouvre la modale de bilan complet.
2. **Bouton Secondaire Compact (`#btn-clinical-save-next`)** :
   - Position : Placé **à gauche** du bouton principal dans le conteneur flex `.arena-actions-right`.
   - Style : Classe `.btn-clinical-save-step`, taille compacte (padding 10px 16px, font-size 0.82rem, bordure cyan semi-transparente).
   - Libellé : **« Enregistrer & Suivant »** (ou **« Enregistrer & Bilan »** sur la dernière question).
   - Comportement : Enregistre le choix de l'étudiant sans afficher la correction ni l'explication, et passe immédiatement à la sous-question suivante (ou lance la validation globale si dernière question).
   - Se masque automatiquement si la question courante a déjà été vérifiée.
3. **Responsive Mobile (`@media (max-width: 640px)`)** :
   - Conteneur `.arena-actions-right` en flex-row avec gap 8px.
   - Bouton secondaire compact `flex: 0 0 auto` sur la gauche, bouton principal `flex: 1` occupant le reste de la largeur.
4. **Validation & Compilation** :
   - Validation syntaxique JS de `src/app.js` (`node -c src/app.js`).
   - Synchronisation et compilation avec `node build-bundle.cjs` (`index.html`, `src/app.bundle.js`, `dist/`).

---

## 20:15:00 — Release v1.5.9 (versionCode 26) : Déploiement Vercel & Publication GitHub Release

### Contexte & Objectif
- Publication de la mise à jour faisant suite à la commande utilisateur **« update github »**.
- Déploiement du nouveau système à double action dans le Mode Séquentiel (1 par 1) des Cas Cliniques :
  - Action principale par défaut : **« Vérifier la réponse »** (évaluation immédiate question par question, surbrillances colorées émeraude/rouge, affichage de l'explication officielle dans l'arène, bascule en « Question suivante ➔ » / « 🏁 Voir le Bilan Final »).
  - Action secondaire compacte à gauche : **« Enregistrer & Suivant »** (sauvegarde sans dévoiler la correction, passage direct à la sous-question suivante).
  - Intégration ergonomique desktop et mobile dans `.arena-actions-right`.

---

### Actions Réalisées

#### 1. Incrémentation de Version & Alignement Multisupport
- Passage de la version applicative de `1.5.8` à **`1.5.9`** (+0.0.1).
- Incrémentation du `versionCode` Android de `25` à **`26`** (+1).
- Synchronisation rigoureuse dans :
  - `package.json` : `"version": "1.5.9"`
  - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.5.9'`
  - `android/app/build.gradle` : `versionCode 26`, `versionName "1.5.9"`
  - `template.html` : `#update-modal-curr-version`, `#update-modal-new-version` et `#settings-current-app-version` en `v1.5.9`.
  - `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md` : synchronisé avec `1.5.9` et `versionCode 26`.

#### 2. Compilation, Synchronisation & Assemblage
- Exécution de `node build-bundle.cjs` :
  - `src/style.css` synchronisé dans `template.html`.
  - `src/app.bundle.js` recompilé avec succès.
  - `index.html` et `dist/index.html` synchronisés pour déploiement Vercel.
- Synchronisation Capacitor Android exécutée avec succès (`cmd.exe /c npx.cmd cap sync android`).
- Compilation locale de l'APK via `build-apk.bat` (`PediaDrill.apk` à la racine).

#### 3. Déploiement & Publication
- Push sur la branche `main` pour mise à jour automatique sur Vercel.
- Création et push du tag `v1.5.9` pour déclencher le workflow GitHub Actions (`.github/workflows/build-and-release.yml`), compilant l'APK signé et publiant la GitHub Release.


