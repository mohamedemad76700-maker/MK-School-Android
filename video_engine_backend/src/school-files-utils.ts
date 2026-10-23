export type SchoolFileRole = 'student' | 'teacher' | 'admin' | 'parent' | string;
export type SchoolFilePurpose = 'student-file' | 'course-cover' | 'course-file' | 'payment-receipt' | 'platform-library' | 'community-attachment' | string;
export interface SchoolFileAccessClaims { sub: string; role: SchoolFileRole }
export interface SchoolFileAccessRow { owner_id: string; owner_role?: SchoolFileRole; purpose: SchoolFilePurpose }

export const SCHOOL_FILE_MIME: Readonly<Record<string, string>> = Object.freeze({
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.gif':'image/gif',
  '.pdf':'application/pdf', '.txt':'text/plain', '.md':'text/markdown', '.csv':'text/csv',
  '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});

/** Only raster images and inert document formats are served; HTML, SVG and scripts are deliberately excluded. */
export function schoolFileMimeForExtension(extension: string): string | null {
  return SCHOOL_FILE_MIME[String(extension || '').toLowerCase()] ?? null;
}

export function safeSchoolOriginalFilename(input: unknown): string {
  const normalized = String(input ?? '').replace(/\\/g, '/').split('/').pop() ?? '';
  const cleaned = normalized.replace(/[\r\n\u0000-\u001f\u007f]/g, '_').replace(/[<>:"|?*]/g, '_').trim();
  return cleaned.slice(0, 240) || 'school-file';
}

export function isSafeSchoolStorageKey(input: unknown): boolean {
  const key = String(input ?? '');
  return /^[a-f0-9-]+\.[a-z0-9]+$/i.test(key) && !key.includes('..') && key === key.split(/[\\/]/).pop();
}

export function canReadSchoolFile(claims: SchoolFileAccessClaims, file: SchoolFileAccessRow): boolean {
  if (claims.role === 'admin') return true;
  if (file.purpose === 'exam-question') return claims.role === 'teacher' && claims.sub === file.owner_id;
  if (file.purpose === 'student-file') return false;
  if (file.purpose === 'payment-receipt') return claims.role === 'student' && claims.sub === file.owner_id;
  if (file.purpose === 'course-cover') return ['student', 'teacher', 'parent'].includes(claims.role);
  // Course files lack a course_id/enrollment relation in the current schema. Do not expose them
  // to every student/parent until the server can verify enrollment for the exact course.
  if (file.purpose === 'course-file') {
    if (claims.role === 'teacher') return claims.sub === file.owner_id;
    // Admin-published MK library attachments are shared learning resources. Files uploaded by
    // individual teachers remain private until course enrollment is represented server-side.
    return ['student', 'parent'].includes(claims.role) && file.owner_role === 'admin';
  }
  // Platform-library files require a separate publication and purchase check in the API.
  if (file.purpose === 'platform-library') return false;
  if (file.purpose === 'community-attachment') return false; // Requires a published-topic check in the API.
  return claims.sub === file.owner_id;
}

export function canUploadSchoolFile(role: SchoolFileRole, purpose: SchoolFilePurpose): boolean {
  if (purpose === 'exam-question') return role === 'teacher';
  if (purpose === 'student-file' || purpose === 'course-cover') return role === 'admin';
  if (purpose === 'course-file') return role === 'admin' || role === 'teacher';
  if (purpose === 'platform-library') return role === 'admin';
  if (purpose === 'payment-receipt') return role === 'student';
  if (purpose === 'community-attachment') return ['student','teacher','parent','admin'].includes(role);
  return false;
}
