import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDealTask,taskStatuses} from '../platform/deal-work-p0.mjs';
import {normalizeMerge} from '../platform/client-relations-p0.mjs';
import {defaultToolAccess,toolAccessLevels} from '../platform/member-tools-p0.mjs';
import {documentVisibilities,caseAccessLevels} from '../platform/case-access-p0.mjs';

const memberId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('deal task requires title, known status, valid due date and real member id',()=>{
 assert.deepEqual(normalizeDealTask({title:' Llamar al cliente ',status:'doing',dueAt:'2026-11-20T10:00:00.000Z',assignedUserId:memberId}),
  {title:'Llamar al cliente',dueAt:'2026-11-20T10:00:00.000Z',status:'doing',assignedUserId:memberId});
 assert.deepEqual(normalizeDealTask({title:'Seguimiento'}),
  {title:'Seguimiento',dueAt:null,status:'todo',assignedUserId:null});
 for(const data of [
  {title:'X'},{title:' '},{title:'Tarea',status:'waiting'},
  {title:'Tarea',dueAt:'20-11-2026'},{title:'Tarea',dueAt:'2026-13-40T10:00:00.000Z'},
  {title:'Tarea',assignedUserId:'no-es-uuid'},{title:'Tarea',unknown:'x'}
 ])assert.throws(()=>normalizeDealTask(data),/Invalid deal task/);
 assert.ok(taskStatuses.includes('done'));
});

test('client merge requires two distinct valid ids and an optional short reason',()=>{
 assert.deepEqual(normalizeMerge({keptClientId:memberId,mergedClientId:otherId,reason:' Duplicado '} ),
  {keptClientId:memberId,mergedClientId:otherId,reason:'Duplicado'});
 assert.deepEqual(normalizeMerge({keptClientId:memberId,mergedClientId:otherId}),
  {keptClientId:memberId,mergedClientId:otherId,reason:''});
 for(const data of [
  {keptClientId:memberId,mergedClientId:memberId},
  {keptClientId:'x',mergedClientId:otherId},
  {keptClientId:memberId},{mergedClientId:otherId},
  {keptClientId:memberId,mergedClientId:otherId,reason:'x'.repeat(501)},
  {keptClientId:memberId,mergedClientId:otherId,reason:12}
 ])assert.throws(()=>normalizeMerge(data),/Invalid merge/);
});

test('default tool access follows the role, and C009 stays owner/admin only',()=>{
 assert.equal(defaultToolAccess('viewer','C002'),'read');
 assert.equal(defaultToolAccess('member','C002'),'write');
 assert.equal(defaultToolAccess('admin','T013'),'write');
 assert.equal(defaultToolAccess('owner','C009'),'read');
 assert.equal(defaultToolAccess('admin','C009'),'read');
 assert.equal(defaultToolAccess('member','C009'),'none');
 assert.equal(defaultToolAccess('viewer','C009'),'none');
 assert.equal(defaultToolAccess('ghost','C001'),'none');
 assert.deepEqual(toolAccessLevels,['none','read','write']);
});

test('case access levels and document visibilities are closed sets',()=>{
 assert.deepEqual(caseAccessLevels,['read','write']);
 assert.deepEqual(documentVisibilities,['team','restricted']);
});
