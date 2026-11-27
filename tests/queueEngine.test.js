import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installMockBrowserEnv } from './helpers/mockDom.js';

installMockBrowserEnv();

const { QueueEngine, slimNote, hydrateNote } = await import('../src/services/queueEngine.js');

const SAMPLE_CHAPTERS = [
  { id: 'chap_a', title: 'Chapitre A', count: 5 },
  { id: 'chap_b', title: 'Chapitre B', count: 2 }
];

const SAMPLE_QUESTIONS = [
  {
    uid: 'chap_a_1',
    chapterId: 'chap_a',
    chapterTitle: 'Chapitre A',
    id: 1,
    type: 'QCU',
    is_croq: false,
    question: 'Question 1',
    options: [
      { id: 1, letter: 'A', text: 'Opt A', is_correct: true },
      { id: 2, letter: 'B', text: 'Opt B', is_correct: false }
    ],
    explanation: 'Explication Q1'
  },
  {
    uid: 'chap_a_2',
    chapterId: 'chap_a',
    chapterTitle: 'Chapitre A',
    id: '2.1',
    type: 'QCU',
    is_croq: false,
    clinical_case: 'Vignette clinique',
    question: 'Sous-question 2.1',
    options: [{ id: 3, letter: 'A', text: 'Oui', is_correct: true }],
    explanation: 'Exp 2.1'
  },
  {
    uid: 'chap_a_3',
    chapterId: 'chap_a',
    chapterTitle: 'Chapitre A',
    id: '2.2',
    type: 'QCU',
    is_croq: false,
    clinical_case: 'Vignette clinique',
    question: 'Sous-question 2.2',
    options: [{ id: 4, letter: 'A', text: 'Oui', is_correct: true }],
    explanation: 'Exp 2.2'
  },
  {
    uid: 'chap_b_1',
    chapterId: 'chap_b',
    chapterTitle: 'Chapitre B',
    id: 1,
    type: 'QCU',
    is_croq: false,
    question: 'Question B1',
    options: [{ id: 5, letter: 'A', text: 'Oui', is_correct: true }],
    explanation: ''
  }
];

