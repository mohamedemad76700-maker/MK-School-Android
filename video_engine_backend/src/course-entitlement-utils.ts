type CoursePayment = {
  courseId?: unknown;
  kind?: unknown;
  resourceId?: unknown;
  studentId?: unknown;
  status?: unknown;
};

export function hasApprovedCoursePayment(payments: unknown, studentId: string, courseId: string): boolean {
  if (!Array.isArray(payments)) return false;
  return (payments as CoursePayment[]).some(payment =>
    payment
    && String(payment.studentId ?? '') === studentId
    && String(payment.courseId ?? '') === courseId
    && payment.kind !== 'library'
    && payment.status === 'paid'
  );
}

export function isPaidCourse(course: any): boolean {
  const kind = String(course?.type ?? course?.kind ?? '').trim().toLowerCase();
  if (kind === 'paid') return true;
  if (kind === 'free') return false;
  return Number(course?.price) > 0;
}

/** A paid course needs both an active enrollment and an administrator-approved order. */
export function hasCourseEnrollmentAccess(course: any, studentId: string, payments: unknown): boolean {
  if (Array.isArray(course?.adminEnrollmentRevocations)
    && course.adminEnrollmentRevocations.some((id: unknown) => String(id) === studentId)) return false;
  const enrolled = Array.isArray(course?.enrollments)
    && course.enrollments.some((id: unknown) => String(id) === studentId);
  if (!enrolled) return false;
  if (Array.isArray(course?.adminEnrollmentGrants)
    && course.adminEnrollmentGrants.some((id: unknown) => String(id) === studentId)) return true;
  if (!isPaidCourse(course)) return true;
  return hasApprovedCoursePayment(payments, studentId, String(course?.id ?? ''));
}
