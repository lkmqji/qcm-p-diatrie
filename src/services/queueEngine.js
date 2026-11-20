// Spaced Repetition Queue Engine with Dynamic Penalty & Mastery Thresholds
import { resolveStorageKey } from './storageScope.js';

function getStorageKey() {
  return typeof resolveStorageKey === 'function' ? resolveStorageKey('drill_state') : 'pedia_drill_state_v1';
}

function getReasoningKey() {
  return typeof resolveStorageKey === 'function' ? resolveStorageKey('reasoning_notes') : 'pedia_drill_reasoning_notes_v1';
}

function getTodayTrackerKey() {
  return typeof resolveStorageKey === 'function' ? resolveStorageKey('today_tracker') : 'pedia_today_tracker';
}

/**
 * Strips redundant static question data (questionText, options, clinicalCase, explanation)
 * that is already permanently bundled in PEDIA_QUESTIONS. Keeps only user attempt data
 * and AI reasoning note text. Reduces note storage footprint by ~80%.
 */
export function slimNote(note) {
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

let cachedQuestionsMap = null;
let lastQuestionsListRef = null;

export function getQuestionsMap(questionsList = []) {
  if (questionsList instanceof Map) return questionsList;
  if (!cachedQuestionsMap || lastQuestionsListRef !== questionsList) {
    lastQuestionsListRef = questionsList;
    cachedQuestionsMap = new Map((Array.isArray(questionsList) ? questionsList : []).map(q => [q.uid, q]));
  }
  return cachedQuestionsMap;
}

/**
 * Re-hydrates a slim note with full question metadata from the question bank.
 */
export function hydrateNote(note, questionsList = []) {
  if (!note || typeof note !== 'object') return note;
  const qMap = getQuestionsMap(questionsList);
  let q = qMap.get(note.questionUid) || null;
  if (!q && typeof window !== 'undefined') {
    if (note.questionUid && note.questionUid.startsWith('psy_') && window.PSY_QUESTIONS) {
      q = window.PSY_QUESTIONS.find(x => x.uid === note.questionUid) || null;
    } else if (window.PEDIA_QUESTIONS) {
      q = window.PEDIA_QUESTIONS.find(x => x.uid === note.questionUid) || null;
    }
  }

  const defaultChapter = (note.questionUid && note.questionUid.startsWith('psy_'))
    ? 'Psychiatrie Générale'
    : 'Pédiatrie Générale';

  if (!q) {
    return {
      ...note,
      chapterTitle: note.chapterTitle || defaultChapter,
      options: note.options || [],
      questionText: note.questionText || '',
      clinicalCase: note.clinicalCase || null,
      officialExplanation: note.officialExplanation || ''
    };
  }
  return {
    ...note,
    questionText: note.questionText || q.question || q.statement || '',
    clinicalCase: note.clinicalCase !== undefined ? note.clinicalCase : (q.clinical_case || null),
    chapterTitle: note.chapterTitle || q.chapterTitle || defaultChapter,
    options: (note.options && note.options.length > 0) ? note.options : (q.options || []),
    media_urls: (note.media_urls && note.media_urls.length > 0) ? note.media_urls : (q.media_urls || []),
    officialExplanation: note.officialExplanation || q.explanation || '',
    correctAnswer: note.correctAnswer || (q.is_croq ? q.croq_answer : '') || ''
  };
}

export class QueueEngine {
  constructor(allQuestions = [], chapters = []) {
    this.allQuestions = allQuestions;
    this.chapters = chapters;
    this.questionsMap = getQuestionsMap(allQuestions);
    this._cachedMetrics = null;
    this.selectedChapterIds = []; // Empty = all chapters (Grand Mix)
    this.selectedChaptersUpdatedAt = 0; // Timestamp of last chapter selection change
    
    // Per-question state map: uid -> { target: number, current: number, mistakes: number, done: boolean }
    this.stats = {};
    
    // Ordered array of question UIDs currently in the spaced queue
    this.queue = [];
    
    // Index of the current question in this.queue
    this.cursor = 0;
    
    // Total mistakes counter
    this.totalMistakesCount = 0;

    // Per-question snoozed map: uid -> 'YYYY-MM-DD'
    this.snoozedQuestions = {};

    // Load persisted state if exists
    this.loadState();
  }

  setQuestions(allQuestions, chapters) {
    this.allQuestions = allQuestions;
    this.chapters = chapters;
    this.questionsMap = getQuestionsMap(allQuestions);
    this._cachedMetrics = null;
    if (this.queue.length === 0) {
      this.initSession();
    }
  }

  loadState() {
    try {
      this.sanitizeReasoningNotesStorage();
      const saved = localStorage.getItem(getStorageKey());
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
        this.selectedChaptersUpdatedAt = parsed.selectedChaptersUpdatedAt || 0;
        this.totalMistakesCount = parsed.totalMistakesCount || 0;
        this.snoozedQuestions = (parsed.snoozedQuestions && typeof parsed.snoozedQuestions === 'object') ? parsed.snoozedQuestions : {};
        this.cleanExpiredSnoozes();
      }
      this.autoHealNotesFromMistakes();
    } catch (err) {
      console.warn("Failed to load queue engine state:", err);
    }
  }

  /**
   * Automatically reconstructs baseline reasoning notes for any question
   * that was missed in training (mistakes >= 1) if no note currently exists in storage.
   */
  autoHealNotesFromMistakes() {
    if (typeof localStorage === 'undefined') return;
    try {
      const rawNotes = this.getRawReasoningNotes();
      const existingUids = new Set(rawNotes.map(n => n && n.questionUid).filter(Boolean));
      const healedNotes = [];

      for (const [uid, stat] of Object.entries(this.stats || {})) {
        if (!stat || !stat.mistakes || stat.mistakes <= 0) continue;
        if (existingUids.has(uid)) continue;

        let q = (this.questionsMap && this.questionsMap.get(uid)) || null;
        if (!q && typeof window !== 'undefined') {
          if (uid.startsWith('psy_') && window.PSY_QUESTIONS) {
            q = window.PSY_QUESTIONS.find(x => x.uid === uid) || null;
          } else if (window.PEDIA_QUESTIONS) {
            q = window.PEDIA_QUESTIONS.find(x => x.uid === uid) || null;
          }
        }
        if (!q) continue;

        const isCroq = !!q.is_croq;
        const correctLetters = isCroq ? [] : (q.options || []).filter(o => o.is_correct).map(o => o.letter);
        const correctText = isCroq 
          ? (q.croq_answer || '') 
          : (q.options || []).filter(o => o.is_correct).map(o => `${o.letter}. ${o.text}`).join(' | ');

        const defaultChap = uid.startsWith('psy_') ? 'Psychiatrie Générale' : 'Pédiatrie Générale';
        const chapTitle = q.chapterTitle || defaultChap;
        const expText = (q.explanation && q.explanation.trim()) 
          ? q.explanation.trim() 
          : `Référence clinique officielle pour le cours ${chapTitle}.`;

        const noteText = `### 1. 🎯 ANALYSE DE L'ERREUR & CONTEXTE :
* **Statut de révision :** Question manquée lors de votre entraînement (${stat.mistakes} faute${stat.mistakes > 1 ? 's' : ''}).
* **Ancrage du bon réflexe :** Vous pouvez déclencher une analyse IA approfondie (Gemini Flash) ou réviser la démarche ci-dessous.

### 2. 📋 EXPLICATION & RÉPONSE OFFICIELLE :
${expText}`;

        healedNotes.push({
          id: `note_auto_${uid}`,
          questionUid: uid,
          questionText: q.question || q.statement || '',
          chapterTitle: chapTitle,
          options: q.options || [],
          userAnswer: isCroq ? 'Révision nécessaire' : (correctLetters.length > 0 ? `Non cochée (${correctLetters.join(', ')})` : 'Erreur'),
          userAnswerLetters: [],
          correctAnswer: correctText,
          officialExplanation: q.explanation || '',
          score: null,
          isCroq: isCroq,
          reasoningNote: noteText,
          modelUsed: 'Base Officielle (Auto-Raisonnement)',
          timestamp: Date.now() - 1000
        });
        existingUids.add(uid);
      }

      if (healedNotes.length > 0) {
        console.log(`[QueueEngine] Auto-healed ${healedNotes.length} reasoning note(s) from recorded mistakes.`);
        const updated = [...healedNotes, ...rawNotes].slice(0, 500);
        localStorage.setItem(getReasoningKey(), JSON.stringify(updated.map(n => slimNote(n))));
      }
    } catch (err) {
      console.warn('[QueueEngine] Auto-heal notes failed:', err);
    }
  }

  /**
   * Migrate and optimize any legacy bloated notes in localStorage to lean format
   */
  sanitizeReasoningNotesStorage() {
    try {
      const raw = localStorage.getItem(getReasoningKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const hasBloated = parsed.some(n => n && (n.questionText || n.options || n.clinicalCase || n.officialExplanation));
        if (hasBloated) {
          console.log(`[Storage] Optimizing ${parsed.length} reasoning notes to lean format...`);
          const slimmed = parsed.map(n => slimNote(n));
          localStorage.setItem(getReasoningKey(), JSON.stringify(slimmed));
        }
      }
    } catch (e) {
      console.warn("Failed to sanitize reasoning notes storage:", e);
    }
  }

  saveState() {
    this._cachedMetrics = null;
    try {
      const data = {
        stats: this.stats,
        queue: this.queue,
        cursor: this.cursor,
        selectedChapterIds: this.selectedChapterIds,
        selectedChaptersUpdatedAt: this.selectedChaptersUpdatedAt || Date.now(),
        totalMistakesCount: this.totalMistakesCount,
        snoozedQuestions: this.snoozedQuestions || {},
        lastUpdated: Date.now()
      };
      localStorage.setItem(getStorageKey(), JSON.stringify(data));
    } catch (err) {
      console.warn("Failed to save state:", err);
    }
  }

  /**
   * Initialize or reset a session with selected chapters (or all)
   */
  initSession(chapterIds = []) {
    this.selectedChapterIds = chapterIds;
    this.selectedChaptersUpdatedAt = Date.now();
    
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

    const todayStr = this.getTodayDateStr();
    this.cleanExpiredSnoozes(todayStr);

    // Build initial queue from unmastered and un-snoozed questions in randomized order
    const unmasteredUids = filtered
      .filter(q => !this.stats[q.uid].done && !this.isQuestionSnoozed(q.uid, todayStr))
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

    const todayStr = this.getTodayDateStr();
    let iterations = 0;
    while (this.queue.length > 0 && iterations < this.queue.length) {
      if (this.cursor >= this.queue.length) {
        this.cursor = 0;
      }
      const uid = this.queue[this.cursor];
      const isSnoozed = this.isQuestionSnoozed(uid, todayStr);
      const isDone = this.stats[uid] && this.stats[uid].done;

      if (isSnoozed || isDone) {
        this.queue.splice(this.cursor, 1);
      } else {
        return (this.questionsMap ? this.questionsMap.get(uid) : this.allQuestions.find(q => q.uid === uid)) || null;
      }
      iterations++;
    }

    return null;
  }

  getTodayDateStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  isQuestionSnoozed(uid, dateStr = this.getTodayDateStr()) {
    if (!this.snoozedQuestions || !this.snoozedQuestions[uid]) return false;
    return this.snoozedQuestions[uid] === dateStr;
  }

  cleanExpiredSnoozes(currentDateStr = this.getTodayDateStr()) {
    if (!this.snoozedQuestions || typeof this.snoozedQuestions !== 'object') {
      this.snoozedQuestions = {};
      return;
    }
    let changed = false;
    for (const [uid, dateStr] of Object.entries(this.snoozedQuestions)) {
      if (dateStr !== currentDateStr) {
        delete this.snoozedQuestions[uid];
        changed = true;
      }
    }
    if (changed) {
      this.saveState();
    }
  }

  snoozeQuestionForToday(uid) {
    if (!uid) return null;
    const today = this.getTodayDateStr();
    if (!this.snoozedQuestions) this.snoozedQuestions = {};
    this.snoozedQuestions[uid] = today;

    // Retirer la question de la file active du jour
    const indexInQueue = this.queue.indexOf(uid);
    if (indexInQueue !== -1) {
      this.queue.splice(indexInQueue, 1);
      if (this.cursor >= this.queue.length && this.queue.length > 0) {
        this.cursor = 0;
      }
    }

    this.saveState();
    return {
      uid,
      snoozedDate: today,
      remainingInQueue: this.queue.length,
      totalSnoozedToday: this.getSnoozedCountToday(today)
    };
  }

  unsnoozeQuestion(uid) {
    if (!uid || !this.snoozedQuestions) return false;
    if (this.snoozedQuestions[uid]) {
      delete this.snoozedQuestions[uid];
      const st = this.getQuestionStats(uid);
      if (!st.done && !this.queue.includes(uid)) {
        this.queue.splice(this.cursor, 0, uid);
      }
      this.saveState();
      return true;
    }
    return false;
  }

  unsnoozeAllForToday() {
    const today = this.getTodayDateStr();
    let count = 0;
    if (this.snoozedQuestions) {
      for (const [uid, dateStr] of Object.entries(this.snoozedQuestions)) {
        if (dateStr === today) {
          delete this.snoozedQuestions[uid];
          const st = this.getQuestionStats(uid);
          if (!st.done && !this.queue.includes(uid)) {
            this.queue.push(uid);
          }
          count++;
        }
      }
    }
    if (count > 0) {
      this.queue = this.shuffleArray(this.queue);
      this.cursor = 0;
      this.saveState();
    }
    return count;
  }

  getSnoozedCountToday(today = this.getTodayDateStr()) {
    if (!this.snoozedQuestions) return 0;
    return Object.values(this.snoozedQuestions).filter(d => d === today).length;
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
   * Process full clinical case validation when 100% of questions are answered correctly
   * - Advances all questions of the case (+1 current success)
   * - Marks mastered questions if current >= target
   * - Distributes remaining questions in the queue
   */
  handleClinicalCaseSuccess(uids = []) {
    if (!Array.isArray(uids) || uids.length === 0) return { success: true, count: 0, activeCreditedCount: 0, alreadyMasteredCount: 0, newlyMasteredCount: 0 };
    const results = [];
    let newlyMasteredCount = 0;
    let alreadyMasteredCount = 0;
    let activeCreditedCount = 0;

    // Remove all case uids from their current positions in the queue
    uids.forEach(uid => {
      let idx;
      while ((idx = this.queue.indexOf(uid)) !== -1) {
        this.queue.splice(idx, 1);
        if (idx < this.cursor && this.cursor > 0) {
          this.cursor--;
        }
      }
    });

    // Advance each question: ONLY non-cleaned questions advance and count
    uids.forEach(uid => {
      const st = this.getQuestionStats(uid);
      const wasAlreadyDone = !!st.done;

      if (wasAlreadyDone) {
        alreadyMasteredCount++;
        results.push({
          uid,
          wasAlreadyDone: true,
          newCurrent: st.current,
          target: st.target,
          permanentlyRemoved: false,
          pushDistance: 0
        });
        return;
      }

      // Question active (non encore nettoyée)
      activeCreditedCount++;
      st.current += 1;
      let permanentlyRemoved = false;
      let pushDistance = 0;

      if (st.current >= st.target) {
        st.done = true;
        permanentlyRemoved = true;
        newlyMasteredCount++;
      } else {
        const remainingNeeded = st.target - st.current;
        let insertIndex;

        if (remainingNeeded === 1) {
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
          pushDistance = Math.floor(Math.random() * 51) + 50;
          insertIndex = Math.min(this.queue.length, this.cursor + pushDistance);
        }
        this.queue.splice(insertIndex, 0, uid);
      }

      results.push({
        uid,
        wasAlreadyDone: false,
        newCurrent: st.current,
        target: st.target,
        permanentlyRemoved,
        pushDistance
      });
    });

    if (this.cursor >= this.queue.length && this.queue.length > 0) {
      this.cursor = 0;
    }

    this.saveState();
    return {
      success: true,
      totalCount: uids.length,
      activeCreditedCount,
      alreadyMasteredCount,
      newlyMasteredCount,
      masteredCount: newlyMasteredCount,
      results,
      remainingInQueue: this.queue.length
    };
  }

  /**
   * Process full clinical case validation when at least 1 question is incorrect
   * Strict Rule:
   * - ZERO question is credited with a success (none of the questions advance)
   * - Failed questions get mistakes++ and target incremented (or decremented if target >= 10)
   * - ALL questions of the clinical case are removed from their current positions
   *   and re-inserted as a contiguous block in 5 to 7 cards to reappear together for retrieval!
   */
  handleClinicalCaseFailure(allCaseUids = [], failedUids = []) {
    if (!Array.isArray(allCaseUids) || allCaseUids.length === 0) return { success: false, failedCount: 0 };
    const failedSet = new Set(failedUids);

    // Apply penalties to failed questions
    failedUids.forEach(uid => {
      const st = this.getQuestionStats(uid);
      const targetWasAtMax = st.target >= 10;
      st.mistakes += 1;
      this.totalMistakesCount += 1;

      if (targetWasAtMax) {
        if (st.current > 0) st.current -= 1;
      } else {
        st.target = Math.min(10, 3 + st.mistakes);
      }
    });

    // Remove ALL questions of the case from the queue first
    allCaseUids.forEach(uid => {
      let idx;
      while ((idx = this.queue.indexOf(uid)) !== -1) {
        this.queue.splice(idx, 1);
        if (idx < this.cursor && this.cursor > 0) {
          this.cursor--;
        }
      }
    });

    // Re-insert the whole clinical case GROUPED CONTIGUOUSLY in 5 to 7 cards
    const pushDistance = Math.floor(Math.random() * 3) + 5; // 5 to 7
    const insertIndex = Math.min(this.queue.length, this.cursor + pushDistance);

    // Splice in the contiguous case questions
    this.queue.splice(insertIndex, 0, ...allCaseUids);

    if (this.cursor >= this.queue.length && this.queue.length > 0) {
      this.cursor = 0;
    }

    this.saveState();

    return {
      success: false,
      totalCount: allCaseUids.length,
      failedCount: failedUids.length,
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
    if (this._cachedMetrics) {
      return this._cachedMetrics;
    }
    const totalPoolCount = this.allQuestions.length;
    let remainingDistinctQuestions = 0;
    let totalIterationsRequired = 0;
    let masteredCount = 0;

    for (let i = 0; i < totalPoolCount; i++) {
      const q = this.allQuestions[i];
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

    this._cachedMetrics = {
      totalPoolCount,
      remainingDistinctQuestions,
      totalIterationsRequired,
      masteredCount,
      progressPct,
      queueLength: this.queue.length,
      totalMistakes: this.totalMistakesCount,
      selectedChaptersCount: this.selectedChapterIds ? this.selectedChapterIds.length : 0
    };
    return this._cachedMetrics;
  }

  /**
   * Save a reasoning note to the dedicated notebook in lean format
   */
  saveReasoningNote(noteData) {
    try {
      const existing = this.getRawReasoningNotes();
      const slimmed = slimNote(noteData);
      const updated = [slimmed, ...existing.filter(n => n.questionUid !== noteData.questionUid || n.id !== noteData.id)];
      localStorage.setItem(getReasoningKey(), JSON.stringify(updated.slice(0, 500))); // Keep up to 500 notes
    } catch (err) {
      console.warn("Failed to save reasoning note:", err);
    }
  }

  getRawReasoningNotes() {
    try {
      const raw = localStorage.getItem(getReasoningKey());
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  getReasoningNotes() {
    try {
      this.autoHealNotesFromMistakes();
      const rawNotes = this.getRawReasoningNotes();
      const qMap = this.questionsMap || getQuestionsMap(this.allQuestions);
      return rawNotes.map(n => hydrateNote(n, qMap));
    } catch {
      return [];
    }
  }

  deleteReasoningNote(id) {
    try {
      const notes = this.getRawReasoningNotes().filter(n => n.id !== id);
      localStorage.setItem(getReasoningKey(), JSON.stringify(notes));
    } catch {}
  }

  deleteReasoningNotesByQuestionUid(questionUid) {
    if (!questionUid) return;
    try {
      const notes = this.getRawReasoningNotes().filter(n => n.questionUid !== questionUid);
      localStorage.setItem(getReasoningKey(), JSON.stringify(notes));
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
      const raw = localStorage.getItem(getTodayTrackerKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.dateStr === todayStr) {
          return parsed;
        }
      }
    } catch {}
    const fresh = { dateStr: todayStr, count: 0 };
    try {
      localStorage.setItem(getTodayTrackerKey(), JSON.stringify(fresh));
    } catch {}
    return fresh;
  }

  incrementTodayCount(amount = 1) {
    const tracker = this.getTodayTracker();
    tracker.count = (tracker.count || 0) + (amount > 0 ? amount : 1);
    try {
      localStorage.setItem(getTodayTrackerKey(), JSON.stringify(tracker));
    } catch {}
    return tracker.count;
  }

  /**
   * Switch active module dataset and reinitialize queue/stats
   */
  switchModule(newQuestions, newChapters) {
    this.saveState();
    this.allQuestions = newQuestions || [];
    this.chapters = newChapters || [];
    this.questionsMap = getQuestionsMap(this.allQuestions);
    this._cachedMetrics = null;
    this.stats = {};
    this.queue = [];
    this.cursor = 0;
    this.totalMistakesCount = 0;
    this.selectedChapterIds = [];
    this.snoozedQuestions = {};
    this.loadState();
    this.initSession(this.selectedChapterIds);
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
      selectedChaptersUpdatedAt: this.selectedChaptersUpdatedAt || Date.now(),
      totalMistakesCount: this.totalMistakesCount,
      snoozedQuestions: this.snoozedQuestions || {},
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
      if (Array.isArray(merged.selectedChapterIds)) {
        const prevChapters = (this.selectedChapterIds || []).slice().sort().join(',');
        const newChapters = (merged.selectedChapterIds || []).slice().sort().join(',');
        this.selectedChapterIds = merged.selectedChapterIds;
        if (typeof merged.selectedChaptersUpdatedAt === 'number') {
          this.selectedChaptersUpdatedAt = merged.selectedChaptersUpdatedAt;
        }
        if (prevChapters !== newChapters) {
          // Re-filter and initialize session queue to immediately reflect synchronized chapters
          this.initSession(this.selectedChapterIds);
        }
      }
      if (typeof merged.totalMistakesCount === 'number') this.totalMistakesCount = merged.totalMistakesCount;
      if (merged.snoozedQuestions && typeof merged.snoozedQuestions === 'object') {
        this.snoozedQuestions = { ...(this.snoozedQuestions || {}), ...merged.snoozedQuestions };
        this.cleanExpiredSnoozes();
      }
      if (Array.isArray(merged.reasoningNotes)) {
        const slimmed = merged.reasoningNotes.map(n => slimNote(n));
        localStorage.setItem(getReasoningKey(), JSON.stringify(slimmed.slice(0, 500)));
      }
      if (merged.todayTracker && typeof merged.todayTracker === 'object') {
        const currentTracker = this.getTodayTracker();
        if (merged.todayTracker.dateStr === currentTracker.dateStr) {
          currentTracker.count = Math.max(currentTracker.count, merged.todayTracker.count || 0);
          localStorage.setItem(getTodayTrackerKey(), JSON.stringify(currentTracker));
        }
      }
      this.saveState();
      this.autoHealNotesFromMistakes();
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
