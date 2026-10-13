// Gemini API Service with Resilience Cascade & Local Fallback
export const DEFAULT_GEMINI_KEY = "AQ.Ab8RN6InNmt_sD2jtOWtfP5veazlJgMEJ85vNfXf2B6St-_gVw";

export const MODEL_CASCADE = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash"
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
   * Execute API call with automatic cascading through MODEL_CASCADE
   */
  async callWithFallback(prompt, systemInstruction = '', maxTokens = 800) {
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
        console.warn(`[Gemini Cascade] ${model} failed (${err.message}), falling back to next model...`);
      }
    }

    throw new Error(`All Gemini models in cascade failed: ${JSON.stringify(errors)}`);
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
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

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
- Réponds STRICTEMENT au format JSON valide suivant, sans aucun markdown ni texte avant ou après :
{
  "score": 85,
  "isValid": true,
  "feedback": "Analyse concise de la réponse : éléments clés présents et manquants.",
  "reasoningNote": "Conseil méthodologique court pour retenir ce point clinique."
}`;

    const userPrompt = `CONTEXTE CLINIQUE : ${clinicalCase || "Aucun"}
QUESTION CROQ : ${questionText}
RÉPONSE MODÈLE OFFICIELLE : ${expectedAnswer}
RÉPONSE DONNÉE PAR L'ÉTUDIANT : ${userAnswer}

Évalue la réponse de l'étudiant et retourne UNIQUEMENT l'objet JSON.`;

    try {
      const result = await this.callWithFallback(userPrompt, systemPrompt, 500);
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
   * Generate short clinical reasoning note for mistake
   */
  async generateReasoningNote(question, selectedLetters, isCroq = false, studentCroq = "") {
    const correctOptions = (question.options || []).filter(o => o.is_correct);
    const correctLetters = correctOptions.map(o => o.letter).join(", ");
    const correctTexts = correctOptions.map(o => `${o.letter}: ${o.text}`).join("\n");
    const allOptionsText = (question.options || []).map(o => `${o.letter}) ${o.text}`).join("\n");

    const systemPrompt = `Tu es un chef de clinique en pédiatrie préparant un étudiant pour le concours de résidanat et major de promotion.
L'étudiant vient de commettre une erreur sur un QCM ou un CROQ.
Génère une note COURTE, PERCUTANTE et CLINIQUE (maximum 120-150 mots) structurée exactement comme suit :
1. 🎯 PIÈGE & DISTRACTEUR : Explique en 1-2 phrases pourquoi cette réponse trompe souvent et où réside le piège.
2. 🩺 MÉTHODE DE RAISONNEMENT : La démarche diagnostique/physiopathologique étape par étape pour trouver la bonne réponse sans hésiter.
3. 💡 RÈGLE D'OR (MÉMO CONCOURS) : Une formule mnémotechnique ou règle courte à mémoriser pour ne plus jamais se tromper.
Sois direct, bienveillant et médicalement rigoureux.`;

    const userPrompt = `MODULE : Pédiatrie - ${question.chapterTitle || ""}
QUESTION : ${question.question}
${question.clinical_case ? `CAS CLINIQUE : ${question.clinical_case}\n` : ""}
OPTIONS DISPONIBLES :
${allOptionsText}
RÉPONSE(S) OFFICIELLEMENT JUSTE(S) : ${correctLetters || question.croq_answer}
RÉPONSE COCHÉE PAR L'ÉTUDIANT : ${isCroq ? studentCroq : selectedLetters.join(", ")}
EXPLICATION OFFICIELLE : ${question.explanation || "Non fournie"}`;

    try {
      const result = await this.callWithFallback(userPrompt, systemPrompt, 500);
      return {
        note: result.text,
        modelUsed: result.modelUsed
      };
    } catch (err) {
      console.warn("Reasoning note generation failed, fallback to structured official explanation:", err);
      return {
        note: `🎯 **PIÈGE & RAPPEL CLÉ**\n${question.explanation || "Revoir les critères diagnostiques et recommandations officielles du cours."}\n\n💡 **RÈGLE D'OR**\nToujours relire attentivement l'énoncé pédiatrique pour repérer les signes de gravité et les valeurs normales selon l'âge.`,
        modelUsed: "Synthèse Clinique Locale"
      };
    }
  }
}

export const geminiService = new GeminiService();
