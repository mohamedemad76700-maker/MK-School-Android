import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeExamAnswers, normalizeExamQuestion } from '../src/exam-utils.js';

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
