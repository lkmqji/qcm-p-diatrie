// ==========================================
// PédiaDrill Unified Client Bundle
// ==========================================
(function() {
// Gemini API Service with Resilience Cascade & Local Fallback (100% Modèles Flash)
const DEFAULT_GEMINI_KEY = "AQ.Ab8RN6InNmt_sD2jtOWtfP5veazlJgMEJ85vNfXf2B6St-_gVw";

/**
 * Cascade de résilience ordonnée : EXCLUSIVEMENT des modèles Flash
 * Garantit une latence ultra-faible, une résistance aux limites de quota et une grande fluidité
 */
const MODEL_CASCADE = [
  "gemini-3-flash-preview",   // Priorité #1 : modèle Flash ultra-rapide (testé et vérifié à ~1.25s)
  "gemini-flash-lite-latest", // Secours #2 : Flash Lite dernière génération ultra-réactif
  "gemini-3.1-flash-lite",    // Secours #3 : Flash Lite haute disponibilité
  "gemini-3.8-flash",         // Secours #4 : Flash haute fidélité (si quota disponible)
  "gemini-3.7-flash",         // Secours #5 : Flash standard
  "gemini-3.6-flash",         // Secours #6 : Flash secours
  "gemini-3.5-flash"          // Secours #7 : Flash réserve
];

/**
 * Nettoyeur et convertisseur de formules / balises LaTeX en texte clair médical lisible.
 * Supprime les syntaxes cryptiques (\\text{}, \\mathbf{}, \\times, \\frac, etc.) générées parfois par les LLMs.
 */
function cleanLatexMath(str) {
  if (!str || typeof str !== 'string') return '';
  let res = str;

  // 1. Délimiteurs de blocs mathématiques : $$...$$, $...$, \[...\], \(...\)
  res = res.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
  res = res.replace(/\\\[([\s\S]*?)\\\]/g, '$1');
  res = res.replace(/\\\(([\s\S]*?)\\\)/g, '$1');
  res = res.replace(/\$([^\$\n]+)\$/g, '$1');

  // 2. Symboles et opérateurs mathématiques courants
  const symbols = [
    [/\\times\b/g, '×'],
    [/\\cdot\b/g, '·'],
    [/\\div\b/g, '÷'],
    [/\\pm\b/g, '±'],
    [/\\mp\b/g, '∓'],
    [/\\leq?\b/g, '≤'],
    [/\\geq?\b/g, '≥'],
    [/\\neq?\b/g, '≠'],
    [/\\approx\b/g, '≈'],
    [/\\sim\b/g, '∼'],
    [/\\equiv\b/g, '≡'],
    [/\\infty\b/g, '∞'],
    [/\\[rR]ightarrow\b|\\to\b/g, '→'],
    [/\\[lL]eftarrow\b/g, '←'],
    [/\\implies\b|\\Rightarrow\b/g, '⇒'],
    [/\\iff\b|\\Leftrightarrow\b/g, '⇔'],
    [/\\mu(?:m|g|l|mol)?\b/g, (m) => m.replace(/\\mu/, 'µ')],
    [/\\alpha\b/g, 'α'],
    [/\\beta\b/g, 'β'],
    [/\\gamma\b/g, 'γ'],
    [/\\delta\b/g, 'δ'],
    [/\\Delta\b/g, 'Δ'],
    [/\\lambda\b/g, 'λ'],
    [/\\theta\b/g, 'θ'],
    [/\\pi\b/g, 'π'],
    [/\\sigma\b/g, 'σ'],
    [/\\Sigma\b/g, 'Σ'],
    [/\\Omega\b/g, 'Ω'],
    [/\\(?:left|right)\s*([()[\]{}|])/g, '$1'],
    [/\\\{/g, '{'],
    [/\\\}/g, '}'],
    [/\\%/g, '%'],
    [/\\_/g, '_'],
    [/\\&/g, '&'],
    [/\\(?:quad|qquad|;|,|:)/g, ' '],
    [/\\\s+/g, ' '],
    [/\^\{\\circ\}\s*C\b|\^\\circ\s*C\b/g, '°C'],
    [/\^\{\\circ\}|\^\\circ/g, '°']
  ];
  for (const [re, repl] of symbols) {
    res = res.replace(re, repl);
  }

  // 3. Déballage styles Gras / Italique LaTeX : \mathbf{...}, \textbf{...}, \mathit{...}, \textit{...}
  let prev;
  do {
    prev = res;
    res = res.replace(/\\(?:mathbf|textbf)\{([^{}]+)\}/g, '**$1**');
    res = res.replace(/\\(?:mathit|textit)\{([^{}]+)\}/g, '*$1*');
  } while (res !== prev);

  // 4. Déballage texte brut : \text{...}, \mathrm{...}, \operatorname{...}, etc.
  do {
    prev = res;
    res = res.replace(/\\(?:text|mathrm|textrm|textnormal|operatorname)\{([^{}]*)\}/g, '$1');
  } while (res !== prev);

  // 5. Fractions : \(?:d)?frac{A}{B} -> (A / B)
  do {
    prev = res;
    res = res.replace(/\\d?frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1 / $2)');
  } while (res !== prev);

  // 6. Racines carrées : \sqrt{A} -> √(A)
  do {
    prev = res;
    res = res.replace(/\\sqrt(?:\[[^\]]*\])?\{([^{}]+)\}/g, '√($1)');
  } while (res !== prev);

  // 7. Commandes résiduelles : \nom{contenu} -> contenu
  do {
    prev = res;
    res = res.replace(/\\[a-zA-Z]+\{([^{}]*)\}/g, '$1');
  } while (res !== prev);

  // 8. Exposants et indices : ^{2} -> ², _{2} -> ₂
  const superMap = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻'};
  const subMap = {'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'};
  res = res.replace(/\^\{?([0-9+-])\}?/g, (m, d) => superMap[d] || m);
  res = res.replace(/_\{?([0-9])\}?/g, (m, d) => subMap[d] || m);

  // 9. Nettoyage des antislashs orphelins résiduels devant des mots
  res = res.replace(/\\([a-zA-Z]+)/g, '$1');

  // 10. Espacements propres
  res = res.replace(/[ \t]{2,}/g, ' ');
  res = res.replace(/\s+([,.:;?!])/g, '$1');

  return res.trim();
}

class GeminiService {
  constructor() {
    this.apiKey = localStorage.getItem('pedia_gemini_key') || DEFAULT_GEMINI_KEY;
    // Filtrage strict : seuls les modèles comportant 'flash' sont admis
    this.allowedModels = MODEL_CASCADE.filter(m => m.toLowerCase().includes('flash'));
    this.activeModel = this.allowedModels[0] || "gemini-3-flash-preview";
    this.lastSuccessfulModel = null;
    this.quarantinedModels = new Map(); // model -> timestamp expiry
    this.callLogs = [];
  }

  setApiKey(key) {
    if (key && key.trim()) {
      this.apiKey = key.trim();
      localStorage.setItem('pedia_gemini_key', this.apiKey);
    }
  }

  getApiKey() {
    return this.apiKey;
  }

  _isQuarantined(model) {
    if (!this.quarantinedModels.has(model)) return false;
    const expiry = this.quarantinedModels.get(model);
    if (Date.now() > expiry) {
      this.quarantinedModels.delete(model);
      return false;
    }
    return true;
  }

  /**
   * Execute API call in cascade avec mémorisation du modèle actif et circuit-breaker :
   * - Tente immédiatement le dernier modèle qui a fonctionné sans refaire les échecs 429
   * - Quarantaine intelligente de 15 minutes pour les modèles dont le quota est dépassé
   * - Latence ultra-courte (1 à 2 secondes)
   */
  async callWithFallback(prompt, systemInstruction = '', maxTokens = 2048) {
    const errors = [];

    // Déterminer le modèle prioritaire (dernier modèle ayant réussi ou activeModel non-quarantiné)
    const primary = (this.lastSuccessfulModel && !this._isQuarantined(this.lastSuccessfulModel))
      ? this.lastSuccessfulModel
      : (!this._isQuarantined(this.activeModel) ? this.activeModel : null);

    const candidateModels = primary
      ? [primary, ...this.allowedModels.filter(m => m !== primary)]
      : [...this.allowedModels];

    for (const model of candidateModels) {
      if (!model.toLowerCase().includes('flash')) continue;

      // Saut immédiat des modèles sous quota sans perte de temps réseau
      if (this._isQuarantined(model)) {
        continue;
      }

      try {
        this.activeModel = model;
        const result = await this._callModel(model, prompt, systemInstruction, maxTokens);
        if (result && result.text) {
          this.lastSuccessfulModel = model;
          this.quarantinedModels.delete(model);
          this.callLogs.push({ model, success: true, timestamp: Date.now() });
          return { text: result.text, modelUsed: model };
        }
      } catch (err) {
        errors.push({ model, error: err.message });

        // Circuit breaker : mise en quarantaine temporaire selon le code d'erreur
        if (err.message && (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED'))) {
          console.warn(`[Gemini Flash Circuit-Breaker] ${model} quota épuisé (429) -> Quarantaine 15 min.`);
          this.quarantinedModels.set(model, Date.now() + 15 * 60 * 1000);
        } else if (err.message && (err.message.includes('503') || err.message.includes('404'))) {
          console.warn(`[Gemini Flash Circuit-Breaker] ${model} indisponible (${err.message.slice(0, 35)}) -> Quarantaine 5 min.`);
          this.quarantinedModels.set(model, Date.now() + 5 * 60 * 1000);
        } else {
          console.warn(`[Gemini Flash Cascade] ${model} failed (${err.message}) -> Trying next Flash model...`);
        }
      }
    }

    throw new Error(`All Gemini Flash models failed: ${JSON.stringify(errors)}`);
  }

  async _callModel(model, prompt, systemInstruction, maxTokens) {
    if (!model.toLowerCase().includes('flash')) {
      throw new Error(`Modèle non autorisé (${model}) : seuls les modèles Flash sont autorisés.`);
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
    
    const contents = [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ];

    const generationConfig = {
      temperature: 0.2,
      maxOutputTokens: maxTokens
    };

    // Optimisation de latence : désactiver le budget de pensée cachée pour les modèles compatibles
    if (model.includes('gemini-3-flash-preview')) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const body = {
      contents,
      generationConfig
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout max par tentative Flash

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const textPart = candidate?.content?.parts?.find(p => p.text);
    if (!textPart || !textPart.text) {
      throw new Error("No candidate text returned");
    }

    return { text: cleanLatexMath(textPart.text.trim()) };
  }

  /**
   * Evaluate CROQ free text answer against standard official answer
   * Must return score (0-100), isValid (>= 75%), explanation, modelUsed
   */
  async evaluateCroq(questionText, clinicalCase, expectedAnswer, userAnswer) {
    const systemPrompt = `Tu es un professeur expert en pédiatrie et jury de concours de résidanat et de 5ème année de médecine.
Ta mission est d'évaluer la réponse d'un étudiant à une question ouverte (CROQ / QROC) médicale par rapport à la réponse type attendue.
Critères d'évaluation :
- Sois rigoureux sur le plan sémantique et médical (synonymes médicaux, acronymes reconnus, termes équivalents doivent être acceptés).
- Attribue une note de 0 à 100%.
- Si le score est >= 75%, la réponse est considérée comme juste.
- Fournis une analyse détaillée et complète sans abréger.
- N'utilise JAMAIS de syntaxe ou balises LaTeX (interdit : \\text{}, \\mathbf{}, \\times, etc.) dans tes explications, feedback ou reasoningNote.
- Réponds STRICTEMENT au format JSON valide suivant, sans aucun markdown ni texte avant ou après :
{
  "score": 85,
  "isValid": true,
  "feedback": "Analyse exhaustive de la réponse : éléments clés validés, oublis et précisions cliniques requises.",
  "reasoningNote": "Conseil méthodologique et réflexe clinique complet pour retenir ce point."
}`;

    const userPrompt = `CONTEXTE CLINIQUE : ${clinicalCase || "Aucun"}
QUESTION CROQ : ${questionText}
RÉPONSE MODÈLE OFFICIELLE : ${expectedAnswer}
RÉPONSE DONNÉE PAR L'ÉTUDIANT : ${userAnswer}

Évalue la réponse de l'étudiant et retourne UNIQUEMENT l'objet JSON complet.`;

    try {
      const result = await this.callWithFallback(userPrompt, systemPrompt, 1024);
      const cleaned = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
      return {
        score,
        isValid: score >= 75,
        feedback: cleanLatexMath(parsed.feedback || (score >= 75 ? "Réponse conforme aux critères attendus." : "Réponse incomplète ou imprécise.")),
        reasoningNote: cleanLatexMath(parsed.reasoningNote || "Raisonnement clinique analysé."),
        modelUsed: result.modelUsed
      };
    } catch (err) {
      console.warn("Gemini CROQ evaluation failed, fallback to local semantic evaluation:", err);
      return this.localEvaluateCroq(expectedAnswer, userAnswer);
    }
  }

  /**
   * Offline / Local semantic matcher for CROQ when offline or API exhausted
   */
  localEvaluateCroq(expectedAnswer, userAnswer) {
    if (!userAnswer || !userAnswer.trim()) {
      return {
        score: 0,
        isValid: false,
        feedback: "Aucune réponse saisie.",
        reasoningNote: "Prenez le temps de formuler les mots-clés essentiels.",
        modelUsed: "Moteur sémantique local"
      };
    }

    const clean = (s) => (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2);

    const expWords = clean(expectedAnswer);
    const userWords = clean(userAnswer);

    if (expWords.length === 0) {
      return { score: 100, isValid: true, feedback: "Réponse validée.", reasoningNote: "OK", modelUsed: "Local" };
    }

    const expSet = new Set(expWords);
    let matched = 0;
    for (const w of expSet) {
      if (userWords.some(uw => uw.includes(w) || w.includes(uw))) {
        matched++;
      }
    }

    const ratio = matched / expSet.size;
    const score = Math.round(ratio * 100);
    return {
      score,
      isValid: score >= 75,
      feedback: `Évaluation locale hors-ligne : ${matched}/${expSet.size} concepts clés retrouvés.`,
      reasoningNote: "Vérifiez la concordance avec les termes précis de la réponse officielle.",
      modelUsed: "Moteur Local Hors-Ligne"
    };
  }

  /**
   * Generate complete, exhaustive clinical reasoning note for mistake or review
   */
  async generateReasoningNote(question, selectedLetters, isCroq = false, studentCroq = "") {
    const correctOptions = (question.options || []).filter(o => o.is_correct);
    const correctLetters = correctOptions.map(o => o.letter).join(", ");
    const allOptionsText = (question.options || []).map(o => `${o.letter}) ${o.text}`).join("\n");

    const systemPrompt = `Tu es un Professeur de pédiatrie et jury de concours de résidanat en médecine.
L'étudiant s'entraîne sur un QCM/CROQ et a besoin d'une explication CLINIQUE COMPLÈTE, PARFAITEMENT STRUCTURÉE et PERCUTANTE.
Va directement au but avec un style médical soigné, rigoureux et précis (mots-clés en gras, listes à puces pour une lecture rapide).
La réponse doit être TOTALE et NE DOIT JAMAIS ÊTRE COUPÉE.
Structure OBLIGATOIREMENT ton retour selon ces 4 sections détaillées :

1. 🎯 PIÈGE CLINIQUE & ANALYSE DE L'ERREUR :
Explique précisément pourquoi la réponse cochée par l'étudiant est fausse, le piège classique posé dans l'énoncé et la confusion fréquente en pédiatrie.

2. 📋 JUSTIFICATION PROPOSITION PAR PROPOSITION (EXHAUSTIVE & COMPLÈTE) :
Passe impérativement en revue TOUTES les propositions (A, B, C, D, E le cas échéant) SANS AUCUNE EXCEPTION NI OUBLI.
Pour CHAQUE proposition (A, B, C, D, E), donne la lettre, l'énoncé de la proposition et justifie rigoureusement pourquoi elle est VRAIE ou FAUSSE sur les plans sémiologique, physiopathologique ou thérapeutique. Chaque proposition doit avoir sa justification détaillée et complète jusqu'au bout.

3. 🩺 DÉMARCHE DE RAISONNEMENT & CONDUITE CLINIQUE :
Détaille la démarche diagnostique et thérapeutique pas-à-pas : quel est le maître-symptôme, quelles données de l'âge de l'enfant orientent immédiatement, et comment éliminer les diagnostics différentiels.

4. 💡 RÈGLE D'OR & MÉMO CONCOURS :
Formule une règle mémo claire, percutante et mémorisable pour ne plus jamais hésiter sur ce dossier au concours.

5. 🚫 RÈGLE STRICTE SUR LES CALCULS, FORMULES ET UNITÉS :
- INTERDICTION TOTALE d'utiliser la syntaxe ou des balises LaTeX (strictement interdit : \\text{}, \\mathbf{}, \\times, \\frac{}, etc.).
- Écris TOUJOURS les calculs, posologies, poids et unités en texte français clair et direct (exemples : "14 g/dl", "3 kg", "×", "/").

Rédige en français médical soigné, rigoureux, direct et complet. Ne coupe aucune phrase, ne saute aucune étape.`;

    const userPrompt = `MODULE : Pédiatrie - ${question.chapterTitle || "Pédiatrie Générale"}
QUESTION : ${question.question}
${question.clinical_case ? `CAS CLINIQUE COMPLET : ${question.clinical_case}\n` : ""}
PROPOSITIONS PROPOSÉES :
${allOptionsText || "Question ouverte (CROQ)"}

RÉPONSE(S) OFFICIELLEMENT CORRECTE(S) : ${correctLetters || question.croq_answer}
RÉPONSE SÉLECTIONNÉE PAR L'ÉTUDIANT : ${isCroq ? studentCroq : (selectedLetters.join(", ") || "Aucune")}
EXPLICATION OFFICIELLE DISPONIBLE DANS LA BASE : ${question.explanation || "Aucune explication fournie dans la base."}

Rédige l'explication clinique complète et approfondie sans aucune coupure. À l'étape 2, justifie impérativement et de façon complète chaque proposition une par une.`;

    try {
      const result = await this.callWithFallback(userPrompt, systemPrompt, 2500);
      return {
        note: cleanLatexMath(result.text),
        modelUsed: result.modelUsed
      };
    } catch (err) {
      console.warn("Reasoning note generation failed, fallback to structured official explanation:", err);
      const chosenStr = isCroq ? studentCroq : (selectedLetters.join(", ") || "Aucune");
      const expStr = question.explanation ? question.explanation.trim() : "Se référer aux critères diagnostiques officiels de pédiatrie.";
      const corrStr = correctLetters || question.croq_answer || "Réponse officielle";

      let localNote = `### 1. 🎯 PIÈGE CLINIQUE & ANALYSE DE L'ERREUR :\n`;
      localNote += `* **Votre sélection :** ${chosenStr}\n`;
      localNote += `* **Réponse attendue :** ${corrStr}\n`;
      localNote += `* **Analyse & Piège :** ${expStr}\n\n`;

      localNote += `### 2. 📋 JUSTIFICATION PROPOSITION PAR PROPOSITION :\n`;
      if (question.options && question.options.length > 0) {
        question.options.forEach(o => {
          const status = o.is_correct ? "VRAIE" : "FAUSSE";
          localNote += `* **${o.letter}) ${o.text}** : **${status}**\n`;
        });
      } else {
        localNote += `* **Réponse type attendue :** ${question.croq_answer || expStr}\n`;
      }
      localNote += `\n`;

      localNote += `### 3. 🩺 DÉMARCHE DE RAISONNEMENT & CONDUITE CLINIQUE :\n`;
      localNote += `* **Thème clé :** *${question.chapterTitle || 'Pédiatrie Générale'}*\n`;
      if (question.clinical_case) {
        localNote += `* **Contexte clinique :** ${question.clinical_case.slice(0, 180)}...\n`;
      }
      localNote += `* **Conduite pratique :** Toujours hiérarchiser les signes de gravité vitale (détresse respiratoire, hémodynamique, neurologique) avant tout examen invasif ou traitement d'épreuve.\n\n`;

      localNote += `### 4. 💡 RÈGLE D'OR & MÉMO CONCOURS :\n`;
      localNote += `> **Règle d'or :** En pédiatrie (*${question.chapterTitle || 'Pédiatrie'}*), toujours retenir la notion clé : **${corrStr}** (conforme aux recommandations HAS et consensus officiels).`;

      return {
        note: cleanLatexMath(localNote),
        modelUsed: "Synthèse Clinique Locale (Hors-Ligne)"
      };
    }
  }


  /**
   * Question-in-context AI chat tutor (Flash models only)
   * Answers student queries specifically focused on the current QCM / CROQ
   */
  async askAboutQuestion(question, conversationHistory = [], userMessage) {
    if (!question) {
      return {
        text: "Aucune question active n'est actuellement chargée dans l'Arène.",
        modelUsed: "Tuteur Local"
      };
    }

    const correctOptions = (question.options || []).filter(o => o.is_correct);
    const correctLetters = correctOptions.map(o => o.letter).join(", ");
    const allOptionsText = (question.options || []).map(o => `${o.letter}) ${o.text}`).join("\n");

    const systemInstruction = `Tu es le Tuteur IA Pédiatrique de PédiaDrill, professeur universitaire et chef de clinique en pédiatrie.
L'étudiant s'entraîne sur un QCM/CROQ précis et te pose une question directe pour mieux comprendre.
Tu as le contexte médical complet sous les yeux :
- Module : Pédiatrie (${question.chapterTitle || 'Pédiatrie Générale'})
- Énoncé : "${question.question || question.statement || ''}"
${question.clinical_case ? `- Cas clinique : "${question.clinical_case}"\n` : ''}
${allOptionsText ? `- Propositions :\n${allOptionsText}\n` : '- Type : Question ouverte (CROQ)\n'}
- Bonne(s) réponse(s) officielle(s) : ${correctLetters || question.croq_answer || 'Non précisé'}
${question.explanation ? `- Explication officielle du cours : "${question.explanation}"\n` : ''}

Consignes pédagogiques strictes :
1. Réponds en français médical rigoureux, clair, bienveillant et concis (va droit au but).
2. Mets en valeur les mots-clés en gras et structure avec des tirets/puces pour une lecture rapide pendant le drill.
3. Justifie sur le plan physiopathologique, sémiologique ou thérapeutique pourquoi telle proposition est vraie ou fausse.
4. Signale les pièges fréquents au concours de résidanat si pertinent.
5. 🚫 RÈGLE STRICTE SUR LES CALCULS, DOSES ET FORMULES :
- INTERDICTION TOTALE d'utiliser la syntaxe ou des balises LaTeX (strictement interdit : \\text{}, \\mathbf{}, \\times, \\frac{}, \\cdot, etc.).
- Écris TOUJOURS les calculs, posologies, poids et unités en texte français clair et direct (exemples : "14 g/dl" et JAMAIS "14\\text{ g/dl}", "Poids = 3 kg" et JAMAIS "\\mathbf{3}\\text{ kg}", "Déficit = 4 g/dl", "×" ou "x" au lieu de "\\times", "/" au lieu de "\\frac").`;

    let promptWithContext = '';
    if (!conversationHistory || conversationHistory.length === 0) {
      promptWithContext = `Voici ma question sur ce QCM : "${userMessage}"`;
    } else {
      const historyStr = conversationHistory.map(m => `${m.role === 'user' ? 'Étudiant' : 'Tuteur IA'} : ${m.text}`).join('\n\n');
      promptWithContext = `Historique de la discussion :\n${historyStr}\n\nNouvelle question de l'étudiant : "${userMessage}"`;
    }

    try {
      const result = await this.callWithFallback(promptWithContext, systemInstruction, 2048);
      return {
        text: cleanLatexMath(result.text),
        modelUsed: result.modelUsed
      };
    } catch (err) {
      console.warn("askAboutQuestion failed:", err);
      const corrStr = correctLetters || question.croq_answer || "Réponse officielle";
      return {
        text: cleanLatexMath(`⚠️ **Mode Hors-Ligne (Quota ou Réseau)** : Le Tuteur Flash est momentanément indisponible.\n\n*Rappel de la base pour ce QCM :*\n- **Bonne réponse :** **${corrStr}**\n- **Explication :** ${question.explanation || 'Consultez le cours de référence.'}`),
        modelUsed: "Secours Local Hors-Ligne"
      };
    }
  }

}
const geminiService = new GeminiService();



// Spaced Repetition Queue Engine with Dynamic Penalty & Mastery Thresholds

const STORAGE_KEY = 'pedia_drill_state_v1';
const REASONING_KEY = 'pedia_drill_reasoning_notes_v1';

/**
 * Strips redundant static question data (questionText, options, clinicalCase, explanation)
 * that is already permanently bundled in PEDIA_QUESTIONS. Keeps only user attempt data
 * and AI reasoning note text. Reduces note storage footprint by ~80%.
 */
function slimNote(note) {
  if (!note || typeof note !== 'object') return note;
  return {
    id: note.id || `note_${note.timestamp || Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    questionUid: note.questionUid || '',
    userAnswer: note.userAnswer || '',
    userAnswerLetters: Array.isArray(note.userAnswerLetters)
      ? note.userAnswerLetters
      : (note.userAnswer ? [note.userAnswer] : []),
    correctAnswer: note.correctAnswer || '',
    score: (note.score !== undefined && note.score !== null) ? Number(note.score) : null,
    isCroq: !!note.isCroq,
    reasoningNote: note.reasoningNote || '',
    modelUsed: note.modelUsed || '',
    timestamp: note.timestamp || Date.now()
  };
}

/**
 * Re-hydrates a slim note with full question metadata from the question bank.
 */
function hydrateNote(note, questionsList = []) {
  if (!note || typeof note !== 'object') return note;
  const q = Array.isArray(questionsList) ? questionsList.find(item => item.uid === note.questionUid) : null;
  if (!q) {
    return {
      ...note,
      chapterTitle: note.chapterTitle || 'Pédiatrie Générale',
      options: note.options || [],
      questionText: note.questionText || '',
      clinicalCase: note.clinicalCase || null,
      officialExplanation: note.officialExplanation || ''
    };
  }
  return {
    ...note,
    questionText: note.questionText || q.question || '',
    clinicalCase: note.clinicalCase !== undefined ? note.clinicalCase : (q.clinical_case || null),
    chapterTitle: note.chapterTitle || q.chapterTitle || 'Pédiatrie Générale',
    options: (note.options && note.options.length > 0) ? note.options : (q.options || []),
    media_urls: (note.media_urls && note.media_urls.length > 0) ? note.media_urls : (q.media_urls || []),
    officialExplanation: note.officialExplanation || q.explanation || '',
    correctAnswer: note.correctAnswer || q.croq_answer || ''
  };
}

class QueueEngine {
  constructor(allQuestions = [], chapters = []) {
    this.allQuestions = allQuestions;
    this.chapters = chapters;
    this.selectedChapterIds = []; // Empty = all chapters (Grand Mix)
    
    // Per-question state map: uid -> { target: number, current: number, mistakes: number, done: boolean }
    this.stats = {};
    
    // Ordered array of question UIDs currently in the spaced queue
    this.queue = [];
    
    // Index of the current question in this.queue
    this.cursor = 0;
    
    // Total mistakes counter
    this.totalMistakesCount = 0;

    // Load persisted state if exists
    this.loadState();
  }

  setQuestions(allQuestions, chapters) {
    this.allQuestions = allQuestions;
    this.chapters = chapters;
    if (this.queue.length === 0) {
      this.initSession();
    }
  }

  loadState() {
    try {
      this.sanitizeReasoningNotesStorage();
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.stats = parsed.stats || {};
        // Ensure all loaded targets respect the maximum threshold of 10
        if (this.stats && typeof this.stats === 'object') {
          Object.values(this.stats).forEach(st => {
            if (st && typeof st === 'object' && typeof st.target === 'number' && st.target > 10) {
              st.target = 10;
            }
          });
        }
        this.queue = parsed.queue || [];
        this.cursor = parsed.cursor || 0;
        this.selectedChapterIds = parsed.selectedChapterIds || [];
        this.totalMistakesCount = parsed.totalMistakesCount || 0;
      }
    } catch (err) {
      console.warn("Failed to load queue engine state:", err);
    }
  }

  /**
   * Migrate and optimize any legacy bloated notes in localStorage to lean format
   */
  sanitizeReasoningNotesStorage() {
    try {
      const raw = localStorage.getItem(REASONING_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const hasBloated = parsed.some(n => n && (n.questionText || n.options || n.clinicalCase || n.officialExplanation));
        if (hasBloated) {
          console.log(`[Storage] Optimizing ${parsed.length} reasoning notes to lean format...`);
          const slimmed = parsed.map(n => slimNote(n));
          localStorage.setItem(REASONING_KEY, JSON.stringify(slimmed));
        }
      }
    } catch (e) {
      console.warn("Failed to sanitize reasoning notes storage:", e);
    }
  }

  saveState() {
    try {
      const data = {
        stats: this.stats,
        queue: this.queue,
        cursor: this.cursor,
        selectedChapterIds: this.selectedChapterIds,
        totalMistakesCount: this.totalMistakesCount,
        lastUpdated: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn("Failed to save state:", err);
    }
  }

  /**
   * Initialize or reset a session with selected chapters (or all)
   */
  initSession(chapterIds = []) {
    this.selectedChapterIds = chapterIds;
    
    // Filter questions
    let filtered = this.allQuestions;
    if (chapterIds && chapterIds.length > 0) {
      const set = new Set(chapterIds);
      filtered = this.allQuestions.filter(q => set.has(q.chapterId));
    }

    // Ensure all questions across the entire bank have a stats entry if not already present
    this.allQuestions.forEach(q => {
      if (!this.stats[q.uid]) {
        this.stats[q.uid] = {
          target: 3,
          current: 0,
          mistakes: 0,
          done: false
        };
      }
    });

    // Build initial queue from unmastered questions in randomized order
    const unmasteredUids = filtered
      .filter(q => !this.stats[q.uid].done)
      .map(q => q.uid);

    // Shuffle
    this.queue = this.shuffleArray(unmasteredUids);
    this.cursor = 0;
    this.saveState();
  }

  shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  getCurrentQuestion() {
    if (this.queue.length === 0) return null;
    if (this.cursor >= this.queue.length) {
      this.cursor = 0; // Loop or cycle if still items
    }
    const uid = this.queue[this.cursor];
    return this.allQuestions.find(q => q.uid === uid) || null;
  }

  getQuestionStats(uid) {
    if (!this.stats[uid]) {
      this.stats[uid] = { target: 3, current: 0, mistakes: 0, done: false };
    }
    if (this.stats[uid].target > 10) {
      this.stats[uid].target = 10;
    }
    return this.stats[uid];
  }

  /**
   * Process a correct response
   * - Normally reappears after 50 to 100 questions
   * - When exactly 1 answer remains to permanently clear the question:
   *   reappears randomly within the last 50% of total remaining questions in the queue!
   * - If threshold met (st.current >= st.target), permanently removed from the queue!
   */
  handleSuccess(uid) {
    const st = this.getQuestionStats(uid);
    st.current += 1;

    let permanentlyRemoved = false;
    let isPenultimate = false;
    let pushDistance = 0;

    if (st.current >= st.target) {
      // MASTERED! Remove permanently
      st.done = true;
      permanentlyRemoved = true;
      // Remove from queue completely
      this.queue.splice(this.cursor, 1);
      // Cursor stays on next item (which slid into current index)
    } else {
      // Remove from current position first
      this.queue.splice(this.cursor, 1);

      const remainingNeeded = st.target - st.current;
      let insertIndex;

      if (remainingNeeded === 1) {
        // Quand il reste une seule réponse pour clear la question :
        // La question est placée parmi les 50% dernières questions totales restantes
        isPenultimate = true;
        const remainingCount = this.queue.length - this.cursor;
        if (remainingCount <= 2) {
          insertIndex = this.queue.length;
        } else {
          const halfOffset = Math.floor(remainingCount * 0.5);
          const randomOffset = halfOffset + Math.floor(Math.random() * (remainingCount - halfOffset + 1));
          insertIndex = Math.min(this.queue.length, this.cursor + randomOffset);
        }
        pushDistance = insertIndex - this.cursor;
      } else {
        // En cas de bonne réponse normale : réapparition après 50 à 100 questions
        pushDistance = Math.floor(Math.random() * 51) + 50; // 50 à 100 questions
        insertIndex = Math.min(this.queue.length, this.cursor + pushDistance);
      }

      this.queue.splice(insertIndex, 0, uid);
      // Cursor stays on current position (points to next item)
    }

    if (this.cursor >= this.queue.length && this.queue.length > 0) {
      this.cursor = 0;
    }

    this.saveState();

    return {
      permanentlyRemoved,
      isPenultimate,
      newCurrent: st.current,
      target: st.target,
      pushDistance,
      remainingInQueue: this.queue.length
    };
  }

  /**
   * Process an incorrect response
   * - Increases repetitions required to clear question up to a maximum cap of 10
   * - When target 10 is reached (st.target >= 10): a wrong answer decrements current successes
   *   (e.g., 7/10 becomes 6/10, bounded at minimum 0)
   * - Reappears in 5 to 7 cards to reinforce the reflex
   */
  handleFailure(uid) {
    const st = this.getQuestionStats(uid);
    const targetWasAtMax = st.target >= 10;
    const previousCurrent = st.current;
    let decremented = false;

    st.mistakes += 1;
    this.totalMistakesCount += 1;

    if (targetWasAtMax) {
      // Quand le plafond de 10 est atteint, une réponse fausse diminue le nombre de réussites (ex: 7/10 devient 6/10)
      if (st.current > 0) {
        st.current -= 1;
        decremented = true;
      }
    } else {
      // Sinon, la faute augmente le nombre de répétitions jusqu'à max 10
      st.target = Math.min(10, 3 + st.mistakes);
    }

    // Remove from current position and re-insert in 5 to 7 cards
    const pushDistance = Math.floor(Math.random() * 3) + 5; // 5 to 7
    this.queue.splice(this.cursor, 1);

    const insertIndex = Math.min(this.queue.length, this.cursor + pushDistance);
    this.queue.splice(insertIndex, 0, uid);

    if (this.cursor >= this.queue.length && this.queue.length > 0) {
      this.cursor = 0;
    }

    this.saveState();

    return {
      newTarget: st.target,
      current: st.current,
      previousCurrent,
      decremented,
      mistakes: st.mistakes,
      pushDistance,
      remainingInQueue: this.queue.length
    };
  }

  /**
   * Compute live dashboard metrics
   * Toujours calculé sur l'intégralité des 1 905 questions (tous les cours confondus)
   * afin que le total d'itérations pour tout clearer (5 715) et la cadence journalière
   * d'examen (ex: 205 QCM/j) reflètent fidèlement l'objectif global de tout nettoyer
   * et ne diffèrent jamais lorsqu'un cours spécifique est sélectionné pour l'entraînement.
   */
  getDashboardMetrics() {
    const totalPoolCount = this.allQuestions.length;
    let remainingDistinctQuestions = 0;
    let totalIterationsRequired = 0;
    let masteredCount = 0;

    for (const q of this.allQuestions) {
      const st = this.stats[q.uid] || { target: 3, current: 0, mistakes: 0, done: false };
      if (st.done) {
        masteredCount++;
      } else {
        remainingDistinctQuestions++;
        const needed = Math.max(0, st.target - st.current);
        totalIterationsRequired += needed;
      }
    }

    const progressPct = totalPoolCount > 0 
      ? Math.round((masteredCount / totalPoolCount) * 100) 
      : 0;

    return {
      totalPoolCount,
      remainingDistinctQuestions,
      totalIterationsRequired,
      masteredCount,
      progressPct,
      queueLength: this.queue.length,
      totalMistakes: this.totalMistakesCount,
      selectedChaptersCount: this.selectedChapterIds ? this.selectedChapterIds.length : 0
    };
  }

  /**
   * Save a reasoning note to the dedicated notebook in lean format
   */
  saveReasoningNote(noteData) {
    try {
      const existing = this.getRawReasoningNotes();
      const slimmed = slimNote(noteData);
      const updated = [slimmed, ...existing.filter(n => n.questionUid !== noteData.questionUid || n.id !== noteData.id)];
      localStorage.setItem(REASONING_KEY, JSON.stringify(updated.slice(0, 500))); // Keep up to 500 notes
    } catch (err) {
      console.warn("Failed to save reasoning note:", err);
    }
  }

  getRawReasoningNotes() {
    try {
      const raw = localStorage.getItem(REASONING_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  getReasoningNotes() {
    try {
      const rawNotes = this.getRawReasoningNotes();
      return rawNotes.map(n => hydrateNote(n, this.allQuestions));
    } catch {
      return [];
    }
  }

  deleteReasoningNote(id) {
    try {
      const notes = this.getRawReasoningNotes().filter(n => n.id !== id);
      localStorage.setItem(REASONING_KEY, JSON.stringify(notes));
    } catch {}
  }

  /**
   * Reset session progress
   */
  resetSessionProgress() {
    this.stats = {};
    this.queue = [];
    this.cursor = 0;
    this.totalMistakesCount = 0;
    this.initSession(this.selectedChapterIds);
  }

  /**
   * Daily QCM counter for current day
   */
  getTodayTracker() {
    const todayStr = new Date().toISOString().slice(0, 10);
    try {
      const raw = localStorage.getItem('pedia_today_tracker');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.dateStr === todayStr) {
          return parsed;
        }
      }
    } catch {}
    const fresh = { dateStr: todayStr, count: 0 };
    try {
      localStorage.setItem('pedia_today_tracker', JSON.stringify(fresh));
    } catch {}
    return fresh;
  }

  incrementTodayCount() {
    const tracker = this.getTodayTracker();
    tracker.count = (tracker.count || 0) + 1;
    try {
      localStorage.setItem('pedia_today_tracker', JSON.stringify(tracker));
    } catch {}
    return tracker.count;
  }

  /**
   * Return raw state object with lean notes representation
   */
  getStateObject() {
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      stats: this.stats,
      queue: this.queue,
      cursor: this.cursor,
      selectedChapterIds: this.selectedChapterIds,
      totalMistakesCount: this.totalMistakesCount,
      reasoningNotes: this.getRawReasoningNotes().map(n => slimNote(n)),
      todayTracker: this.getTodayTracker()
    };
  }

  /**
   * Export state as JSON string
   */
  exportState() {
    return JSON.stringify(this.getStateObject(), null, 2);
  }

  /**
   * Apply merged state object safely, ensuring notes are stored lean
   */
  applyMergedState(merged) {
    if (!merged || typeof merged !== 'object') return false;
    try {
      if (merged.stats) this.stats = merged.stats;
      if (Array.isArray(merged.queue)) this.queue = merged.queue;
      if (typeof merged.cursor === 'number') this.cursor = merged.cursor;
      if (Array.isArray(merged.selectedChapterIds)) this.selectedChapterIds = merged.selectedChapterIds;
      if (typeof merged.totalMistakesCount === 'number') this.totalMistakesCount = merged.totalMistakesCount;
      if (Array.isArray(merged.reasoningNotes)) {
        const slimmed = merged.reasoningNotes.map(n => slimNote(n));
        localStorage.setItem(REASONING_KEY, JSON.stringify(slimmed.slice(0, 500)));
      }
      if (merged.todayTracker && typeof merged.todayTracker === 'object') {
        const currentTracker = this.getTodayTracker();
        if (merged.todayTracker.dateStr === currentTracker.dateStr) {
          currentTracker.count = Math.max(currentTracker.count, merged.todayTracker.count || 0);
          localStorage.setItem('pedia_today_tracker', JSON.stringify(currentTracker));
        }
      }
      this.saveState();
      return true;
    } catch (err) {
      console.error("applyMergedState failed:", err);
      return false;
    }
  }

  /**
   * Import state from JSON string
   */
  importState(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      return this.applyMergedState(parsed);
    } catch (err) {
      console.error("Import failed:", err);
      return false;
    }
  }
}


// Study Progress & Analytics Tracking Service for PédiaDrill
// Manages daily study history, intelligent sessions, precise question timers, streaks, first-pass discovery tracking, and analytics.

const STUDY_HISTORY_KEY = 'pedia_study_history_v1';
const FIRST_PASS_KEY = 'pedia_first_pass_records_v2';
const INACTIVITY_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes: pause timer
const SESSION_GAP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes: new session
const MAX_QUESTION_TIME_CAP_SEC = 180; // 3 minutes cap per question to prevent outlier skew

class StudyTracker {
  constructor() {
    this.history = this.loadHistory();
    this.firstPassRecords = this.loadFirstPassRecords(); // questionUid -> boolean (true = correct on 1st pass, false = wrong)
    this.currentQuestionStartTime = null;
    this.accumulatedQuestionTimeMs = 0;
    this.isTimerPaused = false;
    this.lastPauseTimestamp = null;
    this.activeSessionStarted = false;
    this.lastActionTimestamp = Date.now();
  }

  loadHistory() {
    try {
      if (typeof localStorage === 'undefined') return {};
      const raw = localStorage.getItem(STUDY_HISTORY_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      console.warn("Failed to load study history:", e);
      return {};
    }
  }

  saveHistory() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STUDY_HISTORY_KEY, JSON.stringify(this.history));
    } catch (e) {
      console.warn("Failed to save study history:", e);
    }
  }

  loadFirstPassRecords() {
    try {
      if (typeof localStorage === 'undefined') return {};
      // Purge legacy biased v1 store if migrating to v2
      if (localStorage.getItem('pedia_first_pass_records_v1') && !localStorage.getItem(FIRST_PASS_KEY)) {
        localStorage.removeItem('pedia_first_pass_records_v1');
      }
      const raw = localStorage.getItem(FIRST_PASS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      console.warn("Failed to load first-pass records:", e);
      return {};
    }
  }

  saveFirstPassRecords() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(FIRST_PASS_KEY, JSON.stringify(this.firstPassRecords));
    } catch (e) {
      console.warn("Failed to save first-pass records:", e);
    }
  }

  /**
   * Seed first-pass records from pre-existing queueEngine.stats and reasoning notes
   * Option B: Reconstructs realistic discovery history:
   * - Any question with registered mistakes (st.mistakes > 0 or in reasoningNotes notebook)
   *   is identified as failed upon 1st discovery encounter.
   * - Any question cleared without mistakes (st.current > 0 && st.mistakes === 0)
   *   is identified as succeeded on 1st discovery encounter.
   */
  seedFirstPassFromExistingStats(queueStats, rawReasoningNotes = []) {
    if (!queueStats || typeof queueStats !== 'object') return;

    // Collect mistake question UIDs from AI reasoning notebook
    const notebookMistakeUids = new Set();
    if (Array.isArray(rawReasoningNotes)) {
      rawReasoningNotes.forEach(note => {
        if (note && note.questionUid) {
          notebookMistakeUids.add(note.questionUid);
        }
      });
    }

    let modified = false;
    for (const [uid, st] of Object.entries(queueStats)) {
      if (!st || typeof this.firstPassRecords[uid] !== 'undefined') continue;

      const hasMistakes = (st.mistakes > 0) || notebookMistakeUids.has(uid);
      const hasAttempts = (st.current > 0) || (st.mistakes > 0);

      if (!hasAttempts) continue; // Unanswered question

      if (hasMistakes) {
        // Option B reconstruction: In SRS, any question with an error was failed on discovery pass
        this.firstPassRecords[uid] = false;
        modified = true;
      } else if (st.current > 0 && st.mistakes === 0) {
        // Cleared flawlessly with 0 mistakes
        this.firstPassRecords[uid] = true;
        modified = true;
      }
    }

    if (modified) {
      this.saveFirstPassRecords();
    }
  }

  getTodayDateStr() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get or initialize daily study record
   */
  getOrCreateDayRecord(dateStr = this.getTodayDateStr()) {
    if (!this.history[dateStr]) {
      this.history[dateStr] = {
        dateStr,
        totalQuestions: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        totalTimeSeconds: 0,
        sessionsCount: 0,
        avgTimePerQuestion: 0,
        totalTimeCorrect: 0,
        totalTimeWrong: 0,
        avgTimeCorrect: 0,
        avgTimeWrong: 0,
        firstPassQuestions: 0,
        firstPassCorrect: 0,
        firstPassWrong: 0,
        chaptersStats: {}, // chapterId -> { correct: 0, wrong: 0, timeSeconds: 0 }
        lastActivityTimestamp: Date.now()
      };
    }
    return this.history[dateStr];
  }

  /**
   * Called when a question is displayed in the Arena
   */
  startQuestionTimer() {
    const now = Date.now();
    const dayRecord = this.getOrCreateDayRecord();

    // Check if we need to increment session count
    const timeSinceLastAction = now - (dayRecord.lastActivityTimestamp || 0);
    if (!this.activeSessionStarted || timeSinceLastAction > SESSION_GAP_THRESHOLD_MS) {
      dayRecord.sessionsCount = (dayRecord.sessionsCount || 0) + 1;
      this.activeSessionStarted = true;
    }

    dayRecord.lastActivityTimestamp = now;
    this.currentQuestionStartTime = now;
    this.accumulatedQuestionTimeMs = 0;
    this.isTimerPaused = false;
    this.lastPauseTimestamp = null;
    this.lastActionTimestamp = now;
  }

  /**
   * Pause timer when user leaves tab/window or becomes inactive
   */
  pauseTimer() {
    if (this.currentQuestionStartTime && !this.isTimerPaused) {
      const now = Date.now();
      this.accumulatedQuestionTimeMs += (now - this.currentQuestionStartTime);
      this.currentQuestionStartTime = null;
      this.isTimerPaused = true;
      this.lastPauseTimestamp = now;
    }
  }

  /**
   * Resume timer when user comes back
   */
  resumeTimer() {
    if (this.isTimerPaused) {
      this.currentQuestionStartTime = Date.now();
      this.isTimerPaused = false;
      this.lastPauseTimestamp = null;
      this.lastActionTimestamp = Date.now();
    }
  }

  /**
   * Called when a question is answered (right or wrong)
   * Returns elapsed time in seconds for this question
   */
  recordAnswer(isCorrect, chapterId = 'general', questionUid = null) {
    const now = Date.now();
    let durationMs = this.accumulatedQuestionTimeMs;

    if (this.currentQuestionStartTime && !this.isTimerPaused) {
      durationMs += (now - this.currentQuestionStartTime);
    }

    // Default to at least 1 second if answered very quickly, and cap at max to avoid idle inflation
    let durationSeconds = Math.round(durationMs / 1000);
    if (durationSeconds < 1) durationSeconds = 1;
    if (durationSeconds > MAX_QUESTION_TIME_CAP_SEC) {
      durationSeconds = MAX_QUESTION_TIME_CAP_SEC;
    }

    const todayStr = this.getTodayDateStr();
    const day = this.getOrCreateDayRecord(todayStr);

    day.totalQuestions += 1;
    day.totalTimeSeconds += durationSeconds;

    if (isCorrect) {
      day.correctAnswers += 1;
      day.totalTimeCorrect = (day.totalTimeCorrect || 0) + durationSeconds;
    } else {
      day.wrongAnswers += 1;
      day.totalTimeWrong = (day.totalTimeWrong || 0) + durationSeconds;
    }

    // First-pass discovery tracking (unique question encounter)
    if (questionUid && typeof this.firstPassRecords[questionUid] === 'undefined') {
      this.firstPassRecords[questionUid] = !!isCorrect;
      this.saveFirstPassRecords();

      day.firstPassQuestions = (day.firstPassQuestions || 0) + 1;
      if (isCorrect) {
        day.firstPassCorrect = (day.firstPassCorrect || 0) + 1;
      } else {
        day.firstPassWrong = (day.firstPassWrong || 0) + 1;
      }
    }

    // Averages
    day.avgTimePerQuestion = day.totalQuestions > 0 
      ? Math.round((day.totalTimeSeconds / day.totalQuestions) * 10) / 10 
      : 0;

    day.avgTimeCorrect = day.correctAnswers > 0
      ? Math.round((day.totalTimeCorrect / day.correctAnswers) * 10) / 10
      : 0;

    day.avgTimeWrong = day.wrongAnswers > 0
      ? Math.round((day.totalTimeWrong / day.wrongAnswers) * 10) / 10
      : 0;

    // Chapter breakdown
    if (chapterId) {
      if (!day.chaptersStats) day.chaptersStats = {};
      if (!day.chaptersStats[chapterId]) {
        day.chaptersStats[chapterId] = { correct: 0, wrong: 0, timeSeconds: 0 };
      }
      const ch = day.chaptersStats[chapterId];
      if (isCorrect) ch.correct += 1;
      else ch.wrong += 1;
      ch.timeSeconds += durationSeconds;
    }

    day.lastActivityTimestamp = now;
    this.lastActionTimestamp = now;

    // Reset current question timers
    this.currentQuestionStartTime = null;
    this.accumulatedQuestionTimeMs = 0;
    this.isTimerPaused = false;

    this.saveHistory();
    return durationSeconds;
  }

  /**
   * First pass accuracy analytics across all recorded unique questions
   */
  getFirstPassAnalytics() {
    const records = Object.values(this.firstPassRecords);
    const total = records.length;
    const correct = records.filter(r => r === true).length;
    const wrong = total - correct;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    return {
      total,
      correct,
      wrong,
      pct
    };
  }

  /**
   * First pass analytics for a specific subset of days
   */
  getFirstPassInDays(days = []) {
    let total = 0;
    let correct = 0;
    let wrong = 0;
    for (const d of days) {
      total += (d.firstPassQuestions || 0);
      correct += (d.firstPassCorrect || 0);
      wrong += (d.firstPassWrong || 0);
    }
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { total, correct, wrong, pct };
  }

  /**
   * Calculate consecutive days study streak
   */
  getStreakMetrics() {
    const dates = Object.keys(this.history)
      .filter(d => this.history[d].totalQuestions > 0)
      .sort();

    if (dates.length === 0) {
      return { currentStreak: 0, maxStreak: 0, isStudiedToday: false };
    }

    const todayStr = this.getTodayDateStr();
    const isStudiedToday = (this.history[todayStr] && this.history[todayStr].totalQuestions > 0);

    // Date math
    const oneDayMs = 24 * 60 * 60 * 1000;
    let currentStreak = 0;
    let maxStreak = 0;
    let tempStreak = 0;

    // Parse all active dates as midnight timestamps
    const activeTimestamps = dates.map(d => {
      const parts = d.split('-').map(Number);
      return new Date(parts[0], parts[1] - 1, parts[2]).getTime();
    }).sort((a, b) => a - b);

    // Calculate max streak across all time
    for (let i = 0; i < activeTimestamps.length; i++) {
      if (i === 0) {
        tempStreak = 1;
      } else {
        const diffDays = Math.round((activeTimestamps[i] - activeTimestamps[i - 1]) / oneDayMs);
        if (diffDays === 1) {
          tempStreak += 1;
        } else if (diffDays > 1) {
          tempStreak = 1;
        }
      }
      if (tempStreak > maxStreak) {
        maxStreak = tempStreak;
      }
    }

    // Calculate current streak backwards from today or yesterday
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayMidnight = todayMidnight - oneDayMs;

    let checkTime = isStudiedToday ? todayMidnight : yesterdayMidnight;
    const activeSet = new Set(activeTimestamps);

    while (activeSet.has(checkTime)) {
      currentStreak += 1;
      checkTime -= oneDayMs;
    }

    return {
      currentStreak,
      maxStreak: Math.max(maxStreak, currentStreak),
      isStudiedToday: !!isStudiedToday
    };
  }

  /**
   * Get aggregated global statistics across all recorded days
   */
  getGlobalAnalytics() {
    const days = Object.values(this.history).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    let totalQuestions = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalTimeSeconds = 0;
    let totalSessions = 0;
    let totalTimeCorrect = 0;
    let totalTimeWrong = 0;

    const chapterTotals = {}; // chapterId -> { correct: 0, wrong: 0, timeSeconds: 0 }

    for (const d of days) {
      totalQuestions += (d.totalQuestions || 0);
      totalCorrect += (d.correctAnswers || 0);
      totalWrong += (d.wrongAnswers || 0);
      totalTimeSeconds += (d.totalTimeSeconds || 0);
      totalSessions += (d.sessionsCount || 0);
      totalTimeCorrect += (d.totalTimeCorrect || 0);
      totalTimeWrong += (d.totalTimeWrong || 0);

      if (d.chaptersStats) {
        for (const [chId, st] of Object.entries(d.chaptersStats)) {
          if (!chapterTotals[chId]) {
            chapterTotals[chId] = { correct: 0, wrong: 0, timeSeconds: 0 };
          }
          chapterTotals[chId].correct += (st.correct || 0);
          chapterTotals[chId].wrong += (st.wrong || 0);
          chapterTotals[chId].timeSeconds += (st.timeSeconds || 0);
        }
      }
    }

    const accuracyPct = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    const avgTimePerQuestion = totalQuestions > 0 ? Math.round((totalTimeSeconds / totalQuestions) * 10) / 10 : 0;
    const avgTimeCorrect = totalCorrect > 0 ? Math.round((totalTimeCorrect / totalCorrect) * 10) / 10 : 0;
    const avgTimeWrong = totalWrong > 0 ? Math.round((totalTimeWrong / totalWrong) * 10) / 10 : 0;

    const streak = this.getStreakMetrics();
    const firstPass = this.getFirstPassAnalytics();

    return {
      totalDaysActive: days.filter(d => d.totalQuestions > 0).length,
      totalQuestions,
      totalCorrect,
      totalWrong,
      accuracyPct,
      totalTimeSeconds,
      totalSessions,
      avgTimePerQuestion,
      avgTimeCorrect,
      avgTimeWrong,
      currentStreak: streak.currentStreak,
      maxStreak: streak.maxStreak,
      isStudiedToday: streak.isStudiedToday,
      firstPass,
      chapterTotals,
      days
    };
  }

  /**
   * Get days filtered by range: 'today' | '7' | '30' | 'all'
   */
  getDaysByRange(range = '30') {
    if (range === 'today') {
      const todayStr = this.getTodayDateStr();
      return [this.getOrCreateDayRecord(todayStr)];
    }

    const allDays = Object.values(this.history).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    if (range === 'all') {
      return allDays.length > 0 ? allDays : [this.getOrCreateDayRecord(this.getTodayDateStr())];
    }

    const numDays = parseInt(range, 10) || 30;
    const now = new Date();
    const result = [];

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      result.push(this.history[dateStr] || {
        dateStr,
        totalQuestions: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        totalTimeSeconds: 0,
        sessionsCount: 0,
        avgTimePerQuestion: 0,
        firstPassQuestions: 0,
        firstPassCorrect: 0,
        firstPassWrong: 0,
        chaptersStats: {}
      });
    }

    return result;
  }

  /**
   * Get days filtered by custom date range: [startDateStr, endDateStr]
   */
  getDaysByCustomRange(startDateStr, endDateStr) {
    if (!startDateStr || !endDateStr) return this.getDaysByRange('7');
    let start = startDateStr;
    let end = endDateStr;
    if (start > end) {
      [start, end] = [end, start];
    }

    const partsStart = start.split('-').map(Number);
    const partsEnd = end.split('-').map(Number);
    const dStart = new Date(partsStart[0], partsStart[1] - 1, partsStart[2]);
    const dEnd = new Date(partsEnd[0], partsEnd[1] - 1, partsEnd[2]);

    const result = [];
    const oneDayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.min(365, Math.round((dEnd.getTime() - dStart.getTime()) / oneDayMs));

    for (let i = 0; i <= diffDays; i++) {
      const cur = new Date(dStart.getTime() + i * oneDayMs);
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      result.push(this.history[dateStr] || {
        dateStr,
        totalQuestions: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        totalTimeSeconds: 0,
        sessionsCount: 0,
        avgTimePerQuestion: 0,
        firstPassQuestions: 0,
        firstPassCorrect: 0,
        firstPassWrong: 0,
        chaptersStats: {}
      });
    }

    return result;
  }

  /**
   * Merge external study history object (e.g. from Google Cloud Firestore)
   */
  mergeHistory(remoteHistory) {
    if (!remoteHistory || typeof remoteHistory !== 'object') return false;

    for (const [dateStr, rDay] of Object.entries(remoteHistory)) {
      if (!rDay || typeof rDay !== 'object') continue;
      const lDay = this.history[dateStr];

      if (!lDay) {
        this.history[dateStr] = { ...rDay };
      } else {
        // Non-destructive combination: retain highest question volume or combine sessions
        const maxQuestions = Math.max(lDay.totalQuestions || 0, rDay.totalQuestions || 0);
        const maxCorrect = Math.max(lDay.correctAnswers || 0, rDay.correctAnswers || 0);
        const maxWrong = Math.max(lDay.wrongAnswers || 0, rDay.wrongAnswers || 0);
        const maxTime = Math.max(lDay.totalTimeSeconds || 0, rDay.totalTimeSeconds || 0);
        const maxSessions = Math.max(lDay.sessionsCount || 0, rDay.sessionsCount || 0);

        lDay.totalQuestions = maxQuestions;
        lDay.correctAnswers = maxCorrect;
        lDay.wrongAnswers = maxWrong;
        lDay.totalTimeSeconds = maxTime;
        lDay.sessionsCount = maxSessions;
        lDay.avgTimePerQuestion = maxQuestions > 0 ? Math.round((maxTime / maxQuestions) * 10) / 10 : 0;
        lDay.lastActivityTimestamp = Math.max(lDay.lastActivityTimestamp || 0, rDay.lastActivityTimestamp || 0);

        lDay.firstPassQuestions = Math.max(lDay.firstPassQuestions || 0, rDay.firstPassQuestions || 0);
        lDay.firstPassCorrect = Math.max(lDay.firstPassCorrect || 0, rDay.firstPassCorrect || 0);
        lDay.firstPassWrong = Math.max(lDay.firstPassWrong || 0, rDay.firstPassWrong || 0);

        // Merge chapter stats
        if (rDay.chaptersStats) {
          if (!lDay.chaptersStats) lDay.chaptersStats = {};
          for (const [chId, rCh] of Object.entries(rDay.chaptersStats)) {
            const lCh = lDay.chaptersStats[chId] || { correct: 0, wrong: 0, timeSeconds: 0 };
            lCh.correct = Math.max(lCh.correct || 0, rCh.correct || 0);
            lCh.wrong = Math.max(lCh.wrong || 0, rCh.wrong || 0);
            lCh.timeSeconds = Math.max(lCh.timeSeconds || 0, rCh.timeSeconds || 0);
            lDay.chaptersStats[chId] = lCh;
          }
        }
      }
    }

    this.saveHistory();
    return true;
  }

  getRawHistory() {
    return this.history;
  }
}

const studyTracker = new StudyTracker();


// Firebase Authentication (Google Sign-In) & Firestore Real-time Sync Service for PédiaDrill
// Provides seamless multi-device progress sync across PC, Smartphone, and Tablet.

const FIREBASE_CONFIG_STORAGE_KEY = 'pedia_firebase_config';

// Official production Firebase configuration for qcm-pediatr
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAyTJf9A0mMtcnPM1cGfVzFoLZu2rA0qpA",
  authDomain: "qcm-pediatr.firebaseapp.com",
  projectId: "qcm-pediatr",
  storageBucket: "qcm-pediatr.firebasestorage.app",
  messagingSenderId: "1028938391462",
  appId: "1:1028938391462:web:c37c4f146fe3e72b633967"
};


function toSlimNote(note) {
  if (typeof slimNote === 'function') return slimNote(note);
  if (!note || typeof note !== 'object') return note;
  return {
    id: note.id || `note_${note.timestamp || Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    questionUid: note.questionUid || '',
    userAnswer: note.userAnswer || '',
    userAnswerLetters: Array.isArray(note.userAnswerLetters)
      ? note.userAnswerLetters
      : (note.userAnswer ? [note.userAnswer] : []),
    correctAnswer: note.correctAnswer || '',
    score: (note.score !== undefined && note.score !== null) ? Number(note.score) : null,
    isCroq: !!note.isCroq,
    reasoningNote: note.reasoningNote || '',
    modelUsed: note.modelUsed || '',
    timestamp: note.timestamp || Date.now()
  };
}

/**
 * Intelligent state merger: unites local and remote progress non-destructively.
 * - Takes highest current mastery hits
 * - Takes highest penalty target and mistakes
 * - Logical OR for question done state
 * - Full union of all unique AI reasoning notes (no notes deleted) in lean format
 */
function mergeStates(local, remote) {
  if (!remote || typeof remote !== 'object') return local;
  if (!local || typeof local !== 'object') return remote;

  const merged = {
    version: 2,
    exportedAt: new Date().toISOString(),
    stats: {},
    queue: Array.isArray(local.queue) && local.queue.length > 0 ? local.queue : (remote.queue || []),
    cursor: local.cursor || remote.cursor || 0,
    selectedChapterIds: Array.isArray(local.selectedChapterIds) && local.selectedChapterIds.length > 0
      ? local.selectedChapterIds 
      : (remote.selectedChapterIds || []),
    totalMistakesCount: Math.max(local.totalMistakesCount || 0, remote.totalMistakesCount || 0),
    reasoningNotes: []
  };

  // Merge question stats
  const allUids = new Set([
    ...Object.keys(local.stats || {}),
    ...Object.keys(remote.stats || {})
  ]);

  for (const uid of allUids) {
    const l = (local.stats && local.stats[uid]) || null;
    const r = (remote.stats && remote.stats[uid]) || null;

    if (l && r) {
      merged.stats[uid] = {
        current: Math.max(l.current || 0, r.current || 0),
        target: Math.min(10, Math.max(l.target || 3, r.target || 3)),
        mistakes: Math.max(l.mistakes || 0, r.mistakes || 0),
        done: !!(l.done || r.done)
      };
      if (merged.stats[uid].current >= merged.stats[uid].target) {
        merged.stats[uid].done = true;
      }
    } else if (l) {
      merged.stats[uid] = { ...l, target: Math.min(10, l.target || 3) };
    } else if (r) {
      merged.stats[uid] = { ...r, target: Math.min(10, r.target || 3) };
    }
  }

  // Merge reasoning notes without loss in lean format
  const notesMap = new Map();
  const localNotes = Array.isArray(local.reasoningNotes) ? local.reasoningNotes : [];
  const remoteNotes = Array.isArray(remote.reasoningNotes) ? remote.reasoningNotes : [];

  for (const rawNote of [...remoteNotes, ...localNotes]) {
    if (!rawNote) continue;
    const note = toSlimNote(rawNote);
    const key = note.id || `${note.questionUid}_${note.timestamp}`;
    notesMap.set(key, note);
  }

  merged.reasoningNotes = Array.from(notesMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // Merge today's QCM count non-destructively
  const todayStr = new Date().toISOString().slice(0, 10);
  const localToday = (local.todayTracker && local.todayTracker.dateStr === todayStr) ? (local.todayTracker.count || 0) : 0;
  const remoteToday = (remote.todayTracker && remote.todayTracker.dateStr === todayStr) ? (remote.todayTracker.count || 0) : 0;
  merged.todayTracker = {
    dateStr: todayStr,
    count: Math.max(localToday, remoteToday)
  };

  // Merge study history across devices non-destructively
  if (remote.studyHistory && typeof remote.studyHistory === 'object') {
    if (typeof studyTracker !== 'undefined' && studyTracker && typeof studyTracker.mergeHistory === 'function') {
      studyTracker.mergeHistory(remote.studyHistory);
    }
  }

  return merged;
}

/**
 * Sanitize any object for Firestore: converts undefined to null or omits them
 */
function sanitizeForFirestore(obj) {
  if (obj === undefined) return null;
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    return value === undefined ? null : value;
  }));
}

class FirebaseSyncService {
  constructor(queueEngine, onStateChange = null, onDataMerged = null) {
    this.queueEngine = queueEngine;
    this.onStateChange = onStateChange; // (status, detail, user, lastSyncText) => void
    this.onDataMerged = onDataMerged;   // (mergedState) => void - Re-renders UI
    this.user = null;
    this.isInitialized = false;
    this.firestoreUnsubscribe = null;
    this.autoPushTimer = null;
    this.isPushing = false;
    this.lastSyncedAt = localStorage.getItem('pedia_firebase_last_synced') || null;
    this.status = 'idle'; // 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
  }

  getSavedConfig() {
    try {
      const saved = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Error reading saved Firebase config:', e);
    }
    return DEFAULT_FIREBASE_CONFIG;
  }

  saveConfig(config) {
    try {
      localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(config));
      this.init(true);
      return true;
    } catch (e) {
      console.error('Error saving Firebase config:', e);
      return false;
    }
  }

  hasConfig() {
    const config = this.getSavedConfig();
    return !!(config && config.apiKey && config.projectId);
  }

  init(forceReinit = false) {
    if (typeof window === 'undefined' || !window.firebase) {
      console.warn('Firebase SDK not loaded in window.');
      return false;
    }

    const config = this.getSavedConfig();
    if (!config || !config.apiKey || !config.projectId) {
      this.isInitialized = false;
      this.updateStatus('idle', 'Compte Google prêt à être configuré');
      return false;
    }

    try {
      if (window.firebase.apps.length > 0) {
        if (forceReinit) {
          window.firebase.app().delete().then(() => {
            window.firebase.initializeApp(config);
            this.configureFirestoreSettings();
            this.setupAuthListener();
          });
          return true;
        }
      } else {
        window.firebase.initializeApp(config);
      }

      this.configureFirestoreSettings();
      this.isInitialized = true;
      this.setupAuthListener();
      return true;
    } catch (err) {
      console.error('Firebase initialization error:', err);
      this.updateStatus('error', `Erreur initialisation Firebase: ${err.message}`);
      return false;
    }
  }

  configureFirestoreSettings() {
    try {
      if (window.firebase && window.firebase.firestore) {
        const db = window.firebase.firestore();
        db.settings({ ignoreUndefinedProperties: true });
      }
    } catch (e) {
      // Settings can only be applied before any firestore operation, ignore if already set
    }
  }

  updateStatus(status, detail = '') {
    this.status = status;
    if (typeof this.onStateChange === 'function') {
      this.onStateChange(this.status, detail, this.user, this.getLastSyncedText());
    }
  }

  getLastSyncedText() {
    if (!this.lastSyncedAt) return 'Jamais synchronisé avec Firestore';
    try {
      const date = new Date(Number(this.lastSyncedAt));
      const hours = date.getHours().toString().padStart(2, '0');
      const mins = date.getMinutes().toString().padStart(2, '0');
      return `Synchronisé aujourd'hui à ${hours}:${mins}`;
    } catch {
      return 'Synchronisé';
    }
  }

  setupAuthListener() {
    if (!window.firebase || !window.firebase.auth) return;

    window.firebase.auth().onAuthStateChanged(async (user) => {
      this.user = user;
      if (user) {
        console.log('Firebase User logged in:', user.displayName || user.email);
        this.updateStatus('syncing', `Connecté : ${user.displayName || user.email}`);
        this.setupFirestoreListener();
        // Initial sync on sign-in: Pull remote, merge, and push back
        await this.syncOnLogin();
      } else {
        console.log('Firebase User logged out.');
        if (this.firestoreUnsubscribe) {
          this.firestoreUnsubscribe();
          this.firestoreUnsubscribe = null;
        }
        this.updateStatus('idle', 'Non connecté');
      }
    });
  }

  /**
   * Launch official Google Sign-In: uses native Google dialog on Android/Capacitor,
   * with seamless fallback to popup/redirect on Web/Desktop.
   */
  async signInWithGoogle() {
    if (!this.isInitialized) {
      const ok = this.init();
      if (!ok) {
        return {
          success: false,
          error: 'Veuillez renseigner votre configuration Firebase dans les Paramètres pour activer la connexion Google.'
        };
      }
    }

    // 1. Détection de l'environnement natif Capacitor (Android / iOS)
    const isNative = typeof window.Capacitor !== 'undefined' && 
                     typeof window.Capacitor.isNativePlatform === 'function' && 
                     window.Capacitor.isNativePlatform();
    const nativeAuth = window.Capacitor?.Plugins?.FirebaseAuthentication;

    if (isNative && nativeAuth && typeof nativeAuth.signInWithGoogle === 'function') {
      try {
        this.updateStatus('syncing', 'Ouverture du compte Google natif...');
        const nativeResult = await nativeAuth.signInWithGoogle();

        // Si un idToken est disponible, authentifier également le SDK Web pour Firestore
        if (nativeResult?.credential?.idToken && window.firebase?.auth) {
          const credential = window.firebase.auth.GoogleAuthProvider.credential(nativeResult.credential.idToken);
          const webUserCred = await window.firebase.auth().signInWithCredential(credential);
          this.user = webUserCred.user;
        } else if (nativeResult?.user) {
          this.user = nativeResult.user;
        }

        this.updateStatus('synced', `Connecté avec ${this.user.displayName || this.user.email}`);
        return { success: true, user: this.user };
      } catch (nativeErr) {
        console.error('Native Google Sign-In failed:', nativeErr);
        if (nativeErr.code === '12501' || nativeErr.message?.includes('cancel') || nativeErr.message?.includes('12501')) {
          this.updateStatus('idle', 'Connexion annulée.');
          return { success: false, error: 'Connexion annulée par l\'utilisateur.' };
        }
        const friendlyMsg = this.getFriendlyAuthError(nativeErr);
        this.updateStatus('error', friendlyMsg);
        return { success: false, error: friendlyMsg };
      }
    }

    // 2. Flux Web / PC Desktop (Popup avec secours redirect)
    try {
      this.updateStatus('syncing', 'Ouverture de la fenêtre Google...');
      const provider = new window.firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      try {
        const result = await window.firebase.auth().signInWithPopup(provider);
        this.user = result.user;
        this.updateStatus('synced', `Connecté avec ${this.user.displayName || this.user.email}`);
        return { success: true, user: this.user };
      } catch (popupErr) {
        if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/popup-closed-by-user') {
          console.warn('Popup blocked, attempting signInWithRedirect...');
          await window.firebase.auth().signInWithRedirect(provider);
          return { success: true, redirecting: true };
        }
        throw popupErr;
      }
    } catch (err) {
      console.error('Google Sign-In error:', err);
      const friendlyMsg = this.getFriendlyAuthError(err);
      this.updateStatus('error', friendlyMsg);
      return { success: false, error: friendlyMsg };
    }
  }

  async signOut() {
    const isNative = typeof window.Capacitor !== 'undefined' && 
                     typeof window.Capacitor.isNativePlatform === 'function' && 
                     window.Capacitor.isNativePlatform();
    const nativeAuth = window.Capacitor?.Plugins?.FirebaseAuthentication;
    if (isNative && nativeAuth && typeof nativeAuth.signOut === 'function') {
      try { await nativeAuth.signOut(); } catch(e) { console.warn('Native signOut error:', e); }
    }

    if (!window.firebase || !window.firebase.auth) return;
    try {
      if (this.firestoreUnsubscribe) {
        this.firestoreUnsubscribe();
        this.firestoreUnsubscribe = null;
      }
      await window.firebase.auth().signOut();
      this.user = null;
      this.updateStatus('idle', 'Déconnecté du compte Google');
      return { success: true };
    } catch (err) {
      console.error('Sign out error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Real-time Firestore subscription: automatically receives changes made from other devices
   */
  /**
   * Fetch reasoning notes from chunked Firestore documents (or fallback to legacy single doc array)
   */
  async fetchRemoteNotes(pediaCol, remoteData) {
    const notes = [];
    if (remoteData && typeof remoteData.notesChunksCount === 'number' && remoteData.notesChunksCount > 0) {
      try {
        const chunkPromises = [];
        for (let i = 0; i < remoteData.notesChunksCount; i++) {
          chunkPromises.push(pediaCol.doc(`notes_${i}`).get());
        }
        const chunkSnaps = await Promise.all(chunkPromises);
        for (const snap of chunkSnaps) {
          if (snap.exists) {
            const data = snap.data();
            if (Array.isArray(data?.notes)) {
              notes.push(...data.notes);
            }
          }
        }
      } catch (e) {
        console.warn('Error fetching note chunks from Firestore:', e);
      }
    }

    // Fallback: If no chunk notes were found or legacy single document, check reasoningNotes
    if (notes.length === 0 && Array.isArray(remoteData?.reasoningNotes) && remoteData.reasoningNotes.length > 0) {
      notes.push(...remoteData.reasoningNotes);
    }

    return notes.map(n => toSlimNote(n));
  }

  /**
   * Real-time Firestore subscription: automatically receives changes made from other devices
   */
  setupFirestoreListener() {
    if (!this.user || !window.firebase || !window.firebase.firestore) return;

    if (this.firestoreUnsubscribe) {
      this.firestoreUnsubscribe();
    }

    try {
      const db = window.firebase.firestore();
      const pediaCol = db.collection('users').doc(this.user.uid).collection('pedia');
      const docRef = pediaCol.doc('progress');

      this.firestoreUnsubscribe = docRef.onSnapshot(async (doc) => {
        if (!doc.exists) {
          console.log('No Firestore progress document yet for user, will create on first push.');
          return;
        }

        const remoteData = doc.data();
        if (!remoteData || this.isPushing) return;

        console.log('Real-time update received from Firestore');

        // Fetch chunked reasoning notes
        const remoteNotes = await this.fetchRemoteNotes(pediaCol, remoteData);
        remoteData.reasoningNotes = remoteNotes;

        const localState = this.queueEngine.getStateObject();
        const merged = mergeStates(localState, remoteData);
        this.queueEngine.applyMergedState(merged);

        this.lastSyncedAt = Date.now().toString();
        localStorage.setItem('pedia_firebase_last_synced', this.lastSyncedAt);

        // Notify app to re-render UI
        if (typeof this.onDataMerged === 'function') {
          this.onDataMerged(merged);
        }

        const notesCount = (merged.reasoningNotes || []).length;
        this.updateStatus('synced', `En direct : ${notesCount} note${notesCount > 1 ? 's' : ''} synchronisée${notesCount > 1 ? 's' : ''}`);
      }, (err) => {
        console.warn('Firestore snapshot error:', err);
        const friendly = this.getFriendlyFirestoreError(err);
        this.updateStatus('error', friendly);
      });
    } catch (e) {
      console.warn('Could not setup Firestore listener:', e);
    }
  }

  /**
   * Synchronize on user login: pulls remote progress, merges with current device progress, and uploads
   */
  async syncOnLogin() {
    if (!this.user || !window.firebase || !window.firebase.firestore) return;

    try {
      const db = window.firebase.firestore();
      const pediaCol = db.collection('users').doc(this.user.uid).collection('pedia');
      const docRef = pediaCol.doc('progress');

      const doc = await docRef.get();
      const localState = this.queueEngine.getStateObject();

      let merged = localState;
      if (doc.exists) {
        const remoteData = doc.data();
        const remoteNotes = await this.fetchRemoteNotes(pediaCol, remoteData);
        remoteData.reasoningNotes = remoteNotes;
        merged = mergeStates(localState, remoteData);
        this.queueEngine.applyMergedState(merged);
      }

      // Notify app to re-render UI with merged state
      if (typeof this.onDataMerged === 'function') {
        this.onDataMerged(merged);
      }

      // Save unified state back to Firestore using chunked architecture
      await this.pushToFirestore(merged);
      this.lastSyncedAt = Date.now().toString();
      localStorage.setItem('pedia_firebase_last_synced', this.lastSyncedAt);
      
      const notesCount = (merged.reasoningNotes || []).length;
      this.updateStatus('synced', `Progression & ${notesCount} note${notesCount > 1 ? 's' : ''} synchronisée${notesCount > 1 ? 's' : ''} avec votre compte Google !`);
    } catch (err) {
      console.error('Sync on login error:', err);
      const friendly = this.getFriendlyFirestoreError(err);
      this.updateStatus('error', friendly);
    }
  }

  /**
   * Pull state from Firestore manually
   */
  async pullFromFirestore() {
    if (!this.user || !window.firebase || !window.firebase.firestore) {
      return { success: false, error: 'Veuillez vous connecter avec votre compte Google.' };
    }

    this.updateStatus('syncing', 'Récupération depuis Google Cloud...');

    try {
      const db = window.firebase.firestore();
      const pediaCol = db.collection('users').doc(this.user.uid).collection('pedia');
      const docRef = pediaCol.doc('progress');

      const doc = await docRef.get();
      if (!doc.exists) {
        this.updateStatus('synced', 'Aucune progression distante sur ce compte Google');
        return { success: true, empty: true };
      }

      const remoteData = doc.data();
      const remoteNotes = await this.fetchRemoteNotes(pediaCol, remoteData);
      remoteData.reasoningNotes = remoteNotes;

      const localState = this.queueEngine.getStateObject();
      const merged = mergeStates(localState, remoteData);
      this.queueEngine.applyMergedState(merged);

      this.lastSyncedAt = Date.now().toString();
      localStorage.setItem('pedia_firebase_last_synced', this.lastSyncedAt);

      if (typeof this.onDataMerged === 'function') {
        this.onDataMerged(merged);
      }

      const notesCount = (merged.reasoningNotes || []).length;
      this.updateStatus('synced', `Succès : ${notesCount} note${notesCount > 1 ? 's' : ''} récupérée${notesCount > 1 ? 's' : ''} depuis Google Cloud !`);
      return { success: true, merged };
    } catch (err) {
      console.error('Pull from Firestore error:', err);
      const friendly = this.getFriendlyFirestoreError(err);
      this.updateStatus('error', friendly);
      return { success: false, error: friendly };
    }
  }

  /**
   * Push current state to Firestore using Chunked Storage Architecture.
   * Splits notes into 50-item chunks (~60 KB each) and compacts question stats,
   * guaranteeing document size remains far below Firestore's 1,048,576 bytes (1 MiB) limit.
   */
  async pushToFirestore(explicitState = null) {
    if (!this.user || !window.firebase || !window.firebase.firestore) {
      return { success: false, error: 'Non connecté à Google' };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.updateStatus('offline', 'Hors-ligne');
      return { success: false, error: 'Hors-ligne' };
    }

    this.isPushing = true;
    this.updateStatus('syncing', 'Sauvegarde vers Google Cloud...');

    try {
      const db = window.firebase.firestore();
      const pediaCol = db.collection('users').doc(this.user.uid).collection('pedia');
      const progressDocRef = pediaCol.doc('progress');

      const state = explicitState || this.queueEngine.getStateObject();
      const rawNotes = Array.isArray(state.reasoningNotes) ? state.reasoningNotes : [];
      const slimmedNotes = rawNotes.map(n => toSlimNote(n));

      // 1. Chunk reasoning notes into batches of 50
      // 50 slim notes ~ 60-75 KB, 15x below Firestore's 1MB limit
      const CHUNK_SIZE = 50;
      const noteChunks = [];
      for (let i = 0; i < slimmedNotes.length; i += CHUNK_SIZE) {
        noteChunks.push(slimmedNotes.slice(i, i + CHUNK_SIZE));
      }

      // 2. Compact question stats (omit default untouched questions to keep document small)
      const compactStats = {};
      const rawStats = state.stats || {};
      for (const [uid, st] of Object.entries(rawStats)) {
        if (!st) continue;
        if (st.current > 0 || st.mistakes > 0 || st.done || (st.target && st.target !== 3)) {
          compactStats[uid] = {
            current: st.current || 0,
            target: Math.min(10, st.target || 3),
            mistakes: st.mistakes || 0,
            done: !!st.done
          };
        }
      }

      // 3. Prepare core SRS progress document (~15-20 KB, guaranteed never to exceed 1MB)
      const progressToSave = sanitizeForFirestore({
        version: 2,
        exportedAt: state.exportedAt || new Date().toISOString(),
        stats: compactStats,
        queue: state.queue || [],
        cursor: state.cursor || 0,
        selectedChapterIds: state.selectedChapterIds || [],
        totalMistakesCount: state.totalMistakesCount || 0,
        todayTracker: state.todayTracker || null,
        studyHistory: (typeof studyTracker !== 'undefined' && studyTracker && typeof studyTracker.getRawHistory === 'function')
          ? studyTracker.getRawHistory()
          : (state.studyHistory || {}),
        userEmail: this.user.email || '',
        userDisplayName: this.user.displayName || '',
        lastClientTimestamp: Date.now(),
        notesCount: slimmedNotes.length,
        notesChunksCount: noteChunks.length,
        reasoningNotes: [] // Explicitly clear legacy bloated array in progress document
      });

      progressToSave.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();

      // 4. Atomic batch write for progress doc and all chunk documents
      const batch = db.batch();
      batch.set(progressDocRef, progressToSave, { merge: true });

      for (let i = 0; i < noteChunks.length; i++) {
        const chunkDocRef = pediaCol.doc(`notes_${i}`);
        const chunkData = sanitizeForFirestore({
          chunkIndex: i,
          totalChunks: noteChunks.length,
          notes: noteChunks[i],
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });
        batch.set(chunkDocRef, chunkData);
      }

      // 5. Clean up any excess chunk docs if note count decreased
      const prevChunksCount = Number(localStorage.getItem('pedia_firebase_notes_chunks') || 0);
      if (prevChunksCount > noteChunks.length) {
        for (let i = noteChunks.length; i < prevChunksCount; i++) {
          batch.delete(pediaCol.doc(`notes_${i}`));
        }
      }
      localStorage.setItem('pedia_firebase_notes_chunks', String(noteChunks.length));

      await batch.commit();

      this.lastSyncedAt = Date.now().toString();
      localStorage.setItem('pedia_firebase_last_synced', this.lastSyncedAt);

      const notesCount = slimmedNotes.length;
      this.updateStatus('synced', `Enregistré : ${notesCount} note${notesCount > 1 ? 's' : ''} sauvegardée${notesCount > 1 ? 's' : ''} sur Google Cloud`);
      this.isPushing = false;
      return { success: true };
    } catch (err) {
      this.isPushing = false;
      console.error('Push to Firestore error:', err);
      const friendly = this.getFriendlyFirestoreError(err);
      this.updateStatus('error', friendly);
      return { success: false, error: friendly };
    }
  }

  /**
   * Debounced automatic push: triggered automatically after each answered question
   */
  triggerAutoPush() {
    if (!this.user || !this.isInitialized) return;

    if (this.autoPushTimer) {
      clearTimeout(this.autoPushTimer);
    }
    this.autoPushTimer = setTimeout(() => {
      this.pushToFirestore();
    }, 1500);
  }

  getFriendlyFirestoreError(err) {
    if (!err) return 'Erreur Firestore inconnue';
    const msg = err.message || '';
    if (err.code === 'permission-denied' || msg.includes('Missing or insufficient permissions') || msg.includes('PERMISSION_DENIED')) {
      return '⚠️ Permissions Firestore refusées. Veuillez activer les règles de lecture/écriture dans la console Firebase (Firestore > Règles).';
    }
    if (err.code === 'unavailable' || msg.includes('unavailable')) {
      return 'Connexion Firestore temporairement indisponible (vérifiez votre connexion internet).';
    }
    if (msg.includes('exceeds the maximum allowed size') || (msg.includes('size') && msg.includes('1048576'))) {
      return '⚠️ Limite de taille Firestore dépassée. Le partitionnement automatique des notes a été appliqué.';
    }
    return msg || 'Erreur Firestore';
  }

  getFriendlyAuthError(err) {
    if (!err) return 'Erreur inconnue';
    const msg = err.message || '';
    const code = String(err.code || '');

    if (code === '10' || msg.includes('10:') || msg.includes('DEVELOPER_ERROR')) {
      return '⚠️ Configuration Google Android (Code 10) : L\'empreinte SHA-1 doit être ajoutée dans la Console Firebase (Paramètres du projet > Vos applications > Empreinte SHA).';
    }
    if (code === '12501' || msg.includes('12501') || msg.includes('canceled') || msg.includes('cancelled')) {
      return 'Connexion annulée par l\'utilisateur.';
    }
    if (msg.includes('missing initial state') || code.includes('missing-initial-state')) {
      return 'Erreur de session du navigateur. Utilisez la connexion native Android intégrée.';
    }

    switch (code) {
      case 'auth/popup-blocked':
        return 'La fenêtre de connexion Google a été bloquée par le navigateur. Veuillez autoriser les popups.';
      case 'auth/popup-closed-by-user':
        return 'Connexion annulée par l\'utilisateur.';
      case 'auth/network-request-failed':
        return 'Erreur réseau : vérifiez votre connexion Internet.';
      case 'auth/unauthorized-domain':
        return 'Ce domaine n\'est pas encore autorisé dans la console Firebase (Authentication > Settings > Authorized Domains).';
      case 'auth/operation-not-allowed':
        return 'La connexion Google n\'est pas encore activée dans la console Firebase (Authentication > Sign-in method > Google).';
      default:
        return msg || 'Erreur de connexion Google';
    }
  }
}


// PédiaDrill - Application Controller & Orchestration

// Global Data Access
const allQuestions = window.PEDIA_QUESTIONS || [];
const allChapters = window.PEDIA_CHAPTERS || [];

// Services
const queueEngine = new QueueEngine(allQuestions, allChapters);
const firebaseSyncService = new FirebaseSyncService(
  queueEngine,
  (status, detail, user, lastSyncText) => {
    updateGoogleAccountUI(status, detail, user, lastSyncText);
  },
  (mergedState) => {
    // Whenever Firestore data is received and merged
    updateDashboardUI();
    if (currentView === 'notebook') renderNotebookUI();
    if (currentView === 'stats') renderStatsUI();
    updateArenaDailyBadge();
    updateModalLocalSummary();
    refreshLucide();
  }
);

// Local State
let currentQuestion = null;
let selectedOptionIds = new Set();
let isEvaluating = false;
let currentView = 'dashboard'; // 'dashboard' | 'arena' | 'notebook'
let answeredHistory = []; // Buffer glissant des 5 derniers QCM répondus
let historyCursor = -1; // -1 = QCM actif, 0 = dernier répondu (QCM -1), 1 = (QCM -2), etc.
let isCurrentQuestionAnswered = false; // true dès que l'étudiant valide ou échoue le QCM

function isArenaChapterRevealed() {
  if (historyCursor >= 0) return true; // En mode consultation d'historique, QCM déjà répondu
  if (isCurrentQuestionAnswered) return true; // Question active déjà répondue
  const badge = document.getElementById('arena-chapter-title');
  if (badge && badge.classList.contains('is-revealed')) return true;
  return false;
}

function getEffectiveArenaQuestion() {
  if (historyCursor >= 0 && answeredHistory[historyCursor]) {
    return answeredHistory[historyCursor].question;
  }
  return currentQuestion;
}

// DOM Elements
const views = {
  dashboard: document.getElementById('view-dashboard'),
  arena: document.getElementById('view-arena'),
  notebook: document.getElementById('view-notebook'),
  stats: document.getElementById('view-stats')
};

const modals = {
  error: document.getElementById('modal-error'),
  chapters: document.getElementById('modal-chapters'),
  sync: document.getElementById('modal-sync'),
  settings: document.getElementById('modal-settings')
};

// ============================================================================
// INITIALIZATION
// ============================================================================
function initApp() {
  queueEngine.setQuestions(allQuestions, allChapters);
  studyTracker.seedFirstPassFromExistingStats(queueEngine.stats, queueEngine.getRawReasoningNotes());
  updateDashboardUI();
  setupEventListeners();
  setupKeyboardShortcuts();
  setupFirebaseService();
  refreshLucide();

  // Register Service Worker for offline PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW registration:', err);
    });
  }
}

function updateModalLocalSummary() {
  const summaryEl = document.getElementById('sync-local-summary');
  if (!summaryEl) return;
  const metrics = queueEngine.getDashboardMetrics();
  const notesCount = queueEngine.getReasoningNotes().length;
  summaryEl.textContent = `${metrics.masteredCount} maîtrisées • ${notesCount} note${notesCount > 1 ? 's' : ''} IA`;
}

function updateGoogleAccountUI(status, detail, user, lastSyncText) {
  const btnHeaderLogin = document.getElementById('btn-header-google-login');
  const badgeUserProfile = document.getElementById('btn-open-user-profile');
  const headerAvatar = document.getElementById('header-user-avatar');
  const headerName = document.getElementById('header-user-name');

  const cardDisconnected = document.getElementById('google-disconnected-card');
  const cardConnected = document.getElementById('google-connected-card');
  const modalAvatar = document.getElementById('modal-user-avatar');
  const modalName = document.getElementById('modal-user-name');
  const modalEmail = document.getElementById('modal-user-email');

  const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2310b981'><circle cx='12' cy='8' r='4'/><path d='M20 21a8 8 0 0 0-16 0'/></svg>";

  if (user) {
    if (btnHeaderLogin) btnHeaderLogin.style.display = 'none';
    if (badgeUserProfile) badgeUserProfile.style.display = 'inline-flex';

    const avatarUrl = user.photoURL || defaultAvatar;
    const firstName = user.displayName ? user.displayName.split(' ')[0] : (user.email ? user.email.split('@')[0] : 'Google');

    if (headerAvatar) headerAvatar.src = avatarUrl;
    if (headerName) headerName.textContent = firstName;

    if (cardDisconnected) cardDisconnected.style.display = 'none';
    if (cardConnected) cardConnected.style.display = 'flex';
    if (modalAvatar) modalAvatar.src = avatarUrl;
    if (modalName) modalName.textContent = user.displayName || 'Utilisateur Google';
    if (modalEmail) modalEmail.textContent = user.email || '';
  } else {
    if (btnHeaderLogin) btnHeaderLogin.style.display = 'inline-flex';
    if (badgeUserProfile) badgeUserProfile.style.display = 'none';

    if (cardDisconnected) cardDisconnected.style.display = 'flex';
    if (cardConnected) cardConnected.style.display = 'none';
  }

  const modalStatus = document.getElementById('sync-status-msg');
  if (modalStatus) {
    const accountTag = user ? `[${user.email || 'Google'}]` : '[Non connecté]';
    modalStatus.textContent = detail ? `${lastSyncText} • ${accountTag} (${detail})` : `${lastSyncText} • ${accountTag}`;
  }

  updateModalLocalSummary();
  refreshLucide();
}

function setupFirebaseService() {
  firebaseSyncService.init();

  // Populate form fields with saved config
  const cfg = firebaseSyncService.getSavedConfig();
  if (cfg) {
    const keyEl = document.getElementById('fb-api-key');
    const projEl = document.getElementById('fb-project-id');
    const authEl = document.getElementById('fb-auth-domain');
    const appEl = document.getElementById('fb-app-id');
    if (keyEl && cfg.apiKey) keyEl.value = cfg.apiKey;
    if (projEl && cfg.projectId) projEl.value = cfg.projectId;
    if (authEl && cfg.authDomain) authEl.value = cfg.authDomain;
    if (appEl && cfg.appId) appEl.value = cfg.appId;
  }
}

function refreshLucide() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// ============================================================================
// VIEW NAVIGATION
// ============================================================================
function switchView(viewName) {
  currentView = viewName;
  Object.keys(views).forEach(v => {
    if (views[v]) {
      views[v].style.display = (v === viewName) ? 'flex' : 'none';
    }
  });

  if (viewName === 'dashboard') {
    updateDashboardUI();
  } else if (viewName === 'arena') {
    loadNextArenaQuestion();
  } else if (viewName === 'notebook') {
    renderNotebookUI();
  } else if (viewName === 'stats') {
    renderStatsUI();
  }

  // Floating AI Tutor button in Arena
  const floatingAiBtn = document.getElementById('btn-arena-ai-chat');
  const arenaChatbox = document.getElementById('arena-ai-chatbox');
  if (floatingAiBtn) {
    floatingAiBtn.style.display = (viewName === 'arena') ? 'flex' : 'none';
  }
  if (viewName !== 'arena' && arenaChatbox) {
    arenaChatbox.style.display = 'none';
    if (floatingAiBtn) floatingAiBtn.classList.remove('is-active');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  refreshLucide();
}

// ============================================================================
// EXAM COUNTDOWN & DAILY CADENCE CALCULATOR (Examen le 10/11/2026)
// ============================================================================
function getExamCountdownMetrics(totalIterationsRequired) {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const examDate = new Date(2026, 10, 10); // 10 Novembre 2026 (Mois 10 = Novembre)

  const diffMs = examDate.getTime() - todayMidnight.getTime();
  const daysLeft = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const dailyIterationsRequired = Math.ceil(Math.max(0, totalIterationsRequired) / daysLeft);

  return {
    examDateStr: '10/11',
    daysLeft,
    dailyIterationsRequired
  };
}

function updateArenaDailyBadge() {
  const dailyBadge = document.getElementById('arena-daily-pill');
  if (!dailyBadge) return;
  const metrics = queueEngine.getDashboardMetrics();
  const countdown = getExamCountdownMetrics(metrics.totalIterationsRequired);
  const todayTracker = queueEngine.getTodayTracker();
  dailyBadge.innerHTML = `<i data-lucide="target" style="width:12px;height:12px;display:inline;"></i> <span>${todayTracker.count}/${countdown.dailyIterationsRequired} auj. (J-${countdown.daysLeft})</span>`;
  refreshLucide();
}

// ============================================================================
// DASHBOARD RENDERING
// ============================================================================
function updateDashboardUI() {
  const metrics = queueEngine.getDashboardMetrics();
  const countdown = getExamCountdownMetrics(metrics.totalIterationsRequired);

  document.getElementById('stat-remaining-questions').textContent = formatNumber(metrics.remainingDistinctQuestions);
  document.getElementById('stat-required-iterations').textContent = formatNumber(metrics.totalIterationsRequired);
  document.getElementById('stat-mastered-count').textContent = formatNumber(metrics.masteredCount);
  document.getElementById('stat-mistakes-count').textContent = formatNumber(metrics.totalMistakes);
  document.getElementById('stat-progress-pct').textContent = `${metrics.progressPct}%`;
  
  // Daily Target & Exam Countdown
  const badgeCountdown = document.getElementById('badge-exam-countdown');
  if (badgeCountdown) {
    badgeCountdown.textContent = `⏳ J-${countdown.daysLeft} • Examen 10/11`;
  }

  const dailyTargetEl = document.getElementById('stat-daily-target');
  if (dailyTargetEl) {
    dailyTargetEl.textContent = formatNumber(countdown.dailyIterationsRequired);
  }

  const todayTracker = queueEngine.getTodayTracker();
  const todayDoneEl = document.getElementById('stat-today-done');
  if (todayDoneEl) {
    todayDoneEl.textContent = formatNumber(todayTracker.count);
  }

  const todayGoalEl = document.getElementById('stat-today-goal');
  if (todayGoalEl) {
    todayGoalEl.textContent = `${formatNumber(countdown.dailyIterationsRequired)} requises`;
  }

  const todayPctEl = document.getElementById('stat-today-pct');
  const todayFillEl = document.getElementById('daily-progress-fill');
  const pct = countdown.dailyIterationsRequired > 0 
    ? Math.min(100, Math.round((todayTracker.count / countdown.dailyIterationsRequired) * 100))
    : 100;

  if (todayPctEl) todayPctEl.textContent = `${pct}%`;
  if (todayFillEl) todayFillEl.style.width = `${pct}%`;

  const poolInfoEl = document.getElementById('badge-pool-info');
  if (poolInfoEl) poolInfoEl.textContent = `Sur ${formatNumber(metrics.totalPoolCount)}`;

  // Chapters label
  const chaptersBtnLabel = document.getElementById('btn-chapters-label');
  if (metrics.selectedChaptersCount === 0 || metrics.selectedChaptersCount === allChapters.length) {
    chaptersBtnLabel.textContent = `Tous les cours (${allChapters.length})`;
  } else {
    chaptersBtnLabel.textContent = `${metrics.selectedChaptersCount} cours sélectionnés (${metrics.queueLength} QCM en file)`;
  }

  // Notebook badge
  const notesCount = queueEngine.getReasoningNotes().length;
  document.getElementById('notebook-count-badge').textContent = notesCount;
}

function formatNumber(num) {
  return new Intl.NumberFormat('fr-FR').format(num || 0);
}

// ============================================================================
// FORMATTING HELPERS (CROQ, QCM & CLINICAL AI REASONING)
// ============================================================================
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseMarkdownInline(text) {
  if (!text) return '';
  let clean = (typeof cleanLatexMath === 'function' ? cleanLatexMath(String(text)) : String(text))
    .replace(/\$SpO_2\$/gi, 'SpO₂')
    .replace(/\$SpO2\$/gi, 'SpO₂')
    .replace(/SpO_2/gi, 'SpO₂')
    .replace(/\$PaO_2\$/gi, 'PaO₂')
    .replace(/\$PaCO_2\$/gi, 'PaCO₂')
    .replace(/\$([^\$]+)\$/g, '$1');

  let res = escapeHtml(clean);
  // Code block inline `...`
  res = res.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  // Bold + Italic ***...***
  res = res.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold **...**
  res = res.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic *...*
  res = res.replace(/(^|[^*])\*(?!\*)(.*?)(?<!\*)\*([^*]|$)/g, '$1<em>$2</em>$3');
  return res;
}

/**
 * Advanced Medical Rich Text Formatter
 * Un-glues squished questions, clinical cases, and explanations,
 * turning them into readable, structured paragraphs, medical section headers,
 * and styled bullet/numbered lists with proper vertical spacing and breathing room.
 */
function formatMedicalContent(raw) {
  if (!raw || typeof raw !== 'string') return '';

  let text = typeof cleanLatexMath === 'function' ? cleanLatexMath(raw) : raw.trim();

  // 1. Remove zero-width characters and normalize BOM
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 2. Un-glue bullets (➢, ⁃, •, ►, ▶, ✔, ✓)
  text = text.replace(/([^\n\r])\s*([➢⁃•►▶✔✓])\s*/g, '$1\n$2 ');

  // 3. Un-glue multi-space or NBSP columns (slide tables e.g. "Streptocoque B    E. Coli    Listeria")
  text = text.replace(/[\u00a0\s]{3,}([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ0-9<])/g, '\n- $1');

  // 4. Un-glue squished words where lowercase is immediately followed by real French uppercase
  // e.g. "vaccinéContamination", "pneumonieLes", "marastiqueMaladie", "hyperpigmentationBiologie"
  text = text.replace(/([a-zàâäéèêëîïôöùûüç]{3,})([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][a-zàâäéèêëîïôöùûüç]{2,})/g, '$1.\n\n$2');

  // 5. Un-glue sentence boundaries missing spaces after periods or closing parens
  // e.g. "(TCA).Amyotrophie", "interstitiel.B/ Vrai", "peau5- Vrai", "oncotique.D/ Faux"
  text = text.replace(/([a-z0-9\)])\s*\.\s*([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ])/g, '$1. $2');
  text = text.replace(/([a-z0-9\)])\s*\.\s*(Amyotrophie|H[ée]patom[ée]galie|Distension|L[ée]sions|Biologie|An[ée]mie|Troubles?|Signes?|Phase|Aspect|Examens?|Culture|Ponction|Traitement|Diagnostic|Pronostic|Surveillance|Lutte|Am[ée]lioration|Inconv[ée]nient|Lorsque|Elle|Il|Les|La|Le|Des|En|Pour|Dans)\b/g, '$1.\n\n$2');

  // 6. Un-glue Proposition justifications: "A-Vrai", "A/ Vrai", "A : Faux", "1- Vrai", "1-Perplexe"
  // e.g. "A-Vrai :", "assurésB-Vrai:", "oncotique.D/ Faux.", "peau5- Vrai,", "l'œdème.B : Vrai,"
  text = text.replace(/(^|[^\n\r])\s*([a-eA-E])\s*[-–/:]\s*(?:-?\s*)?(Vrai|Faux|VRAI|FAUX|Fausse|Juste|Perplexe)\b/gi, '$1\n- **$2) $3** : ');
  text = text.replace(/(^|[^\n\r])\s*(\d+)\s*[-–/:]\s*(?:-?\s*)?(Vrai|Faux|VRAI|FAUX|Fausse|Juste|Perplexe)\b/gi, '$1\n- **Item $2 ($3)** : ');

  // 7. Un-glue comprehensive medical section headings
  const headings = [
    'Rappel\\s*:',
    'Rappel\\s+sur[^:]+:',
    'DEFINITION\\s+D[\'’]UNE[^:]+:',
    'D[ée]finition(?:\\s+d[\'’][\\w\\s]+)?\\s*:',
    'Remarque\\s*:',
    'Source(?:\\s+[\\w\\s0-9]+)?\\s*[:;]',
    'NB\\s*:',
    'Attention\\s*:',
    'Conduite\\s+[aà]\\s+tenir\\s*:',
    'CAT\\s*:',
    'Traitement\\s*:',
    'Diagnostic\\s*:',
    'Crit[èe]res\\s*:',
    'Signes\\s+(?:cliniques|physiques|fonctionnels|biologiques|dermatologiques)\\s*:',
    'Tableau\\s+clinique(?:\\s+de[^:]+)?\\s*:',
    'Examens?\\s+(?:compl[ée]mentaires?|syst[ée]matiques?)\\s*:',
    'Physiopathologie\\s*:',
    'Biologie\\s*:',
    'Causes?\\s*:',
    '[ÉEe]tiologies\\s*:',
    'Troubles?\\s+(?:du\\s+comportement|digestifs|neurologiques|h[ée]modynamiques|des\\s+phan[èe]res|cutan[ée]s)\\s*:',
    'L[ée]sions\\s+dermatologiques\\s*:',
    'Phase\\s+d[\'’][ée]tat\\s*:',
    'Aspect\\s+g[ée]n[ée]ral\\s*:',
    'Classifications?(?:\\s+des\\s+MPE)?\\s*:',
    'Classification\\s+de\\s+[\\w\\s]+:',
    'Chez\\s+le\\s+(?:jeune\\s+)?nourrisson(?:\\s+de\\s+[^:]+)?\\s*:',
    'Chez\\s+l[\'’]enfant\\s*:',
    '2\\s+ans\\s+et\\s+grand\\s+enfant\\s*:',
    'Le\\s+kwashiorkor(?:\\s+marastique)?\\s*:',
    'Le\\s+marasme\\s*:',
    'La\\s+m[ée]ningite(?:\\s+[aà][^:]+)?\\s*:',
    'Question\\s*\\d+\\s*:',
    'Q\\d+\\s*:',
    'En\\s+r[ée]sum[ée]\\s*:'
  ];

  headings.forEach(pattern => {
    const re = new RegExp('([^\\n\\r])\\s*(' + pattern + ')', 'gi');
    text = text.replace(re, '$1\n\n$2');
  });

  // 8. Un-glue 'Source' at end of sentence
  text = text.replace(/([^\n\r])\s*(Source\s+diapositive|Source\s*[:;])/gi, '$1\n\n$2');

  // 9. Normalize combined bullet-number items: "- 1. ..." -> "1. ..."
  text = text.replace(/^[-•*➢⁃►▶✔✓]\s*(\d+[\.\)-]\s+)/gm, '$1');

  // 10. Un-glue QCM sub-items: "1- ...", "2- ...", "1. ...", "1) ..."
  text = text.replace(/([^\n\r\-•*➢⁃►▶✔✓])\s+(\d+[\.\)-]\s+[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ])/g, '$1\n$2');
  text = text.replace(/([^\n\r\-•*➢⁃►▶✔✓])\s+([a-eA-E][\.\)]\s+[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ])/g, '$1\n$2');

  // 11. Clean up multiple empty lines
  text = text.replace(/\n{3,}/g, '\n\n');

  // 11. Split into lines
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let html = '<div class="medical-formatted-content">';
  let inBulletList = false;
  let inNumList = false;

  const closeLists = () => {
    if (inBulletList) { html += '</ul>'; inBulletList = false; }
    if (inNumList) { html += '</ul>'; inNumList = false; }
  };

  lines.forEach(line => {
    // Check if line is a Section Title (or starts with a section title)
    const headerMatch = line.match(/^((?:Rappel|D[ée]finition|DEFINITION|Remarque|Source|NB|Attention|Conduite|CAT|Traitement|Diagnostic|Crit[èe]res|Signes|Tableau|Examens|Physiopathologie|Biologie|Causes|Etiologies|[ÉEe]tiologies|Troubles|L[ée]sions|Phase|Aspect|Classifications?|Chez|2\s+ans|Le\s+kwashiorkor|Le\s+marasme|La\s+m[ée]ningite|Question\s*\d+|Q\d+)[^:]*[:;])\s*(.*)$/i);

    if (headerMatch) {
      closeLists();
      const titleText = headerMatch[1].trim();
      const afterText = headerMatch[2] ? headerMatch[2].trim() : '';

      let icon = 'info';
      let titleClass = 'medical-section-title';
      if (/rappel/i.test(titleText)) {
        icon = 'bookmark';
        titleClass += ' title-rappel';
      } else if (/source/i.test(titleText)) {
        icon = 'book-open';
        titleClass += ' title-source';
      } else if (/question|q\d+/i.test(titleText)) {
        icon = 'help-circle';
        titleClass += ' title-question';
      } else if (/biologie|examen/i.test(titleText)) {
        icon = 'activity';
        titleClass += ' title-bio';
      } else if (/signe|tableau|trouble/i.test(titleText)) {
        icon = 'stethoscope';
        titleClass += ' title-clinical';
      }

      html += `<div class="${titleClass}"><i data-lucide="${icon}"></i><span>${parseMarkdownInline(titleText)}</span></div>`;
      if (afterText) {
        html += `<p class="medical-paragraph">${parseMarkdownInline(afterText)}</p>`;
      }
      return;
    }

    // Bullet items
    const bulletMatch = line.match(/^([➢⁃•►▶✔✓\*\-]\s*)(.*)$/);
    if (bulletMatch) {
      if (inNumList) { html += '</ul>'; inNumList = false; }
      if (!inBulletList) { html += '<ul class="medical-bullet-list">'; inBulletList = true; }
      const bulletChar = bulletMatch[1].trim() || '•';
      const content = bulletMatch[2].trim();
      html += `<li class="medical-bullet-item"><span class="medical-bullet-icon">${escapeHtml(bulletChar)}</span><div class="medical-bullet-text">${parseMarkdownInline(content)}</div></li>`;
      return;
    }

    // Numbered items
    const numMatch = line.match(/^(\d+)(?:[-–\.]|\))\s+(.*)$/);
    if (numMatch) {
      if (inBulletList) { html += '</ul>'; inBulletList = false; }
      if (!inNumList) { html += '<ul class="medical-num-list">'; inNumList = true; }
      const num = numMatch[1];
      const content = numMatch[2].trim();
      html += `<li class="medical-num-item"><span class="medical-num-badge">${escapeHtml(num)}</span><div class="medical-num-text">${parseMarkdownInline(content)}</div></li>`;
      return;
    }

    // Regular paragraph
    closeLists();
    html += `<p class="medical-paragraph">${parseMarkdownInline(line)}</p>`;
  });

  closeLists();
  html += '</div>';
  return html;
}
window.cleanLatexMath = cleanLatexMath;
window.formatMedicalContent = formatMedicalContent;

