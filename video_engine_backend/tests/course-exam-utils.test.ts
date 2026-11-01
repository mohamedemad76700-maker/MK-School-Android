import test from 'node:test';
import assert from 'node:assert/strict';
import { findLessonPrerequisiteIndex, hasPassedLessonPrerequisite, lessonPrerequisiteExamId } from '../src/course-exam-utils.js';

const exam = { id: 'exam-1', passPercent: 60, active: true };
const lesson = { id: 'lesson-2', prerequisiteExamId: 'exam-1' };

test('identifies lesson pre-exams without confusing a normal lesson', () => {
  assert.equal(lessonPrerequisiteExamId(lesson), 'exam-1');
  assert.equal(lessonPrerequisiteExamId({ title: 'No gate' }), '');
  assert.equal(findLessonPrerequisiteIndex({ lessons: [{}, lesson] }, 'exam-1'), 1);
  assert.equal(findLessonPrerequisiteIndex({ lessons: [{}] }, 'exam-1'), -1);
});

test('only the assigned student passing the active exam unlocks the lesson', () => {
  const exams = [exam];
  assert.equal(hasPassedLessonPrerequisite(lesson, 'student-1', exams, []), false);
  assert.equal(hasPassedLessonPrerequisite(lesson, 'student-1', exams, [{ student: 'student-2', exam: 'exam-1', percentage: 90 }]), false);
  assert.equal(hasPassedLessonPrerequisite(lesson, 'student-1', exams, [{ student: 'student-1', exam: 'exam-1', percentage: 59 }]), false);
  assert.equal(hasPassedLessonPrerequisite(lesson, 'student-1', exams, [{ student: 'student-1', exam: 'exam-1', percentage: 90, forfeited: true }]), false);
  assert.equal(hasPassedLessonPrerequisite(lesson, 'student-1', exams, [{ student: 'student-1', exam: 'exam-1', percentage: 60 }]), true);
});

test('missing, disabled, and zero-threshold exam settings are handled explicitly', () => {
  assert.equal(hasPassedLessonPrerequisite(lesson, 'student-1', [], [{ student: 'student-1', exam: 'exam-1', percentage: 100 }]), false);
  assert.equal(hasPassedLessonPrerequisite(lesson, 'student-1', [{ ...exam, active: false }], [{ student: 'student-1', exam: 'exam-1', percentage: 100 }]), false);
  assert.equal(hasPassedLessonPrerequisite(lesson, 'student-1', [{ ...exam, passPercent: 0 }], [{ student: 'student-1', exam: 'exam-1', percentage: 0 }]), true);
  assert.equal(hasPassedLessonPrerequisite({}, 'student-1'), true);
});
