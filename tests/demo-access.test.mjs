import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoStore} from '../assets/demo-backend.js';
import {catalog} from '../platform/catalog.mjs';

test('demo opens two isolated companies, never creates a server session',async()=>{
 const demo=createDemoStore(catalog);
 const {tenants}=await demo.request('/api/admin/tenants');
 assert.equal(tenants.length,2);
 const {organizations}=await demo.request('/api/app/organizations');
 assert.equal(organizations.length,2);
 const data=await demo.request('/api/app/'+organizations[0].slug+'/config');
 assert.ok(data.tools.some(t=>t.id==='C002'));
 assert.equal(data.tenant.role,'owner');
});
test('demo lets Madre create a customized suite and toggle tools per company',async()=>{
 const demo=createDemoStore(catalog);
 const {tenant}=await demo.request('/api/admin/tenants',{method:'POST',body:JSON.stringify({name:'Empresa Tercera',slug:'empresa-tercera',suiteId:'S003',toolIds:['C001','T004'],primaryColor:'#3377dd',secondaryColor:'#445566'})});
 const old=await demo.request('/api/admin/tenants/'+tenant.id);
 assert.ok(old.tenant.tools.find(x=>x.id==='T004')?.enabled);
 await demo.request('/api/admin/tenants/'+tenant.id+'/tools/T004',{method:'PUT',body:JSON.stringify({enabled:false})});
 await assert.rejects(()=>demo.request('/api/app/empresa-tercera/tools/T004/records'),/Tool disabled/);
 await assert.rejects(()=>demo.request('/api/app/organizaciones'),/Not found/);
});
test('demo preserves client and CRM isolation and blocks invalid stock withdrawals',async()=>{
 const demo=createDemoStore(catalog);
 const {organizations}=await demo.request('/api/app/organizations');
 const [a,b]=organizations;
 await demo.request('/api/app/'+a.slug+'/workflows/clients',{method:'POST',body:JSON.stringify({name:'Cliente en Empresa A',email:'demo@ejemplo.mx'})});
 const clientsA=(await demo.request('/api/app/'+a.slug+'/workflows/clients')).clients;
 const clientsB=(await demo.request('/api/app/'+b.slug+'/workflows/clients')).clients;
 assert.ok(clientsA.some(c=>c.name==='Cliente en Empresa A'));
 assert.ok(!clientsB.some(c=>c.name==='Cliente en Empresa A'));
 const {item}=await demo.request('/api/app/'+a.slug+'/workflows/inventory',{method:'POST',body:JSON.stringify({sku:'ABC',title:'Artículo',lowStock:2})});
 await assert.rejects(()=>demo.request('/api/app/'+a.slug+'/workflows/inventory/'+item.id+'/movements',{method:'POST',body:JSON.stringify({delta:-5})}),/Insufficient stock/);
});
test('demo appointment conflict and one active member cannot leak another company',async()=>{
 const demo=createDemoStore(catalog);
 const {organizations}=await demo.request('/api/app/organizations');
 const [a,b]=organizations;
 const event={title:'Llamada',resource:'sala-1',startsAt:'2026-11-10T10:00:00.000Z',endsAt:'2026-11-10T11:00:00.000Z'};
 await demo.request('/api/app/'+a.slug+'/workflows/agenda',{method:'POST',body:JSON.stringify(event)});
 await assert.rejects(()=>demo.request('/api/app/'+a.slug+'/workflows/agenda',{method:'POST',body:JSON.stringify({...event,title:'Segunda llamada'})}),/Schedule conflict/);
 await demo.request('/api/app/'+b.slug+'/workflows/agenda',{method:'POST',body:JSON.stringify(event)});
 assert.ok((await demo.request('/api/app/'+b.slug+'/workflows/agenda')).events.length>0);
});


test('independent backgrounds persist in demo per tenant and in Madre without changing other organizations',async()=>{
 const demo=createDemoStore(catalog);
 const original=(await demo.request('/api/app/organizations')).organizations;
 const [a,b]=original;
 const globalBefore=(await demo.request('/api/admin/appearance')).appearance;
 const bBefore=(await demo.request('/api/app/'+b.slug+'/config')).appearance;
 const newGlobal={...globalBefore,dashboardPreset:'pearl',sidebarPreset:'steel'};
 await demo.request('/api/admin/appearance',{method:'PUT',body:JSON.stringify(newGlobal)});
 const aBefore=(await demo.request('/api/app/'+a.slug+'/config')).appearance;
 const custom={...aBefore,dashboardPreset:'custom',dashboardColor:'#f1e7da',sidebarPreset:'custom',sidebarColor:'#0c2445'};
 const modified=await demo.request('/api/admin/tenants/'+(await demo.request('/api/admin/tenants')).tenants.find(t=>t.slug===a.slug).id+'/appearance',{method:'PUT',body:JSON.stringify(custom)});
 assert.equal(modified.appearance.sidebarColor,'#0c2445');
 assert.deepEqual((await demo.request('/api/app/'+a.slug+'/config')).appearance,custom);
 assert.deepEqual((await demo.request('/api/app/'+b.slug+'/config')).appearance,bBefore);
 assert.equal((await demo.request('/api/admin/appearance')).appearance.dashboardPreset,'pearl');
 await demo.request('/api/app/'+b.slug+'/appearance',{method:'PUT',body:JSON.stringify({...bBefore,sidebarPreset:'platinum'})});
 assert.equal((await demo.request('/api/app/'+a.slug+'/config')).appearance.sidebarColor,'#0c2445');
 await assert.rejects(()=>demo.request('/api/admin/appearance',{method:'PUT',body:JSON.stringify({...custom,sidebarColor:'url(https://bad.example)'})}),/Invalid appearance/);
});
