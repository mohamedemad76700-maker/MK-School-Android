export interface NormalizedExamQuestion {
  text: string;
  imageFileId?: string;
  options: string[];
  answer: number;
  points: number;
  /** Accepted phrases for the optional no-choices, double-points challenge. */
  challengeKeywords?: string[];
}

export type SubmittedExamAnswer = number | null | {
  type: 'choice' | 'challenge';
  index?: number;
  text?: string;
};

const MAX_CHALLENGE_KEYWORDS = 20;
const MAX_CHALLENGE_KEYWORD_LENGTH = 120;
const MAX_CHALLENGE_ANSWER_LENGTH = 500;

/** Linked course exams are available only while the student is enrolled in an active course. */
export function isCourseExamEnrolled(course: unknown, studentId: string): boolean {
  if (!course || typeof course !== 'object' || !studentId) return false;
  const record = course as { active?: unknown; enrollments?: unknown };
  return record.active !== false && Array.isArray(record.enrollments) && record.enrollments.map(String).includes(String(studentId));
}

/** Old exams without a setting retain a small, predictable default. */
export function normalizeExamChallengeLimit(value: unknown): number {
  if (value === undefined || value === null || value === '') return 2;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 10) throw new Error('invalid exam challenge limit');
  return limit;
}

function normalizeChallengeKeywords(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\n,،;؛|]+/) : null;
  if (!list || list.length > MAX_CHALLENGE_KEYWORDS) throw new Error('invalid challenge keywords');
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (typeof entry !== 'string') throw new Error('invalid challenge keywords');
    const keyword = entry.trim();
    if (!keyword) continue;
    if (keyword.length > MAX_CHALLENGE_KEYWORD_LENGTH) throw new Error('invalid challenge keywords');
    const normalized = normalizeAnswerText(keyword);
    if (!normalized) continue;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(keyword);
    }
  }
  return result;
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
  const challengeKeywords = normalizeChallengeKeywords(raw.challengeKeywords ?? raw.answerKeywords);
  if ((!text && !imageFileId) || text.length > 10000 || options.length < 2 || options.some((v: string) => !v || v.length > 2000)) {
    throw new Error('invalid question text or options');
  }
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
    throw new Error('invalid correct answer index');
  }
  if (!Number.isFinite(points) || points <= 0 || points > 100) {
    throw new Error('invalid question points');
  }
  return { text, ...(imageFileId ? { imageFileId } : {}), options, answer, points, ...(challengeKeywords.length ? { challengeKeywords } : {}) };
}

/** Return only student-visible question material; answer keys and accepted keywords stay private. */
export function publicExamQuestionForStudent(input: unknown): unknown {
  const cleanPrivateFields = (value: any): any => {
    if (Array.isArray(value)) return value.map(cleanPrivateFields);
    if (!value || typeof value !== 'object') return value;
    const clean: Record<string, unknown> = {};
    for (const [field, fieldValue] of Object.entries(value)) {
      const normalized = field.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalized.includes('answer') || normalized.includes('correct') || normalized.includes('solution') || normalized.includes('explanation')
        || normalized.includes('challengekeyword') || normalized.includes('acceptedkeyword') || normalized === 'challengeenabled') continue;
      clean[field] = cleanPrivateFields(fieldValue);
    }
    return clean;
  };

  if (Array.isArray(input)) return [input[0], cleanPrivateFields(input[1])];
  if (!input || typeof input !== 'object') return input;
  const record = input as Record<string, unknown>;
  const keywords = Array.isArray(record.challengeKeywords) ? record.challengeKeywords : [];
  const challengeEnabled = keywords.some(value => typeof value === 'string' && value.trim().length > 0);
  const clean = cleanPrivateFields(input) as Record<string, unknown>;
  if (challengeEnabled) clean.challengeEnabled = true;
  return clean;
}

