# Historique du 2026-10-29

### 14:45 - Ajout des filtres de portée temporelle (14, 21, 28 jours) et intégration de mini-calendriers interactifs

- **Contexte & Demande utilisateur** :
  - Sur la page de statistiques (`#view-stats` > `#stats-qcm-range-wrap`), enrichir le sélecteur temporel multi-périodes (`#stats-range-toggle`) en ajoutant les options d'intervalles **14 jours**, **21 jours** et **28 jours**.
  - Dans le panneau de filtrage par dates personnalisées (`#custom-range-picker`), ajouter des petits calendriers visuels pour les champs de sélection de dates « Du » et « Au ».

- **Modifications appliquées** :
  - **Boutons de portée temporelle (`template.html`, `src/app.js`, `src/style.css`)** :
    - Ajout des 3 boutons de portée `<button class="range-btn" data-range="14">14 jours</button>`, `<button class="range-btn" data-range="21">21 jours</button>` et `<button class="range-btn" data-range="28">28 jours</button>` au sein de `#stats-range-toggle`.
    - Prise en charge dynamique de ces plages dans `renderStatsUI()` via `studyTracker.getDaysByRange()` et étiquetage automatique des cartes de KPI et du titre du graphique d'activité (`renderStatsActivityChart()`).
    - Défilement horizontal fluide préservé sur tous les écrans (`overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch;`) avec `flex-shrink: 0;` sur les boutons.
  - **Mini-calendriers pour le filtre personnalisé (`template.html`, `src/style.css`, `src/app.js`)** :
    - Encapsulation des champs de date dans des conteneurs interactifs `.date-input-box` (`#box-custom-date-start` et `#box-custom-date-end`).
    - Ajout de l'icône de calendrier Lucide (`<i data-lucide="calendar" class="date-calendar-icon"></i>`) intégrée à côté des inputs « Du » et « Au ».
    - Déclenchement automatique du sélecteur natif de date (`showPicker()` / `focus()`) au clic n'importe où sur la boîte ou l'icône calendrier.
    - Stylisation personnalisée de l'indicateur calendrier natif du navigateur (`::-webkit-calendar-picker-indicator`) avec filtre cyan néon harmonisé.
  - **Compilation et synchronisation du bundle** :
    - Exécution de `build-bundle.cjs` pour synchroniser `src/style.css`, `src/app.js`, `template.html`, `src/app.bundle.js`, `index.html` et les fichiers de production dans `dist/`.
    - Mise à jour exhaustive du Master Context dans `00-historique/MASTER_PRODUCT_TECHNICAL_CONTEXT.md`.
