export function isSessionVersionCurrent(tokenVersion: unknown, accountVersion: unknown): boolean {
  const claim = Number(tokenVersion ?? 1);
  const current = Number(accountVersion ?? 1);
  return Number.isSafeInteger(claim) && Number.isSafeInteger(current) && claim > 0 && current > 0 && claim === current;
}
