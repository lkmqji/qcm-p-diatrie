# Historique des modifications — 2026-11-27

## 2026-11-27 19:09 — Indicateur des questions non nettoyées près du bouton « Résoudre le cas complet »
- **Interface (`template.html`, `src/style.css`)** :
  - Ajout du badge `#clinical-uncleaned-badge` (`#clinical-uncleaned-text`) juste à côté du bouton `#btn-start-clinical-case` (« Résoudre le cas complet ») dans l'en-tête `.clinical-case-header-actions`.
  - Style distinctif ambre lorsqu'il reste des questions à nettoyer, et émeraude (`.is-all-cleaned`) lorsque toutes les questions du cas sont déjà nettoyées (`0/N à nettoyer`).
- **Logique & Mise à jour temps réel (`src/views/clinicalCaseView.js`, `src/views/arenaView.js`)** :
  - Ajout de la fonction `updateClinicalUncleanedBadge()` calculant le nombre de sous-questions pas encore nettoyées (`!queueEngine.stats[uid]?.done`) sur le nombre total de sous-questions du cas clinique (`X/Y à nettoyer`).
  - Masquage automatique du badge pendant un run de cas clinique actif (`appState.isClinicalRunActive`), pour les cas à question unique ou les questions autonomes.
  - Rafraîchissement immédiat du compteur dès qu'une question du cas est définitivement nettoyée (`result.permanentlyRemoved`) en mode drill standard.
- **Tests & Build (`tests/bundleAndViews.test.js`, `build-bundle.cjs`)** :
  - Ajout d'un test unitaire dédié vérifiant le décompte initial, la mise à jour partielle/complète et le masquage contextuel du badge.
  - Reconstruction du bundle (`node build-bundle.cjs`) et validation complète de la suite de tests (`27/27` tests passés).

## 2026-11-27 19:19 — Correction de la modale de confirmation et du bouton « Quitter » en cas clinique
- **Modale de confirmation `#modal-app-confirm` (`template.html`, `src/style.css`)** :
  - Remplacement de la classe non stylée `.modal-card` par `.modal-content` sur `#modal-app-confirm`, ajout de `z-index: 10500` (au-dessus du bouton et de la boîte de chat IA flottante) et stylisation de `.modal-title-group`, `.btn-icon-close` et `.confirm-modal-card`.
- **Nettoyage d'état à la sortie du cas clinique (`src/views/clinicalCaseView.js`)** :
  - Réinitialisation explicite de `appState.isEvaluating = false` dans `teardownClinicalRunView()` lors de la sortie via `#btn-quit-clinical-run`.
- **Tests & Build (`tests/bundleAndViews.test.js`, `build-bundle.cjs`)** :
  - Ajout d'un test de non-régression couvrant la réponse à la première sous-question d'un cas clinique suivie du clic sur « Quitter » et de la confirmation via `#modal-app-confirm`.
  - Reconstruction du bundle (`node build-bundle.cjs`) et validation complète de la suite de tests (`28/28` tests passés).

## 2026-11-27 19:29 — Release v1.6.5 (versionCode 32)
- **Versionning** : Incrémentation vers `v1.6.5` (`versionCode 32`) dans `package.json`, `src/services/updateService.js`, `android/app/build.gradle`, `template.html` et `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md`.
- **Contenu de la release** :
  - Badge `X/Y à nettoyer` près du bouton « Résoudre le cas complet » affichant en temps réel le nombre de questions pas encore nettoyées sur le total du cas clinique.
  - Correction de la modale de confirmation `#modal-app-confirm` (`.modal-content`, `z-index: 10500`, styles d'en-tête et bouton fermer) et réinitialisation de `appState.isEvaluating` dans `teardownClinicalRunView()`, débloquant la sortie du cas clinique via « Quitter ».
- **Build & Déploiement** :
  - Bundle web de production compilé (`node build-bundle.cjs`), synchronisation Capacitor effectuée (`npx cap sync android`), APK local généré (`PediaDrill.apk` via `build-apk.bat`).
  - Push sur `main` (Vercel) et tag `v1.6.5` (GitHub Actions Release Android).


