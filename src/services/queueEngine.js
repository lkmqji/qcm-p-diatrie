// Spaced Repetition Queue Engine with Dynamic Penalty & Mastery Thresholds

const STORAGE_KEY = 'pedia_drill_state_v1';
const REASONING_KEY = 'pedia_drill_reasoning_notes_v1';

export class QueueEngine {
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
   * Pushed far back (30 to 40 cards)
   * If threshold met (3, or up to max 10 if penalized), disappears permanently!
   */
  handleSuccess(uid) {
    const st = this.getQuestionStats(uid);
    st.current += 1;

    let permanentlyRemoved = false;
    let pushDistance = 0;

    if (st.current >= st.target) {
      // MASTERED! Remove permanently
      st.done = true;
      permanentlyRemoved = true;
      // Remove from queue completely
      this.queue.splice(this.cursor, 1);
      // Cursor stays on next item (which slid into current index)
    } else {
      // Re-insert further back (+30 to 40 cards)
      pushDistance = Math.floor(Math.random() * 11) + 30; // 30 to 40
      this.queue.splice(this.cursor, 1); // remove from current
      
      const insertIndex = Math.min(this.queue.length, this.cursor + pushDistance);
      this.queue.splice(insertIndex, 0, uid);
      // Cursor stays on current position (points to next item)
    }

    if (this.cursor >= this.queue.length && this.queue.length > 0) {
      this.cursor = 0;
    }

    this.saveState();

    return {
      permanentlyRemoved,
      newCurrent: st.current,
      target: st.target,
      pushDistance,
      remainingInQueue: this.queue.length
    };
  }

  /**
   * Process an incorrect response
   * Penalizes target (3 -> 4 -> 5 ... up to a max cap of 10)
   * Reappears in 5 to 7 cards to reinforce the reflex
   */
  handleFailure(uid) {
    const st = this.getQuestionStats(uid);
    st.mistakes += 1;
    st.target = Math.min(10, 3 + st.mistakes); // Penalty applied, capped at max 10!
    this.totalMistakesCount += 1;

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
   * Save a reasoning note to the dedicated notebook
   */
  saveReasoningNote(noteData) {
    try {
      const existing = this.getReasoningNotes();
      const updated = [noteData, ...existing.filter(n => n.questionUid !== noteData.questionUid || n.id !== noteData.id)];
      localStorage.setItem(REASONING_KEY, JSON.stringify(updated.slice(0, 500))); // Keep up to 500 notes
    } catch (err) {
      console.warn("Failed to save reasoning note:", err);
    }
  }

  getReasoningNotes() {
    try {
      const raw = localStorage.getItem(REASONING_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  deleteReasoningNote(id) {
    try {
      const notes = this.getReasoningNotes().filter(n => n.id !== id);
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
   * Return raw state object
   */
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
   * Return raw state object
   */
  getStateObject() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      stats: this.stats,
      queue: this.queue,
      cursor: this.cursor,
      selectedChapterIds: this.selectedChapterIds,
      totalMistakesCount: this.totalMistakesCount,
      reasoningNotes: this.getReasoningNotes(),
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
   * Apply merged state object safely
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
        localStorage.setItem(REASONING_KEY, JSON.stringify(merged.reasoningNotes));
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
