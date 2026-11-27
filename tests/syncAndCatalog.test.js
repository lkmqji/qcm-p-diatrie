import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installMockBrowserEnv } from './helpers/mockDom.js';

installMockBrowserEnv();

const {
  MEDICAL_YEARS,
  setExamDate,
  getExamDate,
  getAllExamDates,
  setAllExamDates,
  getExamDatesUpdatedAt
} = await import('../src/services/moduleCatalog.js');
const { mergeStates } = await import('../src/services/firebaseSyncService.js');
const { LessonTracker } = await import('../src/services/lessonTracker.js');

describe('ModuleCatalog, Sync Merge & LessonTracker Multi-Module', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    mock.timers.reset();
  });

  it('has accurate declared coursesCount and qcmCount matching module sums for all 6 years', () => {
    for (const year of MEDICAL_YEARS) {
      const sumCourses = year.modules.reduce((acc, m) => acc + m.courses, 0);
      const sumQcm = year.modules.reduce((acc, m) => acc + m.qcm, 0);
      assert.equal(year.modulesCount, year.modules.length, `Year ${year.year} modulesCount mismatch`);
      assert.equal(year.coursesCount, sumCourses, `Year ${year.year} coursesCount mismatch`);
      assert.equal(year.qcmCount, sumQcm, `Year ${year.year} qcmCount mismatch`);
    }
  });

  it('propagates exam date deletions when remoteExamDatesUpdatedAt is newer', () => {
    setExamDate('2026-12-10', 'pediatrie');
    assert.equal(getExamDate('pediatrie'), '2026-12-10');
    const localTs = getExamDatesUpdatedAt();

    // Simulate newer remote state where pediatrie exam date was cleared
    const changed = setAllExamDates({}, localTs + 5000, true);
    assert.equal(changed, true);
    assert.equal(getExamDate('pediatrie'), '');
    assert.deepEqual(getAllExamDates(), {});
  });

  it('aligns todayTracker merge in firebaseSyncService with local calendar date', () => {
    const midnightPlus30 = new Date(2026, 10, 25, 0, 30, 0);
    mock.timers.enable({ apis: ['Date'], now: midnightPlus30 });

    const local = {
      stats: {},
      todayTracker: { dateStr: '2026-11-25', count: 12 },
      reasoningNotes: []
    };
    const remote = {
      stats: {},
      todayTracker: { dateStr: '2026-11-25', count: 18 },
      reasoningNotes: []
    };
    const merged = mergeStates(local, remote);
    assert.equal(merged.todayTracker.dateStr, '2026-11-25');
    assert.equal(merged.todayTracker.count, 18);
  });

  it('handles lesson sessions across any module dynamically (including future 3rd module)', () => {
    const tracker = new LessonTracker();
    const s1 = tracker.addManualSession({
      lessonName: 'Arthrose',
      chapterId: 'arthrose',
      moduleId: 'locomoteur_5',
      durationSeconds: 1800,
      dateStr: '2026-11-24'
    });
    globalThis.localStorage.setItem('mod_locomoteur_5_lesson_sessions', JSON.stringify([s1]));

    const fresh = new LessonTracker();
    const all = fresh.getSessions('all');
    assert.ok(all.some(s => s.id === s1.id && s.moduleId === 'locomoteur_5'));

    const deleted = fresh.deleteSession(s1.id);
    assert.equal(deleted, true);
    assert.equal(fresh.getSessions('locomoteur_5').length, 0);
  });
});
