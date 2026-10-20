# Historique des modifications - 2026-10-20

### 19:45 - Optimisation majeure de la latence IA : Circuit-Breaker, mise en quarantaine des quotas (429), mémorisation du modèle actif et passage de 38s à 1.5s
- **Diagnostic approfondi de la latence IA (`src/services/gemini.js`)** :
  - Identification de la cause racine des temps d'attente excessifs (30 à 38 secondes) ressentis par l'utilisateur :
    - Les modèles `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash` et `gemini-3.5-flash` renvoyaient immédiatement une erreur HTTP `429 RESOURCE_EXHAUSTED` (quota de 20 requêtes/jour dépassé sur le tier gratuit de la clé par défaut).
    - L'absence de mémorisation du dernier modèle fonctionnel obligeait chaque nouvelle requête (CROQ, erreur QCM, tuteur) à rejouer tous les échecs depuis le début de la liste.
    - Le modèle `gemini-3.5-flash-lite` en 5ème position subissait une latence anormale de plus de 30 secondes, bloquant la boucle jusqu'au timeout maximal de 25s (`AbortError`).
    - L'absence de configuration de désactivation des pensées cachées générait plus de 500 tokens de "thoughts" invisibles avant de renvoyer le texte.
- **Réorganisation ultra-rapide de la cascade Flash (`MODEL_CASCADE`)** :
  - Promotion en priorité #1 de `gemini-3-flash-preview` (temps de réponse mesuré à 1.25s pour un ping et 1.57s pour une évaluation CROQ complète).
  - Établissement de la nouvelle cascade de résilience :
    1. `gemini-3-flash-preview` (Priorité #1 : modèle Flash ultra-rapide validé à 1.25s)
    2. `gemini-flash-lite-latest` (Secours #2 : Flash Lite dernière génération)
    3. `gemini-3.1-flash-lite` (Secours #3 : Flash Lite haute disponibilité)
    4. `gemini-3.8-flash` (Secours #4 : Flash haute fidélité si quota disponible)
    5. `gemini-3.7-flash` (Secours #5 : Flash standard)
    6. `gemini-3.6-flash` (Secours #6 : Flash secours)
    7. `gemini-3.5-flash` (Secours #7 : Flash réserve)
  - Exclusion définitive du modèle bloquant `gemini-3.5-flash-lite`.
- **Circuit-Breaker & Quarantaine dynamique anti-latence (`src/services/gemini.js`)** :
  - **Mémorisation du modèle fonctionnel** : Stockage du dernier modèle ayant réussi (`this.lastSuccessfulModel`). Toute nouvelle requête tente directement ce modèle en premier sans repasser par les modèles en échec.
  - **Quarantaine automatique des erreurs de quota** : Lorsqu'un modèle renvoie une erreur 429 (`RESOURCE_EXHAUSTED`), il est placé en quarantaine pour 15 minutes (`this.quarantinedModels`). Lors des appels suivants, le système le saute immédiatement en mémoire sans effectuer d'appel réseau pénalisant.
  - **Quarantaine des erreurs 503/404** : Mise en quarantaine temporaire de 5 minutes en cas de pic de charge ou de modèle indisponible.
  - **Réduction du timeout par tentative** : Abaissement du timeout d'attente par modèle de 25s à 12s pour basculer instantanément au secours si un serveur Google tarde à répondre.
  - **Désactivation des pensées cachées** : Injection conditionnelle de `thinkingConfig: { thinkingBudget: 0 }` sur `gemini-3-flash-preview`, divisant le temps de génération par 2 sans altérer la qualité médicale des réponses.
  - **Calibration des tokens** : Plafond ajusté à 1024 tokens pour les évaluations CROQ et 2500 tokens pour les notes cliniques structurées.
- **Modernisation des libellés UI (`src/app.js`)** :
  - Remplacement des libellés fixes "Gemini 3.8 Flash" par des mentions dynamiques "IA Flash" dans la bannière de chargement et le carnet d'erreurs, le modèle réel utilisé étant fidèlement reflété par le badge dynamique (`modelUsed`).
- **Compilation, synchronisation et APK** :
  - Compilation réussie du bundle web autonome via `build-bundle.cjs` (`src/app.bundle.js`, `template.html`, `index.html`, `dist/index.html`).
  - Synchronisation des assets natifs Android avec Capacitor (`npx.cmd cap sync android`).
  - Régénération de l'exécutable natif [PediaDrill.apk](file:///c:/Users/Lenovo/Documents/GitHub/qcm-p-diatrie/PediaDrill.apk).
