const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function releaseWeekIsOpen(releaseWeek: unknown, packageWeeks: unknown, enrolledAt: unknown, now = new Date()): boolean {
  const week = Number(releaseWeek ?? 1);
  const totalWeeks = Number(packageWeeks ?? 0);
  if (!Number.isSafeInteger(week) || week < 1 || !Number.isSafeInteger(totalWeeks) || totalWeeks < 0) return false;
  if (totalWeeks > 0 && week > totalWeeks) return false;
  if (week === 1) return true;
  const enrollmentTime = enrolledAt instanceof Date ? enrolledAt.getTime() : new Date(String(enrolledAt ?? '')).getTime();
  if (!Number.isFinite(enrollmentTime) || !Number.isFinite(now.getTime())) return false;
  const availableWeek = Math.floor(Math.max(0, now.getTime() - enrollmentTime) / WEEK_MS) + 1;
  return week <= availableWeek;
}

export function lessonReleaseIsOpen(lesson: any, course: any, enrolledAt: unknown, now = new Date()): boolean {
  const releaseAt = lesson && typeof lesson.releaseAt === 'string' ? lesson.releaseAt.trim() : '';
  if (releaseAt) {
    const releaseTime = new Date(releaseAt).getTime();
    return Number.isFinite(releaseTime) && Number.isFinite(now.getTime()) && releaseTime <= now.getTime();
  }
  const releaseWeek = lesson?.releaseWeek ?? lesson?.week;
  // No schedule means the lesson is available at enrollment. Older and optional
  // date-only lesson forms may persist an empty string instead of omitting it.
  if (releaseWeek == null || (typeof releaseWeek === 'string' && !releaseWeek.trim())) return true;
  return releaseWeekIsOpen(
    releaseWeek,
    course?.packageEnabled ? course.packageWeeks : 0,
    enrolledAt,
    now,
  );
}

export function watchedEnough(watchedSeconds: unknown, durationSeconds: unknown, minimumRatio = 0.95): boolean {
  const watched = Number(watchedSeconds), duration = Number(durationSeconds);
  return Number.isSafeInteger(watched) && Number.isSafeInteger(duration) && duration >= 1 && watched >= Math.ceil(duration * minimumRatio);
}

export function courseLessonsComplete(lessonCount: unknown, completedIndexes: unknown): boolean {
  const count = Number(lessonCount);
  if (!Number.isSafeInteger(count) || count < 1 || !Array.isArray(completedIndexes)) return false;
  const completed = new Set(completedIndexes.map(Number).filter((index: number) => Number.isSafeInteger(index)));
  for (let index = 0; index < count; index++) if (!completed.has(index)) return false;
  return true;
}

export function advanceWatchProgress(input: {
  hasPrevious: boolean;
  previousCompleted: boolean;
  previousPlaying: boolean;
  previousWatchedSeconds: number;
  previousDurationSeconds: number;
  previousPositionSeconds: number;
  elapsedSeconds: number;
  durationSeconds: number;
  positionSeconds: number;
  ended: boolean;
}): { watchedSeconds: number; durationSeconds: number; acceptedPositionSeconds: number; completed: boolean } {
  const duration = Math.max(1, Math.trunc(input.durationSeconds));
  const storedDuration = Math.max(duration, Math.max(0, Math.trunc(input.previousDurationSeconds || 0)));
  const position = Math.max(0, Math.min(duration, Math.trunc(input.positionSeconds)));
  const oldPosition = Math.max(0, Math.trunc(input.previousPositionSeconds || 0));
  const watched = Math.max(0, Math.min(storedDuration, Math.trunc(input.previousWatchedSeconds || 0)));
  const elapsed = Math.max(0, Math.min(15, Number(input.elapsedSeconds) || 0));
  const delta = position - oldPosition;
  let credited = watched;
  let acceptedPosition = oldPosition;
  if (!input.hasPrevious) acceptedPosition = 0;
  else if (delta < 0) acceptedPosition = position;
  else if (input.previousPlaying && elapsed > 0 && delta <= elapsed * 2.05 + 1) {
    credited += Math.max(0, Math.min(delta, Math.floor(elapsed * 2.05)));
    acceptedPosition = position;
  } else if (delta > elapsed * 2.05 + 1) acceptedPosition = oldPosition;
  credited = Math.min(storedDuration, credited);
  const completed = input.previousCompleted || (!!input.hasPrevious && input.ended && acceptedPosition >= duration - 2 && watchedEnough(credited, storedDuration, 0.98));
  return { watchedSeconds: credited, durationSeconds: storedDuration, acceptedPositionSeconds: acceptedPosition, completed };
}
