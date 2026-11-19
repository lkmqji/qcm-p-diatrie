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