describe('QueueEngine SRS & Clinical Cases', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    mock.timers.reset();
  });

  it('uses local calendar date (not UTC) in getTodayTracker around midnight local time', () => {
    // 2026-11-25 00:30:00 local time (in UTC+1 this is 2026-11-24T23:30:00Z in UTC)
    const midnightPlus30 = new Date(2026, 10, 25, 0, 30, 0);
    mock.timers.enable({ apis: ['Date'], now: midnightPlus30 });

    const engine = new QueueEngine(SAMPLE_QUESTIONS, SAMPLE_CHAPTERS);
    const tracker = engine.getTodayTracker();
    assert.equal(tracker.dateStr, '2026-11-25');
    assert.equal(tracker.dateStr, engine.getTodayDateStr());
  });

  it('clears a question after 3 successes and increases target up to 10 on mistakes', () => {
    const engine = new QueueEngine(SAMPLE_QUESTIONS, SAMPLE_CHAPTERS);
    engine.initSession([]);
    const uid = 'chap_a_1';

    // 1 mistake -> target becomes 4
    const idx1 = engine.queue.indexOf(uid);
    engine.cursor = idx1;
    const failRes = engine.handleFailure(uid);
    assert.equal(failRes.newTarget, 4);
    assert.equal(failRes.mistakes, 1);

    // 4 successes -> mastered and removed
    for (let i = 0; i < 4; i++) {
      engine.cursor = engine.queue.indexOf(uid);
      const res = engine.handleSuccess(uid);
      if (i < 3) {
        assert.equal(res.permanentlyRemoved, false);
      } else {
        assert.equal(res.permanentlyRemoved, true);
      }
    }
    assert.equal(engine.getQuestionStats(uid).done, true);
    assert.equal(engine.queue.includes(uid), false);
  });

  it('decrements current successes when target is capped at 10 and another mistake occurs', () => {
    const engine = new QueueEngine(SAMPLE_QUESTIONS, SAMPLE_CHAPTERS);
    engine.initSession([]);
    const uid = 'chap_a_1';
    engine.stats[uid] = { target: 10, current: 7, mistakes: 7, done: false };
    engine.cursor = engine.queue.indexOf(uid);

    const failRes = engine.handleFailure(uid);
    assert.equal(failRes.newTarget, 10);
    assert.equal(failRes.current, 6);
    assert.equal(failRes.decremented, true);
  });

  it('credits only non-mastered sub-questions in handleClinicalCaseSuccess', () => {
    const engine = new QueueEngine(SAMPLE_QUESTIONS, SAMPLE_CHAPTERS);
    engine.initSession([]);
    engine.stats['chap_a_2'] = { target: 3, current: 3, mistakes: 0, done: true };
    engine.stats['chap_a_3'] = { target: 3, current: 1, mistakes: 0, done: false };

    const res = engine.handleClinicalCaseSuccess(['chap_a_2', 'chap_a_3']);
    assert.equal(res.alreadyMasteredCount, 1);
    assert.equal(res.activeCreditedCount, 1);
    assert.equal(engine.getQuestionStats('chap_a_3').current, 2);
  });

  it('applies all-or-nothing rule and contiguous reinsertion in handleClinicalCaseFailure', () => {
    const engine = new QueueEngine(SAMPLE_QUESTIONS, SAMPLE_CHAPTERS);
    engine.initSession([]);
    engine.stats['chap_a_2'] = { target: 3, current: 1, mistakes: 0, done: false };
    engine.stats['chap_a_3'] = { target: 3, current: 1, mistakes: 0, done: false };

    const res = engine.handleClinicalCaseFailure(['chap_a_2', 'chap_a_3'], ['chap_a_3']);
    assert.equal(res.success, false);
    assert.equal(engine.getQuestionStats('chap_a_2').current, 1);
    assert.equal(engine.getQuestionStats('chap_a_3').mistakes, 1);
    assert.equal(engine.getQuestionStats('chap_a_3').target, 4);

    const i1 = engine.queue.indexOf('chap_a_2');
    const i2 = engine.queue.indexOf('chap_a_3');
    assert.ok(i1 !== -1 && i2 === i1 + 1);
  });

  it('snoozes a question for today and expires snooze on the next day', () => {
    const day1 = new Date(2026, 10, 24, 15, 0, 0);
    mock.timers.enable({ apis: ['Date'], now: day1 });

    const engine = new QueueEngine(SAMPLE_QUESTIONS, SAMPLE_CHAPTERS);
    engine.initSession([]);
    engine.snoozeQuestionForToday('chap_b_1');
    assert.equal(engine.getSnoozedCountToday(), 1);
    assert.equal(engine.queue.includes('chap_b_1'), false);

    mock.timers.setTime(new Date(2026, 10, 25, 9, 0, 0).getTime());
    engine.cleanExpiredSnoozes();
    assert.equal(engine.getSnoozedCountToday(), 0);
  });

  it('slims and rehydrates reasoning notes without losing metadata', () => {
    const slim = slimNote({
      id: 'n1',
      questionUid: 'chap_a_1',
      questionText: 'Should be stripped',
      options: [{ letter: 'A', text: 'X' }],
      userAnswer: 'B',
      correctAnswer: 'A',
      reasoningNote: 'Analyse'
    });
    assert.equal('questionText' in slim, false);
    assert.equal('options' in slim, false);

    const hydrated = hydrateNote(slim, SAMPLE_QUESTIONS);
    assert.equal(hydrated.questionText, 'Question 1');
    assert.equal(hydrated.chapterTitle, 'Chapitre A');
    assert.equal(hydrated.options.length, 2);
  });
});
