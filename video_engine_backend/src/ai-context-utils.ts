/**
 * Minimize school data before sending context to a third-party AI provider.
 * The state must already have been filtered for the authenticated role.
 */
const ALLOWED_TOP_LEVEL = new Set([
  'students', 'teachers', 'subjects', 'grades', 'assignments', 'exams', 'schedule',
  'lessonLinks', 'library', 'mkLibrary', 'courses', 'attendance',
]);

const ALLOWED_FIELDS = new Set([
  'grade', 'subject', 'title', 'description', 'summary', 'content', 'body', 'text',
  'type', 'kind', 'active', 'published', 'duration', 'day', 'time', 'score', 'max', 'maxscore',
  'percentage', 'date', 'comment', 'deadline', 'duedate', 'skills', 'topic', 'price', 'lessons',
  'questions', 'options', 'choices', 'resource', 'points', 'questionpoints',
  'week', 'term', 'year', 'status', 'attendance', 'present', 'absent', 'late',
]);

const NEVER_SEND = new Set([
  'id', 'userid', 'studentid', 'teacherid', 'parentid', 'accountid', 'studentcode', 'email',
  'phone', 'mobile', 'address', 'birthdate', 'guardianname', 'guardianphone', 'emergencycontact',
  'name', 'firstname', 'lastname', 'password', 'passhash', 'token', 'secret', 'apikey', 'authorization',
  'cookie', 'file', 'files', 'documents', 'blob', 'base64', 'data', 'adminnote', 'internalnotes',
  'privatenotes', 'healthnotes', 'medicalnotes', 'parentnotes', 'devicefingerprint', 'devicehash',
  'answer', 'correctanswer', 'solution', 'explanation', 'answerkey', 'teacheranswer',
]);

function norm(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function projectValue(value: unknown, field = '', depth = 0): unknown {
  if (depth > 8 || value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 4000);
  if (Array.isArray(value)) {
    const normalizedField = norm(field);
    if (normalizedField === 'questions') {
      return value.slice(0, 100).map(question => {
        // Legacy question tuples were [text, options, answerIndex]. Never send element 3.
        if (Array.isArray(question)) return [projectValue(question[0], 'text', depth + 1), projectValue(question[1], 'options', depth + 1)];
        return projectValue(question, 'question', depth + 1);
      });
    }
    return value.slice(0, 100).map(item => projectValue(item, field, depth + 1));
  }
  if (typeof value !== 'object') return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = norm(key);
    if (NEVER_SEND.has(normalized)) continue;
    if (/password|passwd|token|secret|credential|authorization|cookie|studentcode|birthdate|phone|email|address|answer|correct|solution|explanation|private|medical|health|guardian|emergency/.test(normalized)) continue;
    if (!ALLOWED_FIELDS.has(normalized)) continue;
    const projected = projectValue(nested, key, depth + 1);
    if (projected !== undefined) output[key] = projected;
  }
  return output;
}

export function minimizeAiContext(input: unknown, maxChars = 60_000): string {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const projected: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) continue;
    projected[key] = projectValue(value, key, 0);
  }
  let serialized = JSON.stringify(projected);
  if (serialized.length <= maxChars) return serialized;

  // Reduce the projected arrays rather than cut JSON in the middle of a sensitive field.
  const arrayKeys = Object.keys(projected).filter(key => Array.isArray(projected[key]));
  while (serialized.length > maxChars && arrayKeys.length) {
    const firstKey = arrayKeys[0];
    if (!firstKey) break;
    let longestKey = firstKey;
    for (const key of arrayKeys) {
      const candidate = projected[key];
      const best = projected[longestKey];
      if (Array.isArray(candidate) && Array.isArray(best) && candidate.length > best.length) longestKey = key;
    }
    const arrValue = projected[longestKey];
    if (!Array.isArray(arrValue)) {
      arrayKeys.splice(arrayKeys.indexOf(longestKey), 1);
      continue;
    }
    if (!arrValue.length) {
      arrayKeys.splice(arrayKeys.indexOf(longestKey), 1);
      continue;
    }
    arrValue.pop();
    serialized = JSON.stringify(projected);
  }
  return serialized.length <= maxChars ? serialized : JSON.stringify({ note: 'School context omitted because it exceeded the safe context size.' });
}

/** Keep course lesson context limited to active courses each linked student can open. */
export function filterAiCoursesForEnrolledStudents(courses: unknown, studentIds: readonly string[]): unknown[] {
  if (!Array.isArray(courses) || !studentIds.length) return [];
  const eligibleIds = new Set(studentIds.map(String));
  return courses.filter(course => {
    if (!course || typeof course !== 'object') return false;
    const record = course as { active?: unknown; enrollments?: unknown };
    return record.active !== false && Array.isArray(record.enrollments)
      && record.enrollments.some(studentId => eligibleIds.has(String(studentId)));
  });
}

export function exceedsAiDailyLimit(requestCount: number, limit: number): boolean {
  return !Number.isSafeInteger(requestCount) || !Number.isSafeInteger(limit) || requestCount < 0 || limit < 1 || requestCount > limit;
}
