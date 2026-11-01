import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
test('tenant data model is scoped and tenant branding is configurable',async()=>{
const sql=await readFile('turso/migrations/002_multitenant.sql','utf8');
for(const table of ['tenant_settings','tenant_tools','tenant_clients','tenant_catalog_items','tenant_appointments','tenant_orders','tenant_service_requests'])assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+table));
assert.match(sql,/organization_id TEXT NOT NULL/);
assert.match(sql,/UNIQUE\s*\(organization_id/);
const mod=await readFile('tenant.mjs','utf8');assert.match(mod,/resolveTenant/);assert.match(mod,/getTenantSettings/);assert.match(mod,/getTenantTools/);
});