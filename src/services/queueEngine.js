// Spaced Repetition Queue Engine with Dynamic Penalty & Mastery Thresholds

const STORAGE_KEY = 'pedia_drill_state_v1';
const REASONING_KEY = 'pedia_drill_reasoning_notes_v1';

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

/**
 * Re-hydrates a slim note with full question metadata from the question bank.
 */
export function hydrateNote(note, questionsList = []) {
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

export class QueueEngine {
  constructor(allQuestions = [], chapters = []) {
    this.allQuestions = allQuestions;
    this.chapters = chapters;
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
        this.selectedChaptersUpdatedAt = parsed.selectedChaptersUpdatedAt || 0;
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
        selectedChaptersUpdatedAt: this.selectedChaptersUpdatedAt || Date.now(),
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

  deleteReasoningNotesByQuestionUid(questionUid) {
    if (!questionUid) return;
    try {
      const notes = this.getRawReasoningNotes().filter(n => n.questionUid !== questionUid);
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
      selectedChaptersUpdatedAt: this.selectedChaptersUpdatedAt || Date.now(),
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
