import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadSchoolFile, canUploadSchoolFile, isSafeSchoolStorageKey, safeSchoolOriginalFilename, schoolFileMimeForExtension } from '../src/school-files-utils.js';

test('file type allowlist rejects active content and accepts school documents', () => {
  assert.equal(schoolFileMimeForExtension('.pdf'), 'application/pdf');
  assert.equal(schoolFileMimeForExtension('.png'), 'image/png');
  assert.equal(schoolFileMimeForExtension('.svg'), null);
  assert.equal(schoolFileMimeForExtension('.html'), null);
  assert.equal(schoolFileMimeForExtension('.js'), null);
});

test('original filenames cannot carry paths or header control characters', () => {
  assert.equal(safeSchoolOriginalFilename('../../report.pdf'), 'report.pdf');
  assert.equal(safeSchoolOriginalFilename('C:\\temp\\student.pdf'), 'student.pdf');
  assert.equal(safeSchoolOriginalFilename('x\r\nInjected: yes.pdf'), 'x__Injected_ yes.pdf');
});

test('storage keys cannot escape server-managed upload directory', () => {
  assert.equal(isSafeSchoolStorageKey('123e4567-e89b-12d3-a456-426614174000.pdf'), true);
  assert.equal(isSafeSchoolStorageKey('../secret.pdf'), false);
  assert.equal(isSafeSchoolStorageKey('C:\\temp\\secret.pdf'), false);
  assert.equal(isSafeSchoolStorageKey('my..pdf'), false);
});

test('student records and payment receipts enforce role and ownership checks', () => {
  const record = { owner_id: 'student-1', purpose: 'student-file' };
  const receipt = { owner_id: 'student-1', purpose: 'payment-receipt' };
  assert.equal(canReadSchoolFile({sub:'student-1',role:'student'}, record), false);
  assert.equal(canReadSchoolFile({sub:'student-1',role:'student'}, receipt), true);
  assert.equal(canReadSchoolFile({sub:'student-2',role:'student'}, receipt), false);
  assert.equal(canReadSchoolFile({sub:'admin',role:'admin'}, record), true);
});

test('upload permissions are restricted by purpose', () => {
  assert.equal(canUploadSchoolFile('student','student-file'), false);
  assert.equal(canUploadSchoolFile('admin','student-file'), true);
  assert.equal(canUploadSchoolFile('student','payment-receipt'), true);
  assert.equal(canUploadSchoolFile('teacher','course-file'), true);
  assert.equal(canUploadSchoolFile('parent','course-file'), false);
  assert.equal(canUploadSchoolFile('student','course-cover'), false);
});


test('course files are not globally readable by students or parents without enrollment mapping', () => {
  const courseFile = { owner_id: 'teacher-1', owner_role: 'teacher', purpose: 'course-file' };
  assert.equal(canReadSchoolFile({sub:'student-1',role:'student'}, courseFile), false);
  assert.equal(canReadSchoolFile({sub:'parent-1',role:'parent'}, courseFile), false);
  assert.equal(canReadSchoolFile({sub:'teacher-1',role:'teacher'}, courseFile), true);
  assert.equal(canReadSchoolFile({sub:'teacher-2',role:'teacher'}, courseFile), false);
  const adminPublished = { owner_id: 'admin', owner_role: 'admin', purpose: 'course-file' };
  assert.equal(canReadSchoolFile({sub:'student-1',role:'student'}, adminPublished), true);
  assert.equal(canReadSchoolFile({sub:'parent-1',role:'parent'}, adminPublished), true);
});
