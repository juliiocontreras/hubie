import test from 'node:test';import assert from 'node:assert/strict';
import {createDemoStore} from '../assets/demo-backend.js';import {catalog} from '../platform/catalog.mjs';
test('disabling Clients hides directory from CRM and prevents linking hidden client records',async()=>{
 const store=createDemoStore(catalog);
 const a=(await store.request('/api/app/organizations')).organizations[0];
 const tenantId=(await store.request('/api/admin/tenants')).tenants.find(t=>t.slug===a.slug).id;
 const old=(await store.request('/api/app/'+a.slug+'/workflows/clients')).clients[0];
 await store.request('/api/admin/tenants/'+tenantId+'/tools/C001',{method:'PUT',body:JSON.stringify({enabled:false})});
 const crm=await store.request('/api/app/'+a.slug+'/workflows/crm');
 assert.deepEqual(crm.clients,[]);
 await assert.rejects(()=>store.request('/api/app/'+a.slug+'/workflows/crm',{method:'POST',body:JSON.stringify({title:'Venta nueva',clientId:old.id})}),/Tool disabled/);
 const external=await store.request('/api/app/'+a.slug+'/workflows/crm',{method:'POST',body:JSON.stringify({title:'Venta externa',customer:'Invitado'})});
 assert.ok(external.deal.id);
});
