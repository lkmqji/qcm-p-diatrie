# Historique des Modifications — 21 Novembre 2026

## 00:05:00 — Release v1.6.2 (versionCode 29) : Déploiement Vercel & Publication GitHub Release

### Contexte & Objectif
- Publication officielle de la version **v1.6.2** (versionCode 29) suite à la commande utilisateur **« update github »**.
- Déploiement de la refonte intégrale du système de synchronisation multi-appareils (PWA / Mobile / Desktop).
- Résolution définitive du cloisonnement inter-modules et de l'ancien écrasement sur Firestore : passage d'un schéma monolithique `pedia` à une architecture distribuée moderne **Profil Racine + Sous-Collections Modulaires Chunkées**.

---

### Actions Réalisées

#### 1. Incrémentation de Version & Alignement Multisupport
- Passage de la version applicative de `1.6.1` à **`1.6.2`** (+0.0.1).
- Incrémentation du `versionCode` Android de `28` à **`29`** (+1).
- Synchronisation rigoureuse dans :
  - `package.json` : `"version": "1.6.2"`
  - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.6.2'`
  - `android/app/build.gradle` : `versionCode 29`, `versionName "1.6.2"`
  - `template.html` : `#update-modal-curr-version`, `#update-modal-new-version` et `#settings-current-app-version` en `v1.6.2`.
  - `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md` : synchronisé avec `1.6.2` et `versionCode 29`.

#### 2. Fonctionnalités Embarquées dans cette Release (v1.6.2)
- **Synchronisation Universelle du Profil Étudiant (`users/{uid}/profile/state`)** :
  - Dates d'examen de TOUS les modules (`getAllExamDates`, `setAllExamDates`) synchronisées en direct avec calcul du compte à rebours J-XX et cadence partagée.
  - Module actif synchronisé entre appareils en temps réel avec commutation intelligente (Smart Context Switch) sans interruption intempestive en pleine Arène.
  - Préférences de résolution des cas cliniques (Séquentiel vs Déroulant) partagées.
  - Clé API Google Gemini Flash sauvegardée et synchronisée avec le profil sécurisé.
  - Chronomètre de révision de cours en direct (`activeLessonTimer`) et historique des sessions multi-modules.
- **Isolation Étanche des Modules Médicaux (`users/{uid}/modules/{moduleId}`)** :
  - Chaque module (Pédiatrie, Psychiatrie, et les 44 prochains modules du cursus) dispose de son propre document isolé.
  - Synchronisation complète de l'état SRS, des erreurs, de la file active et du Premier Passage (`firstPassRecords`).
  - Partitionnement automatique des notes IA d'erreur en sous-collections chunkées (`notes_chunks/chunk_{i}`) par paquets de 50 items (~60 Ko), éliminant tout risque de dépassement de la limite de 1 Mo de Firestore.
- **Migration Automatique Rétro-compatible (`checkAndMigrateLegacyData`)** :
  - Détection automatique au premier lancement de l'ancien format `pedia/progress` et migration transparente vers la nouvelle architecture sans aucune perte de données.
- **Double Écouteur & Anti-Boucle Infinie** :
  - Écouteurs `onSnapshot` découplés pour le profil et pour le module actif.
  - Drapeau `isApplyingRemoteSnapshot` neutralisant tout re-push automatique lors de la réception d'une notification Firestore (élimination des boucles ping-pong).
  - Déclenchement automatique de la synchronisation dès le clic sur « Enregistrer les paramètres ».
  - Alignement déterministe de la date locale (`getLocalDateStr()`) dans `mergeStates` éliminant tout décalage UTC/CET sur le compteur du jour (`todayTracker`).

#### 3. Compilation, Synchronisation & Assemblage
- Exécution de `node build-bundle.cjs` :
  - Styles `src/style.css` synchronisés dans `template.html`.
  - Bundle modulaire `src/app.bundle.js` recompilé avec succès.
  - `index.html` et `dist/index.html` synchronisés pour le déploiement continu Vercel.
- Synchronisation Capacitor Android exécutée avec succès (`cmd.exe /c npx.cmd cap sync android`).
- Compilation de l'APK via `build-apk.bat` (`PediaDrill.apk` à la racine).
- Déclenchement automatique de la GitHub Release via le tag `v1.6.2` et le workflow GitHub Actions CI/CD (`.github/workflows/build-and-release.yml`).
