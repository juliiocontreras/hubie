import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoStore} from '../assets/demo-backend.js';
import {catalog} from '../platform/catalog.mjs';

test('custom image backgrounds stay separate for Madre and each Suite',async()=>{
 const store=createDemoStore(catalog);
 const png=Buffer.from('89504e470d0a1a0a0000000d49484452','hex').toString('base64');
 const file={filename:'fondo.png',mime:'image/png',data:png};
 const a=(await store.request('/api/app/organizations')).organizations[0];
 const b=(await store.request('/api/app/organizations')).organizations[1];
 const original=(await store.request('/api/app/'+b.slug+'/config')).backgrounds;
 const response=await store.request('/api/app/'+a.slug+'/media/dashboard',{method:'POST',body:JSON.stringify(file)});
 assert.match(response.backgrounds.dashboard,/^data:image\/png;base64,/);
 assert.deepEqual((await store.request('/api/app/'+b.slug+'/config')).backgrounds,original);
 await store.request('/api/admin/media/sidebar',{method:'POST',body:JSON.stringify(file)});
 assert.equal((await store.request('/api/admin/appearance')).backgrounds.dashboard,null);
 assert.match((await store.request('/api/admin/appearance')).backgrounds.sidebar,/^data:image\/png;base64,/);
 await store.request('/api/app/'+a.slug+'/media/dashboard',{method:'DELETE'});
 assert.equal((await store.request('/api/app/'+a.slug+'/config')).backgrounds.dashboard,null);
});

test('demo attachments are scoped to tool, record, and organization and can be deleted',async()=>{
 const store=createDemoStore(catalog);
 const orgs=(await store.request('/api/app/organizations')).organizations;
 const [a,b]=orgs;
 const client=(await store.request('/api/app/'+a.slug+'/workflows/clients')).clients[0];
 const pdf=Buffer.from('%PDF-1.4\nDemo').toString('base64');
 const route='/api/app/'+a.slug+'/tools/C001/records/'+client.id+'/attachments';
 const result=await store.request(route,{method:'POST',body:JSON.stringify({filename:'comprobante.pdf',mime:'application/pdf',data:pdf})});
 const items=(await store.request(route)).attachments;
 assert.equal(items.length,1);
 assert.equal(items[0].filename,'comprobante.pdf');
 const attachment=(await store.request(items[0].downloadUrl)).file;
 assert.equal(attachment.data,pdf);
 await assert.rejects(()=>store.request('/api/app/'+b.slug+'/attachments/'+result.attachment.id),/Not found/);
 await store.request(items[0].downloadUrl,{method:'DELETE'});
 assert.equal((await store.request(route)).attachments.length,0);
});
