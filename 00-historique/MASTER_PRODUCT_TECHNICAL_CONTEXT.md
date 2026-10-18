# PédiaDrill — Master Product & Technical Context
*Dernière mise à jour : 2026-10-18 18:35:00 CET*
*Source unique de vérité technique et fonctionnelle du projet PédiaDrill.*

---

## 1. Vision du Produit & Résumé Exécutif
**PédiaDrill** est une Progressive Web App (PWA) médicale et autonome d'entraînement intensif au résidanat et aux examens de 5ème année de médecine en pédiatrie. Elle combine :
1. **Un moteur de répétition espacée adaptatif (Spaced Repetition System)** calibré pour l'ancrage mnésique concours.
2. **Une évaluation sémantique par Intelligence Artificielle (exclusivement Gemini 3.8 Flash)** pour noter les questions à réponses ouvertes courtes (CROQ / QROC) et formuler une méthode de raisonnement clinique approfondie.
3. **Une arène de quiz minimaliste sans distraction** avec support de la sélection multiple (A, B, C...) et affichage en temps réel des explications officielles.
4. **Un carnet de raisonnement clinique interactif** regroupé par chapitres avec fiches d'erreur complètes (énoncé, cas clinique, propositions colorées avec texte intégral, explication de cours et fiches IA).
5. **Une synchronisation multi-appareils (PWA / Mobile / Desktop)** adossée à Google Auth et Firebase Firestore.

---

## 2. Architecture Globale & Arborescence du Projet

```
qcm-p-diatrie/
├── 00-historique/
│   ├── historique_2026-10-18.md          # Journal quotidien des modifications horodatées
│   └── MASTER_PRODUCT_TECHNICAL_CONTEXT.md # Contexte technique global (source unique de vérité)
├── dist/                                  # Bundle de production prêt pour déploiement (Vercel / Web)
│   ├── index.html                        # Application complète autonome avec assets embarqués
│   ├── manifest.json                     # Manifeste PWA
│   ├── sw.js                             # Service Worker de cache hors-ligne
│   ├── icon-192.svg                      # Icône PWA 192x192
│   └── icon-512.svg                      # Icône PWA 512x512
├── src/
│   ├── data/
│   │   ├── chapters.js                   # Métadonnées des 35 chapitres de pédiatrie
│   │   └── questions.js                  # Base de données des questions (QCM & CROQ)
│   ├── services/
│   │   ├── gemini.js                     # Service IA Gemini 3.8 Flash (évaluation & raisonnement)
│   │   ├── queueEngine.js                # Algorithme de file active et répétition espacée
│   │   ├── firebaseSyncService.js        # Auth Google & synchronisation bidirectionnelle Firestore
│   │   └── syncService.js                # Service de synchronisation générique
│   ├── app.js                            # Contrôleur d'interface, gestion des vues et événements
│   ├── app.bundle.js                     # Bundle JS client unifié (IIFE sans imports ES)
│   └── style.css                         # Feuille de styles principale (Design System médical)
├── template.html                         # Structure HTML et CSS embarqué pour la génération
├── index.html                            # Version racine autonome de l'application (4.4 MB)
├── build.cjs                             # Script de copie vers le dossier dist/
├── build-bundle.cjs                      # Script d'assemblage automatique (CSS, bundle JS, index.html)
├── vercel.json                           # Configuration de routage et headers de cache Vercel
├── manifest.json                         # Configuration PWA Web App Manifest
├── sw.js                                 # Service Worker (Cache-First / Stale-While-Revalidate)
└── package.json                          # Métadonnées du projet Node.js
```

---

## 3. Spécifications Fonctionnelles & Règles Métier

### 3.1. Moteur de Répétition Espacée (`src/services/queueEngine.js`)
L'apprentissage repose sur une file d'attente circulaire dynamique (`activeQueue`) :
- **Seuil de maîtrise de base** : Une question doit être validée **3 fois consécutives** pour être définitivement éliminée (`permanentlyRemoved: true`).
- **Gestion des erreurs (`handleFailure`)** :
  - Incrémente le compteur de fautes de la question (`mistakes++`).
  - Pénalité : augmente le seuil cible requis (`target++`).
  - Réinitialise le compteur de réussites actuelles (`current = 0`).
  - **Repousse la question à une distance courte de 5 à 7 cartes** (`Math.floor(Math.random() * 3) + 5`) pour réactiver la mémoire immédiate.
- **Gestion des réussites (`handleSuccess`)** :
  - Incrémente les réussites (`current++`).
  - Si `current >= target` : la question est marquée maîtrisée et retirée de la file.
  - Sinon : **la question est repoussée à une distance de 30 à 40 cartes** (`Math.floor(Math.random() * 11) + 30`) pour consolider l'assimilation à moyen terme.
- **Persistance locale** : Tout l'état (`activeQueue`, `questionStats`, `masteredUids`, `notes`, `todayCount`) est sauvegardé dans `localStorage` sous la clé `pedia_state_v1`.

### 3.2. Évaluation IA & Raisonnement Clinique (`src/services/gemini.js`)
- **Modèle exclusif** : Verrouillé strictement sur `gemini-3.8-flash` (`MODEL_CASCADE = ["gemini-3.8-flash"]`).
- **Paramètres de génération** :
  - `temperature: 0.2` (haute rigueur médicale et reproductibilité).
  - `maxOutputTokens: 4096` (garantie de réponses complètes sans coupure de phrases).
  - Timeout réseau de 25 secondes (`AbortController`).
