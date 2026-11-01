import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessCommunitySpace, canReadCommunityTopic } from '../src/community-utils.js';

const state = { courses: [{ id:'course-a', active:true, enrollments:['student-a'] }, { id:'course-off', active:false, enrollments:['student-b'] }] };
const privateCourse = { id:'private-a', active:true, visibility:'private' as const, courseId:'course-a' };

test('public spaces are open to members and private course spaces require enrollment', () => {
  assert.equal(canAccessCommunitySpace({ space:{id:'public',active:true,visibility:'public'},role:'student',userId:'student-b',state }),true);
  assert.equal(canAccessCommunitySpace({ space:privateCourse,role:'student',userId:'student-a',state }),true);
  assert.equal(canAccessCommunitySpace({ space:privateCourse,role:'student',userId:'student-b',state }),false);
});

test('linked parents and admins can access their permitted spaces; inactive spaces stay hidden', () => {
  assert.equal(canAccessCommunitySpace({ space:privateCourse,role:'parent',userId:'parent-a',linkedStudentIds:['student-a'],state }),true);
  assert.equal(canAccessCommunitySpace({ space:privateCourse,role:'parent',userId:'parent-a',linkedStudentIds:['student-b'],state }),false);
  assert.equal(canAccessCommunitySpace({ space:{...privateCourse,active:false},role:'admin',userId:'admin',state }),true);
  assert.equal(canAccessCommunitySpace({ space:{...privateCourse,active:false},role:'student',userId:'student-a',state }),false);
});

test('pending, support, and unapproved group topics are private to their author and admins', () => {
  const pending = { id:'topic-a',authorId:'student-a',status:'pending',recipientType:'public' };
  const support = { id:'topic-b',authorId:'student-a',status:'approved',recipientType:'support' };
  const group = { id:'topic-c',authorId:'student-a',status:'approved',recipientType:'group',groupId:'private-a' };
  assert.equal(canReadCommunityTopic({ topic:pending,role:'student',userId:'student-b',state,spaces:[privateCourse] }),false);
  assert.equal(canReadCommunityTopic({ topic:support,role:'student',userId:'student-b',state,spaces:[privateCourse] }),false);
  assert.equal(canReadCommunityTopic({ topic:group,role:'student',userId:'student-b',state,spaces:[privateCourse] }),false);
  assert.equal(canReadCommunityTopic({ topic:group,role:'student',userId:'student-a',state,spaces:[privateCourse] }),true);
  assert.equal(canReadCommunityTopic({ topic:pending,role:'admin',userId:'admin',state,spaces:[privateCourse] }),true);
});

test('only enrolled members can read private-group topics and hidden topics disappear', () => {
  const topic = { id:'topic-d',authorId:'student-a',status:'approved',recipientType:'group',groupId:'private-a' };
  assert.equal(canReadCommunityTopic({ topic,role:'student',userId:'student-a',state,spaces:[privateCourse] }),true);
  assert.equal(canReadCommunityTopic({ topic,role:'student',userId:'student-b',state,spaces:[privateCourse] }),false);
  assert.equal(canReadCommunityTopic({ topic,role:'student',userId:'student-a',state,spaces:[privateCourse],hidden:true }),false);
});
