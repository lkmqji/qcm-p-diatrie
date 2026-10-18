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
- **Plafonnement maximal de la pénalité (Plafond strict de 10)** :
  - La cible de répétition (`target`) augmente à chaque faute selon la règle `st.target = Math.min(10, 3 + st.mistakes)`.
  - Le nombre maximal de réussites requises est **strictement plafonné à 10** pour éviter toute répétition infinie ou punitive.
  - Tout état persistant antérieur ou fusionné depuis Firestore ayant un `target > 10` est automatiquement nettoyé et ramené à 10 lors du chargement.
- **Gestion des erreurs (`handleFailure`)** :
  - Incrémente le compteur de fautes de la question (`mistakes++`).
  - Pénalité : recalcule le seuil cible requis (`target = Math.min(10, 3 + mistakes)`).
  - Réinitialise le compteur de réussites actuelles (`current = 0`).
  - **Repousse la question à une distance courte de 5 à 7 cartes** (`Math.floor(Math.random() * 3) + 5`) pour réactiver la mémoire immédiate.
- **Gestion des réussites (`handleSuccess`)** :
  - Incrémente les réussites (`current++`).
  - Si `current >= target` : la question est marquée maîtrisée et retirée de la file.
  - Sinon : **la question est repoussée à une distance de 30 à 40 cartes** (`Math.floor(Math.random() * 11) + 30`) pour consolider l'assimilation à moyen terme.
- **Persistance locale & Cloud** : Tout l'état (`activeQueue`, `stats`, `cursor`, `reasoningNotes`, `todayTracker`) est sauvegardé dans `localStorage` sous la clé `pedia_drill_state_v1` et synchronisé via `FirebaseSyncService`.

### 3.2. Évaluation IA & Raisonnement Clinique (`src/services/gemini.js`)
- **Modèle principal privilégié & Cascade de résilience** :
  - Priorité absolue systématique à `gemini-3.8-flash` (position #1 de `MODEL_CASCADE`).
  - Cascade automatique ordonnée si le quota quotidien (20 requêtes/jour sur Free Tier) est épuisé ou en cas d'erreur réseau : `gemini-3.7-flash` -> `gemini-3.5-flash-lite` -> `gemini-3.1-flash-lite` -> `gemini-flash-lite-latest` -> `gemini-3-flash-preview`.
  - Le basculement sur `gemini-3.5-flash-lite` garantit une continuité de service ininterrompue avec une génération pédiatrique complète (~6 500 caractères) en moins de 4 secondes.
- **Paramètres de génération** :
  - `temperature: 0.2` (haute rigueur médicale et reproductibilité).
  - `maxOutputTokens: 4096` (garantie de réponses complètes sans coupure de phrases).
  - Timeout réseau de 25 secondes (`AbortController`).
- **Évaluation des CROQ (`evaluateCroq`)** :
  - Compare la réponse libre de l'étudiant à la réponse type officielle.
  - Retourne un score de 0 à 100%. Validation accordée si `score >= 75%`.
  - Fallback hors-ligne : analyse sémantique par sac de mots-clés normalisés.
- **Génération de la note de raisonnement clinique (`generateReasoningNote`)** :
  Organisée strictement en 4 sections cliniques avec parseur de mémo optimisé (`.reasoning-callout-quote`) :

  1. `🎯 PIÈGE CLINIQUE & ANALYSE DE L'ERREUR` : explication du piège et de la confusion médicale.
  2. `📋 JUSTIFICATION PROPOSITION PAR PROPOSITION (EXHAUSTIVE & COMPLÈTE)` : analyse systématique de TOUTES les options (A, B, C, D, E) avec texte intégral et justification de véracité.
  3. `🩺 DÉMARCHE DE RAISONNEMENT & CONDUITE CLINIQUE` : maître-symptôme, impact de l'âge de l'enfant, diagnostics différentiels.
  4. `💡 RÈGLE D'OR & MÉMO CONCOURS` : moyen mnémotechnique percutant pour le concours.

### 3.3. Affichage Complet des Erreurs (`formatQuestionMistakeRecap`)
Lorsqu'une réponse est incorrecte (dans la modale d'erreur ou dans le carnet) :
1. **Énoncé complet** : Cas clinique intégral (avec stéthoscope) + Question médicale intégrale mise en forme avec le parseur intelligent.
2. **Affichage adapté selon le format de question** :
   - **Pour les QCM / QCU** : Suppression du bloc comparatif supérieur redondant (« Ma réponse » / « Bonne(s) réponse(s) ») afin de ne pas dupliquer l'information. L'interface affiche directement la liste exhaustive des propositions (A à E) avec code couleur et badges :
     - 🔴 `Mon choix (Faux)` avec fond et bordure rouge (`opt-row-wrong`)
     - 🟢 `Mon choix (Juste)` avec fond et bordure verte (`opt-row-correct-chosen`)
     - 🟢 `Réponse juste attendue` avec bordure verte (`opt-row-correct-missed`)
     - ⚪ `Distracteur faux` neutre (`opt-row-neutral`)
   - **Pour les CROQ (questions rédactionnelles)** : Conservation du bloc comparatif en 2 boîtes :
     - ❌ `Votre proposition :` texte saisi par l'étudiant avec badge de score.
     - ✅ `Réponse type officielle :` réponse de référence concours découpée et structurée.
