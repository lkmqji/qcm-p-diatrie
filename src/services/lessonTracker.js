// Lesson Timer & Study Time Tracking Service for PédiaDrill
// Tracks focused study time per lesson/chapter with persistent stopwatch, background tracking, and summary analytics.
import { resolveStorageKey } from './storageScope.js';
import { getActiveModuleId, MEDICAL_YEARS, findModuleById } from './moduleCatalog.js';

function getAllLessonSessionStorageKeys() {
  const keys = new Set(['pedia_lesson_sessions_v1', 'mod_psychiatrie_lesson_sessions']);
  if (Array.isArray(MEDICAL_YEARS)) {
    MEDICAL_YEARS.forEach(year => {
      (year.modules || []).forEach(mod => {
        if (mod && mod.id && typeof resolveStorageKey === 'function') {
          keys.add(resolveStorageKey('lesson_sessions', mod.id));
        }
      });
    });
  }
  return Array.from(keys);
}

function inferModuleFromStorageKey(storageKey) {
  if (!storageKey || storageKey === 'pedia_lesson_sessions_v1') return 'pediatrie';
  const match = storageKey.match(/^mod_(.+)_lesson_sessions$/);
  return match ? match[1] : 'pediatrie';
}

export function identifySessionModule(sess) {
  if (sess && sess.moduleId) {
    return (sess.moduleId === 'psychiatrie_5') ? 'psychiatrie' : sess.moduleId;
  }
  const chId = sess && sess.chapterId;
  const name = sess && sess.lessonName ? sess.lessonName.trim().toLowerCase() : '';

  // 1. Check psychiatrie chapters
  if (typeof window !== 'undefined' && Array.isArray(window.PSY_CHAPTERS)) {
    if (chId && window.PSY_CHAPTERS.some(c => c.id === chId && c.id !== 'autres')) {
      return 'psychiatrie';
    }
    if (name && window.PSY_CHAPTERS.some(c => c.title && c.title.trim().toLowerCase() === name && c.id !== 'autres')) {
      return 'psychiatrie';
    }
  }

  // 2. Check pediatrie chapters
  if (typeof window !== 'undefined' && Array.isArray(window.PEDIA_CHAPTERS)) {
    if (chId && window.PEDIA_CHAPTERS.some(c => c.id === chId)) {
      return 'pediatrie';
    }
    if (name && window.PEDIA_CHAPTERS.some(c => c.title && c.title.trim().toLowerCase() === name)) {
      return 'pediatrie';
    }
  }

  return 'pediatrie';
}

function getLessonStateKey() {
  return typeof resolveStorageKey === 'function' ? resolveStorageKey('lesson_tracker_state') : 'pedia_lesson_tracker_state_v1';
}

function getLessonSessionsKey() {
  return typeof resolveStorageKey === 'function' ? resolveStorageKey('lesson_sessions') : 'pedia_lesson_sessions_v1';
}

function getLessonClearedKey() {
  return typeof resolveStorageKey === 'function' ? resolveStorageKey('lesson_timer_cleared') : 'pedia_lesson_timer_cleared_at';
}

export class LessonTracker {
  constructor() {
    this.activeTimer = this.loadActiveTimer();
    this.sessions = this.loadSessions();
    this.lastTimerClearedAt = (typeof localStorage !== 'undefined') ? Number(localStorage.getItem(getLessonClearedKey()) || 0) : 0;
  }

  reloadForModule() {
    this.activeTimer = this.loadActiveTimer();
    this.sessions = this.loadSessions();
    this.lastTimerClearedAt = (typeof localStorage !== 'undefined') ? Number(localStorage.getItem(getLessonClearedKey()) || 0) : 0;
  }

