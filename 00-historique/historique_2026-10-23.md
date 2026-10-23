# Historique des modifications - 2026-10-23

### 10:08 - Implémentation complète de la page de Suivi du Progrès d'Étude & Infographie Analytique (view-stats)

- **Fonctionnalité ajoutée** :
  - Création d'une page complète dédiée à l'analyse et au suivi du progrès d'étude de l'étudiant avec infographies interactives modernes.
  - Découpage et chronométrage intelligent des sessions :
    - Démarrage automatique du chronomètre au chargement d'un QCM dans l'arène.
    - Mise en pause automatique lors du changement d'onglet ou de mise en veille (`visibilitychange`) ou en cas d'inactivité > 2 minutes.
    - Clôture et création automatique d'une nouvelle session d'étude après une pause > 5 minutes.
    - Plafonnement de sécurité à 180 secondes par question pour éviter toute dérive statistique si le terminal reste allumé sans réponse.

- **Composants et Services Développés** :
  1. **Nouveau service `src/services/studyTracker.js`** :
     - Enregistrement chronologique par date (`YYYY-MM-DD`) de l'activité quotidienne dans `localStorage` sous la clé `pedia_study_history_v1`.
     - Métriques quotidiennes : total QCM faits, réponses justes, fautes, durée totale en secondes, nombre de sessions, vitesse moyenne (s/QCM), vitesse segmentée (sur justes vs sur fautes), ventilation par cours/spécialité.
     - Calcul dynamique de la série de jours consécutifs d'entraînement (Study Streak 🔥 actuel et record historique).
     - Fonction de fusion multi-appareils `mergeHistory` pour combiner les sessions sans perte de données.
     - Prise en charge des environnements headless avec vérification sécurisée `typeof localStorage !== 'undefined'`.

  2. **Intégration au Cloud Google Firestore (`src/services/firebaseSyncService.js`)** :
     - Synchronisation automatique et manuelle de `studyHistory` dans le document Firestore `users/{uid}/pedia/progress`.
     - Fusion non destructive (`mergeStates`) : conservation du volume maximal et consolidation des sessions entre PC, smartphone et tablette.

  3. **Structure HTML & Navigation (`template.html`)** :
     - Bouton d'accès rapide avec icône graphique `#btn-open-stats-icon` dans la barre de titre du header.
     - Carte d'accès direct `#btn-open-stats` dans le Dashboard principal sous les métriques héroïques.
     - Nouvelle vue dédiée `<section id="view-stats" class="stats-view">` comprenant :
       - Barre supérieure avec bouton retour Dashboard et sélecteur de période temporelle (7 jours, 30 jours, Tout).
       - Grille de 5 Hero KPI Cards : Streak 🔥, Questions Faites, Taux de Précision %, Temps Total Cumulé, Vitesse Moyenne.
       - Heatmap d'activité style GitHub (60 à 90 derniers jours) avec 5 niveaux d'intensité colorée et infobulles détaillées.
       - Graphique combiné SVG interactif : barres empilées par jour (Vert Justes / Rouge Fautes) + courbe de vélocité ambre superposée.
       - Panneau d'analyse de vélocité et calcul de projection dynamique vers l'échéance de l'examen du 10/11 (J-28).
       - Panneau de ventilation des spécialités : Top des cours maîtrisés vs cours à réviser prioritairement.
       - Journal quotidien détaillé sous forme de timeline avec cartes récapitulatives de chaque jour.

  4. **Design System & Styles CSS (`src/style.css`)** :
     - Styles dark mode médical épuré respectant les variables de thème (`--bg-surface`, `--bg-card`, `--cyan`, `--emerald`, `--amber`, `--rose`, `--purple`).
     - Heatmap SVG responsive avec scroll horizontal fluide sur mobile.
     - Graphique SVG responsive avec barres empilées, courbes et infobulles contextuelles `<title>`.
     - Cartes timeline aérées avec badges couleur de synthèse.
     - Adaptation mobile-first complète (écrans < 520px et tablettes < 820px).

  5. **Contrôleur d'Application (`src/app.js`)** :
     - Ajout de `stats` au routeur de vues `views` et `switchView('stats')`.
     - Démarrage du chronomètre dans `loadNextArenaQuestion()` et enregistrement des réponses dans `handleAnswerSuccess()` et `handleAnswerFailure()`.
     - Moteur de rendu complet `renderStatsUI()` avec rafraîchissement automatique lors de la réception de mises à jour Firestore en temps réel.
     - Écouteurs d'événements pour le sélecteur de période (7j / 30j / Tout) et la détection de veille (`visibilitychange`).

  6. **Pipeline de Bundling (`build-bundle.cjs`)** :
     - Intégration de `studyTracker.js` dans la chaîne d'assemblage automatique du bundle client unifié `src/app.bundle.js` et d'`index.html`.
     - Mise à jour du dossier de distribution `dist/`.

- **Validation & Contrôles Qualité** :
  - Vérification de la syntaxe de tous les fichiers JavaScript via `node -c` : 0 erreur.
  - Tests automatisés des calculs de streak, moyennes et fusion : 100% validé.
  - Compilation réussie du bundle de production (215 Ko) et d'`index.html` (4.5 Mo).

