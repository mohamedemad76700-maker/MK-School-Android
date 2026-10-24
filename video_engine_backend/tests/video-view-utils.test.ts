import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeVideoView, nextVideoViewCount } from '../src/video-view-utils.js';

test('normal video allowance consumes three ordinary views before extra grants', () => {
  let current = 0;
  for (let expected = 1; expected <= 3; expected++) {
    const result = consumeVideoView(current, 2, 0);
    assert.ok(result);
    assert.equal(result.baseCount, expected);
    assert.equal(result.usedExtra, 0);
    current = result.baseCount;
  }
  assert.deepEqual(consumeVideoView(current, 2, 0), {
    baseCount: 3, usedExtra: 1, totalCount: 4, remaining: 1, usedGrant: true,
  });
  assert.deepEqual(consumeVideoView(current, 2, 1), {
    baseCount: 3, usedExtra: 2, totalCount: 5, remaining: 0, usedGrant: true,
  });
  assert.equal(consumeVideoView(current, 2, 2), null);
  assert.equal(nextVideoViewCount(3), null);
});

test('view grant helper rejects corrupt counters', () => {
  assert.throws(() => consumeVideoView(0, 1, 2));
  assert.throws(() => consumeVideoView(-1, 0, 0));
});
