export type CommunityActorRole = 'admin' | 'student' | 'parent';

export type CommunitySpace = {
  id: string;
  title?: string;
  description?: string;
  teacherName?: string;
  active?: boolean;
  visibility: 'public' | 'private';
  courseId?: string | null;
};

export function canAccessCommunitySpace(input: {
  space: CommunitySpace;
  role: CommunityActorRole;
  userId: string;
  state: any;
  linkedStudentIds?: string[];
}): boolean {
  const { space, role, userId, state } = input;
  if (space.active === false) return role === 'admin';
  if (role === 'admin' || space.visibility === 'public') return true;
  const courseId = String(space.courseId || '');
  if (!courseId) return false;
  const course = (Array.isArray(state?.courses) ? state.courses : []).find((item: any) => String(item?.id) === courseId && item?.active !== false);
  if (!course) return false;
  const enrolled = new Set((Array.isArray(course.enrollments) ? course.enrollments : []).map(String));
  if (role === 'student') return enrolled.has(String(userId));
  return (input.linkedStudentIds || []).some(id => enrolled.has(String(id)));
}

export function canReadCommunityTopic(input: {
  topic: any;
  role: CommunityActorRole;
  userId: string;
  state: any;
  spaces: CommunitySpace[];
  linkedStudentIds?: string[];
  hidden?: boolean;
}): boolean {
  const { topic, role, userId } = input;
  if (role === 'admin') return true;
  if (input.hidden || topic?.status !== 'approved') return String(topic?.authorId || '') === String(userId) && !input.hidden;
  if (String(topic?.authorId || '') === String(userId)) return true;
  const recipient = String(topic?.recipientType || topic?.targetType || 'public');
  if (recipient === 'public') return true;
  if (recipient !== 'group') return false;
  const groupId = String(topic?.groupId || topic?.spaceId || '');
  const space = input.spaces.find(item => String(item.id) === groupId);
  return !!space && canAccessCommunitySpace({ space, role, userId, state: input.state, linkedStudentIds: input.linkedStudentIds });
}
