# Historique du 2026-10-27

### 17:35 - Synchronisation et Redéploiement Production du Site Web Vercel vers la Version Stable v1.4.3

- **Contexte & Constat** :
  - Suite au rollback vers la version **v1.4.3** effectué le 26/10/2026, l'application Android native ([PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk)) et le dépôt Git local étaient bien calés sur la v1.4.3.
  - Cependant, le site web public en ligne ([https://qcm-p-diatrie-coral.vercel.app/](https://qcm-p-diatrie-coral.vercel.app/)) continuait de servir l'ancienne version 1.4.6 (comportant le Mode Flash et les optimisations 1.4.6).
  - **Cause technique** : Le moteur de déploiement Vercel gère les déploiements de façon immuable. Lorsqu'un `git push --force` ramène la branche `main` vers un commit antérieur déjà répertorié (`ae9f4b7`), Vercel ne redéploie pas automatiquement et maintient le domaine de production assigné au déploiement le plus récent chronologiquement (`f6c9369` / v1.4.6).
- **Modifications & Actions appliquées** :
  - **Recompilation complète des bundles de production** :
    - Exécution de `build-bundle.cjs` pour synchroniser [src/app.bundle.js](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/src/app.bundle.js), le fichier racine servi directement par Vercel [index.html](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/index.html) et [dist/index.html](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/dist/index.html).
    - Validation de l'absence totale de tout reliquat du « Mode Flash », des flashcards et de la v1.4.6 dans le code source de production.
  - **Déclenchement du redéploiement Vercel** :
    - Enregistrement du commit de synchronisation et de publication de la v1.4.3 sur `main`.
    - Push vers GitHub (`origin/main`) provoquant la notification webhook Vercel pour construire et publier immédiatement la version 1.4.3 en production sur le domaine `qcm-p-diatrie-coral.vercel.app`.
  - **Vérification en direct** :
    - Contrôle HTTP direct du contenu servi par Vercel après le déploiement pour certifier l'alignement strict du site web avec l'application mobile (v1.4.3).
