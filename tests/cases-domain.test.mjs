import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCase,caseKinds,caseStatuses} from '../platform/cases-domain.mjs';
const clientId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('a dossier requires an existing client reference, valid kind, title and status',()=>{
 assert.deepEqual(normalizeCase({clientId,title:'  Expediente Norte ',kind:'commercial',status:'open',notes:' Inicio '}),{clientId,title:'Expediente Norte',kind:'commercial',status:'open',notes:'Inicio'});
 assert.ok(caseKinds.includes('commercial'));assert.ok(caseStatuses.includes('in_progress'));
 for(const data of [
  {clientId:'../../admin',title:'Expediente'},
  {clientId,title:' '},
  {clientId,title:'X'.repeat(200)},
  {clientId,title:'Expediente',kind:'clinical'},
  {clientId,title:'Expediente',status:'deleted'},
  {clientId,title:'Expediente',notes:'x'.repeat(2100)}
 ])assert.throws(()=>normalizeCase(data),/Invalid case/);
});
test('normalization rejects arbitrary fields to avoid unauthorized relation changes',()=>{
 assert.throws(()=>normalizeCase({clientId,title:'Expediente',organizationId:'otro'}),/Invalid case/);
});
