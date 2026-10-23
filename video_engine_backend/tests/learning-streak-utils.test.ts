import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeLearningStreak } from '../src/learning-streak-utils.js';

test('learning streak uses only unique valid days and handles an active day', () => {
  const result = summarizeLearningStreak([
    '2026-10-20', '2026-10-21', '2026-10-21', '2026-10-23', '2026-10-24', 'invalid', null,
  ], '2026-10-23');
  assert.equal(result.currentStreak, 1);
  assert.equal(result.longestStreak, 2);
  assert.equal(result.activeToday, true);
  assert.equal(result.recentDays.length, 7);
  assert.equal(result.recentDays.at(-1)?.active, true);
});

test('learning streak preserves a streak through yesterday and drops after a missed day', () => {
  assert.equal(summarizeLearningStreak(['2026-10-22', '2026-10-21'], '2026-10-23').currentStreak, 2);
  assert.equal(summarizeLearningStreak(['2026-10-20'], '2026-10-23').currentStreak, 0);
});

test('learning streak rejects an invalid server date', () => {
  assert.throws(() => summarizeLearningStreak([], '2026-02-30'), /invalid current day/);
});
