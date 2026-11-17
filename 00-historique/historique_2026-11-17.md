# Historique des Modifications — 17 Novembre 2026

## 07:32:00 — Alignement par Défaut du Module dans le Suivi des Cours sur le Module Actif du Dashboard

### Contexte & Retour Utilisateur
À la suite de la remarque utilisateur :
> *« dans l'onglet de suivi des cours par défaut le module sélectionné dans le dashbord est sélectionné par défaut dans les suivi pas l'onglet tous »*
- Par défaut, les 4 panneaux de l'onglet de suivi des cours (`#stats-subpage-lessons`) doivent présélectionner le module actif en cours sur le Dashboard (ex: Pédiatrie ou Psychiatrie) au lieu de l'onglet « Tous ».
- L'utilisateur conserve la possibilité de cliquer à tout moment sur « Tous les cours » pour afficher la totalité des modules.

---

### Changements Effectués

#### 1. Logique Applicative (`src/app.js`)
- **Initialisation dynamique des variables d'état** :
  - `lessonDistModuleFilter`, `lessonMatrixModuleFilter`, `lessonSummaryModuleFilter` et `lessonRecentModuleFilter` sont désormais initialisés dynamiquement avec `(typeof getActiveModuleId === 'function' ? getActiveModuleId() : 'pediatrie')`.
  - Si l'utilisateur a sélectionné la Psychiatrie sur le Dashboard, le suivi des cours démarre directement en mode Psychiatrie. Si la Pédiatrie est active, il démarre en mode Pédiatrie.
- **Synchronisation dynamique lors du changement de module (`switchActiveModule`)** :
  - Dès que l'utilisateur permute de module médical (depuis le header du Dashboard ou la modale des Paramètres), les 4 filtres de cours sont automatiquement réalignés sur le nouvel identifiant de module actif (`mod.id`).

#### 2. Gabarit HTML (`template.html`)
- Alignement de la classe `.active` par défaut dans les 4 sélecteurs à boutons pilules (`#lesson-dist-module-filter`, `#lesson-matrix-module-filter`, `#lesson-summary-module-filter`, `#lesson-recent-module-filter`) sur le module par défaut (`data-mod="pediatrie"`) au lieu de `data-mod="all"`.

#### 3. Compilation & Synchronisation
- Exécution réussie de `build-bundle.cjs` :
  - `src/style.css` synchronisé dans `template.html`.
  - `src/app.bundle.js` régénéré avec succès (428 Ko).
  - `index.html` (6.49 Mo) et `dist/index.html` (6.67 Mo) synchronisés.
- Synchronisation Capacitor Android validée (`npx cap sync android`).
- Contrôle de syntaxe JavaScript `node -c` validé à 100%.


---

## 09:56:00 — Release v1.5.7 (versionCode 24) : Déploiement Vercel & Publication GitHub Release

### Contexte & Objectif
- Publication de la mise à jour faisant suite à la commande utilisateur **« update github »**.
- Intégration de la pré-sélection automatique du module actif du Dashboard dans l'onglet de suivi des cours (`#stats-subpage-lessons`) et synchronisation dynamique des filtres lors du changement de module.

---

### Actions Réalisées

#### 1. Incrémentation de Version & Alignement Multisupport
- Passage de la version applicative de `1.5.6` à **`1.5.7`** (+0.0.1).
- Incrémentation du `versionCode` Android de `23` à **`24`** (+1).
- Synchronisation rigoureuse dans :
  - `package.json` : `"version": "1.5.7"`
  - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.5.7'`
  - `android/app/build.gradle` : `versionCode 24`, `versionName "1.5.7"`
  - `template.html` : `#update-modal-curr-version` et `#update-modal-new-version` mis à jour en `v1.5.7`
  - `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md` : synchronisé avec `1.5.7` et `versionCode 24`.

#### 2. Assemblage & Compilation des Bundles
- Exécution de `node build-bundle.cjs` :
  - `src/style.css` injecté dans `template.html`.
  - `src/app.bundle.js` recompilé (428 Ko).
  - `index.html` (6.49 Mo) et `dist/index.html` (6.67 Mo) prêts pour déploiement Vercel.
- Synchronisation Capacitor Android exécutée (`cmd.exe /c npx.cmd cap sync android`).
- Compilation locale de l'APK via `build-apk.bat` (`PediaDrill.apk` à la racine).

#### 3. Déploiement
- Push sur la branche `main` déclenchant le déploiement continu Vercel.
- Tag `v1.5.7` poussé déclenchant le workflow GitHub Actions `build-and-release.yml` pour la publication de la Release GitHub avec l'APK Android.
