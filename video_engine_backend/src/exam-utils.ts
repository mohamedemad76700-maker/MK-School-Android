export interface NormalizedExamQuestion {
  text: string;
  imageFileId?: string;
  options: string[];
  answer: number;
  points: number;
}

/** Linked course exams are available only while the student is enrolled in an active course. */
export function isCourseExamEnrolled(course: unknown, studentId: string): boolean {
  if (!course || typeof course !== 'object' || !studentId) return false;
  const record = course as { active?: unknown; enrollments?: unknown };
  return record.active !== false && Array.isArray(record.enrollments) && record.enrollments.map(String).includes(String(studentId));
}

/** Accept both the current object format and the legacy [text, options, answer] tuple. */
export function normalizeExamQuestion(input: unknown, fallbackPoints = 1): NormalizedExamQuestion {
  const raw: any = Array.isArray(input)
    ? { text: input[0], options: input[1], answer: input[2] }
    : input && typeof input === 'object' ? input : {};
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  const imageFileId = typeof raw.imageFileId === 'string' && /^sf_[a-f0-9]{32}$/i.test(raw.imageFileId) ? raw.imageFileId : '';
  const options = Array.isArray(raw.options)
    ? raw.options.slice(0, 4).map((v: unknown) => typeof v === 'string' ? v.trim() : '')
    : [];
  const answer = Number(raw.answer ?? 0);
  const points = Number(raw.points ?? fallbackPoints ?? 1);
  if ((!text && !imageFileId) || text.length > 10000 || options.length < 2 || options.some((v: string) => !v || v.length > 2000)) {
    throw new Error('invalid question text or options');
  }
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
    throw new Error('invalid correct answer index');
  }
  if (!Number.isFinite(points) || points <= 0 || points > 100) {
    throw new Error('invalid question points');
  }
  return { text, ...(imageFileId ? { imageFileId } : {}), options, answer, points };
}

/** Grades only server-held question keys; answer indices from clients are untrusted. */
export function gradeExamAnswers(questions: NormalizedExamQuestion[], submitted: unknown): { score: number; max: number; percentage: number; answers: (number | null)[] } {
  if (!Array.isArray(submitted) || submitted.length !== questions.length || submitted.length > 250) {
    throw new Error('answer count does not match the exam');
  }
  const answers: (number | null)[] = submitted.map((value: unknown, index: number) => {
    if (value === null) return null;
    const question = questions[index];
    if (!question) throw new Error('invalid question definition');
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) >= question.options.length) {
      throw new Error('invalid selected answer');
    }
    return value as number;
  });
  const max = questions.reduce((sum, question) => sum + question.points, 0);
  const score = questions.reduce((sum, question, index) => sum + (answers[index] === question.answer ? question.points : 0), 0);
  return { score, max, percentage: max > 0 ? Math.round(score / max * 100) : 0, answers };
}
