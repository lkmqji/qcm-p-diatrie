// Gemini API Service with Resilience Cascade & Local Fallback
export const DEFAULT_GEMINI_KEY = "AQ.Ab8RN6InNmt_sD2jtOWtfP5veazlJgMEJ85vNfXf2B6St-_gVw";

export const MODEL_CASCADE = [
  "gemini-3.8-flash"
];

class GeminiService {
  constructor() {
    this.apiKey = localStorage.getItem('pedia_gemini_key') || DEFAULT_GEMINI_KEY;
    this.activeModel = MODEL_CASCADE[0];
    this.lastSuccessfulModel = null;
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

  /**
   * Execute API call strictly with Gemini 3.8 Flash
   */
  async callWithFallback(prompt, systemInstruction = '', maxTokens = 4096) {
    const errors = [];

    for (const model of MODEL_CASCADE) {
      try {
        this.activeModel = model;
        const result = await this._callModel(model, prompt, systemInstruction, maxTokens);
        if (result && result.text) {
          this.lastSuccessfulModel = model;
          this.callLogs.push({ model, success: true, timestamp: Date.now() });
          return { text: result.text, modelUsed: model };
        }
      } catch (err) {
        errors.push({ model, error: err.message });
        console.warn(`[Gemini] ${model} failed (${err.message})`);
      }
    }

    throw new Error(`Gemini 3.8 Flash call failed: ${JSON.stringify(errors)}`);
  }

  async _callModel(model, prompt, systemInstruction, maxTokens) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
    
    const contents = [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ];

    const body = {
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: maxTokens
      }
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout for complete clinical reasoning

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

    return { text: textPart.text.trim() };
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
      const result = await this.callWithFallback(userPrompt, systemPrompt, 2048);
      const cleaned = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
      return {
        score,
        isValid: score >= 75,
        feedback: parsed.feedback || (score >= 75 ? "Réponse conforme aux critères attendus." : "Réponse incomplète ou imprécise."),
        reasoningNote: parsed.reasoningNote || "Raisonnement clinique analysé.",
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
L'étudiant s'entraîne sur un QCM/CROQ et a besoin d'une explication CLINIQUE COMPLÈTE, PARFAITEMENT STRUCTURÉE et EXHAUSTIVE.
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

Rédige en français médical soigné, rigoureux et complet. Ne coupe aucune phrase, ne saute aucune étape.`;

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
      const result = await this.callWithFallback(userPrompt, systemPrompt, 4096);
      return {
        note: result.text,
        modelUsed: result.modelUsed
      };
    } catch (err) {
      console.warn("Reasoning note generation failed, fallback to structured official explanation:", err);
      let localNote = `### 🎯 PIÈGE CLINIQUE & RAPPEL OFFICIEL\n\n`;
      if (question.explanation && question.explanation.trim()) {
        localNote += `${question.explanation.trim()}\n\n`;
      } else {
        localNote += `Revoir attentivement les critères diagnostiques et recommandations du cours *${question.chapterTitle || 'Pédiatrie'}*.\n\n`;
      }
      localNote += `### 💡 RÈGLE D'OR CONCOURS\nEn pédiatrie, toujours vérifier l'âge de l'enfant, l'état vaccinal et les signes de détresse vitale avant de poser un diagnostic.`;
      
      return {
        note: localNote,
        modelUsed: "Synthèse Clinique Locale"
      };
    }
  }
}

export const geminiService = new GeminiService();
