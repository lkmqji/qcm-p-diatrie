# Règle Métier : Commande « update github » (Déploiement Vercel & Release Android)

Dès que l'utilisateur dit **« update github »** (ou toute variante comme *« mets à jour github »*, *« push github »*, *« publie la mise à jour »*, *« update release »*), l'agent DOIT exécuter automatiquement et sans omission le protocole en 5 étapes suivant :

---

## 1. Incrémentation Automatique de la Version (+0.0.1 & versionCode +1)
- Récupérer la version actuelle (ex: `1.4.7`).
- Calculer la nouvelle version en incrémentant le numéro de patch de **+0.0.1** (ex: `1.4.7` devient `1.4.8`, `1.4.9` devient `1.5.0`, `1.5.0` devient `1.5.1`).
- Incrémenter le `versionCode` Android de **+1** (ex: `14` devient `15`).
- Répercuter rigoureusement ces nouveaux numéros dans TOUS les fichiers de référence :
  1. `package.json` : `"version": "X.Y.Z"`
  2. `src/services/updateService.js` : `export const CURRENT_APP_VERSION = 'X.Y.Z';`
  3. `android/app/build.gradle` :
     - `versionCode <N+1>`
     - `versionName "X.Y.Z"`
  4. `template.html` :
     - `<strong id="update-modal-curr-version">vX.Y.Z</strong>`
     - `<strong id="update-modal-new-version">vX.Y.Z</strong>`
  5. `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md` : synchroniser les mentions de version (`versionName` et `versionCode`).

---

## 2. Compilation et Assemblage des Bundles de Production
- Exécuter la commande :
  ```powershell
  node build-bundle.cjs
  ```
  Cette étape :
  - Synchronise les styles `src/style.css` dans `template.html`.
  - Assemble `src/app.bundle.js` à partir des services modulaires.
  - Compile `index.html` (qui est la page principale déployée et servie par Vercel).
  - Met à jour le dossier `dist/` (`dist/index.html`, assets, sw.js...).
- Synchroniser Capacitor pour la plateforme Android :
  ```powershell
  cmd.exe /c npx.cmd cap sync android
  ```
- Compiler l'APK Android local (si l'environnement local le permet) pour mettre à jour `PediaDrill.apk` à la racine :
  ```powershell
  cmd.exe /c build-apk.bat
  ```

---

## 3. Traçabilité & Documentation (Historique Quotidien & Master Context)
- Ajouter une entrée horodatée dans `00-historique/historique_YYYY-MM-DD.md` :
  - Numéro de la nouvelle version (`vX.Y.Z`, `versionCode`).
  - Résumé clair des fonctionnalités, correctifs ou améliorations apportés.
  - Statut des déploiements Vercel et Android.
- Mettre à jour `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md`.

---

## 4. Validation & Intégrité
- Vérifier la syntaxe des scripts modifiés avant tout commit :
  ```powershell
  node -c src/app.js
  node -c src/app.bundle.js
  node -c src/services/updateService.js
  ```

---

## 5. Commit, Tag et Push vers GitHub (Déclenchement Vercel & GitHub Actions Release)
- Ajouter tous les fichiers modifiés :
  ```powershell
  git add -A
  ```
- Créer le commit de release :
  ```powershell
  git commit -m "chore(release): vX.Y.Z - <description concise des changements>"
  ```
- Créer le tag git annoté correspondant à la version :
  ```powershell
  git tag vX.Y.Z
  ```
- Pousser la branche principale vers GitHub pour **mettre à jour automatiquement le site sur Vercel** :
  ```powershell
  git push origin main
  ```
- Pousser le tag vers GitHub pour **déclencher automatiquement le workflow GitHub Actions (`.github/workflows/build-and-release.yml`)** qui compile l'APK Android et publie la GitHub Release avec `PediaDrill.apk` en téléchargement direct pour l'application :
  ```powershell
  git push origin vX.Y.Z
  ```
