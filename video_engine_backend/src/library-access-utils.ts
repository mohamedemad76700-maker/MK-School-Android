export interface PlatformLibraryResource {
  id: string;
  fileId: string;
  active?: boolean;
  type?: string;
  price?: number;
}

export interface LibraryPayment {
  kind?: string;
  resourceId?: string;
  studentId?: string;
  status?: string;
}

export function canReadPublishedLibraryFile(
  role: string,
  resource: PlatformLibraryResource | null | undefined,
  fileId: string,
  studentIds: string[],
  payments: LibraryPayment[],
): boolean {
  if (role === 'admin') return true;
  if (!['student', 'parent'].includes(role) || !resource || resource.active === false || String(resource.fileId) !== fileId) return false;
  if (resource.type !== 'paid' || !(Number(resource.price) > 0)) return true;
  if (!studentIds.length) return false;
  return payments.some(payment => payment.kind === 'library'
    && String(payment.resourceId) === String(resource.id)
    && payment.status === 'paid'
    && studentIds.includes(String(payment.studentId)));
}

export function teacherOwnsCourse(teacherId: string, course: any): boolean {
  const explicitOwner = String(course?.teacherId ?? course?.teacher_id ?? '').trim();
  // A display name is not an authorization grant. Only the administrator's explicit
  // teacher assignment on the course record grants course access.
  return !!teacherId && explicitOwner === teacherId;
}

export function canRegisterDeviceSession(role: string, boundDeviceHash: string | null, requestedHash: string): boolean {
  // Non-admin accounts stay bound to the first device until an administrator resets
  // the binding. Logging out only ends a session; it must not release the device.
  return role === 'admin' || !boundDeviceHash || boundDeviceHash === requestedHash;
}

export function requiresDeviceRegistration(role: string): boolean {
  return role !== 'admin';
}
