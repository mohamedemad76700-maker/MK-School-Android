import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExamAnswerReview, gradeExamAnswers, incorrectExamQuestionIndexes, normalizeExamQuestion, publicExamQuestionForStudent, validateExamRetryAnswers } from '../src/exam-utils.js';

test('normalizes the current object question schema', () => {
  assert.deepEqual(normalizeExamQuestion({ text: '  2+2? ', options: ['3', '4'], answer: 1, points: 2 }), {
    text: '2+2?', options: ['3', '4'], answer: 1, points: 2,
  });
});

test('supports legacy tuple questions without changing the answer index', () => {
  assert.deepEqual(normalizeExamQuestion(['Capital?', ['Cairo', 'Alexandria', 'Aswan'], 0]), {
    text: 'Capital?', options: ['Cairo', 'Alexandria', 'Aswan'], answer: 0, points: 1,
  });
});

test('grades answers on the server and treats unanswered questions as zero', () => {
  const questions = [
    normalizeExamQuestion({ text: 'one', options: ['a', 'b'], answer: 1, points: 2 }),
    normalizeExamQuestion({ text: 'two', options: ['a', 'b', 'c'], answer: 2, points: 1 }),
  ];
  assert.deepEqual(gradeExamAnswers(questions, [1, null]), { score: 2, max: 3, percentage: 67, answers: [1, null] });
});

test('rejects a result payload with the wrong number of answers', () => {
  const q = [normalizeExamQuestion({ text: 'Q', options: ['a', 'b'], answer: 0 })];
  assert.throws(() => gradeExamAnswers(q, []), /answer count/);
});

test('rejects answer indices outside the actual options', () => {
  const q = [normalizeExamQuestion({ text: 'Q', options: ['a', 'b'], answer: 0 })];
  assert.throws(() => gradeExamAnswers(q, [2]), /invalid selected answer/);
});

test('rejects malformed answer keys and question points', () => {
  assert.throws(() => normalizeExamQuestion({ text: 'Q', options: ['a', 'b'], answer: 2 }), /correct answer index/);
  assert.throws(() => normalizeExamQuestion({ text: 'Q', options: ['a', 'b'], answer: 0, points: 0 }), /question points/);
});

test('challenge keywords are graded with Arabic normalization and doubled points', () => {
  const questions = [normalizeExamQuestion({ text: 'سؤال', options: ['أ', 'ب', 'ج', 'د'], answer: 0, points: 3, challengeKeywords: ['ثورة ٢٣ يوليو'] })];
  const result = gradeExamAnswers(questions, [{ type: 'challenge', text: 'كانت ثَوْرةُ ٢٣ يوليو نقطة تحول.' }], 1);
  assert.equal(result.score, 6);
  assert.equal(result.max, 6);
  assert.deepEqual(incorrectExamQuestionIndexes(questions, [{ type: 'challenge', text: 'ثورة يوليو' }], 1), [0]);
});

test('student-safe questions reveal challenge eligibility but never the grading keys', () => {
  const output = publicExamQuestionForStudent({
    text: 'سؤال', options: ['أ', 'ب'], answer: 0, answerIndex: 0,
    challengeKeywords: ['مفتاح سري'], explanation: 'شرح سري', solution: 'حل سري',
  }) as Record<string, unknown>;
  assert.equal(output.challengeEnabled, true);
  assert.equal(output.answer, undefined);
  assert.equal(output.answerIndex, undefined);
  assert.equal(output.challengeKeywords, undefined);
  assert.equal(output.explanation, undefined);
  assert.equal(output.solution, undefined);
});

test('retry validation locks correct answers and result review includes corrected mistakes', () => {
  const questions = [
    normalizeExamQuestion({ text: 'Q1', options: ['a', 'b'], answer: 0 }),
    normalizeExamQuestion({ text: 'Q2', options: ['c', 'd'], answer: 1 }),
  ];
  const first = [{ type: 'choice', index: 0 }, { type: 'choice', index: 0 }];
  assert.throws(() => validateExamRetryAnswers(questions, first, [{ type: 'choice', index: 1 }, { type: 'choice', index: 1 }], [1]), /changed a previously correct answer/);
  const retry = validateExamRetryAnswers(questions, first, [{ type: 'choice', index: 0 }, { type: 'choice', index: 1 }], [1]);
  assert.deepEqual(buildExamAnswerReview(questions, retry, [1]), [{
    index: 1, question: 'Q2', correct: true, retried: true, answer: 'd', correctAnswer: 'd',
  }]);
});
