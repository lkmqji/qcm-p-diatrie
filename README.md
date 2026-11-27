# PédiaDrill

Application médicale d'entraînement intensif par répétition espacée adaptative (SRS), cas cliniques progressifs et raisonnement clinique assisté par IA (Google Gemini Flash), conçue pour la préparation au concours de résidanat et aux examens de 5ème année de médecine.

## Modules disponibles
- **Pédiatrie & Chirurgie Pédiatrique** : 35 chapitres, 1 905 questions (QCU, QCM, CROQ, Cas cliniques)
- **Psychiatrie & Pédopsychiatrie** : 20 chapitres, 862 questions (QCU, QCM, Cas cliniques)

## Architecture
- `src/services/` : catalogue du cursus (`moduleCatalog.js`), partitionnement local (`storageScope.js`), moteur SRS (`queueEngine.js`), suivi d'étude (`studyTracker.js`, `lessonTracker.js`), IA Gemini multi-clés (`gemini.js`), synchronisation Firebase Firestore (`firebaseSyncService.js`), mises à jour GitHub Releases (`updateService.js`).
- `src/utils/` : formateurs médicaux & LaTeX (`formatters.js`), notifications/modales in-app (`uiDialogs.js`).
- `src/views/` : contrôleurs d'interface (`dashboardView.js`, `clinicalCaseView.js`, `arenaView.js`, `notebookView.js`, `statsView.js`, `lessonView.js`).
- `src/app.js` : orchestrateur principal, raccourcis clavier et gestion native Android (`@capacitor/app`).
- `build-bundle.cjs` & `build.cjs` : assemblage du bundle client autonome, copie des assets locaux (`lucide`, `canvas-confetti`) dans `dist/` et synchronisation de `index.html`.

## Commandes
```powershell
npm run dev       # Lance le serveur local (http://localhost:3000)
npm run build     # Compile le bundle de production dans index.html et dist/
npm run build:dev # Compile avec la barre d'annotation Agentation
npm test          # Exécute la suite de tests unitaires (node --test)
npm run build:apk # Synchronise Capacitor et compile PediaDrill.apk
```

## Configuration IA (Gemini Flash)
Aucune clé API n'est stockée dans le code source. Renseignez une ou plusieurs clés Google AI Studio dans **Paramètres → Moteur d'Intelligence Artificielle** (une par ligne ou séparées par des virgules). La rotation Round-Robin et la synchronisation multi-appareils via Firestore sont automatiques.
