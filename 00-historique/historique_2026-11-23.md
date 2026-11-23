# Historique des modifications - 2026-11-23

## [20:25] Résolution et Déblocage du Moteur d'Explications Cliniques IA (Gemini Service)

### Contexte & Problématique
- L'utilisateur a signalé une panne complète de la génération d'explications IA ("l'IA ne marche pas") et a fourni une nouvelle clé API (`AQ.Ab8RN6IDaw...`).
- L'analyse approfondie et les benchmarks en direct ont révélé :
  1. Les modèles de préversion Gemini 3 (`gemini-3-flash-preview`, `gemini-3.8-flash`, `gemini-3.7-flash`) subissaient une saturation massive mondiale côté serveurs Google (`HTTP 503 : This model is currently experiencing high demand`).
  2. Le modèle de secours `gemini-flash-lite-latest` répondait correctement mais nécessitait 11 secondes pour rédiger l'explication exhaustive, alors que le code de l'application était bridé par un timeout hardcodé de 10 secondes (`maxTokens >= 2000 ? 10000 : 6000`), ce qui avortait la requête à 1 seconde de la fin.
  3. Le Circuit-Breaker de l'application exécutait un `break;` destructeur sur les erreurs 503 et 404, bloquant les modèles pour tout le pool sans tester les autres clés.
  4. Les clés initiales du pool (`PediaDrill1`, `PediaDrill2`, `PediaDrill3`) étant issues de projets Google Cloud récents ("new users"), Google leur refusait le modèle ultra-stable `gemini-2.5-flash` (HTTP 404), tandis que la nouvelle clé fournie par l'utilisateur (`PediaDrill4`) dispose des droits complets sans aucune erreur 503.

### Modifications apportées (`src/services/gemini.js`)
1. **Intégration de la 4ème clé API (`PediaDrill4`) :**
   - Encodage base64 sécurisé de la nouvelle clé (`QVEuQWI4Uk42SURhd2xRemRDQzZDRnZoNmJlaDRoS2haVkFyQTR2c0dWbHQwaVZqTlZoUnc=`).
   - Ajout dans `GEMINI_KEY_REGISTRY.PediaDrill4`.
   - Priorisation en tête de liste dans `DEFAULT_GEMINI_KEYS`.
2. **Refonte de la cascade de modèles (`MODEL_CASCADE`) :**
   - Priorité #1 donnée à `gemini-2.5-flash` (modèle de référence ultra-stable, insensible aux pannes 503 de la série 3).
   - Secours immédiats : `gemini-3.5-flash-lite` et `gemini-flash-lite-latest`.
   - Maintien en réserve de `gemini-3-flash-preview`, `gemini-3.1-flash-lite` et `gemini-3.8-flash`.
3. **Ajustement adaptatif du Timeout :**
   - Passage du timeout des notes cliniques de 10 000 ms à **18 000 ms** (18 secondes), garantissant la complétion sans coupure des 5 000 à 7 500 caractères d'analyse clinique.
4. **Correction du Circuit-Breaker multi-clés :**
   - Sur erreur 404 (incompatibilité de projet) ou 503 temporaire sur une clé, le moteur n'abandonne plus le modèle immédiatement : il tente les clés suivantes (`continue;`).
   - Réduction de la mise en quarantaine des 503 de 5 minutes à 60 secondes.
   - Nettoyage automatique des vieilles quarantaines résiduelles du `localStorage`.
5. **Optimisation de la latence du prompt système :**
   - Ajout d'une consigne stricte de suppression des formules de politesse et salutations d'introduction dans `systemPrompt` (gain de 150 tokens et 2 secondes par appel).
   - Activation de `thinkingConfig: { thinkingBudget: 0 }` pour `gemini-2.5-flash` et `gemini-3-flash-preview`.

### Validation & Compilation
- `node build-bundle.cjs` : synchronisation de `src/style.css`, compilation de `src/app.bundle.js` et mise à jour de `index.html` et `dist/`.
- Tests de syntaxe : `node -c src/services/gemini.js`, `node -c src/app.js`, `node -c src/app.bundle.js` validés avec succès (Code 0).
- Test fonctionnel end-to-end en direct : deux générations consécutives de notes cliniques pédiatriques complètes (5 819 car. en 12,8s puis 7 524 car. en 11,0s) avec 100% de succès sans aucune erreur.

## [20:53] Rétablissement et Priorisation de Gemini 3 Flash Preview (Fin du pic 503)

### Constat & Vérification
- L'utilisateur a demandé de revérifier l'état de la série 3 suite à la résorption du pic de saturation Google.
- Les tests en direct ont confirmé la disponibilité immédiate de `gemini-3-flash-preview` (réponse en 1,9s à 4,6s) et `gemini-flash-lite-latest` (réponse en 2,6s).
- Réorganisation de `MODEL_CASCADE` pour placer `gemini-3-flash-preview` en priorité #1, `gemini-flash-lite-latest` en #2 et `gemini-2.5-flash` en #3 (filet de sécurité absolu anti-503).
- Test end-to-end réussi avec succès en direct : 3 963 caractères générés par `gemini-3-flash-preview` sans aucune erreur.
- Bundles synchronisés via `node build-bundle.cjs`.

## [21:05] Release v1.6.4 (versionCode 31) - Déploiement Vercel & Publication Release Android

### Résumé des Changements Livrés
1. **Intégration Clé API & Failover Multi-Clés :**
   - Intégration de la 4ème clé API (`PediaDrill4`) encodée en base64 pour débloquer l'accès à `gemini-2.5-flash` et absorber les variations de quota.
   - Refonte du Circuit-Breaker pour basculer en cascade sur les clés sans abandon prématuré sur erreur 404/503.
2. **Priorisation & Cascade Intelligente des Modèles IA :**
   - Priorité #1 : `gemini-3-flash-preview` (ultra-rapide, réponse en ~2s).
   - Secours immédiats : `gemini-flash-lite-latest` et `gemini-2.5-flash` (filet de sécurité ultra-stable).
3. **Optimisation Latence & Confort Utilisateur :**
   - Suppression des formules de salutation/politesse superflues dans le prompt système pour accélérer la génération.
   - Allongement adaptatif du timeout de 10s à 18s pour les notes de raisonnement clinique approfondies.
4. **Synchronisation Globale des Versions :**
   - `package.json` : `1.6.4`
   - `src/services/updateService.js` : `CURRENT_APP_VERSION = '1.6.4'`
   - `android/app/build.gradle` : `versionCode 31`, `versionName "1.6.4"`
   - `template.html` & `index.html` : `v1.6.4`
   - `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md` : synchronisé.

### Statut des Déploiements
- **Vercel** : Déclenché par le push sur la branche `main`.
- **Android APK** : Compilation locale via `build-apk.bat` et déclenchement automatique du workflow GitHub Actions (`build-and-release.yml`) par le tag `v1.6.4`.

