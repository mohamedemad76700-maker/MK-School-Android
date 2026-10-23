import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAiCoursesForEnrolledStudents, minimizeAiContext } from '../src/ai-context-utils.js';

test('AI context keeps schoolwork fields but removes account identifiers and sensitive profile data', () => {
  const result = JSON.parse(minimizeAiContext({
    students: [{ id: 'student-secret-id', name: 'Child Name', email: 'child@example.test', birthDate: '2012-01-01', grade: 'Grade 6', classId: '6-A' }],
    classes: [{ id: '6-A', name: 'Class A', grade: 'Grade 6' }],
    grades: [{ studentId: 'student-secret-id', subject: 'Math', title: 'Quiz', score: 8, max: 10, percentage: 80 }],
    users: [{ id: 'admin', password: 'do-not-send' }],
  }));
  assert.equal(result.students[0].grade, 'Grade 6');
  assert.equal('classId' in result.students[0], false);
  assert.equal('classes' in result, false);
  assert.equal('id' in result.students[0], false);
  assert.equal('name' in result.students[0], false);
  assert.equal('email' in result.students[0], false);
  assert.equal('birthDate' in result.students[0], false);
  assert.equal(result.grades[0].score, 8);
  assert.equal('studentId' in result.grades[0], false);
  assert.equal('users' in result, false);
});

test('AI context removes correct answers from object and legacy tuple questions', () => {
  const result = JSON.parse(minimizeAiContext({
    exams: [{ title: 'Math', questions: [
      { text: '2 + 2?', options: ['3', '4'], answer: 1, correctAnswer: '4', explanation: 'private key' },
      ['Capital?', ['Cairo', 'Paris'], 0],
    ] }],
  }));
  assert.deepEqual(result.exams[0].questions[0], { text: '2 + 2?', options: ['3', '4'] });
  assert.deepEqual(result.exams[0].questions[1], ['Capital?', ['Cairo', 'Paris']]);
});

test('AI context remains bounded and valid JSON for oversized school data', () => {
  const large = { library: Array.from({ length: 100 }, (_, i) => ({ title: `Lesson ${i}`, content: 'X'.repeat(4000), grade: 'G' })) };
  const text = minimizeAiContext(large, 12000);
  assert.ok(text.length <= 12000);
  assert.doesNotThrow(() => JSON.parse(text));
});

test('AI lesson context includes only active courses enrolled by the student or linked children', () => {
  const courses = [
    { title: 'Purchased course', active: true, enrollments: ['student-a'], lessons: [{ title: 'Open lesson' }] },
    { title: 'Other student course', active: true, enrollments: ['student-b'], lessons: [{ title: 'Private lesson' }] },
    { title: 'Inactive course', active: false, enrollments: ['student-a'], lessons: [{ title: 'Hidden lesson' }] },
  ];
  const visible = filterAiCoursesForEnrolledStudents(courses, ['student-a']);
  const context = JSON.parse(minimizeAiContext({ courses: visible }));
  assert.deepEqual(context.courses.map((course: { title: string }) => course.title), ['Purchased course']);
  assert.deepEqual(context.courses[0].lessons, [{ title: 'Open lesson' }]);
});
