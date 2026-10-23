// Lesson Timer & Study Time Tracking Service for PédiaDrill
// Tracks focused study time per lesson/chapter with persistent stopwatch, background tracking, and summary analytics.

export const LESSON_TRACKER_STATE_KEY = 'pedia_lesson_tracker_state_v1';
export const LESSON_SESSIONS_KEY = 'pedia_lesson_sessions_v1';

export class LessonTracker {
  constructor() {
    this.activeTimer = this.loadActiveTimer();
    this.sessions = this.loadSessions();
  }

  loadActiveTimer() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(LESSON_TRACKER_STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.lessonName) {
        return parsed;
      }
      return null;
    } catch (e) {
      console.warn('Failed to load active lesson timer:', e);
      return null;
    }
  }

  saveActiveTimer() {
    try {
      if (typeof localStorage === 'undefined') return;
      if (this.activeTimer) {
        localStorage.setItem(LESSON_TRACKER_STATE_KEY, JSON.stringify(this.activeTimer));
      } else {
        localStorage.removeItem(LESSON_TRACKER_STATE_KEY);
      }
    } catch (e) {
      console.warn('Failed to save active lesson timer:', e);
    }
  }

  loadSessions() {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(LESSON_SESSIONS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Failed to load lesson sessions:', e);
      return [];
    }
  }

  saveSessions() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(LESSON_SESSIONS_KEY, JSON.stringify(this.sessions));
    } catch (e) {
      console.warn('Failed to save lesson sessions:', e);
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
   * Start a new lesson stopwatch timer
   */
  startTimer(lessonName, chapterId = null) {
    const cleanName = (lessonName || '').trim() || 'Leçon sans titre';
    const now = Date.now();

    this.activeTimer = {
      lessonName: cleanName,
      chapterId: chapterId || null,
      isRunning: true,
      isPaused: false,
      startTimestamp: now,
      accumulatedMs: 0,
      initialStartTimestamp: now
    };

    this.saveActiveTimer();
    return this.activeTimer;
  }

  /**
   * Pause the active timer
   */
  pauseTimer() {
    if (!this.activeTimer || !this.activeTimer.isRunning || this.activeTimer.isPaused) {
      return this.activeTimer;
    }

    const now = Date.now();
    if (this.activeTimer.startTimestamp) {
      this.activeTimer.accumulatedMs += (now - this.activeTimer.startTimestamp);
    }
    this.activeTimer.startTimestamp = null;
    this.activeTimer.isPaused = true;
    this.saveActiveTimer();
    return this.activeTimer;
  }

  /**
   * Resume the active timer
   */
  resumeTimer() {
    if (!this.activeTimer || !this.activeTimer.isRunning || !this.activeTimer.isPaused) {
      return this.activeTimer;
    }

    this.activeTimer.startTimestamp = Date.now();
    this.activeTimer.isPaused = false;
    this.saveActiveTimer();
    return this.activeTimer;
  }

  /**
   * Get total elapsed time in milliseconds
   */
  getElapsedTimeMs() {
    if (!this.activeTimer || !this.activeTimer.isRunning) return 0;
    let totalMs = this.activeTimer.accumulatedMs || 0;
    if (!this.activeTimer.isPaused && this.activeTimer.startTimestamp) {
      totalMs += (Date.now() - this.activeTimer.startTimestamp);
    }
    return totalMs;
  }

  /**
   * Get total elapsed time in whole seconds
   */
  getElapsedTimeSeconds() {
    return Math.floor(this.getElapsedTimeMs() / 1000);
  }

  /**
   * Stop active timer and record session in persistent history
   */
  stopAndSaveSession() {
    if (!this.activeTimer) return null;

    const durationSeconds = this.getElapsedTimeSeconds();
    if (durationSeconds < 1) {
      // Too short to record as a meaningful session
      this.cancelTimer();
      return null;
    }

    const now = Date.now();
    const session = {
      id: `sess_${now}_${Math.random().toString(36).substring(2, 7)}`,
      lessonName: this.activeTimer.lessonName,
      chapterId: this.activeTimer.chapterId || null,
      startTime: this.activeTimer.initialStartTimestamp || (now - durationSeconds * 1000),
      endTime: now,
      durationSeconds,
      dateStr: this.getTodayDateStr()
    };

    this.sessions.unshift(session);
    this.saveSessions();

    this.activeTimer = null;
    this.saveActiveTimer();

    return session;
  }

  /**
   * Cancel active timer without saving
   */
  cancelTimer() {
    this.activeTimer = null;
    this.saveActiveTimer();
  }

  /**
   * Delete an existing session from history
   */
  deleteSession(sessionId) {
    if (!sessionId) return false;
    const initialLen = this.sessions.length;
    this.sessions = this.sessions.filter(s => s && s.id !== sessionId);
    if (this.sessions.length !== initialLen) {
      this.saveSessions();
      return true;
    }
    return false;
  }

  /**
   * Get all recorded sessions
   */
  getSessions() {
    return Array.isArray(this.sessions) ? [...this.sessions] : [];
  }

  /**
   * Aggregates study metrics per lesson
   * Returns array sorted by total duration descending
   */
  getLessonSummaries() {
    const map = new Map();

    (this.sessions || []).forEach(sess => {
      if (!sess || !sess.lessonName) return;
      const key = sess.lessonName.trim().toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          lessonName: sess.lessonName.trim(),
          chapterId: sess.chapterId || null,
          totalDurationSeconds: 0,
          sessionsCount: 0,
          lastSessionTimestamp: 0,
          lastSessionDateStr: ''
        });
      }

      const item = map.get(key);
      item.totalDurationSeconds += (sess.durationSeconds || 0);
      item.sessionsCount += 1;
      const sessEnd = sess.endTime || 0;
      if (sessEnd > item.lastSessionTimestamp) {
        item.lastSessionTimestamp = sessEnd;
        item.lastSessionDateStr = sess.dateStr || '';
      }
    });

    const summaries = Array.from(map.values());
    summaries.sort((a, b) => b.totalDurationSeconds - a.totalDurationSeconds || b.lastSessionTimestamp - a.lastSessionTimestamp);
    return summaries;
  }

  /**
   * Merge remote sessions from Firestore multi-device synchronization
   */
  mergeSessions(remoteSessions) {
    if (!Array.isArray(remoteSessions) || remoteSessions.length === 0) return;

    const existingIds = new Set(this.sessions.map(s => s && s.id).filter(Boolean));
    const merged = [...this.sessions];
    let modified = false;

    remoteSessions.forEach(remoteSess => {
      if (!remoteSess || !remoteSess.lessonName || !remoteSess.durationSeconds) return;

      if (remoteSess.id && existingIds.has(remoteSess.id)) {
        return; // Already present
      }

      // Check for fuzzy duplicate (same lesson, same start time within 5s window)
      const isDuplicate = merged.some(s => 
        s && s.lessonName === remoteSess.lessonName &&
        Math.abs((s.startTime || 0) - (remoteSess.startTime || 0)) < 5000
      );

      if (!isDuplicate) {
        merged.push(remoteSess);
        if (remoteSess.id) existingIds.add(remoteSess.id);
        modified = true;
      }
    });

    if (modified) {
      // Sort newest first
      merged.sort((a, b) => (b.endTime || 0) - (a.endTime || 0));
      this.sessions = merged;
      this.saveSessions();
    }
  }

  getRawSessions() {
    return this.sessions;
  }
}

export const lessonTracker = new LessonTracker();
