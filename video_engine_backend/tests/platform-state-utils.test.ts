import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPlatformStateChanges, diffPlatformState, mergePlatformState } from '../src/platform-state-utils.js';

test('diff and apply changes only touched array records and preserve unrelated server records', () => {
  const base = { students: [{id:'s1',name:'Old'},{id:'s2',name:'Keep'}], settings:{theme:'light',locale:'ar'} };
  const local = { students: [{id:'s1',name:'New'},{id:'s2',name:'Keep'}], settings:{theme:'dark',locale:'ar'} };
  const diff = diffPlatformState(base, local);
  assert.equal(diff.students.upsert?.length, 1);
  assert.equal(diff.settings.upsert?.length, 1);
  assert.deepEqual(applyPlatformStateChanges(base, diff), local);
});

test('apply changes supports safe deletes and ordered inserts', () => {
  const result = applyPlatformStateChanges({ students:[{id:'s1'},{id:'s2'}] }, { students:{kind:'array',delete:['s1'],upsert:[{key:'s3',ordinal:0,value:{id:'s3'}}]} });
  assert.deepEqual(result.students, [{id:'s3'},{id:'s2'}]);
});

test('three-way merge keeps disjoint edits and uses server value for same-record conflict', () => {
  const base = { students:[{id:'s1',name:'One',grade:'G1'}], settings:{theme:'light',locale:'ar'} };
  const local = { students:[{id:'s1',name:'Local Name',grade:'G1'}], settings:{theme:'light',locale:'en'} };
  const remote = { students:[{id:'s1',name:'Remote Name',grade:'G2'}], settings:{theme:'dark',locale:'ar'} };
  const merged=mergePlatformState(base,local,remote);
  assert.equal(merged.students[0].name,'Remote Name');
  assert.equal(merged.students[0].grade,'G2');
  assert.equal(merged.settings.theme,'dark');
  assert.equal(merged.settings.locale,'en');
});

test('malicious object keys and oversized change sets are rejected', () => {
  assert.throws(() => applyPlatformStateChanges({}, JSON.parse('{"__proto__":{"kind":"object","replace":true,"value":{}}}')));
  assert.throws(() => applyPlatformStateChanges({}, { students:{kind:'array',upsert:Array.from({length:20001},(_,i)=>({key:String(i),value:{id:String(i)}}))} }));
});
