export interface VideoRendition {
  name: string;
  height: number;
  width: number;
  bitrate: string;
  maxrate: string;
  buffer: string;
}

const standardRenditions: VideoRendition[] = [
  { name: '360p', height: 360, width: 640, bitrate: '650k', maxrate: '750k', buffer: '1300k' },
  { name: '480p', height: 480, width: 854, bitrate: '1100k', maxrate: '1250k', buffer: '2200k' },
  { name: '720p', height: 720, width: 1280, bitrate: '2400k', maxrate: '2700k', buffer: '4800k' },
];

export function selectVideoRenditions(sourceHeight: number): VideoRendition[] {
  if (!Number.isSafeInteger(sourceHeight) || sourceHeight < 2) throw new Error('video has invalid dimensions');
  const available = standardRenditions.filter(rendition => rendition.height <= sourceHeight);
  if (available.length) return available.map(rendition => ({ ...rendition }));
  const height = Math.max(2, Math.floor(sourceHeight / 2) * 2);
  const width = Math.max(2, Math.floor((height * 16 / 9) / 2) * 2);
  return [{ name: `${height}p`, height, width, bitrate: '450k', maxrate: '550k', buffer: '900k' }];
}

export function buildHlsTranscodeArgs(input: string, outputDirectory: string, renditions: VideoRendition[], hasAudio: boolean): string[] {
  if (!input || !outputDirectory || !renditions.length || renditions.length > standardRenditions.length) throw new Error('invalid HLS transcode configuration');
  const splitLabels = renditions.map((_, index) => `[source${index}]`).join('');
  const filters = [`[0:v:0]split=${renditions.length}${splitLabels}`];
  renditions.forEach((rendition, index) => {
    filters.push(`[source${index}]scale=w='min(${rendition.width},iw)':h='min(${rendition.height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2[v${index}]`);
  });

  const args = ['-y', '-i', input, '-filter_complex', filters.join(';')];
  renditions.forEach((_, index) => {
    args.push('-map', `[v${index}]`);
    if (hasAudio) args.push('-map', '0:a:0');
  });
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-sc_threshold', '0', '-force_key_frames', 'expr:gte(t,n_forced*6)');
  renditions.forEach((rendition, index) => {
    args.push(`-b:v:${index}`, rendition.bitrate, `-maxrate:v:${index}`, rendition.maxrate, `-bufsize:v:${index}`, rendition.buffer, `-threads:v:${index}`, '1');
  });
  if (hasAudio) args.push('-c:a', 'aac', '-b:a', '96k', '-ac', '2');
  const variantMap = renditions.map((_, index) => `v:${index}${hasAudio ? `,a:${index}` : ''}`).join(' ');
  args.push(
    '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
    '-var_stream_map', variantMap, '-master_pl_name', 'playlist.m3u8',
    '-hls_segment_filename', `${outputDirectory}/segment_%v_%05d.ts`, `${outputDirectory}/variant_%v.m3u8`,
  );
  return args;
}

export function hlsVariantNames(master: string): string[] {
  return [...master.matchAll(/^variant_(\d+)\.m3u8$/gm)].map(match => `variant_${match[1]!}.m3u8`);
}

export function hlsSegmentNames(playlist: string): string[] {
  return [...playlist.matchAll(/^(segment_[A-Za-z0-9_-]+\.ts)$/gm)].map(match => match[1]!);
}

export function rewriteHlsManifest(manifest: string, videoId: string, token: string): string {
  return manifest.split(/\r?\n/).map(raw => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return raw;
    if (/^variant_\d+\.m3u8$/.test(line)) return `/api/v1/videos/${encodeURIComponent(videoId)}/playlist/${encodeURIComponent(line)}?token=${encodeURIComponent(token)}`;
    if (/^segment_[A-Za-z0-9_-]+\.ts$/.test(line)) return `/api/v1/videos/${encodeURIComponent(videoId)}/segment/${encodeURIComponent(line)}?token=${encodeURIComponent(token)}`;
    throw new Error('invalid HLS playlist reference');
  }).join('\n');
}
