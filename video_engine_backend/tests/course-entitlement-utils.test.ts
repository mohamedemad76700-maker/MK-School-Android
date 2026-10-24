import test from 'node:test';
import assert from 'node:assert/strict';
import { hasApprovedCoursePayment, hasCourseEnrollmentAccess } from '../src/course-entitlement-utils.js';

const approved = [{ courseId: 'paid-1', studentId: 'student-1', status: 'paid' }];

test('free courses open to their enrolled student without a payment record', () => {
  assert.equal(hasCourseEnrollmentAccess({ id: 'free-1', type: 'free', enrollments: ['student-1'] }, 'student-1', []), true);
});

test('paid courses stay locked unless the same student has an approved payment', () => {
  const course = { id: 'paid-1', type: 'paid', enrollments: ['student-1'] };
  assert.equal(hasCourseEnrollmentAccess(course, 'student-1', []), false);
  assert.equal(hasCourseEnrollmentAccess(course, 'student-1', [{ ...approved[0], status: 'pending' }]), false);
  assert.equal(hasCourseEnrollmentAccess(course, 'student-2', approved), false);
  assert.equal(hasCourseEnrollmentAccess(course, 'student-1', approved), true);
});

test('administrator course grants unlock paid courses and administrator revocation overrides payment', () => {
  const course = { id: 'paid-1', type: 'paid', enrollments: ['student-1'], adminEnrollmentGrants: ['student-1'] };
  assert.equal(hasCourseEnrollmentAccess(course, 'student-1', []), true);
  course.adminEnrollmentRevocations = ['student-1'];
  assert.equal(hasCourseEnrollmentAccess(course, 'student-1', [{ ...approved[0], status: 'paid' }]), false);
  delete course.adminEnrollmentRevocations;
  assert.equal(hasCourseEnrollmentAccess(course, 'student-1', []), true);
});

test('a library payment cannot unlock a course with a colliding identifier', () => {
  assert.equal(hasApprovedCoursePayment([{ courseId: 'paid-1', resourceId: 'paid-1', kind: 'library', studentId: 'student-1', status: 'paid' }], 'student-1', 'paid-1'), false);
});