3. **Explication officielle de cours** : Encadré dédié reprenant `question.explanation` structuré avec titres, puces et sauts de ligne aérés.
4. **Surbrillance en direct dans l'arène** : Les cartes de l'arène sont immédiatement colorées (`wrong-highlight` en rouge, `correct-highlight` en vert).

### 3.4. Sélection Multiple Systématique
- La restriction sur les types de questions a été levée dans `toggleOptionSelection` : toutes les questions permettent de cocher librement une ou plusieurs options (ex: A + B + C) simultanément.
- Le bouton de validation est activé dès qu'au moins une proposition est sélectionnée.

### 3.5. Explication Directe en Arène (`#arena-explanation-box`)
- Dès qu'une réponse est validée avec succès, l'explication officielle issue de la base de données s'affiche directement dans l'arène sous la bannière de succès, permettant un rappel immédiat avant de passer à la question suivante.

### 3.6. Carnet de Raisonnement Réorganisé (`view-notebook`)
- Regroupement des notes par chapitre médical (accordéons dépliables avec compteurs).
- Fiches de tentatives détaillées affichant la synthèse complète (`formatQuestionMistakeRecap`) et les 4 cartes IA stylisées.
- Recherche multi-critères : filtrage en direct par mot-clé sur les questions, les énoncés, les choix d'options, les explications et les notes IA.

### 3.7. Moteur de Formatage Médical Intelligent (`formatMedicalContent`)
Pour résoudre les problèmes de textes compacts ou collés sans sauts de lignes issus de l'extraction de cours :
- **Dégel des justifications de propositions (ex: `A-Vrai`, `A/ Vrai`, `B : Faux`, `1- Vrai`, `1-Perplexe`)** : Détection et conversion systématique en listes à puces avec badges en gras (`- **A) Vrai** :`).
- **Dégel des colonnes multi-espaces de diapositives** : Détection des énumérations séparées par de multiples espaces insécables (`\u00A0`) et conversion en éléments de liste à puces individuels.
- **Séparation des phrases compactées** : Détection des mots et phrases collées sans espace ou sans point (`(TCA).Amyotrophie`, `assurésB-Vrai`, `interstitiel.B/ Vrai`, `vaccinéContamination`, `hyperpigmentationBiologie`).
- **Dégel des puces (`➢`, `⁃`, `•`, `►`, `▶`, `✔`, `✓`, `-`, `*`)** : Détection regex et insertion de retours à la ligne avec génération de listes HTML `<ul class="medical-bullet-list">` et puces stylisées.
- **Dégel des énumérations d'énoncés (ex: `1-`, `2-`, `1.`, `2.`)** : Rendu sous forme de listes ordonnées avec badges colorés `<ul class="medical-num-list">` et `<span class="medical-num-badge">`.
- **Mise en valeur et découpage des en-têtes médicaux** : Détection des marqueurs clés (`Rappel :`, `Définition :`, `Question 01 :`, `Remarque :`, `Source :`, `NB :`, `Attention :`, `CAT :`, `Traitement :`, `Diagnostic :`, `Signes cliniques :`, `Biologie :`, `Physiopathologie :`, `Tableau clinique :`, `Examens :`) avec découpage immédiat du titre et de son paragraphe associé, badges thématiques `<div class="medical-section-title">` et icônes Lucide.
- **Nettoyage et espacement** : Élimination des BOM (`\uFEFF`) et des blocs d'espaces insécables (`\u00A0`), découpage en paragraphes espacés `<p class="medical-paragraph">` avec `line-height: 1.6`.
- **Application omni-présente** :
  - Arène : Énoncé (`#arena-question-text`), Cas clinique (`#arena-clinical-case-text`), Explication officielle en direct (`#arena-explanation-text`).
  - Modale d'erreur : Énoncé complet, cas clinique et explication officielle dans `formatQuestionMistakeRecap`.
  - Carnet : Rendu fidèle et aéré dans toutes les fiches d'historique.

---

## 4. Spécificités UI, Responsive & Mobile First

- **Design System** : Palette médicale sombre moderne (fond `#070b14`, cartes `#121d33`, accents cyan `#00d4ff`, émeraude `#10b981`, rose `#ef4444`, ambre `#f59e0b`, violet `#8b5cf6`).
- **Typographie Médicale Structurée** :
  - `Outfit` : Titres de sections, badges numérotés et badges de métriques.
  - `Inter` : Corps de texte médical, justifications sémiologiques et listes à puces.
  - Hauteur de ligne aérée (`line-height: 1.55` à `1.6`) avec espacement entre paragraphes pour une lecture sans fatigue oculaire.
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