### 10:50 - Ajout des filtres temporels « Aujourd'hui » & « Personnalisé » et du KPI « Réussite 1er Passage (Découverte) »

- **Retours utilisateur traités** :
  1. *Filtres de période temporelle* :
     - Ajout de l'option « **Aujourd'hui** » (`data-range="today"`) dans le sélecteur de période pour isoler instantanément le bilan de la journée en cours.
     - Ajout de l'option « **Personnalisé 📅** » (`data-range="custom"`) avec panneau de sélection par dates (`custom-range-picker`), deux sélecteurs `[Du] [Au]` (`<input type="date">`) et un bouton de validation `[Filtrer]`.
     - Adaptation dynamique du titre du graphique combiné et des axes selon la période choisie (journée seule, personnalisée, 7j, 30j ou historique complet).
  2. *Tracker de Réussite au 1er Passage (Découverte de question)* :
     - Ajout d'une 6ème Hero KPI Card : **Réussite 1er Passage (Découverte)** (`accent-teal`), affichant le pourcentage de questions réussies du premier coup lors de leur toute première apparition.
     - **Règle métier stricte** : Seule la première réponse jamais formulée sur un `questionUid` donné est enregistrée dans `pedia_first_pass_records_v1`. Les répétitions ultérieures (2ème passage, 3ème validation SRS) n'affectent pas ce taux, permettant à l'étudiant d'évaluer son niveau réel à la découverte face à des questions inédites.
     - Rétro-amorçage automatique (`seedFirstPassFromExistingStats`) depuis les états préexistants de `queueEngine.stats` pour les questions déjà résolues.
     - Prise en charge des deux modes d'affichage : taux de découverte sur la période temporelle sélectionnée vs taux global tous cours confondus.

- **Fichiers modifiés** :
  - `src/services/studyTracker.js` : constantes `FIRST_PASS_KEY`, persistance `firstPassRecords`, méthodes `seedFirstPassFromExistingStats`, `getFirstPassAnalytics`, `getFirstPassInDays`, `getDaysByRange('today')` et `getDaysByCustomRange(start, end)`.
  - `template.html` : boutons `Aujourd'hui` et `Personnalisé 📅`, panneau `.custom-range-picker` avec inputs date, 6ème KPI card `#kpi-first-pass-pct`.
  - `src/style.css` : styles pour `.stats-range-wrap`, `.custom-range-picker`, `.date-input`, `.btn-apply-range`, `.stat-kpi-card.accent-teal`, et réajustement de `.stats-kpi-grid` (minmax 160px).
  - `src/app.js` : passage de `questionUid` dans `recordAnswer`, amorçage au lancement, gestion des clics de range, mise à jour du KPI de premier passage et du titre de graphique.
  - `build-bundle.cjs` : recompilation du bundle client unifié et synchronisation `dist/index.html`.

---

## 2026-10-23 11:17 - Reconstruction Réaliste du Taux de Découverte (Option B : Croisement Stats & Carnet d'Erreurs)

- **Contexte & Problème résolu** :
  - Suite au diagnostic de l'affichage erroné du taux de 1er passage ("96% - 298/310"), l'utilisateur a choisi l'**Option B**.
  - L'ancien algorithme d'amorçage omettait toutes les questions où `mistakes > 0` et `current > 0` (questions ratées puis réussies lors des répétitions espacées SRS), ce qui éliminait ~130 à 150 questions échouées et ne retenait que 12 questions non encore rejouées.
- **Modifications appliquées** :
  - **`src/services/studyTracker.js`** :
    - Migration de la clé de stockage de `pedia_first_pass_records_v1` vers `pedia_first_pass_records_v2` pour purger les 310 enregistrements tronqués et recalibrer la base sans perte.
    - Mise à jour de `seedFirstPassFromExistingStats(queueStats, rawReasoningNotes)` : croisement des statistiques de la file `queueEngine.stats` avec l'historique du carnet d'erreurs IA `reasoningNotes`.
    - Identification rigoureuse : toute question ayant au moins une faute enregistrée (`st.mistakes > 0` ou présente dans le carnet d'explications IA) est correctement marquée comme ratée au 1er passage (`false`). Toute question maîtrisée sans aucune faute (`current > 0 && mistakes === 0`) est marquée comme réussie (`true`).
  - **`src/app.js`** :
    - Injection des notes du carnet d'erreurs `queueEngine.getRawReasoningNotes()` lors de l'appel initial à `seedFirstPassFromExistingStats()`.
    - Affichage clarifié du sous-titre de la carte KPI `#kpi-first-pass-pct` :
      - En vue globale ("Tout") : affiche le total exact reconstitué (ex: `298/444 découverts (global)`).
      - En vue périodique ("Aujourd'hui", "7 jours", etc.) sans nouvelles découvertes : affiche `--%` et `0 inédit (que des révisions)` pour éviter toute confusion avec le cumul global.
  - **Compilation & Déploiement** :
    - Recompilation avec `node build-bundle.cjs` : régénération de `src/app.bundle.js` (224 KB), `index.html` (4.52 MB) et réplication dans `dist/`.
    - Validation de la syntaxe JS avec `node -c`.

