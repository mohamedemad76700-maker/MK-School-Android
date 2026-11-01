type UnknownRecord = Record<string, unknown>;

export function lessonPrerequisiteExamId(lesson: UnknownRecord | null | undefined): string {
  return String(lesson?.prerequisiteExamId ?? '').trim();
}

export function findLessonPrerequisiteIndex(course: UnknownRecord | null | undefined, examId: string): number {
  const lessons = Array.isArray(course?.lessons) ? course.lessons as UnknownRecord[] : [];
  return lessons.findIndex(lesson => lessonPrerequisiteExamId(lesson) === String(examId).trim());
}

export function hasPassedLessonPrerequisite(
  lesson: UnknownRecord | null | undefined,
  studentId: string,
  exams: UnknownRecord[] = [],
  results: UnknownRecord[] = [],
): boolean {
  const examId = lessonPrerequisiteExamId(lesson);
  if (!examId) return true;
  const exam = exams.find(item => String(item?.id ?? '') === examId);
  if (!exam || exam.active === false || exam.published === false || exam.disabled === true) return false;
  const thresholdValue = Number(exam.passPercent);
  const threshold = Number.isFinite(thresholdValue) ? Math.max(0, Math.min(100, thresholdValue)) : 50;
  return results.some(result =>
    String(result?.student ?? result?.studentId ?? '') === String(studentId)
    && String(result?.exam ?? result?.examId ?? '') === examId
    && result?.forfeited !== true
    && Number(result?.percentage) >= threshold,
  );
}
