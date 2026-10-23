import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceWatchProgress, courseLessonsComplete, watchedEnough } from '../src/course-release-utils.js';

const watch = (input: Partial<Parameters<typeof advanceWatchProgress>[0]>) => advanceWatchProgress({
  hasPrevious: false,
  previousCompleted: false,
  previousPlaying: false,
  previousWatchedSeconds: 0,
  previousDurationSeconds: 0,
  previousPositionSeconds: 0,
  elapsedSeconds: 0,
  durationSeconds: 100,
  positionSeconds: 0,
  ended: false,
  ...input,
});

test('watch progress rejects seeking and only credits plausible playback deltas', () => {
  const seek = watch({ hasPrevious: true, previousPlaying: true, previousPositionSeconds: 10, elapsedSeconds: 1, positionSeconds: 80 });
  assert.equal(seek.watchedSeconds, 0);
  assert.equal(seek.acceptedPositionSeconds, 10);
  const playback = watch({ hasPrevious: true, previousPlaying: true, previousPositionSeconds: 10, elapsedSeconds: 5, positionSeconds: 20 });
  assert.equal(playback.watchedSeconds, 10);
  assert.equal(playback.acceptedPositionSeconds, 20);
});

test('video completion requires near-full watch time and a valid ended event', () => {
  const notEnded = watch({ hasPrevious: true, previousPlaying: true, previousWatchedSeconds: 98, previousDurationSeconds: 100, previousPositionSeconds: 98, elapsedSeconds: 1, positionSeconds: 100 });
  assert.equal(notEnded.completed, false);
  const ended = watch({ hasPrevious: true, previousPlaying: true, previousWatchedSeconds: 98, previousDurationSeconds: 100, previousPositionSeconds: 98, elapsedSeconds: 1, positionSeconds: 100, ended: true });
  assert.equal(ended.completed, true);
  assert.equal(watchedEnough(97, 100, 0.98), false);
  assert.equal(watchedEnough(98, 100, 0.98), true);
});

test('course reward eligibility requires every lesson completion index', () => {
  assert.equal(courseLessonsComplete(3, [0, 1]), false);
  assert.equal(courseLessonsComplete(3, [0, 1, 2]), true);
  assert.equal(courseLessonsComplete(0, []), false);
});
