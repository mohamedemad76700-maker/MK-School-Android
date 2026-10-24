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

/** A paid course needs both an active enrollment and an administrator-approved order. */
export function hasCourseEnrollmentAccess(course: any, studentId: string, payments: unknown): boolean {
  const enrolled = Array.isArray(course?.enrollments)
    && course.enrollments.some((id: unknown) => String(id) === studentId);
  if (!enrolled) return false;
  if (String(course?.type ?? course?.kind ?? 'free') !== 'paid') return true;
  return hasApprovedCoursePayment(payments, studentId, String(course?.id ?? ''));
}
