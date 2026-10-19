# PédiaDrill — Master Product & Technical Context
*Dernière mise à jour : 2026-10-19 19:30:00 CET*
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
- **Plafonnement maximal et décrémentation au palier 10** :
  - **Avant d'atteindre 10** (`st.target < 10`) : La cible de répétition (`target`) augmente à chaque faute selon la règle `st.target = Math.min(10, 3 + st.mistakes)`.
  - **Une fois le plafond de 10 atteint** (`st.target >= 10`) : Le seuil de répétition ne pouvant plus augmenter, chaque mauvaise réponse diminue directement le nombre de réussites acquises : `st.current = Math.max(0, st.current - 1)` (ex: `7/10` devient `6/10`, `6/10` devient `5/10`, etc.).
  - Le nombre maximal de réussites requises reste **strictement plafonné à 10**.
  - Tout état persistant antérieur ou fusionné depuis Firestore ayant un `target > 10` est automatiquement nettoyé et ramené à 10 lors du chargement.
- **Gestion des erreurs (`handleFailure`)** :
  - Incrémente le compteur de fautes de la question (`mistakes++`).
  - Pénalité dynamique :
    - Si `target < 10` : augmente le seuil cible (`target = Math.min(10, 3 + mistakes)`).
    - Si `target >= 10` : décrémente les réussites actuelles (`current = Math.max(0, current - 1)`).
  - **Repousse la question à une distance courte de 5 à 7 cartes** (`Math.floor(Math.random() * 3) + 5`) pour réactiver la mémoire immédiate.
- **Gestion des réussites (`handleSuccess`)** :
  - Incrémente les réussites (`current++`).
  - Si `current >= target` : la question est marquée maîtrisée (`done = true`) et retirée définitivement de la file.
  - Si `target - current === 1` (dernier palier avant élimination complète) : **la question apparaît aléatoirement au sein des 50% dernières questions totales restantes** de la file (`[Math.floor(remaining * 0.5), remaining]`).
  - Sinon (`target - current > 1`) : **la question réapparaît après 50 à 100 questions** (`Math.floor(Math.random() * 51) + 50`).
- **Compteur journalier d'itérations (`todayTracker`)** :
  - **Seules les réponses justes** (`handleAnswerSuccess`) ajoutent +1 au compteur de questions faites aujourd'hui (`todayTracker.count`).
  - Les erreurs (`handleAnswerFailure`) n'incrémentent plus ce compteur, garantissant que l'objectif journalier reflète fidèlement le nombre de validations acquises vers l'échéance de l'examen du 10/11.
- **Persistance locale & Cloud** : Tout l'état (`activeQueue`, `stats`, `cursor`, `reasoningNotes`, `todayTracker`) est sauvegardé dans `localStorage` sous la clé `pedia_drill_state_v1` et synchronisé via `FirebaseSyncService`.