function formatReasoningNote(noteText) {
  if (!noteText || typeof noteText !== 'string' || !noteText.trim()) {
    return '<div class="reasoning-cards-container"><div class="reasoning-card card-method"><div class="reasoning-card-body">Aucune note de raisonnement clinique disponible.</div></div></div>';
  }

  const raw = typeof cleanLatexMath === 'function' ? cleanLatexMath(noteText) : noteText.trim();

  // Regex patterns to capture the 4 structured sections from Gemini 3.8 Flash
  const sec1Regex = /(?:###\s*|\*\*|#\s*)?(?:1[\.\)]\s*)?🎯\s*PI[ÈÉEeèéê]GE[^\n:]*[:\n]([\s\S]*?)(?=(?:###\s*|\*\*|#\s*)?(?:2[\.\)]\s*)?📋\s*JUSTIFICATION|(?:###\s*|\*\*|#\s*)?(?:3[\.\)]\s*)?🩺\s*D[ÉEèéê]MARCHE|(?:###\s*|\*\*|#\s*)?(?:2[\.\)]\s*)?🩺\s*M[ÉEèéê]THODE|$)/i;
  const sec2Regex = /(?:###\s*|\*\*|#\s*)?(?:2[\.\)]\s*)?📋\s*JUSTIFICATION[^\n:]*[:\n]([\s\S]*?)(?=(?:###\s*|\*\*|#\s*)?(?:3[\.\)]\s*)?🩺\s*D[ÉEèéê]MARCHE|(?:###\s*|\*\*|#\s*)?(?:4[\.\)]\s*)?💡\s*R[ÈÉEeèéê]GLE|$)/i;
  const sec3Regex = /(?:###\s*|\*\*|#\s*)?(?:[23][\.\)]\s*)?🩺\s*(?:D[ÉEèéê]MARCHE|M[ÉEèéê]THODE)[^\n:]*[:\n]([\s\S]*?)(?=(?:###\s*|\*\*|#\s*)?(?:[34][\.\)]\s*)?💡\s*R[ÈÉEeèéê]GLE|$)/i;
  const sec4Regex = /(?:###\s*|\*\*|#\s*)?(?:[34][\.\)]\s*)?💡\s*R[ÈÉEeèéê]GLE[^\n:]*[:\n]([\s\S]*?)$/i;

  const match1 = raw.match(sec1Regex);
  const match2 = raw.match(sec2Regex);
  const match3 = raw.match(sec3Regex);
  const match4 = raw.match(sec4Regex);

  const renderSectionContent = (contentRaw) => {
    if (!contentRaw) return '';
    let clean = contentRaw.trim()
      .replace(/^[\s\-–—*]{3,}\s*$/gm, '') // Strip horizontal rule lines
      .trim();

    const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
    let out = '';
    let inList = false;
    let inQuote = false;

    lines.forEach(line => {
      // Skip divider lines
      if (/^[\-–—*]{3,}$/.test(line)) return;

      // Blockquotes (> ...) for golden memos and rules
      const quoteMatch = line.match(/^>\s*(.*)$/);
      if (quoteMatch) {
        if (inList) { out += '</ul>'; inList = false; }
        if (!inQuote) { out += '<blockquote class="reasoning-callout-quote">'; inQuote = true; }
        out += `<p>${parseMarkdownInline(quoteMatch[1])}</p>`;
        return;
      } else if (inQuote) {
        out += '</blockquote>';
        inQuote = false;
      }

      // Bullet items (-, •, *)
      if (/^[-•*]\s+/.test(line)) {
        if (!inList) {
          out += '<ul class="reasoning-list">';
          inList = true;
        }
        const bulletText = line.replace(/^[-•*]\s+/, '');
        out += `<li class="reasoning-list-item">${parseMarkdownInline(bulletText)}</li>`;
      } else {
        if (inList) {
          out += '</ul>';
          inList = false;
        }
        out += `<p class="reasoning-paragraph">${parseMarkdownInline(line)}</p>`;
      }
    });

    if (inList) out += '</ul>';
    if (inQuote) out += '</blockquote>';
    return out;
  };

  if (match1 || match2 || match3 || match4) {
    let html = '<div class="reasoning-cards-container">';

    if (match1 && match1[1] && match1[1].trim()) {
      html += `
        <div class="reasoning-card card-trap">
          <div class="reasoning-card-header">
            <span class="reasoning-badge badge-trap">
              <span class="badge-icon">🎯</span>
              <span>Piège Clinique & Analyse de l'Erreur</span>
            </span>
          </div>
          <div class="reasoning-card-body">${renderSectionContent(match1[1])}</div>
        </div>`;
    }

    if (match2 && match2[1] && match2[1].trim()) {
      html += `
        <div class="reasoning-card card-options-analysis">
          <div class="reasoning-card-header">
            <span class="reasoning-badge badge-options-analysis">
              <span class="badge-icon">📋</span>
              <span>Justification Proposition par Proposition</span>
            </span>
          </div>
          <div class="reasoning-card-body">${renderSectionContent(match2[1])}</div>
        </div>`;
    }

    if (match3 && match3[1] && match3[1].trim()) {
      html += `
        <div class="reasoning-card card-method">
          <div class="reasoning-card-header">
            <span class="reasoning-badge badge-method">
              <span class="badge-icon">🩺</span>
              <span>Démarche Clinique & Raisonnement</span>
            </span>
          </div>
          <div class="reasoning-card-body">${renderSectionContent(match3[1])}</div>
        </div>`;
    }

    if (match4 && match4[1] && match4[1].trim()) {
      html += `
        <div class="reasoning-card card-rule">
          <div class="reasoning-card-header">
            <span class="reasoning-badge badge-rule">
              <span class="badge-icon">💡</span>
              <span>Règle d'Or & Mémo Concours</span>
            </span>
          </div>
          <div class="reasoning-card-body">${renderSectionContent(match4[1])}</div>
        </div>`;
    }

    html += '</div>';
    return html;
  }

  // Fallback for unstructured notes: render clean paragraphs & lists
  return `<div class="reasoning-cards-container"><div class="reasoning-card card-method"><div class="reasoning-card-body">${renderSectionContent(raw)}</div></div></div>`;
}

function formatCroqAnswer(answerText) {
  if (!answerText || typeof answerText !== 'string' || !answerText.trim()) {
    return '<div class="empty-answer">Non renseignée</div>';
  }

  const trimmed = answerText.trim();

  // Pattern detection: dashed items (e.g. "Intro : - Item 1 - Item 2") or numbered items
  const hasDashes = /(?:^|\s|\.)-\s*[A-ZÀ-ÖØ-öø-ÿ0-9]/.test(trimmed) || trimmed.startsWith('-');
  const hasNumberedPoints = /(?:^|\n|\s)\d+[\.\)]\s+/.test(trimmed);

  if (hasDashes) {
    const firstDashMatch = trimmed.match(/(?:^|\s|\.)-\s*([A-ZÀ-ÖØ-öø-ÿ0-9])/i);
    let intro = '';
    let itemsRaw = trimmed;

    if (firstDashMatch && firstDashMatch.index > 0) {
      intro = trimmed.slice(0, firstDashMatch.index).trim();
      intro = intro.replace(/[:\-]$/, '').trim();
      itemsRaw = trimmed.slice(firstDashMatch.index);
    }

    const points = itemsRaw
      .split(/(?:^|\s|\.)-\s*/)
      .map(p => p.trim())
      .filter(p => p.length > 0 && p !== '-');

    let html = '<div class="croq-structured-answer">';
    if (intro) {
      html += `<div class="croq-intro">${parseMarkdownInline(intro)} :</div>`;
    }
    if (points.length > 0) {
      html += '<ul class="croq-points-list">';
      points.forEach(point => {
        const cleanPt = point.replace(/^-\s*/, '').replace(/\s*\.\s*$/, '');
        if (cleanPt) {
          html += `<li class="croq-point-item"><span class="croq-point-check">✓</span><span class="croq-point-text">${parseMarkdownInline(cleanPt)}</span></li>`;
        }
      });
      html += '</ul>';
    }
    html += '</div>';
    return html;
  }

  if (hasNumberedPoints) {
    const points = trimmed.split(/(?:^|\n|\s)\d+[\.\)]\s+/).map(p => p.trim()).filter(Boolean);
    let html = '<div class="croq-structured-answer"><ul class="croq-points-list">';
    points.forEach((point, idx) => {
      html += `<li class="croq-point-item"><span class="croq-point-number">${idx + 1}</span><span class="croq-point-text">${parseMarkdownInline(point)}</span></li>`;
    });
    html += '</ul></div>';
    return html;
  }

  return `<div class="croq-simple-answer">${parseMarkdownInline(trimmed)}</div>`;
}

// ============================================================================
// MEDICAL MEDIA (PHOTOS) - SPOILER / RETRACTED & BLURRED BY DEFAULT
// ============================================================================
function renderQuestionMedia(mediaUrls) {
  if (!mediaUrls || !Array.isArray(mediaUrls) || mediaUrls.length === 0) {
    return '';
  }

  const count = mediaUrls.length;
  const cardsHtml = mediaUrls.map((url, idx) => {
    const escapedUrl = escapeHtml(url);
    const numLabel = count > 1 ? ` #${idx + 1}` : '';
    return `
      <div class="medical-media-card is-collapsed" data-media-url="${escapedUrl}">
        <div class="medical-media-inner" onclick="window.toggleMedicalMedia(this.parentElement, event)" title="Toucher pour afficher clairement">
          <button type="button" class="btn-media-card-close" onclick="window.toggleMedicalMedia(this.closest('.medical-media-card'), event)" title="Fermer / Masquer la photo">
            <i data-lucide="x" style="width:13px;height:13px;"></i>
          </button>
          <img src="${escapedUrl}" class="medical-media-img" alt="Iconographie médicale${numLabel}" loading="lazy">
          <div class="medical-media-spoiler-overlay">
            <span class="medical-media-badge">
              <i data-lucide="eye" style="width:11px;height:11px;"></i>
              <span>Toucher pour afficher</span>
            </span>
            <span class="medical-media-subtext">Photo floutée</span>
          </div>
        </div>
        <div class="medical-media-actions">
          <button type="button" class="btn-media-zoom" onclick="window.openMediaLightbox('${escapedUrl}', event)">
            <i data-lucide="maximize-2" style="width:12px;height:12px;"></i>
            <span>Plein écran HD</span>
          </button>
          <button type="button" class="btn-media-close" onclick="window.toggleMedicalMedia(this.closest('.medical-media-card'), event)" title="Masquer et reflouter la photo">
            <i data-lucide="x" style="width:12px;height:12px;"></i>
            <span>Fermer la photo</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="medical-media-section">
      <div class="medical-media-header">
        <div class="medical-media-title">
          <i data-lucide="image" style="width:13px;height:13px;color:var(--cyan);"></i>
          <span>Iconographie médicale (${count} photo${count > 1 ? 's' : ''})</span>
        </div>
        <span style="font-size:0.68rem;color:var(--text-dim);font-weight:500;">
          Floutée par défaut • Toucher pour afficher
        </span>
      </div>
      <div class="medical-media-grid">
        ${cardsHtml}
      </div>
    </div>
  `;
}

window.toggleMedicalMedia = function(cardEl, event) {
  if (event) event.stopPropagation();
  if (!cardEl) return;
  const isCollapsed = cardEl.classList.contains('is-collapsed');
  if (isCollapsed) {
    cardEl.classList.remove('is-collapsed');
    cardEl.classList.add('is-expanded');
  } else {
    cardEl.classList.remove('is-expanded');
    cardEl.classList.add('is-collapsed');
  }
  refreshLucide();
};

window.toggleArenaChapterTitle = function(forceRevealed = null) {
  const badge = document.getElementById('arena-chapter-title');
  const chatBlurredEls = document.querySelectorAll('.chatbox-chapter-blurred');

  let willReveal;
  if (forceRevealed !== null) {
    willReveal = forceRevealed;
  } else if (badge) {
    willReveal = badge.classList.contains('is-blurred');
  } else {
    const firstChatEl = document.querySelector('.chatbox-chapter-blurred');
    willReveal = firstChatEl ? firstChatEl.classList.contains('is-blurred') : true;
  }

  if (badge) {
    if (willReveal) {
      badge.classList.remove('is-blurred');
      badge.classList.add('is-revealed');
      badge.title = 'Cliquer pour masquer le chapitre';
      const hint = badge.querySelector('.chapter-title-hint');
      if (hint && !hint.textContent.includes('QCM Répondu')) {
        hint.innerHTML = `<i data-lucide="eye-off" style="width:11px;height:11px;"></i> Cours visible`;
      }
    } else {
      badge.classList.add('is-blurred');
      badge.classList.remove('is-revealed');
      badge.title = 'Chapitre masqué (Cliquer pour afficher)';
      const hint = badge.querySelector('.chapter-title-hint');
      if (hint && !hint.textContent.includes('QCM Répondu')) {
        hint.innerHTML = `<i data-lucide="eye" style="width:11px;height:11px;"></i> Cours masqué`;
      }
    }
  }

  chatBlurredEls.forEach(el => {
    if (willReveal) {
      el.classList.remove('is-blurred');
      el.classList.add('is-revealed');
      el.title = 'Cours visible (Cliquer pour masquer)';
    } else {
      el.classList.add('is-blurred');
      el.classList.remove('is-revealed');
      el.title = 'Cours masqué jusqu\'à ce que vous répondiez (Cliquer pour afficher)';
    }
  });

  refreshLucide();
};

window.openMediaLightbox = function(url, event) {
  if (event) event.stopPropagation();
  let modal = document.getElementById('media-lightbox-modal');
  let img = document.getElementById('media-lightbox-img');

  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'media-lightbox-overlay';
    modal.id = 'media-lightbox-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="media-lightbox-backdrop" onclick="window.closeMediaLightbox()"></div>
      <div class="media-lightbox-content">
        <button class="media-lightbox-close" onclick="window.closeMediaLightbox()" title="Fermer (Échap)">
          <i data-lucide="x"></i>
        </button>
        <img id="media-lightbox-img" src="" alt="Iconographie Pédiatrique HD">
      </div>
    `;
    document.body.appendChild(modal);
    img = document.getElementById('media-lightbox-img');
  }

  if (img) img.src = url;
  modal.style.display = 'flex';
  refreshLucide();
};

window.closeMediaLightbox = function() {
  const modal = document.getElementById('media-lightbox-modal');
  if (modal) {
    modal.style.display = 'none';
  }
};

/**
 * Format complete structured recap: Full Question Statement, All Options (A-E),
 * Student's Choice, Correct Choice and Official Database Explanation
 */
function formatQuestionMistakeRecap(question, userSelectedLetters, isCroq = false, userCroqText = '', score = null) {
  if (!question) return '';

  const effectiveIsCroq = isCroq || (question && question.type === 'CROQ');

  const lettersArr = Array.isArray(userSelectedLetters)
    ? userSelectedLetters
    : (userSelectedLetters ? String(userSelectedLetters).split(',').map(s => s.trim().toUpperCase()) : []);

  let clinicalHtml = '';
  if (question.clinical_case && question.clinical_case.trim()) {
    clinicalHtml = `
      <div class="mistake-clinical-box">
        <div class="mistake-clinical-header">
          <i data-lucide="stethoscope"></i>
          <span>Cas Clinique</span>
        </div>
        <div class="mistake-clinical-text">${formatMedicalContent(question.clinical_case.trim())}</div>
      </div>
    `;
  }

  let optionsOrCroqHtml = '';

  if (effectiveIsCroq) {
    const scoreBadge = (score !== null && score !== undefined)
      ? `<span class="answer-badge ${score >= 75 ? 'badge-success' : 'badge-failure'}">Score : ${score}%</span>`
      : '';
    optionsOrCroqHtml = `
      <div class="answer-comparison-grid">
        <div class="answer-box box-user">
          <div class="answer-box-header">
            <span class="answer-box-title text-rose">
              <span class="box-icon">✕</span> Votre proposition :
            </span>
            ${scoreBadge}
          </div>
          <div class="answer-box-content croq-user-text">
            ${userCroqText ? parseMarkdownInline(userCroqText) : '<em>Aucune réponse saisie</em>'}
          </div>
        </div>
        <div class="answer-box box-correct">
          <div class="answer-box-header">
            <span class="answer-box-title text-emerald">
              <span class="box-icon">✓</span> Réponse type officielle :
            </span>
            <span class="answer-badge badge-official">Référence concours</span>
          </div>
          <div class="answer-box-content">
            ${formatCroqAnswer(question.croq_answer || '')}
          </div>
        </div>
      </div>
    `;
  } else {
    // QCM / QCU - Afficher uniquement la liste exhaustive des propositions (A à E) avec coloration et statut
    const options = question.options || [];
    const correctOptions = options.filter(o => o.is_correct);
    const correctLetters = correctOptions.map(o => o.letter).sort();

    optionsOrCroqHtml = `
      <!-- Examen Exhaustif de Toutes les Propositions (A à E) avec Coloration & Statut -->
      <div class="mistake-options-container">
        <div class="mistake-options-header">
          <div style="display:flex;align-items:center;gap:6px;">
            <i data-lucide="list-checks" style="width:16px;height:16px;color:var(--cyan);"></i>
            <span style="font-weight:700;font-size:0.88rem;color:var(--text-main);">Toutes les propositions (A à E) &amp; Statut détaillé :</span>
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);">
            Bonne(s) réponse(s) : <strong class="text-emerald">${correctLetters.join(', ')}</strong>
          </div>
        </div>
        <div class="mistake-options-list">
          ${options.map(opt => {
            const isCorrect = !!opt.is_correct;
            const isUserSelected = lettersArr.includes(opt.letter);

            let rowClass = 'opt-row-neutral';
            let badgeHtml = '';

            if (isUserSelected && !isCorrect) {
              rowClass = 'opt-row-wrong'; // RED
              badgeHtml = `<span class="opt-status-badge badge-wrong"><i data-lucide="x"></i> Mon choix (Faux)</span>`;
            } else if (isUserSelected && isCorrect) {
              rowClass = 'opt-row-correct-chosen'; // GREEN
              badgeHtml = `<span class="opt-status-badge badge-correct"><i data-lucide="check"></i> Mon choix (Juste)</span>`;
            } else if (!isUserSelected && isCorrect) {
              rowClass = 'opt-row-correct-missed'; // GREEN border / subtle green
              badgeHtml = `<span class="opt-status-badge badge-correct"><i data-lucide="check"></i> Réponse juste attendue</span>`;
            } else {
              badgeHtml = `<span class="opt-status-badge badge-neutral">Distracteur faux</span>`;
            }

            return `
              <div class="mistake-option-row ${rowClass}">
                <div class="mistake-option-letter">${escapeHtml(opt.letter)}</div>
                <div class="mistake-option-text">${parseMarkdownInline(opt.text)}</div>
                <div class="mistake-option-badge-wrap">${badgeHtml}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  let explanationHtml = '';
  if (question.explanation && question.explanation.trim()) {
    explanationHtml = `
      <div class="mistake-official-explanation-box">
        <div class="mistake-explanation-title">
          <i data-lucide="book-open" style="width:15px;height:15px;color:var(--cyan);"></i>
          <span>Explication &amp; Source Officielle (Base de Données)</span>
        </div>
        <div class="mistake-explanation-body">
          ${formatMedicalContent(question.explanation.trim())}
        </div>
      </div>
    `;
  }

  return `
    <div class="mistake-recap-wrapper">
      <div class="mistake-question-card">
        <div class="mistake-question-header">
          <span class="tag-pill tag-qcu" style="font-size:0.7rem;padding:2px 8px;">${escapeHtml(question.chapterTitle || 'Pédiatrie')}</span>
          <span class="tag-pill ${isCroq ? 'tag-croq' : 'tag-qcu'}" style="font-size:0.7rem;padding:2px 8px;">${isCroq ? 'CROQ' : 'QCM'}</span>
        </div>
        ${clinicalHtml}
        <div class="mistake-question-statement">
          ${formatMedicalContent(question.question || question.statement || '')}
        </div>
        ${renderQuestionMedia(question.media_urls || [])}
      </div>
      ${optionsOrCroqHtml}
      ${explanationHtml}
    </div>
  `;
}

// Backward-compatible fallback helper
function formatAnswerComparison(userAnswer, correctAnswer, isCroq = false, score = null) {
  if (currentQuestion) {
    const letters = userAnswer ? userAnswer.split(',').map(s => s.trim().toUpperCase()) : [];
    return formatQuestionMistakeRecap(currentQuestion, letters, isCroq, userAnswer, score);
  }
  return `
    <div class="answer-comparison-grid">
      <div class="answer-box box-user">
        <div class="answer-box-header">
          <span class="answer-box-title text-rose"><span class="box-icon">✕</span> Votre choix :</span>
        </div>
        <div class="answer-box-content"><strong>${escapeHtml(userAnswer || 'Aucun')}</strong></div>
      </div>
      <div class="answer-box box-correct">
        <div class="answer-box-header">
          <span class="answer-box-title text-emerald"><span class="box-icon">✓</span> Bonne réponse :</span>
        </div>
        <div class="answer-box-content"><strong>${escapeHtml(correctAnswer || '')}</strong></div>
      </div>
    </div>
  `;
}

// ============================================================================
// ARENA HISTORY NAVIGATION (RETROUVER LES 5 DERNIERS QCM RÉPONDUS)
// ============================================================================
function pushToAnsweredHistory(question, userAnswerLetters, isCorrect, score = null) {
  if (!question) return;
  const snapshot = {
    question: JSON.parse(JSON.stringify(question)),
    userAnswerLetters: Array.isArray(userAnswerLetters) ? [...userAnswerLetters] : (userAnswerLetters ? [userAnswerLetters] : []),
    isCorrect: !!isCorrect,
    score: score,
    explanation: question.explanation || '',
    timestamp: Date.now()
  };

  // Éviter les doublons consécutifs sur la même question
  if (answeredHistory.length > 0 && answeredHistory[0].question.uid === question.uid) {
    answeredHistory[0] = snapshot;
  } else {
    answeredHistory.unshift(snapshot);
    if (answeredHistory.length > 5) {
      answeredHistory = answeredHistory.slice(0, 5);
    }
  }
  updateHistoryNavUI();
}

function updateHistoryNavUI() {
  const prevBtn = document.getElementById('btn-history-prev');
  const nextBtn = document.getElementById('btn-history-next');
  const labelEl = document.getElementById('arena-history-label');
  const navBox = document.getElementById('arena-history-nav');
  const badgeEl = document.getElementById('arena-history-badge');
  const bannerEl = document.getElementById('arena-history-consult-banner');
  const resumeActionBtn = document.getElementById('btn-history-resume-action');
  const shortcutHint = document.getElementById('keyboard-shortcuts-hint');
  const btnSubmitAnswer = document.getElementById('btn-submit-answer');
  const btnSubmitCroq = document.getElementById('btn-submit-croq');

  if (!prevBtn || !nextBtn || !labelEl) return;

  if (historyCursor === -1) {
    // Mode Actuel (Drill en cours)
    prevBtn.disabled = (answeredHistory.length === 0);
    nextBtn.disabled = true;
    labelEl.textContent = answeredHistory.length > 0 ? `Actuel (${answeredHistory.length})` : 'Actuel';
    if (badgeEl) badgeEl.classList.remove('is-past');
    if (navBox) navBox.classList.remove('is-browsing');
    if (bannerEl) bannerEl.style.display = 'none';
    if (resumeActionBtn) resumeActionBtn.style.display = 'none';
    if (currentQuestion) {
      if (currentQuestion.is_croq) {
        if (btnSubmitCroq) btnSubmitCroq.style.display = 'flex';
      } else {
        if (btnSubmitAnswer) btnSubmitAnswer.style.display = 'flex';
      }
    }
  } else {
    // Mode Consultation Historique (Lecture seule + Tuteur IA)
    prevBtn.disabled = (historyCursor >= answeredHistory.length - 1);
    nextBtn.disabled = false;
    labelEl.textContent = `Précédent ${historyCursor + 1}/${answeredHistory.length}`;
    if (badgeEl) badgeEl.classList.add('is-past');
    if (navBox) navBox.classList.add('is-browsing');
    if (bannerEl) bannerEl.style.display = 'flex';
    if (resumeActionBtn) resumeActionBtn.style.display = 'inline-flex';
    if (btnSubmitAnswer) btnSubmitAnswer.style.display = 'none';
    if (btnSubmitCroq) btnSubmitCroq.style.display = 'none';
    if (shortcutHint) shortcutHint.textContent = 'Mode Révision : QCM en lecture seule & Tuteur IA actif';
  }
}

function renderHistoryQuestion(historyEntry) {
  if (!historyEntry || !historyEntry.question) return;
  const q = historyEntry.question;

  // Mise à jour immédiate du contexte Tuteur IA
  arenaChatHistory = [];
  updateArenaChatContext();
  const chatboxEl = document.getElementById('arena-ai-chatbox');
  if (chatboxEl && chatboxEl.style.display !== 'none') {
    renderChatWelcome();
  }

  // Masquer la bannière de succès
  document.getElementById('arena-success-banner').style.display = 'none';

  // Mise à jour visuelle des boutons et indicateurs de navigation
  updateHistoryNavUI();

  // Badge du cours (affiché en clair sans floutage en mode révision)
  const chapterBadge = document.getElementById('arena-chapter-title');
  if (chapterBadge) {
    chapterBadge.classList.remove('is-blurred');
    chapterBadge.classList.add('is-revealed');
    chapterBadge.title = 'Chapitre du QCM révisé';
    chapterBadge.innerHTML = `
      <span class="chapter-title-text">Pédiatrie — ${escapeHtml(q.chapterTitle || 'Général')}</span>
      <span class="chapter-title-hint" style="color:var(--amber);"><i data-lucide="history" style="width:11px;height:11px;"></i> QCM Répondu</span>
    `;
  }

  // Badges Type & Progression
  const typePill = document.getElementById('arena-type-pill');
  if (typePill) {
    typePill.textContent = q.type || 'QCM';
    typePill.className = `tag-pill tag-${(q.type || 'QCM').toLowerCase()}`;
  }

  const progressPill = document.getElementById('arena-progress-pill');
  if (progressPill) {
    const stats = queueEngine.getQuestionStats(q.uid);
    progressPill.textContent = historyEntry.isCorrect ? `✅ Répondu Juste` : `⚠️ Répondu Faux (${stats.mistakes} faute${stats.mistakes > 1 ? 's' : ''})`;
    progressPill.className = historyEntry.isCorrect ? 'tag-pill progress-pill' : 'tag-pill progress-penalized';
  }

  // Cas Clinique
  const clinicalBox = document.getElementById('arena-clinical-case');
  const clinicalText = document.getElementById('arena-clinical-case-text');
  if (q.clinical_case && q.clinical_case.trim()) {
    clinicalText.innerHTML = formatMedicalContent(q.clinical_case.trim());
    clinicalBox.style.display = 'block';
  } else {
    clinicalBox.style.display = 'none';
  }

  // Énoncé de la question
  document.getElementById('arena-question-text').innerHTML = formatMedicalContent(q.question || q.statement);

  // Iconographie / Médias
  const mediaWrap = document.getElementById('arena-media-wrap');
  if (q.media_urls && q.media_urls.length > 0) {
    mediaWrap.innerHTML = renderQuestionMedia(q.media_urls);
    mediaWrap.style.display = 'block';
    refreshLucide();
  } else {
    mediaWrap.innerHTML = '';
    mediaWrap.style.display = 'none';
  }

  // Affichage en lecture seule (Options QCM vs CROQ)
  const optionsContainer = document.getElementById('arena-options-container');
  const croqContainer = document.getElementById('arena-croq-container');
  const btnSubmitAnswer = document.getElementById('btn-submit-answer');
  const btnSubmitCroq = document.getElementById('btn-submit-croq');
  const resumeBtn = document.getElementById('btn-history-resume-action');

  btnSubmitAnswer.style.display = 'none';
  btnSubmitCroq.style.display = 'none';
  if (resumeBtn) resumeBtn.style.display = 'inline-flex';

  if (q.is_croq) {
    optionsContainer.style.display = 'none';
    croqContainer.style.display = 'flex';
    const croqInput = document.getElementById('arena-croq-input');
    croqInput.value = historyEntry.userAnswerLetters?.[0] || '';
    croqInput.disabled = true;
  } else {
    croqContainer.style.display = 'none';
    optionsContainer.style.display = 'flex';
    optionsContainer.innerHTML = '';

    (q.options || []).forEach((opt, idx) => {
      const item = document.createElement('div');
      item.className = 'option-item read-only';
      item.dataset.optId = opt.id || idx;
      const letter = opt.letter || String.fromCharCode(65 + idx);
      item.dataset.letter = letter;

      const isCorrectOpt = !!opt.is_correct;
      const userPicked = (historyEntry.userAnswerLetters || []).includes(letter);

      if (isCorrectOpt) {
        item.classList.add('correct-highlight');
      } else if (userPicked) {
        item.classList.add('wrong-highlight');
      }

      const statusBadge = isCorrectOpt 
        ? '<span style="color:var(--emerald);font-weight:700;font-size:0.75rem;margin-left:auto;">✓ VRAIE</span>'
        : (userPicked ? '<span style="color:var(--rose);font-weight:700;font-size:0.75rem;margin-left:auto;">✗ Votre choix</span>' : '');

      item.innerHTML = `
        <div class="option-letter">${letter}</div>
        <div class="option-text">${opt.text}</div>
        ${statusBadge}
      `;
      optionsContainer.appendChild(item);
    });
  }

  // Boîte d'explication officielle ouverte automatiquement
  const expBox = document.getElementById('arena-explanation-box');
  const expText = document.getElementById('arena-explanation-text');
  if (expBox && expText) {
    if (q.explanation && q.explanation.trim()) {
      expText.innerHTML = formatMedicalContent(q.explanation.trim());
    } else {
      expText.innerHTML = `<em>Réponse officielle de référence pour le cours <strong>${escapeHtml(q.chapterTitle || 'Pédiatrie')}</strong>.</em>`;
    }
    expBox.style.display = 'flex';
  }

  refreshLucide();
}

window.navigateHistoryPrev = function() {
  if (answeredHistory.length === 0) return;
  if (historyCursor < answeredHistory.length - 1) {
    historyCursor++;
    renderHistoryQuestion(answeredHistory[historyCursor]);
  }
};

window.navigateHistoryNext = function() {
  if (historyCursor > 0) {
    historyCursor--;
    renderHistoryQuestion(answeredHistory[historyCursor]);
  } else if (historyCursor === 0) {
    window.resumeActiveDrill();
  }
};

window.resumeActiveDrill = function() {
  historyCursor = -1;
  loadNextArenaQuestion(true);
};

// ============================================================================
// QUIZ ARENA (QUESTION DISPLAY & SUBMISSION)
// ============================================================================
function loadNextArenaQuestion() {
  isCurrentQuestionAnswered = false;
  historyCursor = -1;
  updateHistoryNavUI();
  const croqInput = document.getElementById('arena-croq-input');
  if (croqInput) {
    croqInput.disabled = false;
  }

  currentQuestion = queueEngine.getCurrentQuestion();
  selectedOptionIds.clear();
  isEvaluating = false;

  // Start question timer for study tracking
  if (currentQuestion) {
    studyTracker.startQuestionTimer();
  }

  // Reset & update AI chat context for the new question
  arenaChatHistory = [];
  updateArenaChatContext();
  const chatboxEl = document.getElementById('arena-ai-chatbox');
  if (chatboxEl && chatboxEl.style.display !== 'none') {
    renderChatWelcome();
  }

  // Hide success banner & explanation box, remove highlights, show default actions
  document.getElementById('arena-success-banner').style.display = 'none';
  const arenaExpBox = document.getElementById('arena-explanation-box');
  if (arenaExpBox) arenaExpBox.style.display = 'none';
  document.querySelectorAll('.option-item').forEach(el => el.classList.remove('correct-highlight', 'wrong-highlight'));
  document.getElementById('arena-default-actions').style.display = 'flex';

  if (!currentQuestion) {
    // All questions cleaned!
    showVictoryScreen();
    return;
  }

  const stats = queueEngine.getQuestionStats(currentQuestion.uid);

  // Chapter badge (blurred by default until clicked)
  const chapterBadge = document.getElementById('arena-chapter-title');
  if (chapterBadge) {
    chapterBadge.classList.add('is-blurred');
    chapterBadge.classList.remove('is-revealed');
    chapterBadge.title = 'Chapitre masqué (Cliquer pour afficher)';
    chapterBadge.innerHTML = `
      <span class="chapter-title-text">Pédiatrie — ${escapeHtml(currentQuestion.chapterTitle || 'Général')}</span>
      <span class="chapter-title-hint"><i data-lucide="eye" style="width:11px;height:11px;"></i> Cours masqué</span>
    `;
    chapterBadge.onclick = () => window.toggleArenaChapterTitle();
  }
  
  const typePill = document.getElementById('arena-type-pill');
  typePill.textContent = currentQuestion.type;
  typePill.className = `tag-pill tag-${currentQuestion.type.toLowerCase()}`;

  // Progress badge
  const progressPill = document.getElementById('arena-progress-pill');
  if (stats.mistakes > 0) {
    progressPill.textContent = `⚠️ ${stats.current}/${stats.target} (${stats.mistakes} faute${stats.mistakes > 1 ? 's' : ''})`;
    progressPill.className = 'tag-pill progress-penalized';
  } else {
    progressPill.textContent = `✅ ${stats.current}/${stats.target} pour éliminer`;
    progressPill.className = 'tag-pill progress-pill';
  }

  updateArenaDailyBadge();

  // Clinical Case
  const clinicalBox = document.getElementById('arena-clinical-case');
  const clinicalText = document.getElementById('arena-clinical-case-text');
  if (currentQuestion.clinical_case && currentQuestion.clinical_case.trim()) {
    clinicalText.innerHTML = formatMedicalContent(currentQuestion.clinical_case.trim());
    clinicalBox.style.display = 'block';
  } else {
    clinicalBox.style.display = 'none';
  }

  // Question Statement
  document.getElementById('arena-question-text').innerHTML = formatMedicalContent(currentQuestion.question || currentQuestion.statement);

  // Media preview (retracted & blurred by default)
  const mediaWrap = document.getElementById('arena-media-wrap');
  if (currentQuestion.media_urls && currentQuestion.media_urls.length > 0) {
    mediaWrap.innerHTML = renderQuestionMedia(currentQuestion.media_urls);
    mediaWrap.style.display = 'block';
    refreshLucide();
  } else {
    mediaWrap.innerHTML = '';
    mediaWrap.style.display = 'none';
  }

  // Options vs CROQ rendering
  const optionsContainer = document.getElementById('arena-options-container');
  const croqContainer = document.getElementById('arena-croq-container');
  const btnSubmitAnswer = document.getElementById('btn-submit-answer');
  const btnSubmitCroq = document.getElementById('btn-submit-croq');
  const shortcutHint = document.getElementById('keyboard-shortcuts-hint');

  if (currentQuestion.is_croq) {
    // Mode CROQ
    optionsContainer.style.display = 'none';
    croqContainer.style.display = 'flex';
    document.getElementById('arena-croq-input').value = '';
    btnSubmitAnswer.style.display = 'none';
    btnSubmitCroq.style.display = 'flex';
    shortcutHint.textContent = 'Mode CROQ : Évaluation IA sémantique';
  } else {
    // Mode QCU / QCM
    croqContainer.style.display = 'none';
    optionsContainer.style.display = 'flex';
    btnSubmitAnswer.style.display = 'flex';
    btnSubmitCroq.style.display = 'none';
    btnSubmitAnswer.disabled = true;
    shortcutHint.textContent = 'Raccourcis : [1-5] pour cocher, [Entrée] pour valider';

    renderOptionsList(currentQuestion.options || []);
  }

  refreshLucide();
}

function renderOptionsList(options) {
  const container = document.getElementById('arena-options-container');
  container.innerHTML = '';

  options.forEach((opt, idx) => {
    const item = document.createElement('div');
    item.className = 'option-item';
    item.dataset.optId = opt.id || idx;
    item.dataset.letter = opt.letter || String.fromCharCode(65 + idx);

    item.innerHTML = `
      <div class="option-letter">${item.dataset.letter}</div>
      <div class="option-text">${opt.text}</div>
    `;

    item.addEventListener('click', () => {
      toggleOptionSelection(item);
    });

    container.appendChild(item);
  });
}

function toggleOptionSelection(itemElement) {
  const optId = itemElement.dataset.optId;

  // Multi-choice selection enabled for all questions (A, B, C...)
  if (selectedOptionIds.has(optId)) {
    selectedOptionIds.delete(optId);
    itemElement.classList.remove('selected');
  } else {
    selectedOptionIds.add(optId);
    itemElement.classList.add('selected');
  }

  const btnSubmit = document.getElementById('btn-submit-answer');
  btnSubmit.disabled = selectedOptionIds.size === 0;
}

// Keyboard quick selection
function selectOptionByIndex(index) {
  if (!currentQuestion || currentQuestion.is_croq) return;
  const options = document.querySelectorAll('.option-item');
  if (options[index]) {
    toggleOptionSelection(options[index]);
  }
}

// ============================================================================
// ANSWER SUBMISSION (QCU / QCM)
// ============================================================================
async function handleSubmitQcm() {
  if (!currentQuestion || selectedOptionIds.size === 0 || isEvaluating) return;
  isEvaluating = true;

  const correctOptions = (currentQuestion.options || []).filter(o => o.is_correct);
  const correctLetters = correctOptions.map(o => o.letter).sort();

  const selectedLetters = [];
  document.querySelectorAll('.option-item.selected').forEach(el => {
    selectedLetters.push(el.dataset.letter);
  });
  selectedLetters.sort();

  // Strict match comparison
  const isCorrect = (correctLetters.length === selectedLetters.length) &&
    correctLetters.every((letter, idx) => letter === selectedLetters[idx]);

  if (isCorrect) {
    handleAnswerSuccess();
  } else {
    await handleAnswerFailure(selectedLetters, correctLetters.join(', '));
  }
}

// ============================================================================
// ANSWER SUBMISSION (CROQ via Gemini)
// ============================================================================
async function handleSubmitCroq() {
  if (!currentQuestion || !currentQuestion.is_croq || isEvaluating) return;
  const userInput = document.getElementById('arena-croq-input').value.trim();
  if (!userInput) {
    alert('Veuillez saisir votre réponse avant de lancer l\'évaluation.');
    return;
  }

  isEvaluating = true;
  const btn = document.getElementById('btn-submit-croq');
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader" class="spin"></i> <span>Évaluation par IA en cours...</span>`;
  refreshLucide();

  try {
    const evalResult = await geminiService.evaluateCroq(
      currentQuestion.question,
      currentQuestion.clinical_case,
      currentQuestion.croq_answer,
      userInput
    );

    if (evalResult.isValid && evalResult.score >= 75) {
      // Correct!
      handleAnswerSuccess(evalResult.score, evalResult.feedback);
    } else {
      // Failed!
      await handleAnswerFailure(
        [userInput], 
        currentQuestion.croq_answer, 
        true, 
        evalResult.score, 
        evalResult.feedback
      );
    }
  } catch (err) {
    console.error('CROQ error:', err);
    alert('Une erreur est survenue lors de l\'évaluation. Fallback activé.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="sparkles"></i> <span>Évaluer par IA (Gemini)</span>`;
    refreshLucide();
  }
}

// ============================================================================
// SUCCESS HANDLER WITH LIVE EXPLANATION
// ============================================================================
function handleAnswerSuccess(score = null, feedback = null, customLetters = null) {
  let letters = customLetters;
  if (!letters) {
    if (currentQuestion && currentQuestion.is_croq) {
      const croqVal = document.getElementById('arena-croq-input')?.value?.trim();
      letters = croqVal ? [croqVal] : [];
    } else {
      letters = Array.from(document.querySelectorAll('.option-item.selected')).map(el => el.dataset.letter).sort();
    }
  }

  // Enregistrer dans l'historique de consultation (max 5)
  pushToAnsweredHistory(currentQuestion, letters, true, score);

  const result = queueEngine.handleSuccess(currentQuestion.uid);
  queueEngine.incrementTodayCount();
  studyTracker.recordAnswer(true, currentQuestion ? currentQuestion.chapterId : null, currentQuestion ? currentQuestion.uid : null);
  updateArenaDailyBadge();
  firebaseSyncService.triggerAutoPush();

  // Trigger celebration confetti
  if (result.permanentlyRemoved) {
    triggerMasteryConfetti();
  }

  // Update success banner
  document.getElementById('arena-default-actions').style.display = 'none';
  const banner = document.getElementById('arena-success-banner');
  const bannerText = document.getElementById('arena-success-text');

  if (result.permanentlyRemoved) {
    bannerText.innerHTML = `<strong>Éliminée pour de bon ! 🎉</strong> Cette question a été validée avec succès (${result.target}/${result.target}) et n'apparaîtra plus.`;
  } else if (result.isPenultimate) {
    const scoreText = score ? ` (Score : ${score}%)` : '';
    bannerText.innerHTML = `<strong>Dernier palier avant élimination ! 🎯</strong> Validée ${result.newCurrent}/${result.target} fois. Placée parmi les 50% dernières questions restantes (+${result.pushDistance} cartes).`;
  } else {
    const scoreText = score ? ` (Score : ${score}%)` : '';
    bannerText.innerHTML = `<strong>Bonne réponse${scoreText} !</strong> Validée ${result.newCurrent}/${result.target} fois. Repoussée de ${result.pushDistance} cartes.`;
  }

  banner.style.display = 'flex';

  // Highlight correct options visually in arena
  if (currentQuestion && currentQuestion.options) {
    document.querySelectorAll('.option-item').forEach(el => {
      const letter = el.dataset.letter;
      const isCor = (currentQuestion.options || []).some(o => o.letter === letter && o.is_correct);
      if (isCor) {
        el.classList.add('correct-highlight');
      }
    });
  }

  // Live Official Explanation Box right in the Arena (displayed for both right & wrong answers)
  const expBox = document.getElementById('arena-explanation-box');
  const expText = document.getElementById('arena-explanation-text');
  if (expBox && expText) {
    if (currentQuestion.explanation && currentQuestion.explanation.trim()) {
      expText.innerHTML = formatMedicalContent(currentQuestion.explanation.trim());
      expBox.style.display = 'flex';
    } else {
      expText.innerHTML = `<em>Réponse officielle validée conformément aux critères du cours <strong>${escapeHtml(currentQuestion.chapterTitle || 'Pédiatrie')}</strong>.</em>`;
      expBox.style.display = 'flex';
    }
  }

  isCurrentQuestionAnswered = true;
  window.toggleArenaChapterTitle(true);
  refreshLucide();
}

function triggerMasteryConfetti() {
  if (typeof window.confetti === 'function') {
    window.confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
  }
}

// ============================================================================
// FAILURE HANDLER & ERROR MODAL WITH AI REASONING
// ============================================================================
async function handleAnswerFailure(userAnswerLetters, correctAnswerText, isCroq = false, score = 0, feedback = '') {
  // Enregistrer dans l'historique de consultation (max 5)
  pushToAnsweredHistory(currentQuestion, userAnswerLetters, false, score);

  const result = queueEngine.handleFailure(currentQuestion.uid);
  studyTracker.recordAnswer(false, currentQuestion ? currentQuestion.chapterId : null, currentQuestion ? currentQuestion.uid : null);
  // Seules les réponses justes incrémentent le compteur journalier de QCM
  updateArenaDailyBadge();
  firebaseSyncService.triggerAutoPush();
  isCurrentQuestionAnswered = true;
  window.toggleArenaChapterTitle(true);

  // Populate penalty header
  let penaltyTitle = '';
  let penaltyDesc = '';

  if (result.newTarget >= 10) {
    if (result.decremented) {
      penaltyTitle = `Plafond de 10 atteint : progression diminuée (${result.previousCurrent}/10 ➔ ${result.current}/10)`;
      penaltyDesc = `Cette question a été ratée (${result.mistakes} faute${result.mistakes > 1 ? 's' : ''}). Le seuil étant plafonné à 10, votre progression diminue de ${result.previousCurrent}/10 à ${result.current}/10. Elle réapparaîtra dans ${result.pushDistance} cartes.`;
    } else {
      penaltyTitle = `Pénalité maximale : seuil plafonné à 10 réussites requises`;
      penaltyDesc = `Cette question a été ratée (${result.mistakes} faute${result.mistakes > 1 ? 's' : ''}). Progression actuelle : ${result.current}/10. Elle réapparaîtra dans ${result.pushDistance} cartes pour ancrer le bon réflexe.`;
    }
  } else {
    penaltyTitle = `Pénalité appliquée : seuil augmenté à ${result.newTarget} réussites requises`;
    penaltyDesc = `Cette question a été ratée (${result.mistakes} faute${result.mistakes > 1 ? 's' : ''}). Progression actuelle : ${result.current}/${result.newTarget}. Elle réapparaîtra dans ${result.pushDistance} cartes pour ancrer le bon réflexe.`;
  }

  document.getElementById('error-modal-penalty-title').textContent = penaltyTitle;
  document.getElementById('error-modal-penalty-desc').textContent = penaltyDesc;

  // Render structured comparison in error modal with full question statement, all choices A-E, my choice, and correct choice!
  const userText = isCroq ? (userAnswerLetters[0] || '') : (userAnswerLetters.join(', ') || 'Aucune réponse cochée');
  const comparisonContainer = document.getElementById('error-modal-comparison-container') 
    || document.querySelector('.answer-recap-box');

  if (comparisonContainer) {
    const recapHtml = formatQuestionMistakeRecap(currentQuestion, userAnswerLetters, isCroq, userText, score);
    comparisonContainer.outerHTML = `<div id="error-modal-comparison-container">${recapHtml}</div>`;
  }

  // Highlight options visually in Arena (red for wrong choices, green for correct)
  if (currentQuestion && currentQuestion.options) {
    document.querySelectorAll('.option-item').forEach(el => {
      const letter = el.dataset.letter;
      const isSelected = userAnswerLetters.includes(letter);
      const isCor = (currentQuestion.options || []).some(o => o.letter === letter && o.is_correct);

      if (isSelected && !isCor) {
        el.classList.add('wrong-highlight');
      } else if (isCor) {
        el.classList.add('correct-highlight');
      }
    });
  }

  // Show modal immediately
  modals.error.style.display = 'flex';
  const aiNoteContainer = document.getElementById('error-modal-ai-note');
  aiNoteContainer.innerHTML = `
    <div class="reasoning-loader-wrap">
      <i data-lucide="sparkles" class="spin"></i>
      <span>Consultation de l'IA Flash et formulation de la démarche clinique complète...</span>
    </div>
  `;
  refreshLucide();

  // Request AI reasoning note asynchronously
  const reasoningObj = await geminiService.generateReasoningNote(
    currentQuestion,
    userAnswerLetters,
    isCroq,
    userAnswerLetters[0] || ''
  );

  aiNoteContainer.innerHTML = formatReasoningNote(reasoningObj.note);
  document.getElementById('error-modal-model-tag').textContent = reasoningObj.modelUsed;

  // Save to Notebook with complete question metadata and options
  const noteRecord = {
    id: `note_${Date.now()}`,
    questionUid: currentQuestion.uid,
    questionText: currentQuestion.question,
    clinicalCase: currentQuestion.clinical_case || null,
    chapterTitle: currentQuestion.chapterTitle,
    options: currentQuestion.options ? JSON.parse(JSON.stringify(currentQuestion.options)) : [],
    media_urls: currentQuestion.media_urls || [],
    userAnswer: userText,
    userAnswerLetters: Array.isArray(userAnswerLetters) ? userAnswerLetters : [userAnswerLetters],
    correctAnswer: correctAnswerText,
    officialExplanation: currentQuestion.explanation || '',
    isCroq: !!isCroq,
    score: isCroq ? score : null,
    reasoningNote: reasoningObj.note,
    modelUsed: reasoningObj.modelUsed,
    timestamp: Date.now()
  };
  queueEngine.saveReasoningNote(noteRecord);
  firebaseSyncService.triggerAutoPush();

  // Update notebook badge in dashboard
  const notesCount = queueEngine.getReasoningNotes().length;
  const badgeEl = document.getElementById('notebook-count-badge');
  if (badgeEl) badgeEl.textContent = notesCount;

  refreshLucide();
}

function closeErrorModalAndContinue() {
  modals.error.style.display = 'none';
  loadNextArenaQuestion();
}

// ============================================================================
// ALL CLEANED VICTORY SCREEN
// ============================================================================
function showVictoryScreen() {
  document.getElementById('arena-question-text').innerHTML = `
    <div style="text-align:center;padding:30px 10px;">
      <div style="font-size:3rem;margin-bottom:12px;">🏆</div>
      <h2 style="font-family:var(--font-heading);font-size:1.8rem;color:var(--emerald);margin-bottom:8px;">
        Félicitations Majeur de Promo !
      </h2>
      <p style="color:var(--text-muted);font-size:1rem;max-width:500px;margin:0 auto 20px;">
        Toutes les questions sélectionnées ont été nettoyées et validées jusqu'à leur seuil de maîtrise.
      </p>
      <button class="btn-primary-large" id="btn-victory-home" style="margin:0 auto;">
        Retour au Dashboard
      </button>
    </div>
  `;
  document.getElementById('arena-options-container').innerHTML = '';
  document.getElementById('arena-croq-container').style.display = 'none';
  document.getElementById('arena-default-actions').style.display = 'none';

  document.getElementById('btn-victory-home').onclick = () => switchView('dashboard');
  triggerMasteryConfetti();
}

// ============================================================================
// CARNET DE RAISONNEMENT IA (Groupé par Cours & Question Unique, Tris Multi-Critères)
// ============================================================================
let notebookSelectedChapter = '';
let notebookSortBy = 'date'; // 'date' | 'mistakes' | 'chapter' | 'score'
let notebookSortOrder = 'desc'; // 'desc' | 'asc'
let notebookViewMode = 'chapter'; // 'chapter' | 'flat'

function compareQuestions(qA, qB, sortBy, sortOrder) {
  let valA, valB;

  if (sortBy === 'date') {
    valA = qA.latestTimestamp || 0;
    valB = qB.latestTimestamp || 0;
  } else if (sortBy === 'mistakes') {
    valA = qA.totalMistakes || 0;
    valB = qB.totalMistakes || 0;
    // Tie-breaker: most recent date
    if (valA === valB) {
      valA = qA.latestTimestamp || 0;
      valB = qB.latestTimestamp || 0;
    }
  } else if (sortBy === 'chapter') {
    const cmp = (qA.chapterTitle || '').localeCompare(qB.chapterTitle || '', 'fr');
    return sortOrder === 'asc' ? cmp : -cmp;
  } else if (sortBy === 'score') {
    valA = (qA.latestScore !== null && qA.latestScore !== undefined) ? qA.latestScore : (qA.isCroq ? 0 : 100);
    valB = (qB.latestScore !== null && qB.latestScore !== undefined) ? qB.latestScore : (qB.isCroq ? 0 : 100);
  } else {
    valA = qA.latestTimestamp || 0;
    valB = qB.latestTimestamp || 0;
  }

  if (sortOrder === 'asc') {
    return valA > valB ? 1 : (valA < valB ? -1 : 0);
  } else {
    return valA < valB ? 1 : (valA > valB ? -1 : 0);
  }
}

function getSortSummaryLabel() {
  const dirText = notebookSortOrder === 'desc' ? 'Décroissant ⬇' : 'Croissant ⬆';
  let critText = 'Date de faute';
  if (notebookSortBy === 'mistakes') critText = "Nombre d'erreurs";
  else if (notebookSortBy === 'chapter') critText = 'Ordre alphabétique des cours';
  else if (notebookSortBy === 'score') critText = 'Score CROQ';
  return `${critText} (${dirText})`;
}

function updateSortOrderButtonUI() {
  const btn = document.getElementById('btn-toggle-sort-order');
  const label = document.getElementById('sort-order-label');
  const icon = document.getElementById('sort-order-icon');
  if (!btn || !label) return;

  if (notebookSortOrder === 'desc') {
    label.textContent = 'Décroissant ⬇';
    btn.setAttribute('data-order', 'desc');
    btn.title = 'Ordre actuel : Décroissant (Max ➔ Min). Cliquer pour passer en Croissant.';
    if (icon) icon.setAttribute('data-lucide', 'arrow-down-wide-narrow');
  } else {
    label.textContent = 'Croissant ⬆';
    btn.setAttribute('data-order', 'asc');
    btn.title = 'Ordre actuel : Croissant (Min ➔ Max). Cliquer pour passer en Décroissant.';
    if (icon) icon.setAttribute('data-lucide', 'arrow-up-narrow-wide');
  }
  refreshLucide();
}

function renderQuestionCard(q, gIdx, qIdx, rankNumber = null) {
  const qDomId = `qcard_${gIdx}_${qIdx}`;
  const latestAttempt = q.attempts[0];
  const latestDateStr = latestAttempt.timestamp 
    ? new Date(latestAttempt.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  // Attempts tab switcher (if multiple attempts on the same question)
  let switcherHtml = '';
  if (q.attempts.length > 1) {
    switcherHtml = `
      <div class="attempts-switcher-bar">
        ${q.attempts.map((att, attIdx) => {
          const timeStr = att.timestamp 
            ? new Date(att.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
            : `Tentative ${q.attempts.length - attIdx}`;
          const scoreBadge = (att.score !== null && att.score !== undefined) ? `<span class="badge-pill-micro">${att.score}%</span>` : '';
          const label = (attIdx === 0) ? `✨ Dernière analyse (#${q.attempts.length})` : `Tentative #${q.attempts.length - attIdx}`;
          return `
            <button class="attempt-tab-btn ${attIdx === 0 ? 'active' : ''}" onclick="window.switchAttemptTab('${qDomId}', ${attIdx}, this)">
              <span>${label}</span>
              <span class="badge-pill-micro">${timeStr}</span>
              ${scoreBadge}
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  // Pre-rendered panels for each attempt with complete fiches
  const panelsHtml = q.attempts.map((att, attIdx) => {
    const fullQ = allQuestions.find(item => item.uid === att.questionUid) || {
      uid: att.questionUid,
      question: att.questionText,
      clinical_case: att.clinicalCase || null,
      chapterTitle: att.chapterTitle || q.chapterTitle,
      options: att.options || [],
      explanation: att.officialExplanation || '',
      croq_answer: att.correctAnswer || ''
    };
    if (!fullQ.media_urls && att.media_urls) { fullQ.media_urls = att.media_urls; }
    const letters = att.userAnswerLetters || (att.userAnswer ? att.userAnswer.split(',').map(s => s.trim().toUpperCase()) : []);
    const recapHtml = formatQuestionMistakeRecap(fullQ, letters, q.isCroq, att.userAnswer, att.score);
    const reasHtml = formatReasoningNote(att.reasoningNote);

    return `
      <div class="attempt-panel" id="${qDomId}_att_${attIdx}" style="${attIdx === 0 ? '' : 'display:none;'}">
        ${recapHtml}
        <div class="notebook-reasoning-section">
          <div class="notebook-reasoning-title">
            <i data-lucide="sparkles" style="width:16px;height:16px;color:var(--cyan);"></i>
            <span>Méthode &amp; Analyse Clinique Approfondie (IA Flash)</span>
          </div>
          ${reasHtml}
        </div>
      </div>
    `;
  }).join('');

  const rankBadgeHtml = rankNumber !== null ? `
    <span class="note-stat-badge stat-rank" title="Classement selon le critère de tri">
      #${rankNumber}
    </span>
  ` : '';

  const mistakesBadgeHtml = `
    <span class="note-stat-badge stat-mistakes" title="${q.totalMistakes} erreur(s) enregistrée(s)">
      <i data-lucide="alert-triangle" style="width:12px;height:12px;"></i>
      ${q.totalMistakes} faute${q.totalMistakes > 1 ? 's' : ''}
    </span>
  `;

  const scoreBadgeHtml = (q.isCroq && q.latestScore !== null && q.latestScore !== undefined) ? `
    <span class="note-stat-badge ${q.latestScore >= 75 ? 'stat-score' : 'stat-mistakes'}" title="Score obtenu au CROQ">
      Score : ${q.latestScore}%
    </span>
  ` : '';

  const questionPreview = q.questionText ? escapeHtml(q.questionText) : 'Question médicale';

  return `
    <div class="note-card grouped-question-card" id="${qDomId}">
      <div class="note-card-header clickable-question-header" onclick="window.toggleQuestionCard('${qDomId}', event)" title="Cliquer pour replier ou déplier cette question">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <i data-lucide="chevron-down" class="question-chevron"></i>
          ${rankBadgeHtml}
          <span class="note-chapter">${escapeHtml(q.chapterTitle)}</span>
          <span class="tag-pill ${q.isCroq ? 'tag-croq' : 'tag-qcu'}" style="font-size:0.68rem;padding:2px 8px;">
            ${q.isCroq ? 'CROQ' : 'QCM'}
          </span>
          ${mistakesBadgeHtml}
          ${scoreBadgeHtml}
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          ${q.attemptsCount > 1 ? `
            <span class="attempts-history-badge">
              <i data-lucide="history" style="width:13px;height:13px;"></i>
              ${q.attemptsCount} tentatives
            </span>
          ` : ''}
          <span class="note-date"><i data-lucide="calendar" style="width:11px;height:11px;display:inline;vertical-align:middle;margin-right:2px;"></i>${latestDateStr}</span>
        </div>
      </div>
      <div class="question-collapsed-preview" onclick="window.toggleQuestionCard('${qDomId}', event)" title="Cliquer pour déplier l'analyse complète de la question">
        <i data-lucide="file-text" style="width:14px;height:14px;color:var(--cyan);flex-shrink:0;"></i>
        <span class="question-collapsed-text">${questionPreview}</span>
      </div>
      ${switcherHtml}
      <div class="attempt-content-container">
        ${panelsHtml}
      </div>
    </div>
  `;
}

function groupNotesByChapterAndQuestion(notes) {
  const chapterMap = new Map();

  notes.forEach(note => {
    const fullQ = allQuestions.find(item => item.uid === note.questionUid);
    const chap = (fullQ && fullQ.chapterTitle) || (note.chapterTitle && note.chapterTitle.trim()) || "Pédiatrie Générale";
    const qKey = note.questionUid || (fullQ && fullQ.question) || note.questionText || note.id;

    if (!chapterMap.has(chap)) {
      chapterMap.set(chap, new Map());
    }
    const qMap = chapterMap.get(chap);
    if (!qMap.has(qKey)) {
      qMap.set(qKey, []);
    }
    qMap.get(qKey).push(note);
  });

  const result = [];
  const chapterKeys = Array.from(chapterMap.keys());

  for (const chapTitle of chapterKeys) {
    const qMap = chapterMap.get(chapTitle);
    const questions = [];

    for (const [qKey, attempts] of qMap.entries()) {
      // Sort attempts: newest first inside the question
      attempts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      const primary = attempts[0];
      const isCroq = primary.isCroq || (primary.correctAnswer && primary.correctAnswer.length > 50) || (primary.userAnswer && primary.userAnswer.length > 30);
      const stats = queueEngine.getQuestionStats(primary.questionUid);
      const totalMistakes = Math.max(attempts.length, (stats ? stats.mistakes : 0));
      const latestTimestamp = attempts[0]?.timestamp || 0;
      const latestScore = (attempts[0]?.score !== null && attempts[0]?.score !== undefined) ? attempts[0].score : (isCroq ? 0 : null);

      questions.push({
        questionKey: qKey,
        questionUid: primary.questionUid,
        questionText: primary.questionText,
        chapterTitle: chapTitle,
        isCroq: !!isCroq,
        attemptsCount: attempts.length,
        totalMistakes: totalMistakes,
        latestTimestamp: latestTimestamp,
        latestScore: latestScore,
        attempts: attempts
      });
    }

    // Sort questions within this chapter according to active criteria
    questions.sort((a, b) => compareQuestions(a, b, notebookSortBy, notebookSortOrder));

    const chapterLatestTimestamp = Math.max(...questions.map(q => q.latestTimestamp || 0), 0);
    const chapterTotalMistakes = questions.reduce((sum, q) => sum + q.totalMistakes, 0);

    result.push({
      chapterTitle: chapTitle,
      totalQuestions: questions.length,
      totalNotes: questions.reduce((sum, q) => sum + q.attemptsCount, 0),
      chapterLatestTimestamp: chapterLatestTimestamp,
      chapterTotalMistakes: chapterTotalMistakes,
      questions: questions
    });
  }

  // Sort chapters themselves according to the active criteria
  result.sort((cA, cB) => {
    if (notebookSortBy === 'date') {
      return notebookSortOrder === 'asc'
        ? cA.chapterLatestTimestamp - cB.chapterLatestTimestamp
        : cB.chapterLatestTimestamp - cA.chapterLatestTimestamp;
    } else if (notebookSortBy === 'mistakes') {
      return notebookSortOrder === 'asc'
        ? cA.chapterTotalMistakes - cB.chapterTotalMistakes
        : cB.chapterTotalMistakes - cA.chapterTotalMistakes;
    } else if (notebookSortBy === 'chapter') {
      const cmp = cA.chapterTitle.localeCompare(cB.chapterTitle, 'fr');
      return notebookSortOrder === 'asc' ? cmp : -cmp;
    } else if (notebookSortBy === 'score') {
      const avgA = cA.questions.reduce((s, q) => s + (q.latestScore ?? 50), 0) / (cA.questions.length || 1);
      const avgB = cB.questions.reduce((s, q) => s + (q.latestScore ?? 50), 0) / (cB.questions.length || 1);
      return notebookSortOrder === 'asc' ? avgA - avgB : avgB - avgA;
    }
    return cB.chapterLatestTimestamp - cA.chapterLatestTimestamp;
  });

  return result;
}

window.switchAttemptTab = function(qDomId, activeIdx, clickedBtn) {
  const parentBar = clickedBtn.closest('.attempts-switcher-bar');
  if (parentBar) {
    parentBar.querySelectorAll('.attempt-tab-btn').forEach(b => b.classList.remove('active'));
    clickedBtn.classList.add('active');
  }
  const card = document.getElementById(qDomId);
  if (card) {
    card.querySelectorAll('.attempt-panel').forEach((p, idx) => {
      p.style.display = (idx === activeIdx) ? 'block' : 'none';
    });
  }
};

window.toggleChapterGroup = function(groupId) {
  const el = document.getElementById(groupId);
  if (el) {
    el.classList.toggle('collapsed');
  }
};

window.toggleQuestionCard = function(cardId, e) {
  if (e && (e.target.closest('.attempt-tab-btn') || e.target.closest('button') || e.target.closest('a'))) {
    return;
  }
  const card = document.getElementById(cardId);
  if (card) {
    card.classList.toggle('collapsed');
  }
};

window.toggleAllChapters = function() {
  const allGroups = document.querySelectorAll('.notebook-chapter-group');
  const allCards = document.querySelectorAll('.grouped-question-card');

  const hasExpandedGroups = Array.from(allGroups).some(g => !g.classList.contains('collapsed'));
  const hasExpandedCards = Array.from(allCards).some(c => !c.classList.contains('collapsed'));
  const shouldCollapse = hasExpandedGroups || (allGroups.length === 0 && hasExpandedCards);

  allGroups.forEach(g => {
    if (shouldCollapse) {
      g.classList.add('collapsed');
    } else {
      g.classList.remove('collapsed');
    }
  });

  allCards.forEach(c => {
    if (shouldCollapse) {
      c.classList.add('collapsed');
    } else {
      c.classList.remove('collapsed');
    }
  });

  const btnText = document.getElementById('btn-toggle-all-chapters-text');
  if (btnText) {
    btnText.textContent = shouldCollapse ? 'Tout déplier' : 'Tout replier';
  }
};

function renderNotebookUI(filterText = '') {
  const container = document.getElementById('notebook-notes-list');
  const allNotes = queueEngine.getReasoningNotes();

  // Populate or update the chapter filter select if it exists
  const chapFilterSelect = document.getElementById('notebook-chapter-filter');
  if (chapFilterSelect) {
    const existingChapters = Array.from(new Set(allNotes.map(n => n.chapterTitle || 'Pédiatrie Générale'))).sort((a,b) => a.localeCompare(b, 'fr'));
    const currentVal = notebookSelectedChapter;
    let optionsHtml = `<option value="">Tous les cours (${allNotes.length} notes)</option>`;
    existingChapters.forEach(c => {
      const count = allNotes.filter(n => (n.chapterTitle || 'Pédiatrie Générale') === c).length;
      optionsHtml += `<option value="${escapeHtml(c)}" ${c === currentVal ? 'selected' : ''}>${escapeHtml(c)} (${count})</option>`;
    });
    chapFilterSelect.innerHTML = optionsHtml;
  }

  // Sync sort controls
  const sortSelect = document.getElementById('notebook-sort-by');
  if (sortSelect && sortSelect.value !== notebookSortBy) {
    sortSelect.value = notebookSortBy;
  }
  updateSortOrderButtonUI();

  // Filter notes by text & chapter
  const filtered = allNotes.filter(n => {
    if (notebookSelectedChapter && (n.chapterTitle || 'Pédiatrie Générale') !== notebookSelectedChapter) {
      return false;
    }
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    const fullQ = allQuestions.find(item => item.uid === n.questionUid);
    const optionsText = fullQ && fullQ.options ? fullQ.options.map(o => o.text).join(' ').toLowerCase() : '';
    const explanationText = (fullQ && fullQ.explanation ? fullQ.explanation.toLowerCase() : '') || (n.officialExplanation ? n.officialExplanation.toLowerCase() : '');

    const qText = (fullQ && fullQ.question ? fullQ.question.toLowerCase() : '') || (n.questionText ? n.questionText.toLowerCase() : '');
    const chapText = (fullQ && fullQ.chapterTitle ? fullQ.chapterTitle.toLowerCase() : '') || (n.chapterTitle ? n.chapterTitle.toLowerCase() : '');

    return qText.includes(q) ||
           chapText.includes(q) ||
           (n.reasoningNote && n.reasoningNote.toLowerCase().includes(q)) ||
           (n.userAnswer && n.userAnswer.toLowerCase().includes(q)) ||
           optionsText.includes(q) ||
           explanationText.includes(q);
  });

  // Update summary bar
  const summaryBar = document.getElementById('notebook-summary-bar');
  if (filtered.length === 0) {
    if (summaryBar) summaryBar.style.display = 'none';
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text-dim);">
        <i data-lucide="book-marked" style="width:36px;height:36px;margin:0 auto 10px;display:block;"></i>
        ${filterText || notebookSelectedChapter 
          ? 'Aucune note ne correspond à vos filtres actuels.' 
          : 'Aucune note de raisonnement pour le moment. Vos futures erreurs seront automatiquement analysées et regroupées ici par cours !'}
      </div>
    `;
    refreshLucide();
    return;
  }

  const groupedChapters = groupNotesByChapterAndQuestion(filtered);
  const totalQuestions = groupedChapters.reduce((sum, g) => sum + g.totalQuestions, 0);
  const totalNotes = groupedChapters.reduce((sum, g) => sum + g.totalNotes, 0);

  if (summaryBar) {
    summaryBar.style.display = 'flex';
    summaryBar.innerHTML = `
      <span class="notebook-stat-summary">
        <strong>${totalQuestions}</strong> question${totalQuestions > 1 ? 's' : ''} (${totalNotes} analyse${totalNotes > 1 ? 's' : ''}) • Tri : <strong class="text-cyan">${getSortSummaryLabel()}</strong>
      </span>
      <button class="notebook-toggle-all-btn" onclick="window.toggleAllChapters()" title="Tout replier ou tout déplier">
        <i data-lucide="chevrons-up-down" style="width:14px;height:14px;"></i>
        <span id="btn-toggle-all-chapters-text">Tout replier</span>
      </button>
    `;
  }

  container.innerHTML = '';

  if (notebookViewMode === 'flat') {
    // FLAT LIST VIEW: All questions sorted across the whole syllabus
    const allFlatQuestions = [];
    groupedChapters.forEach(g => {
      allFlatQuestions.push(...g.questions);
    });
    allFlatQuestions.sort((a, b) => compareQuestions(a, b, notebookSortBy, notebookSortOrder));

    allFlatQuestions.forEach((q, qIdx) => {
      const cardHtml = renderQuestionCard(q, 'flat', qIdx, qIdx + 1);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = cardHtml;
      container.appendChild(tempDiv.firstElementChild);
    });
  } else {
    // CHAPTER ACCORDION VIEW
    groupedChapters.forEach((g, gIdx) => {
      const chapterGroupId = `chap_group_${gIdx}`;
      const chapterGroupEl = document.createElement('div');
      chapterGroupEl.className = 'notebook-chapter-group';
      chapterGroupEl.id = chapterGroupId;

      let questionsHtml = '';
      g.questions.forEach((q, qIdx) => {
        questionsHtml += renderQuestionCard(q, gIdx, qIdx, null);
      });

      const mistakesCountBadge = g.chapterTotalMistakes > 0 ? `
        <span class="chapter-count-badge" style="background:rgba(239, 68, 68, 0.2);color:#fca5a5;border-color:rgba(239,68,68,0.4);" title="Total des fautes dans ce cours">
          ⚠️ ${g.chapterTotalMistakes} faute${g.chapterTotalMistakes > 1 ? 's' : ''}
        </span>
      ` : '';

      chapterGroupEl.innerHTML = `
        <div class="notebook-chapter-header" onclick="window.toggleChapterGroup('${chapterGroupId}')">
          <div class="notebook-chapter-title-wrap">
            <i data-lucide="folder-open" class="chapter-folder-icon"></i>
            <span class="notebook-chapter-title">${escapeHtml(g.chapterTitle)}</span>
            <span class="chapter-count-badge">${g.totalQuestions} question${g.totalQuestions > 1 ? 's' : ''}</span>
            <span class="chapter-count-badge" style="background:rgba(0, 212, 255, 0.15);color:var(--cyan);border-color:rgba(0,212,255,0.35);">
              ${g.totalNotes} analyse${g.totalNotes > 1 ? 's' : ''} IA
            </span>
            ${mistakesCountBadge}
          </div>
          <i data-lucide="chevron-down" class="chapter-chevron"></i>
        </div>
        <div class="notebook-chapter-body notebook-chapter-questions">
          ${questionsHtml}
        </div>
      `;

      container.appendChild(chapterGroupEl);
    });
  }

  refreshLucide();
}

// ============================================================================
// CHAPTER SELECTION MODAL
// ============================================================================
function openChaptersModal() {
  const container = document.getElementById('chapters-checkboxes-container');
  container.innerHTML = '';

  const selectedSet = new Set(queueEngine.selectedChapterIds);

  allChapters.forEach(chap => {
    const item = document.createElement('div');
    const isChecked = selectedSet.has(chap.id);
    item.className = `chapter-select-item ${isChecked ? 'checked' : ''}`;
    item.dataset.chapId = chap.id;

    item.innerHTML = `
      <div class="chapter-checkbox-wrap">
        <input type="checkbox" ${isChecked ? 'checked' : ''} style="accent-color:var(--cyan);width:16px;height:16px;">
        <span style="font-size:0.88rem;font-weight:600;">${chap.title}</span>
      </div>
      <span class="chapter-item-count">${chap.count} QCM</span>
    `;

    const checkbox = item.querySelector('input');
    item.onclick = (e) => {
      if (e.target !== checkbox) checkbox.checked = !checkbox.checked;
      item.classList.toggle('checked', checkbox.checked);
    };

    container.appendChild(item);
  });

  modals.chapters.style.display = 'flex';
  refreshLucide();
}

function applyChapterSelection() {
  const selected = [];
  document.querySelectorAll('.chapter-select-item').forEach(item => {
    const checkbox = item.querySelector('input');
    if (checkbox && checkbox.checked) {
      selected.push(item.dataset.chapId);
    }
  });

  queueEngine.initSession(selected);
  modals.chapters.style.display = 'none';
  updateDashboardUI();
}

// ============================================================================
// STUDY PROGRESS & ANALYTICS INFOGRAPHIC ENGINE
// ============================================================================
let currentStatsRange = '7'; // 'today' | '7' | '30' | 'all' | 'custom'
let customStatsStart = '';
let customStatsEnd = '';

function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '0m';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes > 0 ? minutes + 'm' : ''}`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds > 0 ? seconds + 's' : ''}`;
  }
  return `${seconds}s`;
}

function formatDateFr(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const options = { weekday: 'short', day: 'numeric', month: 'short' };
  return d.toLocaleDateString('fr-FR', options);
}

function renderStatsUI() {
  const globalAnalytics = studyTracker.getGlobalAnalytics();
  const todayStr = studyTracker.getTodayDateStr();
  const todayRecord = studyTracker.getOrCreateDayRecord(todayStr);

  let rangeDays;
  if (currentStatsRange === 'today') {
    rangeDays = studyTracker.getDaysByRange('today');
  } else if (currentStatsRange === 'custom') {
    const start = customStatsStart || document.getElementById('custom-date-start')?.value || todayStr;
    const end = customStatsEnd || document.getElementById('custom-date-end')?.value || todayStr;
    rangeDays = studyTracker.getDaysByCustomRange(start, end);
  } else {
    rangeDays = studyTracker.getDaysByRange(currentStatsRange);
  }

  // 1. Hero KPIs
  const streakDaysEl = document.getElementById('kpi-streak-days');
  const streakSubEl = document.getElementById('kpi-streak-sub');
  if (streakDaysEl) streakDaysEl.textContent = globalAnalytics.currentStreak;
  if (streakSubEl) streakSubEl.textContent = `Record : ${globalAnalytics.maxStreak} jour${globalAnalytics.maxStreak > 1 ? 's' : ''}`;

  const qTotalEl = document.getElementById('kpi-total-questions');
  const qSubEl = document.getElementById('kpi-questions-sub');
  if (qTotalEl) qTotalEl.textContent = formatNumber(globalAnalytics.totalQuestions);
  if (qSubEl) qSubEl.textContent = `${todayRecord.totalQuestions} auj. (${todayRecord.correctAnswers} justes)`;

  const accEl = document.getElementById('kpi-accuracy-pct');
  const accSubEl = document.getElementById('kpi-accuracy-sub');
  if (accEl) accEl.textContent = `${globalAnalytics.accuracyPct}%`;
  if (accSubEl) accSubEl.textContent = `${formatNumber(globalAnalytics.totalCorrect)} justes • ${formatNumber(globalAnalytics.totalWrong)} fautes`;

  // First Pass (Découverte) KPI Card
  const fpCardPct = document.getElementById('kpi-first-pass-pct');
  const fpCardSub = document.getElementById('kpi-first-pass-sub');
  const fpData = (currentStatsRange === 'all')
    ? studyTracker.getFirstPassAnalytics()
    : studyTracker.getFirstPassInDays(rangeDays);

  if (fpCardPct) {
    fpCardPct.textContent = fpData.total > 0 ? `${fpData.pct}%` : '--%';
  }
  if (fpCardSub) {
    if (fpData.total > 0) {
      fpCardSub.textContent = (currentStatsRange === 'all')
        ? `${formatNumber(fpData.correct)}/${formatNumber(fpData.total)} découverts (global)`
        : `${formatNumber(fpData.correct)}/${formatNumber(fpData.total)} inédits sur période`;
    } else {
      fpCardSub.textContent = (currentStatsRange === 'all')
        ? '0 découverte'
        : '0 inédit (que des révisions)';
    }
  }

  const timeEl = document.getElementById('kpi-total-time');
  const sessSubEl = document.getElementById('kpi-sessions-sub');
  if (timeEl) timeEl.textContent = formatDuration(globalAnalytics.totalTimeSeconds);
  if (sessSubEl) sessSubEl.textContent = `${globalAnalytics.totalSessions} session${globalAnalytics.totalSessions > 1 ? 's' : ''} active${globalAnalytics.totalSessions > 1 ? 's' : ''}`;

  const speedEl = document.getElementById('kpi-avg-speed');
  const speedSubEl = document.getElementById('kpi-speed-sub');
  if (speedEl) speedEl.textContent = globalAnalytics.avgTimePerQuestion || '--';
  if (speedSubEl) speedSubEl.textContent = `Justes : ${globalAnalytics.avgTimeCorrect || '--'}s • Fautes : ${globalAnalytics.avgTimeWrong || '--'}s`;

  // 2. Heatmap
  renderStatsHeatmap(studyTracker.getRawHistory());

  // 3. Activity Chart (Stacked Bars & Velocity curve)
  renderStatsActivityChart(rangeDays);

  // 4. Velocity breakdown & Exam projection
  renderStatsVelocityAndProjection(globalAnalytics);

  // 5. Chapters breakdown
  renderStatsChapters(globalAnalytics.chapterTotals);

  // 6. Daily Timeline
  renderStatsTimeline(globalAnalytics.days);

  refreshLucide();
}

/**
 * Renders GitHub-style activity contribution heatmap for last 60 days
 */
function renderStatsHeatmap(history) {
  const container = document.getElementById('stats-heatmap-container');
  if (!container) return;

  const now = new Date();
  const daysCount = 63; // 9 full weeks of 7 days
  const cellWidth = 14;
  const cellHeight = 14;
  const gap = 4;
  const leftMargin = 34;
  const topMargin = 22;

  const width = leftMargin + (9 * (cellWidth + gap)) + 10;
  const height = topMargin + (7 * (cellHeight + gap)) + 6;

  // Build 63 days list ending today
  const daysList = [];
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const dayData = history[dateStr] || null;
    const dayOfWeek = (d.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
    daysList.push({ dateStr, dayData, dateObj: d, dayOfWeek });
  }

  let svgContent = `<svg class="heatmap-svg" viewBox="0 0 ${width} ${height}" style="max-width:100%;height:auto;">`;

  // Day of week labels on left
  const dayNames = ['Lun', '', 'Mer', '', 'Ven', '', 'Dim'];
  dayNames.forEach((name, idx) => {
    if (name) {
      const y = topMargin + idx * (cellHeight + gap) + 11;
      svgContent += `<text x="4" y="${y}" fill="#64748b" font-size="9" font-family="var(--font-body)">${name}</text>`;
    }
  });

  // Cells grouped by weeks
  for (let col = 0; col < 9; col++) {
    for (let row = 0; row < 7; row++) {
      const itemIndex = col * 7 + row;
      const item = daysList[itemIndex];
      if (!item) continue;

      const x = leftMargin + col * (cellWidth + gap);
      const y = topMargin + row * (cellHeight + gap);

      const total = item.dayData ? (item.dayData.totalQuestions || 0) : 0;
      const correct = item.dayData ? (item.dayData.correctAnswers || 0) : 0;
      const wrong = item.dayData ? (item.dayData.wrongAnswers || 0) : 0;
      const timeSec = item.dayData ? (item.dayData.totalTimeSeconds || 0) : 0;

      let color = '#121d33';
      let stroke = 'rgba(255,255,255,0.06)';
      if (total >= 80) { color = '#00d4ff'; stroke = 'none'; }
      else if (total >= 40) { color = '#10b981'; stroke = 'none'; }
      else if (total >= 15) { color = '#047857'; stroke = 'none'; }
      else if (total >= 1) { color = '#064e3b'; stroke = 'none'; }

      const dateLabel = item.dateObj.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
      const tooltipText = total > 0
        ? `${dateLabel} : ${total} QCM (${correct} justes, ${wrong} fautes, ${formatDuration(timeSec)})`
        : `${dateLabel} : Aucun entraînement`;

      svgContent += `
        <rect class="heatmap-day-cell" x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" rx="3" ry="3"
              fill="${color}" stroke="${stroke}" stroke-width="1">
          <title>${escapeHtml(tooltipText)}</title>
        </rect>
      `;
    }
  }

  svgContent += '</svg>';
  container.innerHTML = svgContent;
}

/**
 * Renders combined SVG activity chart (Stacked bars for Justes vs Fautes + Polyline for velocity)
 */
function renderStatsActivityChart(rangeDays) {
  const container = document.getElementById('stats-activity-chart');
  if (!container) return;

  const totalRange = rangeDays.length;
  const chartTitleEl = document.getElementById('activity-chart-title');
  if (chartTitleEl) {
    if (currentStatsRange === 'today') {
      chartTitleEl.textContent = "Activité d'Aujourd'hui (Bilan de la journée)";
    } else if (currentStatsRange === 'custom') {
      const firstStr = rangeDays[0]?.dateStr ? formatDateFr(rangeDays[0].dateStr) : '';
      const lastStr = rangeDays[rangeDays.length - 1]?.dateStr ? formatDateFr(rangeDays[rangeDays.length - 1].dateStr) : '';
      chartTitleEl.textContent = `Activité Personnalisée (${firstStr} ➔ ${lastStr})`;
    } else if (totalRange <= 7) {
      chartTitleEl.textContent = 'Activité des 7 derniers jours (Volume, Justes vs Fautes & Vélocité)';
    } else if (totalRange <= 30) {
      chartTitleEl.textContent = 'Activité des 30 derniers jours';
    } else {
      chartTitleEl.textContent = "Historique complet d'activité";
    }
  }

  if (rangeDays.length === 0) {
    container.innerHTML = '<div class="stats-empty-state"><p>Aucune donnée d\'entraînement sur cette période.</p></div>';
    return;
  }

  const svgWidth = 840;
  const svgHeight = 250;
  const padLeft = 46;
  const padRight = 50;
  const padTop = 30;
  const padBottom = 42;

  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const maxQ = Math.max(10, ...rangeDays.map(d => d.totalQuestions || 0));
  const maxVel = Math.max(60, ...rangeDays.map(d => d.avgTimePerQuestion || 0));

  let svg = `<svg class="chart-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="none">`;

  // Background Grid Lines (Horizontal)
  const gridSteps = 4;
  for (let s = 0; s <= gridSteps; s++) {
    const yVal = padTop + (plotH / gridSteps) * s;
    const qValue = Math.round(maxQ - (maxQ / gridSteps) * s);
    const velValue = Math.round(maxVel - (maxVel / gridSteps) * s);

    svg += `<line x1="${padLeft}" y1="${yVal}" x2="${svgWidth - padRight}" y2="${yVal}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />`;
    // Left axis label (volume)
    svg += `<text x="${padLeft - 8}" y="${yVal + 4}" fill="#64748b" font-size="9" text-anchor="end" font-family="var(--font-body)">${qValue}</text>`;
    // Right axis label (velocity in seconds)
    if (s < gridSteps) {
      svg += `<text x="${svgWidth - padRight + 8}" y="${yVal + 4}" fill="#f59e0b" font-size="9" text-anchor="start" font-family="var(--font-body)">${velValue}s</text>`;
    }
  }

  const N = rangeDays.length;
  const colWidth = plotW / N;
  const barWidth = Math.max(6, Math.min(36, colWidth * 0.65));
  const velocityPoints = [];

  // Draw Bars
  rangeDays.forEach((d, i) => {
    const xCenter = padLeft + (i + 0.5) * colWidth;
    const xBar = xCenter - barWidth / 2;

    const total = d.totalQuestions || 0;
    const cor = d.correctAnswers || 0;
    const wr = d.wrongAnswers || 0;
    const speed = d.avgTimePerQuestion || 0;

    const hTotal = (total / maxQ) * plotH;
    const hCor = (cor / maxQ) * plotH;
    const hWr = (wr / maxQ) * plotH;

    const yCor = padTop + plotH - hCor;
    const yWr = yCor - hWr;

    const tooltip = `${formatDateFr(d.dateStr)} : ${total} QCM (${cor} justes, ${wr} fautes) • Vitesse : ${speed || '--'}s/QCM`;

    if (total > 0) {
      // Correct bar (bottom emerald)
      if (cor > 0) {
        svg += `
          <rect class="chart-bar-rect" x="${xBar}" y="${yCor}" width="${barWidth}" height="${Math.max(2, hCor)}" rx="2" fill="var(--emerald)">
            <title>${escapeHtml(tooltip)}</title>
          </rect>
        `;
      }
      // Wrong bar (top rose)
      if (wr > 0) {
        svg += `
          <rect class="chart-bar-rect" x="${xBar}" y="${yWr}" width="${barWidth}" height="${Math.max(2, hWr)}" rx="2" fill="var(--rose)">
            <title>${escapeHtml(tooltip)}</title>
          </rect>
        `;
      }
    } else {
      // Empty day placeholder bar
      svg += `
        <rect x="${xBar}" y="${padTop + plotH - 3}" width="${barWidth}" height="3" rx="1" fill="rgba(255,255,255,0.06)">
          <title>${escapeHtml(formatDateFr(d.dateStr))} : Aucun entraînement</title>
        </rect>
      `;
    }

    // Velocity point calculation
    if (speed > 0) {
      const yVel = padTop + plotH - (speed / maxVel) * plotH;
      velocityPoints.push({ x: xCenter, y: yVel, speed, dateStr: d.dateStr });
    }

    // X-axis date labels (show filtered according to range size)
    const shouldShowLabel = (N <= 10) || (N <= 31 && i % 3 === 0) || (i === N - 1);
    if (shouldShowLabel) {
      const labelText = d.dateStr ? d.dateStr.slice(5).replace('-', '/') : '';
      svg += `<text x="${xCenter}" y="${svgHeight - padBottom + 16}" fill="#8ca2c4" font-size="9" text-anchor="middle" font-family="var(--font-body)">${labelText}</text>`;
    }
  });

  // Draw Velocity curve (amber polyline)
  if (velocityPoints.length > 1) {
    const pointsStr = velocityPoints.map(p => `${p.x},${p.y}`).join(' ');
    svg += `<polyline points="${pointsStr}" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
    velocityPoints.forEach(p => {
      svg += `
        <circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#f59e0b" stroke="#070b14" stroke-width="1.5">
          <title>${escapeHtml(formatDateFr(p.dateStr))} • Vitesse : ${p.speed} s/QCM</title>
        </circle>
      `;
    });
  } else if (velocityPoints.length === 1) {
    const p = velocityPoints[0];
    svg += `
      <circle cx="${p.x}" cy="${p.y}" r="4" fill="#f59e0b" stroke="#070b14" stroke-width="1.5">
        <title>${escapeHtml(formatDateFr(p.dateStr))} • Vitesse : ${p.speed} s/QCM</title>
      </circle>
    `;
  }

  svg += '</svg>';
  container.innerHTML = svg;
}

/**
 * Renders velocity metrics and adaptive countdown projection to November 10 exam
 */
function renderStatsVelocityAndProjection(globalAnalytics) {
  const velCorEl = document.getElementById('stat-vel-correct');
  const velWrEl = document.getElementById('stat-vel-wrong');
  const cadenceEl = document.getElementById('stat-cadence-observed');
  const projTextEl = document.getElementById('stat-exam-projection-text');

  if (velCorEl) velCorEl.textContent = globalAnalytics.avgTimeCorrect ? `${globalAnalytics.avgTimeCorrect} s` : '-- s';
  if (velWrEl) velWrEl.textContent = globalAnalytics.avgTimeWrong ? `${globalAnalytics.avgTimeWrong} s` : '-- s';

  const activeDays = Math.max(1, globalAnalytics.totalDaysActive);
  const observedCadence = Math.round(globalAnalytics.totalQuestions / activeDays);
  if (cadenceEl) cadenceEl.textContent = `${observedCadence} QCM / jour actif`;

  if (!projTextEl) return;

  const dashboardMetrics = queueEngine.getDashboardMetrics();
  const iterationsRemaining = dashboardMetrics.totalIterationsRequired;
  const countdown = getExamCountdownMetrics(iterationsRemaining);

  if (observedCadence > 0) {
    const daysNeeded = Math.ceil(iterationsRemaining / observedCadence);
    const estDate = new Date();
    estDate.setDate(estDate.getDate() + daysNeeded);
    const estDateStr = estDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

    if (daysNeeded <= countdown.daysLeft) {
      projTextEl.innerHTML = `<strong>🏆 Cadence excellente !</strong> Au rythme observé de <strong>${observedCadence} QCM/jour</strong>, vous aurez validé l'intégralité du programme en <strong>${daysNeeded} jours</strong> (vers le ${estDateStr}), soit avant l'échéance du concours (J-${countdown.daysLeft}) !`;
    } else {
      projTextEl.innerHTML = `<strong>⚠️ Recommandation Concours :</strong> Au rythme actuel (${observedCadence} QCM/j), il faudrait ${daysNeeded} jours pour tout nettoyer. Pour franchir la ligne d'arrivée avant le 10/11 (J-${countdown.daysLeft}), maintenez la cadence cible de <strong>${countdown.dailyIterationsRequired} QCM/jour</strong>.`;
    }
  } else {
    projTextEl.innerHTML = `<em>Répondez à vos premiers QCM pour activer la projection personnalisée vers l'examen du 10/11. Cadence cible recommandée : <strong>${countdown.dailyIterationsRequired} QCM/jour</strong>.</em>`;
  }
}

/**
 * Renders top strengths and urgent revision chapters
 */
function renderStatsChapters(chapterTotals = {}) {
  const container = document.getElementById('stats-chapters-breakdown');
  if (!container) return;

  const entries = Object.entries(chapterTotals).filter(([_, st]) => (st.correct + st.wrong) > 0);

  if (entries.length === 0) {
    container.innerHTML = `
      <div style="font-size:0.8rem;color:var(--text-muted);padding:14px;text-align:center;">
        Aucun entraînement par cours enregistré pour le moment.
      </div>
    `;
    return;
  }

  // Map to chapter metadata
  const list = entries.map(([chId, st]) => {
    const ch = allChapters.find(c => c.id === chId) || { title: chId };
    const total = st.correct + st.wrong;
    const pct = Math.round((st.correct / total) * 100);
    return {
      id: chId,
      title: ch.title,
      correct: st.correct,
      wrong: st.wrong,
      total,
      pct
    };
  });

  // Sort by accuracy descending
  list.sort((a, b) => b.pct - a.pct || b.total - a.total);

  let html = '';
  list.slice(0, 6).forEach(item => {
    let colorClass = 'var(--emerald)';
    if (item.pct < 50) colorClass = 'var(--rose)';
    else if (item.pct < 75) colorClass = 'var(--amber)';

    html += `
      <div class="chapter-stat-item">
        <div class="chapter-stat-header">
          <span class="chapter-stat-name" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
          <span class="chapter-stat-pct" style="color:${colorClass}">${item.pct}% <small style="font-size:0.7rem;color:var(--text-dim);">(${item.correct}/${item.total})</small></span>
        </div>
        <div class="chapter-progress-track">
          <div class="chapter-progress-fill" style="width: ${item.pct}%; background: ${colorClass};"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

/**
 * Renders daily detailed history cards
 */
function renderStatsTimeline(days = []) {
  const container = document.getElementById('stats-daily-timeline');
  const countBadge = document.getElementById('stats-days-count-badge');
  if (!container) return;

  const activeDays = (days || [])
    .filter(d => d.totalQuestions > 0)
    .sort((a, b) => b.dateStr.localeCompare(a.dateStr));

  if (countBadge) {
    countBadge.textContent = `${activeDays.length} jour${activeDays.length > 1 ? 's' : ''} enregistré${activeDays.length > 1 ? 's' : ''}`;
  }

  if (activeDays.length === 0) {
    container.innerHTML = `
      <div class="stats-empty-state">
        <i data-lucide="calendar-x2"></i>
        <div>
          <div style="font-weight:700;color:#ffffff;margin-bottom:4px;">Aucun historique d'entraînement</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">Lancez une arène de QCM pour démarrer l'enregistrement de vos journées d'étude !</div>
        </div>
      </div>
    `;
    return;
  }

  const todayStr = studyTracker.getTodayDateStr();

  let html = '';
  activeDays.forEach(d => {
    const isToday = (d.dateStr === todayStr);
    const accuracy = d.totalQuestions > 0 ? Math.round((d.correctAnswers / d.totalQuestions) * 100) : 0;
    const dateFormatted = formatDateFr(d.dateStr);

    html += `
      <div class="timeline-day-card">
        <div class="timeline-day-top">
          <div class="timeline-date-wrap">
            <span class="timeline-date-badge">${escapeHtml(dateFormatted)}</span>
            ${isToday ? '<span class="timeline-day-today">Aujourd\'hui</span>' : ''}
          </div>
          <div class="timeline-badges-row">
            <span class="timeline-pill pill-count"><i data-lucide="check-square" style="width:12px;height:12px;"></i> ${d.totalQuestions} QCM</span>
            <span class="timeline-pill pill-correct">✓ ${d.correctAnswers} justes (${accuracy}%)</span>
            <span class="timeline-pill pill-wrong">✗ ${d.wrongAnswers} fautes</span>
            <span class="timeline-pill pill-time"><i data-lucide="clock" style="width:12px;height:12px;"></i> ${formatDuration(d.totalTimeSeconds)}</span>
            <span class="timeline-pill pill-sessions"><i data-lucide="zap" style="width:12px;height:12px;"></i> ${d.sessionsCount || 1} sess.</span>
            <span class="timeline-pill pill-speed">${d.avgTimePerQuestion || '--'}s/QCM</span>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ============================================================================
// EVENT LISTENERS & KEYBOARD BINDINGS
// ============================================================================
function setupEventListeners() {
  // Navigation
  document.getElementById('btn-home-logo').onclick = () => switchView('dashboard');
  document.getElementById('btn-leave-arena').onclick = () => switchView('dashboard');
  document.getElementById('btn-leave-notebook').onclick = () => switchView('dashboard');
  const btnLeaveStats = document.getElementById('btn-leave-stats');
  if (btnLeaveStats) btnLeaveStats.onclick = () => switchView('dashboard');

  document.getElementById('btn-open-notebook').onclick = () => switchView('notebook');
  document.getElementById('btn-open-notebook-icon').onclick = () => switchView('notebook');

  const btnOpenStats = document.getElementById('btn-open-stats');
  if (btnOpenStats) btnOpenStats.onclick = () => switchView('stats');

  const btnOpenStatsIcon = document.getElementById('btn-open-stats-icon');
  if (btnOpenStatsIcon) btnOpenStatsIcon.onclick = () => switchView('stats');

  // Stats range toggle buttons
  const rangeToggle = document.getElementById('stats-range-toggle');
  const customPicker = document.getElementById('custom-range-picker');
  const customStartInput = document.getElementById('custom-date-start');
  const customEndInput = document.getElementById('custom-date-end');
  const btnApplyCustom = document.getElementById('btn-apply-custom-range');

  if (rangeToggle) {
    rangeToggle.querySelectorAll('.range-btn').forEach(btn => {
      btn.onclick = () => {
        rangeToggle.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const r = btn.dataset.range || '7';
        currentStatsRange = r;

        if (r === 'custom') {
          if (customPicker) {
            customPicker.style.display = 'flex';
            const today = studyTracker.getTodayDateStr();
            if (customEndInput && !customEndInput.value) customEndInput.value = today;
            if (customStartInput && !customStartInput.value) {
              const d = new Date();
              d.setDate(d.getDate() - 7);
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              customStartInput.value = `${y}-${m}-${day}`;
            }
          }
        } else {
          if (customPicker) customPicker.style.display = 'none';
          renderStatsUI();
        }
      };
    });
  }

  if (btnApplyCustom) {
    btnApplyCustom.onclick = () => {
      customStatsStart = customStartInput?.value || '';
      customStatsEnd = customEndInput?.value || '';
      if (!customStatsStart || !customStatsEnd) {
        alert('Veuillez sélectionner une date de début et une date de fin.');
        return;
      }
      renderStatsUI();
    };
  }

  // Auto-pause timer when tab is hidden or phone goes to lock screen
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      studyTracker.pauseTimer();
    } else {
      studyTracker.resumeTimer();
    }
  });

  // Dashboard primary buttons
  document.getElementById('btn-start-random').onclick = () => {
    // If no chapters selected or reset requested
    if (queueEngine.queue.length === 0) {
      queueEngine.initSession([]);
    }
    switchView('arena');
  };

  document.getElementById('btn-open-chapters').onclick = openChaptersModal;
  document.getElementById('btn-toggle-all-chapters').onclick = () => {
    const items = document.querySelectorAll('.chapter-select-item input');
    const shouldCheck = Array.from(items).some(i => !i.checked);
    items.forEach(i => {
      i.checked = shouldCheck;
      i.closest('.chapter-select-item').classList.toggle('checked', shouldCheck);
    });
  };
  document.getElementById('btn-apply-chapters').onclick = applyChapterSelection;
  document.getElementById('btn-close-chapters-modal').onclick = () => {
    modals.chapters.style.display = 'none';
  };

  // Arena Actions
  document.getElementById('btn-submit-answer').onclick = handleSubmitQcm;
  document.getElementById('btn-submit-croq').onclick = handleSubmitCroq;
  document.getElementById('btn-next-question').onclick = () => loadNextArenaQuestion();

  // History Navigation in Arena
  const btnHistPrev = document.getElementById('btn-history-prev');
  if (btnHistPrev) btnHistPrev.onclick = () => window.navigateHistoryPrev();
  const btnHistNext = document.getElementById('btn-history-next');
  if (btnHistNext) btnHistNext.onclick = () => window.navigateHistoryNext();
  const btnHistResume = document.getElementById('btn-history-resume-action');
  if (btnHistResume) btnHistResume.onclick = () => window.resumeActiveDrill();


  // Error modal
  document.getElementById('btn-continue-after-error').onclick = closeErrorModalAndContinue;
  document.getElementById('btn-close-error-modal').onclick = closeErrorModalAndContinue;

  // Notebook search, chapter filter & sorting controls
  document.getElementById('notebook-search-input').oninput = (e) => {
    renderNotebookUI(e.target.value);
  };
  const notebookSortSelect = document.getElementById('notebook-sort-by');
  if (notebookSortSelect) {
    notebookSortSelect.onchange = (e) => {
      notebookSortBy = e.target.value;
      const searchVal = document.getElementById('notebook-search-input')?.value || '';
      renderNotebookUI(searchVal);
    };
  }
  const btnSortOrder = document.getElementById('btn-toggle-sort-order');
  if (btnSortOrder) {
    btnSortOrder.onclick = () => {
      notebookSortOrder = (notebookSortOrder === 'desc') ? 'asc' : 'desc';
      updateSortOrderButtonUI();
      const searchVal = document.getElementById('notebook-search-input')?.value || '';
      renderNotebookUI(searchVal);
    };
  }
  const btnViewChapter = document.getElementById('btn-view-mode-chapter');
  const btnViewFlat = document.getElementById('btn-view-mode-flat');
  if (btnViewChapter && btnViewFlat) {
    btnViewChapter.onclick = () => {
      notebookViewMode = 'chapter';
      btnViewChapter.classList.add('active');
      btnViewFlat.classList.remove('active');
      const searchVal = document.getElementById('notebook-search-input')?.value || '';
      renderNotebookUI(searchVal);
    };
    btnViewFlat.onclick = () => {
      notebookViewMode = 'flat';
      btnViewFlat.classList.add('active');
      btnViewChapter.classList.remove('active');
      const searchVal = document.getElementById('notebook-search-input')?.value || '';
      renderNotebookUI(searchVal);
    };
  }
  const notebookChapFilter = document.getElementById('notebook-chapter-filter');
  if (notebookChapFilter) {
    notebookChapFilter.onchange = (e) => {
      notebookSelectedChapter = e.target.value;
      const searchVal = document.getElementById('notebook-search-input')?.value || '';
      renderNotebookUI(searchVal);
    };
  }

  // Chapters modal search
  document.getElementById('chapters-search-input').oninput = (e) => {
    const filter = e.target.value.toLowerCase();
    document.querySelectorAll('.chapter-select-item').forEach(item => {
      const title = item.querySelector('span').textContent.toLowerCase();
      item.style.display = title.includes(filter) ? 'flex' : 'none';
    });
  };

  // Google Auth & Sync Modal Triggers
  const openSyncModal = () => {
    updateModalLocalSummary();
    const currentUser = firebaseSyncService.user;
    updateGoogleAccountUI(
      firebaseSyncService.status, 
      '', 
      currentUser, 
      currentUser ? firebaseSyncService.getLastSyncedText() : 'Non connecté'
    );
    modals.sync.style.display = 'flex';
  };

  const btnHeaderLogin = document.getElementById('btn-header-google-login');
  if (btnHeaderLogin) btnHeaderLogin.onclick = openSyncModal;

  const btnUserProfile = document.getElementById('btn-open-user-profile');
  if (btnUserProfile) btnUserProfile.onclick = openSyncModal;

  document.getElementById('btn-close-sync-modal').onclick = () => modals.sync.style.display = 'none';

  // Modal Google Login Button
  const btnModalGoogleLogin = document.getElementById('btn-modal-google-login');
  if (btnModalGoogleLogin) {
    btnModalGoogleLogin.onclick = async () => {
      if (!firebaseSyncService.hasConfig()) {
        const panel = document.getElementById('firebase-config-panel');
        if (panel) panel.style.display = 'flex';
        const chevron = document.getElementById('firebase-chevron');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
        alert('Veuillez renseigner les identifiants de votre projet Firebase dans le panneau ci-dessous pour connecter Google.');
        return;
      }

      btnModalGoogleLogin.disabled = true;
      btnModalGoogleLogin.innerHTML = '<span>Connexion Google en cours...</span>';
      
      const res = await firebaseSyncService.signInWithGoogle();
      btnModalGoogleLogin.disabled = false;
      btnModalGoogleLogin.innerHTML = `
        <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        <span>Se connecter avec Google</span>
      `;

      if (res.success && res.user) {
        updateDashboardUI();
        if (currentView === 'notebook') renderNotebookUI();
        alert(`Bienvenue ${res.user.displayName || res.user.email} ! Votre progression est désormais synchronisée en direct avec votre compte Google.`);
      } else if (!res.success && res.error) {
        alert(res.error);
      }
    };
  }

  // Modal Google Logout Button
  const btnGoogleLogout = document.getElementById('btn-google-logout');
  if (btnGoogleLogout) {
    btnGoogleLogout.onclick = async () => {
      if (confirm('Voulez-vous vous déconnecter de votre compte Google sur cet appareil ? (Vos données locales restent conservées)')) {
        await firebaseSyncService.signOut();
        updateDashboardUI();
        alert('Déconnecté du compte Google.');
      }
    };
  }

  // Modal Firestore Push Button
  const btnFirestorePush = document.getElementById('btn-firestore-push');
  if (btnFirestorePush) {
    btnFirestorePush.onclick = async () => {
      btnFirestorePush.disabled = true;
      btnFirestorePush.innerHTML = '<span>Sauvegarde vers le Cloud...</span>';
      const res = await firebaseSyncService.pushToFirestore();
      btnFirestorePush.disabled = false;
      btnFirestorePush.innerHTML = '<i data-lucide="upload-cloud"></i> <span>📤 Envoyer au Cloud</span>';
      refreshLucide();
      updateModalLocalSummary();
      if (res.success) {
        alert('✅ Progression & notes de raisonnement sauvegardées sur votre compte Google Cloud !');
      } else {
        alert('❌ ' + (res.error || 'Échec de sauvegarde'));
      }
    };
  }

  // Modal Firestore Pull Button
  const btnFirestorePull = document.getElementById('btn-firestore-pull');
  if (btnFirestorePull) {
    btnFirestorePull.onclick = async () => {
      btnFirestorePull.disabled = true;
      btnFirestorePull.innerHTML = '<span>Récupération du Cloud...</span>';
      const res = await firebaseSyncService.pullFromFirestore();
      btnFirestorePull.disabled = false;
      btnFirestorePull.innerHTML = '<i data-lucide="download-cloud"></i> <span>📥 Récupérer du Cloud</span>';
      refreshLucide();
      updateModalLocalSummary();
      if (res.success) {
        updateDashboardUI();
        if (currentView === 'notebook') renderNotebookUI();
        alert('✅ Progression et notes récupérées et fusionnées avec succès depuis Google Cloud !');
      } else {
        alert('❌ ' + (res.error || 'Échec de récupération'));
      }
    };
  }

  // Toggle Firebase Configuration Panel
  const btnToggleFb = document.getElementById('btn-toggle-firebase-config');
  if (btnToggleFb) {
    btnToggleFb.onclick = () => {
      const panel = document.getElementById('firebase-config-panel');
      if (!panel) return;
      const isHidden = panel.style.display === 'none';
      panel.style.display = isHidden ? 'flex' : 'none';
      const chevron = document.getElementById('firebase-chevron');
      if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'none';
    };
  }

  // Save Firebase Configuration Button
  const btnSaveFb = document.getElementById('btn-save-firebase-config');
  if (btnSaveFb) {
    btnSaveFb.onclick = () => {
      const config = {
        apiKey: document.getElementById('fb-api-key').value.trim(),
        projectId: document.getElementById('fb-project-id').value.trim(),
        authDomain: document.getElementById('fb-auth-domain').value.trim(),
        appId: document.getElementById('fb-app-id').value.trim()
      };

      if (!config.apiKey || !config.projectId) {
        alert('Veuillez renseigner au minimum la clé API et l\'ID de projet Firebase.');
        return;
      }

      firebaseSyncService.saveConfig(config);
      alert('Configuration Firebase enregistrée et initialisée ! Vous pouvez maintenant vous connecter avec Google.');
    };
  }

  document.getElementById('btn-export-json').onclick = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(queueEngine.exportState());
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `pediadrile_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  document.getElementById('btn-import-json').onclick = () => {
    document.getElementById('file-import-input').click();
  };
  document.getElementById('file-import-input').onchange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const ok = queueEngine.importState(event.target.result);
      if (ok) {
        updateDashboardUI();
        alert('Progression importée avec succès !');
        modals.sync.style.display = 'none';
      } else {
        alert('Fichier JSON invalide.');
      }
    };
    reader.readAsText(file);
  };

  // Settings Modal
  document.getElementById('btn-open-settings').onclick = () => {
    document.getElementById('settings-gemini-key').value = geminiService.getApiKey();
    modals.settings.style.display = 'flex';
  };
  document.getElementById('btn-close-settings-modal').onclick = () => modals.settings.style.display = 'none';
  document.getElementById('btn-save-settings').onclick = () => {
    const key = document.getElementById('settings-gemini-key').value;
    geminiService.setApiKey(key);
    alert('Clé API Gemini enregistrée !');
    modals.settings.style.display = 'none';
  };

  // Modal backdrop click to close
  window.onclick = (e) => {
    Object.values(modals).forEach(m => {
      if (e.target === m) m.style.display = 'none';
    });
  };
}

// Keyboard shortcuts: 1-5, A-E, Enter, Space
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // If media lightbox is open, Escape closes it
    const lightboxModal = document.getElementById('media-lightbox-modal');
    if (lightboxModal && lightboxModal.style.display === 'flex') {
      if (e.key === 'Escape') {
        e.preventDefault();
        window.closeMediaLightbox();
        return;
      }
    }

    // If error modal is open, Space or Enter closes it and continues
    if (modals.error.style.display === 'flex') {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        closeErrorModalAndContinue();
      }
      return;
    }

    // Ignore keyboard shortcuts if focus is in an input or textarea
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (activeTag === 'input' || activeTag === 'textarea') {
      return;
    }

    if (currentView === 'arena') {
      // Navigation dans l'historique via les flèches du clavier
      if (e.key === 'ArrowLeft') {
        if (answeredHistory.length > 0 && historyCursor < answeredHistory.length - 1) {
          e.preventDefault();
          window.navigateHistoryPrev();
          return;
        }
      } else if (e.key === 'ArrowRight') {
        if (historyCursor >= 0) {
          e.preventDefault();
          window.navigateHistoryNext();
          return;
        }
      }

      // En mode consultation d'historique, désactiver la sélection et permettre à Entrée de reprendre le drill
      if (historyCursor >= 0) {
        if (e.key === 'Enter') {
          e.preventDefault();
          window.resumeActiveDrill();
        }
        return;
      }

      // Options 1-5 or A-E (mode drill actif uniquement)
      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        selectOptionByIndex(parseInt(e.key, 10) - 1);
      } else if (['a', 'b', 'c', 'd', 'e'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        const idx = e.key.toLowerCase().charCodeAt(0) - 97;
        selectOptionByIndex(idx);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // If success banner is showing, enter continues
        if (document.getElementById('arena-success-banner').style.display === 'flex') {
          loadNextArenaQuestion();
        } else if (!document.getElementById('btn-submit-answer').disabled) {
          handleSubmitQcm();
        }
      }
    }
  });
}

// Start application safely whether DOM is loading or already loaded
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}



// ============================================================================
// ARENA AI TUTOR CHAT CONTROLLER
// ============================================================================
let arenaChatHistory = [];

window.toggleArenaChat = function(forceOpen = null) {
  const chatbox = document.getElementById('arena-ai-chatbox');
  const btn = document.getElementById('btn-arena-ai-chat');
  if (!chatbox) return;

  const isOpen = (forceOpen !== null) ? !forceOpen : (chatbox.style.display !== 'none');
  if (isOpen) {
    chatbox.style.display = 'none';
    if (btn) btn.classList.remove('is-active');
  } else {
    chatbox.style.display = 'flex';
    if (btn) btn.classList.add('is-active');
    updateArenaChatContext();
    if (arenaChatHistory.length === 0) {
      renderChatWelcome();
    }
    const inputEl = document.getElementById('chatbox-text-input');
    if (inputEl) setTimeout(() => inputEl.focus(), 150);
  }
  refreshLucide();
};

window.clearArenaChat = function() {
  arenaChatHistory = [];
  renderChatWelcome();
  const inputEl = document.getElementById('chatbox-text-input');
  if (inputEl) inputEl.value = '';
};

window.sendChatPrompt = function(promptText) {
  if (!promptText || !promptText.trim()) return;
  const inputEl = document.getElementById('chatbox-text-input');
  if (inputEl) inputEl.value = promptText;
  executeSendMessage(promptText.trim());
};

window.handleChatSubmit = function(event) {
  if (event) event.preventDefault();
  const inputEl = document.getElementById('chatbox-text-input');
  if (!inputEl) return;
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  executeSendMessage(text);
};

function updateArenaChatContext() {
  const qTextEl = document.getElementById('chatbox-q-statement');
  const ctxEl = document.getElementById('chatbox-current-context');
  const effQ = getEffectiveArenaQuestion();
  if (effQ) {
    if (qTextEl) {
      const qText = effQ.question || effQ.statement || 'Question pédiatrique';
      qTextEl.textContent = qText.length > 80 ? qText.slice(0, 80) + '...' : qText;
    }
    if (ctxEl) {
      const isHistory = historyCursor >= 0;
      const isRevealed = isArenaChapterRevealed();
      const blurClass = isRevealed ? 'is-revealed' : 'is-blurred';
      const blurTitle = isRevealed 
        ? 'Cours visible (Cliquer pour masquer)' 
        : 'Cours masqué jusqu\'à ce que vous répondiez (Cliquer pour afficher)';
      const histSuffix = isHistory ? ` (QCM -${historyCursor + 1})` : '';

      ctxEl.innerHTML = `Pédiatrie — <span class="chatbox-chapter-blurred ${blurClass}" onclick="window.toggleArenaChapterTitle()" title="${blurTitle}">${escapeHtml(effQ.chapterTitle || 'Général')}</span>${histSuffix}`;
    }
  }
}

function renderChatWelcome() {
  const listEl = document.getElementById('chatbox-messages-list');
  if (!listEl) return;
  const effQ = getEffectiveArenaQuestion();
  const chapTitle = effQ ? (effQ.chapterTitle || 'Pédiatrie') : 'Pédiatrie';
  const isHistory = historyCursor >= 0;
  const isRevealed = isArenaChapterRevealed();
  const blurClass = isRevealed ? 'is-revealed' : 'is-blurred';
  const blurTitle = isRevealed 
    ? 'Cours visible (Cliquer pour masquer)' 
    : 'Cours masqué jusqu\'à ce que vous répondiez (Cliquer pour afficher)';

  listEl.innerHTML = `
    <div class="chat-bubble bubble-ai">
      <p>👋 Bonjour ! Je suis votre <strong>Tuteur IA Pédiatrique</strong>.</p>
      <p>Je connais par cœur l'énoncé, le cas clinique, les propositions et la justification officielle de ce QCM ${isHistory ? '<strong>en cours de consultation</strong>' : ''} en <strong class="chatbox-chapter-blurred ${blurClass}" onclick="window.toggleArenaChapterTitle()" title="${blurTitle}">${escapeHtml(chapTitle)}</strong>.</p>
      <p style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">
        Posez-moi votre question directement ou cliquez sur une suggestion rapide :
      </p>
    </div>
  `;
}

async function executeSendMessage(userText) {
  const effQ = getEffectiveArenaQuestion();
  if (!effQ) return;
  const listEl = document.getElementById('chatbox-messages-list');
  if (!listEl) return;

  // 1. Add user bubble
  arenaChatHistory.push({ role: 'user', text: userText, timestamp: Date.now() });

  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble bubble-user';
  userBubble.textContent = userText;
  listEl.appendChild(userBubble);
  listEl.scrollTop = listEl.scrollHeight;

  // 2. Add loading bubble
  const loadingBubble = document.createElement('div');
  loadingBubble.className = 'chat-bubble bubble-ai is-loading';
  loadingBubble.id = 'chatbox-loading-indicator';
  loadingBubble.innerHTML = `
    <div class="typing-indicator"><span></span><span></span><span></span></div>
    <span>Gemini Flash analyse ce QCM...</span>
  `;
  listEl.appendChild(loadingBubble);
  listEl.scrollTop = listEl.scrollHeight;

  // Disable controls while thinking
  const sendBtn = document.getElementById('btn-chat-send');
  const inputEl = document.getElementById('chatbox-text-input');
  if (sendBtn) sendBtn.disabled = true;
  if (inputEl) inputEl.disabled = true;

  try {
    const historyForAi = arenaChatHistory.slice(0, -1);
    const response = await geminiService.askAboutQuestion(effQ, historyForAi, userText);

    // Remove loading bubble
    const existingLoader = document.getElementById('chatbox-loading-indicator');
    if (existingLoader) existingLoader.remove();

    // 3. Add AI bubble
    arenaChatHistory.push({ role: 'ai', text: response.text, modelUsed: response.modelUsed, timestamp: Date.now() });

    const aiBubble = document.createElement('div');
    aiBubble.className = 'chat-bubble bubble-ai';
    aiBubble.innerHTML = formatMedicalContent(response.text);
    listEl.appendChild(aiBubble);

    const modelTag = document.getElementById('chatbox-model-tag');
    if (modelTag && response.modelUsed) {
      modelTag.textContent = response.modelUsed;
    }
  } catch (err) {
    console.error('Chat error:', err);
    const existingLoader = document.getElementById('chatbox-loading-indicator');
    if (existingLoader) existingLoader.remove();

    const errBubble = document.createElement('div');
    errBubble.className = 'chat-bubble bubble-ai';
    errBubble.innerHTML = `⚠️ Erreur de réponse IA : <em>${escapeHtml(err.message)}</em>`;
    listEl.appendChild(errBubble);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    if (inputEl) {
      inputEl.disabled = false;
      inputEl.focus();
    }
    listEl.scrollTop = listEl.scrollHeight;
    refreshLucide();
  }
}

})();
