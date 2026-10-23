const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(value: unknown): number | null {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed / DAY_MS : null;
}

export interface LearningStreakSummary {
  currentStreak: number;
  longestStreak: number;
  activeToday: boolean;
  recentDays: Array<{ date: string; active: boolean }>;
}

/** Summarize server-recorded activity dates without trusting client-supplied dates. */
export function summarizeLearningStreak(datesInput: unknown, todayInput: unknown): LearningStreakSummary {
  const today = dayNumber(todayInput);
  if (today === null) throw new Error('invalid current day');
  const days = [...new Set((Array.isArray(datesInput) ? datesInput : [])
    .map(dayNumber).filter((value): value is number => value !== null && value <= today))].sort((a, b) => a - b);
  const active = new Set(days);
  let currentStreak = 0;
  let cursor = active.has(today) ? today : today - 1;
  while (active.has(cursor)) { currentStreak++; cursor--; }
  let longestStreak = 0, run = 0, previous: number | null = null;
  for (const day of days) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = day;
  }
  const recentDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date((today - 6 + index) * DAY_MS).toISOString().slice(0, 10);
    return { date, active: active.has(today - 6 + index) };
  });
  return { currentStreak, longestStreak, activeToday: active.has(today), recentDays };
}