  loadActiveTimer() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(getLessonStateKey());
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
        localStorage.setItem(getLessonStateKey(), JSON.stringify(this.activeTimer));
      } else {
        localStorage.removeItem(getLessonStateKey());
        localStorage.setItem(getLessonClearedKey(), String(this.lastTimerClearedAt || Date.now()));
      }
    } catch (e) {
      console.warn('Failed to save active lesson timer:', e);
    }
  }

  loadSessions() {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(getLessonSessionsKey());
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
      localStorage.setItem(getLessonSessionsKey(), JSON.stringify(this.sessions));
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

  getActiveTimer() {
    return this.activeTimer ? { ...this.activeTimer } : null;
  }

  getLastTimerUpdatedAt() {
    return this.activeTimer ? (this.activeTimer.updatedAt || 0) : (this.lastTimerClearedAt || 0);
  }

  /**
   * Start a new lesson stopwatch timer with optional initial offset in seconds
   */
  startTimer(lessonName, chapterId = null, offsetSeconds = 0, moduleId = null) {
    const cleanName = (lessonName || '').trim() || 'Leçon sans titre';
    const now = Date.now();
    const offsetMs = Math.max(0, Math.floor((Number(offsetSeconds) || 0) * 1000));
    const activeModId = moduleId || (typeof getActiveModuleId === 'function' ? getActiveModuleId() : 'pediatrie');

    this.activeTimer = {
      lessonName: cleanName,
      chapterId: chapterId || null,
      moduleId: activeModId,
      isRunning: true,
      isPaused: false,
      startTimestamp: now,
      accumulatedMs: offsetMs,
      initialStartTimestamp: now - offsetMs,
      updatedAt: now
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
    this.activeTimer.updatedAt = now;
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

    const now = Date.now();
    this.activeTimer.startTimestamp = now;
    this.activeTimer.isPaused = false;
    this.activeTimer.updatedAt = now;
    this.saveActiveTimer();
    return this.activeTimer;
  }

  /**
   * Merge remote active timer from multi-device Firestore synchronization
   */
  mergeActiveTimer(remoteTimer, remoteUpdatedAt = null) {
    const localUpdatedAt = this.getLastTimerUpdatedAt();
    const rUpdatedAt = (remoteTimer && remoteTimer.updatedAt) || Number(remoteUpdatedAt) || 0;

    // If remote explicitly cleared the timer more recently than local update
    if (!remoteTimer) {
      if (rUpdatedAt > localUpdatedAt && this.activeTimer) {
        this.activeTimer = null;
        this.lastTimerClearedAt = rUpdatedAt;
        this.saveActiveTimer();
        return true;
      }
      return false;
    }

    // Remote has an active timer:
    // If local has no active timer, or remote is strictly newer
    if (!this.activeTimer || rUpdatedAt > localUpdatedAt) {
      this.activeTimer = { ...remoteTimer };
      this.saveActiveTimer();
      return true;
    }

    return false;
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
   * Record a completed session directly (e.g. studied offline without starting timer)
   */
  addManualSession(sessionData) {
    if (!sessionData) return null;
    const cleanName = (sessionData.lessonName || '').trim() || 'Leçon sans titre';
    const durationSeconds = Math.max(1, Math.floor(Number(sessionData.durationSeconds) || 0));
    const now = Date.now();
    const dateStr = sessionData.dateStr || this.getTodayDateStr();
    const activeModId = sessionData.moduleId || (typeof getActiveModuleId === 'function' ? getActiveModuleId() : 'pediatrie');

    const session = {
      id: `sess_manual_${now}_${Math.random().toString(36).substring(2, 7)}`,
      lessonName: cleanName,
      chapterId: sessionData.chapterId || null,
      moduleId: activeModId,
      startTime: now - (durationSeconds * 1000),
      endTime: now,
      durationSeconds,
      dateStr,
      isManual: true
    };

    this.sessions.unshift(session);
    this.saveSessions();
    return session;
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
    const activeModId = this.activeTimer.moduleId || (typeof getActiveModuleId === 'function' ? getActiveModuleId() : 'pediatrie');
    const session = {
      id: `sess_${now}_${Math.random().toString(36).substring(2, 7)}`,
      lessonName: this.activeTimer.lessonName,
      chapterId: this.activeTimer.chapterId || null,
      moduleId: activeModId,
      startTime: this.activeTimer.initialStartTimestamp || (now - durationSeconds * 1000),
      endTime: now,
      durationSeconds,
      dateStr: this.getTodayDateStr()
    };

    this.sessions.unshift(session);
    this.saveSessions();

    this.activeTimer = null;
    this.lastTimerClearedAt = now;
    this.saveActiveTimer();

    return session;
  }

  /**
   * Cancel active timer without saving
   */
  cancelTimer() {
    this.activeTimer = null;
    this.lastTimerClearedAt = Date.now();
    this.saveActiveTimer();
  }

  /**
   * Delete an existing session from history across memory and storage keys
   */
  deleteSession(sessionId) {
    if (!sessionId) return false;
    let modified = false;

    const initialLen = this.sessions.length;
    this.sessions = this.sessions.filter(s => s && s.id !== sessionId);
    if (this.sessions.length !== initialLen) {
      this.saveSessions();
      modified = true;
    }

    if (typeof localStorage !== 'undefined') {
      const storageKeys = getAllLessonSessionStorageKeys();
      storageKeys.forEach(k => {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              const filtered = list.filter(s => s && s.id !== sessionId);
              if (filtered.length !== list.length) {
                localStorage.setItem(k, JSON.stringify(filtered));
                modified = true;
              }
            }
          }
        } catch (e) {}
      });
    }

    return modified;
  }

  /**
   * Loads all sessions across all medical modules with deterministic attribution
   */
  getAllSessions() {
    try {
      const sessionMap = new Map();

      // 1. In-memory sessions
      (this.sessions || []).forEach(s => {
        if (s && s.id) {
          const modId = identifySessionModule(s);
          sessionMap.set(s.id, { ...s, moduleId: modId });
        }
      });

      // 2. Module storage partitions in localStorage (dynamic across all modules)
      if (typeof localStorage !== 'undefined') {
        const storageKeys = getAllLessonSessionStorageKeys();
        storageKeys.forEach(k => {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                const fallbackMod = inferModuleFromStorageKey(k);
                parsed.forEach(s => {
                  if (s && s.id && !sessionMap.has(s.id)) {
                    const modId = (s.moduleId ? identifySessionModule(s) : null) || identifySessionModule(s) || fallbackMod;
                    sessionMap.set(s.id, { ...s, moduleId: modId });
                  }
                });
              }
            }
          } catch (e) {}
        });
      }

      const all = Array.from(sessionMap.values());
      all.sort((a, b) => (b.endTime || 0) - (a.endTime || 0));
      return all;
    } catch (e) {
      console.warn('Failed to load all sessions across modules:', e);
      return this.sessions || [];
    }
  }

  /**
   * Get recorded sessions, optionally filtered by module ('all' | moduleId)
   */
  getSessions(filterModuleId = 'all') {
    const all = this.getAllSessions();
    if (!filterModuleId || filterModuleId === 'all') {
      return all;
    }
    return all.filter(s => (s.moduleId || identifySessionModule(s)) === filterModuleId);
  }

  /**
   * Aggregates study metrics per lesson, optionally filtered by module
   * Returns array sorted by total duration descending
   */
  getLessonSummaries(filterModuleId = 'all') {
    const map = new Map();
    const sessions = this.getSessions(filterModuleId);

    sessions.forEach(sess => {
      if (!sess || !sess.lessonName) return;
      const key = sess.lessonName.trim().toLowerCase();

      if (!map.has(key)) {
        const modId = sess.moduleId || identifySessionModule(sess);
        const modMeta = typeof findModuleById === 'function' ? findModuleById(modId) : null;
        const moduleTitle = modId === 'psychiatrie' ? 'Psychiatrie' : (modId === 'pediatrie' ? 'Pédiatrie' : (modMeta?.title || modId));
        map.set(key, {
          lessonName: sess.lessonName.trim(),
          chapterId: sess.chapterId || null,
          moduleId: modId,
          moduleTitle,
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
    if (!Array.isArray(remoteSessions) || remoteSessions.length === 0) return false;

    const allExisting = this.getAllSessions();
    const existingIds = new Set(allExisting.map(s => s && s.id).filter(Boolean));
    const toAdd = [];

    remoteSessions.forEach(remoteSess => {
      if (!remoteSess || !remoteSess.lessonName || !remoteSess.durationSeconds) return;

      if (remoteSess.id && existingIds.has(remoteSess.id)) {
        return; // Already present
      }

      // Check for fuzzy duplicate (same lesson, same start time within 5s window)
      const isDuplicate = allExisting.some(s => 
        s && s.lessonName === remoteSess.lessonName &&
        Math.abs((s.startTime || 0) - (remoteSess.startTime || 0)) < 5000
      );

      if (!isDuplicate) {
        const enriched = { ...remoteSess, moduleId: identifySessionModule(remoteSess) };
        toAdd.push(enriched);
        if (remoteSess.id) existingIds.add(remoteSess.id);
      }
    });

    if (toAdd.length > 0) {
      if (typeof localStorage !== 'undefined') {
        const groupedByMod = new Map();
        toAdd.forEach(s => {
          const modId = s.moduleId || 'pediatrie';
          if (!groupedByMod.has(modId)) groupedByMod.set(modId, []);
          groupedByMod.get(modId).push(s);
        });

        for (const [modId, items] of groupedByMod.entries()) {
          const storageKey = typeof resolveStorageKey === 'function'
            ? resolveStorageKey('lesson_sessions', modId)
            : `mod_${modId}_lesson_sessions`;
          try {
            const raw = localStorage.getItem(storageKey);
            const list = (raw && Array.isArray(JSON.parse(raw))) ? JSON.parse(raw) : [];
            const combined = [...list, ...items].sort((a, b) => (b.endTime || 0) - (a.endTime || 0));
            localStorage.setItem(storageKey, JSON.stringify(combined));
          } catch (e) {}
        }
      }

      this.sessions = this.loadSessions();
      return true;
    }
    return false;
  }

  getRawSessions() {
    return this.getAllSessions();
  }
}

export const lessonTracker = new LessonTracker();
