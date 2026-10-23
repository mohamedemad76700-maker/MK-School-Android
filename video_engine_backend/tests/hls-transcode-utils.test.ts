import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHlsTranscodeArgs, hlsSegmentNames, hlsVariantNames, rewriteHlsManifest, selectVideoRenditions } from '../src/hls-transcode-utils.js';

test('selects only source-supported variants and never offers a higher source resolution', () => {
  assert.deepEqual(selectVideoRenditions(1080).map(item => item.name), ['360p', '480p', '720p']);
  assert.deepEqual(selectVideoRenditions(480).map(item => item.name), ['360p', '480p']);
  assert.deepEqual(selectVideoRenditions(240).map(item => item.name), ['240p']);
  assert.throws(() => selectVideoRenditions(0), /invalid dimensions/);
});

test('builds authenticated multi-quality HLS outputs with and without source audio', () => {
  const renditions = selectVideoRenditions(720);
  const withAudio = buildHlsTranscodeArgs('input.mp4', 'media/video', renditions, true);
  assert.equal(withAudio[withAudio.indexOf('-master_pl_name') + 1], 'playlist.m3u8');
  assert.equal(withAudio[withAudio.indexOf('-var_stream_map') + 1], 'v:0,a:0 v:1,a:1 v:2,a:2');
  assert.equal(withAudio.filter(value => value === '0:a:0').length, 3);
  assert.ok(withAudio.at(-1)?.endsWith('variant_%v.m3u8'));
  assert.ok(withAudio[withAudio.indexOf('-hls_segment_filename') + 1].endsWith('segment_%v_%05d.ts'));

  const silent = buildHlsTranscodeArgs('silent.mp4', 'media/video', renditions, false);
  assert.equal(silent.some(value => value.includes('0:a:0')), false);
  assert.equal(silent[silent.indexOf('-var_stream_map') + 1], 'v:0 v:1 v:2');
});

test('accepts only generated HLS variant and segment filenames from manifests', () => {
  assert.deepEqual(hlsVariantNames('#EXTM3U\nvariant_0.m3u8\n../secret.m3u8\n'), ['variant_0.m3u8']);
  assert.deepEqual(hlsSegmentNames('#EXTM3U\nsegment_1_00001.ts\n../secret.ts\n'), ['segment_1_00001.ts']);
  assert.equal(rewriteHlsManifest('#EXTM3U\nvariant_0.m3u8\n', 'video 1', 'token+value'), '#EXTM3U\n/api/v1/videos/video%201/playlist/variant_0.m3u8?token=token%2Bvalue\n');
  assert.throws(() => rewriteHlsManifest('#EXTM3U\nhttps://attacker.example/stream.m3u8\n', 'video', 'token'), /invalid HLS/);
});