### 3.2. Évaluation IA & Raisonnement Clinique (`src/services/gemini.js`)
- **Modèles 100% Flash Exclusifs & Cascade de résilience** :
  - Verrouillage strict et absolu : **seuls les modèles Flash de Gemini** sont autorisés dans l'application. Tout modèle non-flash est systématiquement bloqué et rejeté.
  - Priorité absolue systématique à `gemini-3.8-flash` (position #1 de `MODEL_CASCADE`).
  - Cascade automatique ordonnée si le quota quotidien (20 requêtes/jour sur Free Tier) est épuisé ou en cas d'erreur réseau :
    1. `gemini-3.8-flash` (modèle principal de référence)
    2. `gemini-3.7-flash` (secours Flash standard)
    3. `gemini-3.6-flash` (secours Flash haute disponibilité)
    4. `gemini-3.5-flash` (secours Flash rapide)
    5. `gemini-3.5-flash-lite` (secours Flash Lite ultra-réactif)
    6. `gemini-flash-lite-latest` (secours Flash Lite dernière version)
    7. `gemini-3-flash-preview` (secours Flash Preview)
    8. `gemini-3.1-flash-lite` (secours Flash Lite de réserve)
  - Le basculement automatique garantit une continuité de service ininterrompue avec une génération pédiatrique complète en moins de 4 secondes.
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

### 3.8. Barre d'Outils Visuelle & Annotations UI (Agentation)
- **Intégration Standalone (`agentation.bundle.js`)** :
  - Copie du bundle officiel autonome à la racine et dans `dist/` via le pipeline `build.cjs`.
  - Chargement automatique via `<script src="agentation.bundle.js"></script>` injecté par `build-bundle.cjs`.
  - Auto-montage sur `#agentation-root` avec la pilule d'interaction, les marqueurs d'annotations, les pastilles bleues et la palette d'outils.
- **Fonctionnalités activées** :
  - **Annotation visuelle en direct** : clic sur n'importe quel élément UI de l'arène, du dashboard ou du carnet pour déposer une note avec capture automatique du sélecteur CSS, de la hiérarchie DOM et des styles calculés.
  - **Mode wireframe / Layout (`L`)** : manipulation et disposition de blocs pour prévisualiser des réorganisations d'interface.
  - **Mode pause animations (`P`)** : fige les micro-animations pour une inspection sereine.
  - **Copie structurée (`C`) & Nettoyage (`X`)** : export direct des annotations au format markdown pour transmission immédiate à l'agent.
- **Serveur MCP en temps réel** :
  - Connecté via `agentation-mcp` (`mcp_config.json`) sur le port local pour transmission bidirectionnelle transparente.

### 3.9. Iconographie & Clichés Médicaux Protégés (Rétractés & Floutés par Défaut)
- **Objectif mnésique & ergonomique** : Pour éviter que les clichés d'imagerie, radiographies ou photos cliniques ne divulguent prématurément la réponse ou ne perturbent la lecture de l'énoncé, tous les médias associés aux questions (`media_urls`) sont **rétractés et floutés par défaut**.
- **Composant UI (`renderQuestionMedia`)** :
  - **État Rétracté & Flouté (`.medical-media-card.is-collapsed`)** :
    - Vignette miniature carrée de 96x96px (84x84px sur smartphone).
    - Flou prononcé `filter: blur(9px) brightness(0.72)` avec compensation d'échelle `transform: scale(1.12)` pour supprimer les franges de flou aux bords.
    - Overlay interactif `.medical-media-spoiler-overlay` arborant le badge cyan `Toucher pour afficher` et le rappel `Photo floutée`.
  - **État Déplié & Net (`.medical-media-card.is-expanded`)** :
    - Déploiement fluide animé en CSS.
    - Image en pleine netteté (`filter: none`), hauteur adaptative jusqu'à 420px avec préservation du ratio d'aspect (`object-fit: contain`).
    - Barre d'action avec bouton d'agrandissement `Plein écran HD` et bascule `Réduire & flouter`.
    - Un simple clic sur l'image dépliée ou sur le texte d'action la replie et la refloute immédiatement.
  - **Visionneuse Plein Écran HD (Lightbox)** :
    - Modal plein écran `#media-lightbox-modal` avec flou d'arrière-plan (`backdrop-filter: blur(10px)`).
    - Image centrée en résolution maximale sans altération.
    - Fermeture au clic sur le fond noir, via le bouton de fermeture ou par la touche clavier `Échap`.
- **Intégration transverse** :
  - **Arène de Quiz** : Rendu dynamique sous l'énoncé dans `#arena-media-wrap`.
  - **Modale d'Erreur & Explication** : Intégration systématique dans la fiche d'erreur `formatQuestionMistakeRecap`.
  - **Carnet de Révision** : Préservation et restitution intégrale dans les fiches de révision sauvegardées localement et synchronisées sur Google Firestore.

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

## 6. Architecture Mobile Native Android & Capacitor

### 6.1. Configuration Capacitor (`capacitor.config.json`)
- **Package Id** : `com.pediadrill.app`
- **Nom de l'application** : `PédiaDrill`
- **Dossier web racine (`webDir`)** : `dist`
- **Dépendances natives** : `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` (version 8.x).

### 6.2. Environnement Android Studio & Toolchain
- **Emplacement Android Studio** : `C:\Program Files\Android\Android Studio` (`bin\studio64.exe`).
- **JDK / JVM utilisée** : OpenJDK JBR 25 embarqué dans Android Studio (`C:\Program Files\Android\Android Studio\jbr`).
- **Android SDK** : `C:\Users\Lenovo\AppData\Local\Android\Sdk` (plateformes `android-34`, `android-36`, `android-37.0` avec build-tools `34.0.0`, `35.0.0`, `36.0.0`).
- **Moteur Gradle** : Gradle 9.2 (`gradle-9.2.0-bin`), entièrement compatible avec Java 25 et Android Gradle Plugin (AGP 8.13.0).

### 6.3. Génération & Emplacements de l'APK
- **Script automatisé** : `build-apk.bat` (exécutable via `npm run build:apk`).
- **Cible Gradle optimisée** : `:app:assembleDebug` (permet de compiler directement l'application et de générer l'APK sans surcharge d'extraction d'annotations ou de construction d'AAR de bibliothèques).
- **Fichier APK racine (accès direct utilisateur)** : `PediaDrill.apk` (taille : ~4.96 Mo).
- **Fichier APK de build Android** : `android/app/build/outputs/apk/debug/app-debug.apk`.
- **Ouverture dans l'IDE Android Studio** : `npm run open:android` ou lancement de `studio64.exe android`.

---

## 7. Pipeline de Compilation & Déploiement

- **Compilation Web PWA** : `node build.cjs` (prépare `dist/index.html` autonome avec datasets, styles et scripts).
- **Compilation Bundle autonome** : `node build-bundle.cjs` (reconstruit `src/app.bundle.js` et génère la version racine `index.html`).
- **Compilation Mobile Android (APK)** :
  1. `npm run build` : génère les fichiers finaux dans `dist/`.
  2. `npx cap sync android` : synchronise les assets web et plugins dans `android/app/src/main/assets/public/`.
  3. `cmd /c build-apk.bat` : exécute `:app:assembleDebug` avec le JDK Android Studio et copie automatiquement l'APK généré sous `PediaDrill.apk` à la racine du projet.
- **Scripts `package.json` disponibles** :
  - `npm run build` : génération de `dist/`.
  - `npm run start` : prévisualisation locale du dossier `dist/`.
  - `npm run build:apk` : build web + sync Capacitor + génération du fichier `.apk`.
  - `npm run open:android` : ouverture du projet natif dans l'interface graphique Android Studio.