- **Évaluation des CROQ (`evaluateCroq`)** :
  - Compare la réponse libre de l'étudiant à la réponse type officielle.
  - Retourne un score de 0 à 100%. Validation accordée si `score >= 75%`.
  - Fallback hors-ligne : analyse sémantique par sac de mots-clés normalisés.
- **Génération de la note de raisonnement clinique (`generateReasoningNote`)** :
  Organisée strictement en 4 sections cliniques :
  1. `🎯 PIÈGE CLINIQUE & ANALYSE DE L'ERREUR` : explication du piège et de la confusion médicale.
  2. `📋 JUSTIFICATION PROPOSITION PAR PROPOSITION (EXHAUSTIVE & COMPLÈTE)` : analyse systématique de TOUTES les options (A, B, C, D, E) avec texte intégral et justification de véracité.
  3. `🩺 DÉMARCHE DE RAISONNEMENT & CONDUITE CLINIQUE` : maître-symptôme, impact de l'âge de l'enfant, diagnostics différentiels.
  4. `💡 RÈGLE D'OR & MÉMO CONCOURS` : moyen mnémotechnique percutant pour le concours.

### 3.3. Affichage Complet des Erreurs (`formatQuestionMistakeRecap`)
Lorsqu'une réponse est incorrecte (dans la modale d'erreur ou dans le carnet) :
1. **Énoncé complet** : Cas clinique intégral (avec stéthoscope) + Question intégrale en gras.
2. **Grille comparative en deux blocs avec libellé complet** :
   - ❌ **Ma réponse** : liste de chaque proposition cochée avec sa lettre et son **texte intégral complet**, taguée rouge (`item-wrong` ou `item-correct`).
   - ✅ **Bonne(s) réponse(s) juste(s) attendue(s)** : liste de chaque bonne réponse avec sa lettre et son **texte intégral complet**, taguée verte (`item-correct`).
3. **Examen exhaustif de toutes les propositions (A à E)** :
   - Chaque ligne affiche la lettre, le texte complet et un badge explicite :
     - 🔴 `Mon choix (Faux)`
     - 🟢 `Mon choix (Juste)`
     - 🟢 `Réponse juste attendue` (en cas d'omission)
     - ⚪ `Distracteur faux`
4. **Explication officielle de cours** : encadré dédié reprenant `question.explanation` en clair.
5. **Surbrillance en direct dans l'arène** : Les cartes de l'arène sont immédiatement colorées (`wrong-highlight` en rouge, `correct-highlight` en vert).

### 3.4. Sélection Multiple Systématique
- La restriction sur les types de questions a été levée dans `toggleOptionSelection` : toutes les questions permettent de cocher librement une ou plusieurs options (ex: A + B + C) simultanément.
- Le bouton de validation est activé dès qu'au moins une proposition est sélectionnée.

### 3.5. Explication Directe en Arène (`#arena-explanation-box`)
- Dès qu'une réponse est validée avec succès, l'explication officielle issue de la base de données s'affiche directement dans l'arène sous la bannière de succès, permettant un rappel immédiat avant de passer à la question suivante.

### 3.6. Carnet de Raisonnement Réorganisé (`view-notebook`)
- Regroupement des notes par chapitre médical (accordéons dépliables avec compteurs).
- Fiches de tentatives détaillées affichant la synthèse complète (`formatQuestionMistakeRecap`) et les 4 cartes IA stylisées.
- Recherche multi-critères : filtrage en direct par mot-clé sur les questions, les énoncés, les choix d'options, les explications et les notes IA.

---

## 4. Spécificités UI, Responsive & Mobile First

- **Design System** : Palette médicale sombre moderne (fond `#070b14`, cartes `#121d33`, accents cyan `#00d4ff`, émeraude `#10b981`, rose `#ef4444`, ambre `#f59e0b`, violet `#8b5cf6`).
- **Typographie** : `Outfit` (titres et badges) et `Inter` (corps médical et justifications).
- **Adaptation Mobile & Portrait (`@media (max-width: 768px)`)** :
  - Réduction générale d'échelle de ~15% pour une densité optimale sans défilement excessif.
  - Padding ajusté (`10px 8px 18px 8px`), marges et gap réduits.
  - Modale d'erreur : largeur responsive `max-width: min(780px, 94vw)` et `max-height: 88vh` avec défilement interne fluide.

---

## 5. Synchronisation Multi-Appareils & Firebase

- **Fournisseur** : Firebase Auth (Google Provider) & Cloud Firestore.
- **Protocole** : Bidirectionnel avec fusion basée sur horodatage (`mergeStates`).
- **Déclencheurs** : Push automatique après chaque réponse validée ou enregistrement de note, pull automatique à la connexion.

---

## 6. Pipeline de Compilation & Déploiement

- **Script de compilation** : `node build-bundle.cjs`
  1. Synchronise le CSS de `src/style.css` dans le `<style>` de `template.html`.
  2. Assemble `src/app.bundle.js` à partir des modules `gemini.js`, `queueEngine.js`, `firebaseSyncService.js` et `app.js` en encapsulant le code dans une IIFE propre.
  3. Génère `index.html` standalone autonome (4.35 MB) intégrant templates, CSS, datasets complets et le bundle JS.
  4. Copie `index.html`, `manifest.json`, `sw.js` et les icônes dans `dist/` pour le déploiement de production.
