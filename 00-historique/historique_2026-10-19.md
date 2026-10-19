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
