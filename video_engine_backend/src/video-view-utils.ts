/** Returns the next accepted play count, or null when the configured limit is reached. */
export function nextVideoViewCount(current: number, maximum = 3): number | null {
  if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(maximum) || maximum < 1) {
    throw new Error('invalid video view counter');
  }
  return current >= maximum ? null : current + 1;
}

export function consumeVideoView(currentBase: number, grantedExtra: number, usedExtra: number, baseMaximum = 3): {
  baseCount: number;
  usedExtra: number;
  totalCount: number;
  remaining: number;
  usedGrant: boolean;
} | null {
  for (const value of [currentBase, grantedExtra, usedExtra, baseMaximum]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid video view allowance');
  }
  if (baseMaximum < 1 || usedExtra > grantedExtra) throw new Error('invalid video view allowance');
  if (currentBase < baseMaximum) {
    const baseCount = currentBase + 1;
    return { baseCount, usedExtra, totalCount: baseCount + usedExtra, remaining: baseMaximum - baseCount + grantedExtra - usedExtra, usedGrant: false };
  }
  if (usedExtra < grantedExtra) {
    const nextUsedExtra = usedExtra + 1;
    return { baseCount: currentBase, usedExtra: nextUsedExtra, totalCount: currentBase + nextUsedExtra, remaining: grantedExtra - nextUsedExtra, usedGrant: true };
  }
  return null;
}