/** Grade against keys held by the server. Challenge answers are exact keyword/phrase matches. */
export function gradeExamAnswers(
  questions: NormalizedExamQuestion[],
  submitted: unknown,
  challengeLimit = 2,
): { score: number; max: number; percentage: number; answers: (number | null | { mode: 'challenge'; correct: boolean })[]; bonusPoints?: number } {
  if (!Array.isArray(submitted) || submitted.length !== questions.length || submitted.length > 250) {
    throw new Error('answer count does not match the exam');
  }
  if (!Number.isSafeInteger(challengeLimit) || challengeLimit < 0 || challengeLimit > 10) {
    throw new Error('invalid exam challenge limit');
  }

  let challengeCount = 0;
  const answers: (number | null | { mode: 'challenge'; correct: boolean })[] = submitted.map((value: unknown, index: number) => {
    if (value === null) return null;
    const question = questions[index];
    if (!question) throw new Error('invalid question definition');

    // Legacy numeric submissions remain accepted for existing clients.
    if (Number.isInteger(value)) {
      if ((value as number) < 0 || (value as number) >= question.options.length) throw new Error('invalid selected answer');
      return value as number;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid submitted answer');
    const submittedAnswer = value as { type?: unknown; index?: unknown; text?: unknown };
    if (submittedAnswer.type === 'choice') {
      const answer = submittedAnswer.index;
      if (!Number.isInteger(answer) || (answer as number) < 0 || (answer as number) >= question.options.length) throw new Error('invalid selected answer');
      return answer as number;
    }
    if (submittedAnswer.type !== 'challenge' || typeof submittedAnswer.text !== 'string' || submittedAnswer.text.length > MAX_CHALLENGE_ANSWER_LENGTH) {
      throw new Error('invalid submitted answer');
    }
    if (!Array.isArray(question.challengeKeywords) || !question.challengeKeywords.length) throw new Error('challenge is not enabled for this question');
    challengeCount++;
    const correct = matchesChallengeKeywords(submittedAnswer.text, question.challengeKeywords);
    return { mode: 'challenge', correct };
  });

  if (challengeCount > challengeLimit) throw new Error('exam challenge limit exceeded');
  const baseMax = questions.reduce((sum, question) => sum + question.points, 0);
  const challengeMax = answers.reduce<number>((sum, answer, index) => sum + (answer && typeof answer === 'object' && answer.mode === 'challenge' ? questions[index]!.points : 0), 0);
  const score = answers.reduce<number>((sum, answer, index) => {
    if (answer === null) return sum;
    if (typeof answer === 'object') return sum + (answer.correct ? questions[index]!.points * 2 : 0);
    return sum + (answer === questions[index]!.answer ? questions[index]!.points : 0);
  }, 0);
  const bonusPoints = answers.reduce<number>((sum, answer, index) => sum + (answer && typeof answer === 'object' && answer.mode === 'challenge' && answer.correct ? questions[index]!.points : 0), 0);
  const max = baseMax + challengeMax;
  return { score, max, percentage: max > 0 ? Math.round(score / max * 100) : 0, answers, ...(bonusPoints ? { bonusPoints } : {}) };
}

/** Canonicalize an already-validated student payload before storing a retry snapshot. */
export function normalizeSubmittedExamAnswers(
  questions: NormalizedExamQuestion[], submitted: unknown, challengeLimit = 2,
): SubmittedExamAnswer[] {
  gradeExamAnswers(questions, submitted, challengeLimit);
  return (submitted as SubmittedExamAnswer[]).map(answer => {
    if (answer === null) return null;
    if (typeof answer === 'number') return { type: 'choice', index: answer };
    return answer.type === 'choice'
      ? { type: 'choice', index: answer.index }
      : { type: 'challenge', text: answer.text };
  });
}

/** First-attempt and final review use the same server-side correctness rules. */
export function incorrectExamQuestionIndexes(questions: NormalizedExamQuestion[], submitted: unknown, challengeLimit = 2): number[] {
  const graded = gradeExamAnswers(questions, submitted, challengeLimit);
  return questions.flatMap((question, index) => {
    const answer = graded.answers[index];
    const correct = answer !== null && answer !== undefined && (typeof answer === 'number'
      ? answer === question.answer
      : answer.correct);
    return correct ? [] : [index];
  });
}

/** Do not let a retry alter answers which were already correct in the first round. */
export function validateExamRetryAnswers(
  questions: NormalizedExamQuestion[], previous: unknown, submitted: unknown, wrongIndexes: unknown,
  challengeLimit = 2,
): SubmittedExamAnswer[] {
  const first = normalizeSubmittedExamAnswers(questions, previous, challengeLimit);
  const retry = normalizeSubmittedExamAnswers(questions, submitted, challengeLimit);
  if (!Array.isArray(wrongIndexes) || wrongIndexes.length > questions.length) throw new Error('invalid retry question list');
  const mutable = new Set<number>();
  for (const index of wrongIndexes) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= questions.length || mutable.has(index)) throw new Error('invalid retry question list');
    mutable.add(index);
  }
  for (let index = 0; index < questions.length; index++) {
    if (!mutable.has(index) && JSON.stringify(first[index]) !== JSON.stringify(retry[index])) {
      throw new Error('retry changed a previously correct answer');
    }
  }
  return retry;
}

/** Results are revealed only after the final submission has been stored. */
export function buildExamAnswerReview(
  questions: NormalizedExamQuestion[], submitted: unknown, originalWrongIndexes: unknown = [], challengeLimit = 2,
): Array<{ index: number; question: string; correct: boolean; retried: boolean; answer: string; correctAnswer: string }> {
  const answers = normalizeSubmittedExamAnswers(questions, submitted, challengeLimit);
  const firstWrong = new Set(Array.isArray(originalWrongIndexes) ? originalWrongIndexes.filter((value): value is number => Number.isSafeInteger(value) && value >= 0 && value < questions.length) : []);
  const wrong = new Set(incorrectExamQuestionIndexes(questions, answers, challengeLimit));
  return [...new Set([...firstWrong, ...wrong])].sort((a, b) => a - b).map(index => {
    const question = questions[index]!;
    const answer = answers[index] ?? null;
    const correct = !wrong.has(index);
    let submittedText = 'لم تتم الإجابة';
    if (answer && typeof answer === 'object') submittedText = answer.type === 'challenge' ? answer.text || '' : question.options[answer.index ?? -1] || '';
    else if (typeof answer === 'number') submittedText = question.options[answer] || '';
    return {
      index, question: question.text || `السؤال ${index + 1}`, correct, retried: firstWrong.has(index), answer: submittedText,
      correctAnswer: question.options[question.answer] || '',
    };
  });
}

function normalizeAnswerText(value: string): string {
  return value.normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .toLocaleLowerCase('ar')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesChallengeKeywords(answer: string, keywords: string[]): boolean {
  const normalizedAnswer = ` ${normalizeAnswerText(answer)} `;
  if (normalizedAnswer.length <= 2) return false;
  return keywords.some(keyword => {
    const normalizedKeyword = normalizeAnswerText(keyword);
    return normalizedKeyword.length > 0 && normalizedAnswer.includes(` ${normalizedKeyword} `);
  });
}
