/** Returns the next accepted play count, or null when the configured limit is reached. */
export function nextVideoViewCount(current: number, maximum = 3): number | null {
  if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(maximum) || maximum < 1) {
    throw new Error('invalid video view counter');
  }
  return current >= maximum ? null : current + 1;
}
