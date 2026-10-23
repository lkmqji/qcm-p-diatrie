// Study Progress & Analytics Tracking Service for PédiaDrill
// Manages daily study history, intelligent sessions, precise question timers, streaks, first-pass discovery tracking, and analytics.

export const STUDY_HISTORY_KEY = 'pedia_study_history_v1';
export const FIRST_PASS_KEY = 'pedia_first_pass_records_v1';
export const INACTIVITY_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes: pause timer
export const SESSION_GAP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes: new session
export const MAX_QUESTION_TIME_CAP_SEC = 180; // 3 minutes cap per question to prevent outlier skew

export class StudyTracker {
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
   * Seed first-pass records from pre-existing queueEngine.stats if available
   */
  seedFirstPassFromExistingStats(queueStats) {
    if (!queueStats || typeof queueStats !== 'object') return;
    let modified = false;
    for (const [uid, st] of Object.entries(queueStats)) {
      if (!st || typeof this.firstPassRecords[uid] !== 'undefined') continue;
      // If questions were answered before tracking:
      if (st.current > 0 && st.mistakes === 0) {
        this.firstPassRecords[uid] = true;
        modified = true;
      } else if (st.mistakes > 0 && st.current === 0) {
        this.firstPassRecords[uid] = false;
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

export const studyTracker = new StudyTracker();
