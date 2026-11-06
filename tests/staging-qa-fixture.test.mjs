import test from 'node:test';import assert from 'node:assert/strict';
import {QA_COMPANY, fixtureIds, makeQaSeedPlan, checkQaCounts} from '../platform/staging-qa-fixture.mjs';

const orgId='11111111-1111-4111-8111-111111111111';
const actorId='22222222-2222-4222-8222-222222222222';
test('QA fixture is deterministic, non-destructive and connected by composite tenant IDs',()=>{
 const ids=fixtureIds(orgId);
 assert.deepEqual(ids,fixtureIds(orgId));
 assert.notEqual(ids.client,ids.case);
 assert.equal(QA_COMPANY.slug,'hubie-qa-piloto');
 assert.equal(QA_COMPANY.suiteId,'S006');
 assert.ok(QA_COMPANY.toolIds.includes('C003'));
 assert.ok(QA_COMPANY.toolIds.includes('T004'));
 const rows=makeQaSeedPlan(orgId,actorId);
 assert.ok(rows.length>=13);
 assert.ok(rows.every(q=>/^INSERT OR IGNORE\s/i.test(q.sql)||/^INSERT\s+OR\s+IGNORE\s/i.test(q.sql)));
 assert.ok(rows.every(q=>q.args[0]===orgId||q.sql.includes('audit_events')));
 assert.ok(rows.some(q=>q.sql.includes('tenant_deal_clients')&&q.args.includes(ids.client)&&q.args.includes(ids.deal)));
 assert.ok(rows.some(q=>q.sql.includes('tenant_appointment_links')&&q.args.includes(ids.client)&&q.args.includes(ids.deal)));
 assert.ok(rows.some(q=>q.sql.includes('tenant_case_document_versions')&&q.args.includes(ids.case)));
 assert.ok(rows.some(q=>q.sql.includes('tenant_entity_links')&&q.args.includes('T004')));
 assert.ok(rows.some(q=>q.sql.includes('tenant_tool_records')&&q.args.includes('T013')));
});
test('seed count verification fails on incomplete company and accepts all expected links',()=>{
 assert.equal(checkQaCounts([1,1,1,1,1,1,1,1,2,2]),true);
 assert.equal(checkQaCounts([1,1,1,1,1,1,1,1,0,2]),false);
});
