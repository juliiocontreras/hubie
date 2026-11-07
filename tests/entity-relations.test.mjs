import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeDeal,normalizeEvent} from '../platform/workflows.mjs';
import {normalizeEntityLink,canonicalPair} from '../platform/entity-relations.mjs';
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('CRM and Agenda accept normalized links to real client IDs, optional deal from same tenant',()=>{
 const deal=normalizeDeal({title:'Venta a Cliente',clientId:a,customer:'Texto legado'});
 assert.equal(deal.clientId,a);
 assert.equal(normalizeDeal({title:'Venta sin vinculo'}).clientId,null);
 const event=normalizeEvent({title:'Visita',startsAt:'2026-12-02T12:00:00Z',endsAt:'2026-12-02T13:00:00Z',clientId:a,dealId:b});
 assert.equal(event.clientId,a);assert.equal(event.dealId,b);
 assert.throws(()=>normalizeDeal({title:'Venta',clientId:'../../../admin'}),/Invalid deal/);
 assert.throws(()=>normalizeEvent({title:'Visita',startsAt:'2026-12-02T12:00:00Z',endsAt:'2026-12-02T13:00:00Z',dealId:'bad'}),/Invalid appointment/);
});
test('generic tool relations only allow known tools, links and never self relations',()=>{
 const link=normalizeEntityLink({targetToolId:'C003',targetRecordId:b,relationType:'related'});
 assert.deepEqual(link,{targetToolId:'C003',targetRecordId:b,relationType:'related'});
 assert.deepEqual(canonicalPair('C001',a,'C003',b),canonicalPair('C003',b,'C001',a));
 for(const value of [{targetToolId:'XX02',targetRecordId:b},{targetToolId:'C003',targetRecordId:'bad'},{targetToolId:'C003',targetRecordId:b,organizationId:'fake'},{targetToolId:'C003',targetRecordId:b,relationType:'danger'}])
 assert.throws(()=>normalizeEntityLink(value),/Invalid relation/);
});