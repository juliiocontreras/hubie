import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDemoStore} from '../assets/demo-backend.js';
import {catalog} from '../platform/catalog.mjs';
const png=Buffer.from('89504e470d0a1a0a0000000d49484452','hex').toString('base64');
const post=body=>({method:'POST',body:JSON.stringify(body)});
const patch=body=>({method:'PATCH',body:JSON.stringify(body)});
const put=body=>({method:'PUT',body:JSON.stringify(body)});
const daysFromNow=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
async function setup(){
 const demo=createDemoStore(catalog);
 const slug=(await demo.request('/api/app/organizations')).organizations[0].slug;
 const base='/api/app/'+slug;
 const clients=(await demo.request(base+'/workflows/clients')).clients;
 return {demo,slug,base,client:clients[0]};
}
async function uploadDoc(demo,base,caseId,filename,documentType,expiresOn){
 return demo.request(base+'/tools/C003/records/'+caseId+'/attachments',
  post({filename,mime:'application/pdf',data:png,documentType,expiresOn}));
}

test('C001 timeline derives deals, cases, appointments and quotes by client_id',async()=>{
 const {demo,base,client}=await setup();
 const quote=await demo.request(base+'/workflows/quotes',post({clientId:client.id,clientName:client.name,
  title:'Cotización de la línea de tiempo',vatRate:16,
  lines:[{description:'Servicio',quantity:1,unitPriceCents:10000}]}));
 assert.equal(quote.quote.clientId,client.id);
 const {timeline,counts}=await demo.request(base+'/workflows/clients/'+client.id+'/timeline');
 const kinds=new Set(timeline.map(e=>e.kind));
 assert.ok(kinds.has('deal')&&kinds.has('case')&&kinds.has('appointment')&&kinds.has('quote'));
 assert.ok(counts.deal>=1&&counts.quote>=1);
 const at=timeline.map(e=>e.at);
 assert.deepEqual(at,[...at].sort((a,b)=>String(b).localeCompare(String(a))));
 const quoteEvent=timeline.find(e=>e.kind==='quote');
 assert.equal(quoteEvent.recordId,quote.quote.id);
 assert.equal(quoteEvent.toolId,'T013');
});

test('C002 deal assignment needs a real active member; tasks live on the deal',async()=>{
 const {demo,base}=await setup();
 const crm=await demo.request(base+'/workflows/crm');
 const member=crm.members[0];
 assert.ok(member?.id);
 await assert.rejects(()=>demo.request(base+'/workflows/crm',
  post({title:'Trato sin responsable válido',amountCents:100,assignedUserId:randomUUID()})),/Invalid deal/);
 const created=await demo.request(base+'/workflows/crm',
  post({title:'Trato asignado',amountCents:50000,assignedUserId:member.id}));
 assert.equal(created.deal.assignedUserId,member.id);
 const listed=(await demo.request(base+'/workflows/crm')).deals.find(d=>d.id===created.deal.id);
 assert.equal(listed.assignedUserEmail,member.email);
 const tasksBase=base+'/workflows/crm/'+created.deal.id+'/tasks';
 await assert.rejects(()=>demo.request(tasksBase,post({title:'X'})),/Invalid deal task/);
 await assert.rejects(()=>demo.request(base+'/workflows/crm/'+randomUUID()+'/tasks',post({title:'Tarea'})),/Not found/);
 const task=await demo.request(tasksBase,post({title:'Enviar propuesta',status:'todo',dueAt:'2026-11-20T10:00:00.000Z',assignedUserId:member.id}));
 assert.equal(task.task.status,'todo');
 assert.equal((await demo.request(tasksBase)).tasks.length,1);
 await demo.request(tasksBase+'/'+task.task.id,{method:'PATCH',body:JSON.stringify({title:'Enviar propuesta',status:'done',dueAt:'2026-11-20T10:00:00.000Z',assignedUserId:member.id})});
 const done=(await demo.request(tasksBase)).tasks[0];
 assert.equal(done.status,'done');
 assert.ok(done.completedAt);
 await demo.request(tasksBase+'/'+task.task.id,{method:'DELETE'});
 assert.equal((await demo.request(tasksBase)).tasks.length,0);
});

test('C002 quotes link to a deal and show back from the quote',async()=>{
 const {demo,base,client}=await setup();
 const deal=(await demo.request(base+'/workflows/crm')).deals[0];
 const quote=await demo.request(base+'/workflows/quotes',post({clientId:client.id,clientName:client.name,
  title:'Cotización del trato',vatRate:16,lines:[{description:'Servicio',quantity:2,unitPriceCents:15000}]}));
 const linkBase=base+'/workflows/crm/'+deal.id+'/quotes';
 assert.deepEqual((await demo.request(linkBase)).quotes,[]);
 const linked=await demo.request(linkBase+'/'+quote.quote.id,post({}));
 assert.equal(linked.linked,true);
 assert.equal((await demo.request(linkBase)).quotes[0].id,quote.quote.id);
 assert.equal((await demo.request(base+'/workflows/quotes/'+quote.quote.id)).quote.dealId,deal.id);
 assert.deepEqual((await demo.request(base+'/workflows/quotes/'+quote.quote.id+'/deal')).deal,{id:deal.id,title:deal.title});
 await assert.rejects(()=>demo.request(linkBase+'/'+quote.quote.id,post({})),/Duplicate relation/);
 const otherClient=await demo.request(base+'/workflows/clients',post({name:'Otro cliente',email:'otro-cliente@correo.invalid',status:'active'}));
 const otherQuote=await demo.request(base+'/workflows/quotes',post({clientId:otherClient.client.id,clientName:'Otro cliente',
  title:'Cotización ajena',vatRate:16,lines:[{description:'Servicio',quantity:1,unitPriceCents:1000}]}));
 await assert.rejects(()=>demo.request(linkBase+'/'+otherQuote.quote.id,post({})),/Relation mismatch/);
 await demo.request(linkBase+'/'+quote.quote.id,{method:'DELETE'});
 assert.deepEqual((await demo.request(linkBase)).quotes,[]);
 assert.equal((await demo.request(base+'/workflows/quotes/'+quote.quote.id+'/deal')).deal,null);
});

test('C001 duplicates are found by email and merge reassigns relations with audit',async()=>{
 let captured=null;
 const source=createDemoStore(catalog,{load:()=>null,save:s=>{captured=s;}});
 await source.request('/api/app/organizations');
 const slug=(await source.request('/api/app/organizations')).organizations[0].slug;
 const base='/api/app/'+slug;
 const seed=(await source.request(base+'/workflows/clients')).clients[0];
 // La creación de un segundo cliente con el mismo email está bloqueada por la
 // unicidad; un duplicado solo llega como dato heredado, así que se siembra.
 await source.request(base+'/workflows/clients',post({name:'Cliente sembrado',email:'sembrado@correo.invalid'}));
 assert.ok(captured);
 const tenant=captured.tenants[0];
 tenant.clients.push({id:randomUUID(),name:'Contacto duplicado',company:'',email:seed.email,phone:'',status:'active',notes:''});
 const demo=createDemoStore(catalog,{load:()=>captured,save:()=>{}});
 const {duplicates}=await demo.request(base+'/workflows/clients/duplicates');
 assert.equal(duplicates.length,1);
 assert.equal(duplicates[0].email,seed.email.toLowerCase());
 assert.equal(duplicates[0].clients.length,2);
 const duplicate=duplicates[0].clients.find(c=>c.id!==seed.id);
 assert.ok(duplicate.relations.deals>=0);
 const other=await demo.request(base+'/workflows/clients',post({name:'Tercero distinto',email:'tercero@correo.invalid'}));
 await assert.rejects(()=>demo.request(base+'/workflows/clients/'+seed.id+'/merge',
  post({mergedClientId:other.client.id})),/Invalid merge/);
 const merged=await demo.request(base+'/workflows/clients/'+seed.id+'/merge',
  post({mergedClientId:duplicate.id,reason:'Duplicado por email'}));
 assert.equal(merged.merged,true);
 assert.equal(merged.keptClientId,seed.id);
 const remaining=(await demo.request(base+'/workflows/clients')).clients;
 assert.ok(!remaining.some(c=>c.id===duplicate.id));
 const deals=(await demo.request(base+'/workflows/crm')).deals;
 assert.ok(deals.every(d=>d.clientId!==duplicate.id));
 await assert.rejects(()=>demo.request(base+'/workflows/clients/'+seed.id+'/merge',
  post({mergedClientId:duplicate.id})),/Not found/);
});

test('C003 document search, expiry alerts, visibility and per-case access',async()=>{
 const {demo,base,client}=await setup();
 const dossier=await demo.request(base+'/workflows/cases',post({clientId:client.id,title:'Expediente de búsqueda',kind:'contract',status:'open'}));
 const caseId=dossier.case.id;
 const expired=await uploadDoc(demo,base,caseId,'contrato-vencido.pdf','contract','2026-11-01');
 const soon=await uploadDoc(demo,base,caseId,'constancia-por-vencer.pdf','certificate',daysFromNow(10));
 await uploadDoc(demo,base,caseId,'identificacion-vigente.pdf','identification','2027-06-01');
 // Segunda versión del contrato vencido.
 await demo.request(base+'/tools/C003/records/'+caseId+'/attachments',
  post({filename:'contrato-vencido-v2.pdf',mime:'application/pdf',data:png,documentType:'contract',expiresOn:'2026-11-01',replaceDocumentId:expired.attachment.documentId}));
 const search=(q)=>demo.request(base+'/workflows/cases/documents/search'+q);
 const byName=await search('?q=contrato');
 assert.equal(byName.documents.length,1);
 assert.equal(byName.documents[0].latestVersion,2);
 assert.equal((await search('?type=certificate')).documents[0].filename,'constancia-por-vencer.pdf');
 assert.equal((await search('?expiry=expired')).documents.length,1);
 const expiring=await demo.request(base+'/workflows/cases/documents/expiring');
 assert.equal(expiring.counts.expired,1);
 assert.equal(expiring.counts.expiringSoon,1);
 assert.equal(expiring.expiringSoon[0].documentId,soon.attachment.documentId);
 const docId=expired.attachment.documentId;
 const vis=await demo.request(base+'/case-documents/'+docId+'/visibility',patch({visibility:'restricted'}));
 assert.equal(vis.visibility,'restricted');
 const access=await demo.request(base+'/case-documents/'+docId+'/access');
 assert.equal(access.visibility,'restricted');
 assert.deepEqual(access.grants,[]);
 const member=(await demo.request(base+'/workflows/crm')).members[0];
 await demo.request(base+'/case-documents/'+docId+'/access',put({userId:member.id,access:'read'}));
 assert.equal((await demo.request(base+'/case-documents/'+docId+'/access')).grants[0].email,member.email);
 const caseAccessBase=base+'/workflows/cases/'+caseId+'/access';
 assert.deepEqual((await demo.request(caseAccessBase)).grants,[]);
 await demo.request(caseAccessBase,put({userId:member.id,access:'write'}));
 assert.equal((await demo.request(caseAccessBase)).grants[0].access,'write');
 await demo.request(caseAccessBase,put({userId:member.id,access:null}));
 assert.deepEqual((await demo.request(caseAccessBase)).grants,[]);
 const history=(await demo.request(base+'/workflows/cases/'+caseId+'/history')).events;
 assert.ok(history.some(e=>e.action==='updated'&&e.description.includes('Acceso')));
});

test('C003 case links gather deals, appointments and quotes of the same client',async()=>{
 const {demo,base,client}=await setup();
 const dossier=await demo.request(base+'/workflows/cases',post({clientId:client.id,title:'Expediente vinculado',kind:'commercial',status:'open'}));
 const links=await demo.request(base+'/workflows/cases/'+dossier.case.id+'/links');
 assert.equal(links.client.id,client.id);
 assert.ok(links.deals.length>=1);
 assert.ok(links.appointments.length>=1);
 const quote=await demo.request(base+'/workflows/quotes',post({clientId:client.id,clientName:client.name,
  title:'Cotización vinculada',vatRate:16,lines:[{description:'Servicio',quantity:1,unitPriceCents:5000}]}));
 const links2=await demo.request(base+'/workflows/cases/'+dossier.case.id+'/links');
 assert.ok(links2.quotes.some(q=>q.id===quote.quote.id));
});

test('C009 per-member tool permissions override the role default; suspension hides the member',async()=>{
 const {demo,base}=await setup();
 const tenants=(await demo.request('/api/admin/tenants')).tenants;
 const tenantId=tenants[0].id;
 const members=(await demo.request('/api/admin/tenants/'+tenantId+'/members')).members;
 const owner=members.find(m=>m.role==='owner');
 const mine=await demo.request(base+'/member-tools');
 assert.equal(mine.role,'owner');
 assert.equal(mine.access.C001,'write');
 assert.equal(mine.access.C009,'read');
 const toolsBase=base+'/member-tools/'+owner.id;
 const denied=await demo.request(toolsBase,put({tools:{C002:'none'}}));
 assert.equal(denied.members.find(m=>m.id===owner.id).tools.C002,'none');
 const restored=await demo.request(toolsBase,put({tools:{C002:'write'}}));
 assert.equal(restored.members.find(m=>m.id===owner.id).tools.C002,'write');
 await assert.rejects(()=>demo.request(toolsBase,put({tools:{C002:'super'}})),/Invalid tenant data/);
 const adminTools=await demo.request('/api/admin/tenants/'+tenantId+'/members/'+owner.id+'/tools');
 assert.equal(adminTools.members.find(m=>m.id===owner.id).tools.C003,'write');
 const added=await demo.request('/api/admin/tenants/'+tenantId+'/members',post({email:'miembro@ejemplo.invalid',role:'member'}));
 const member=added.members.find(m=>m.email==='miembro@ejemplo.invalid');
 assert.equal(member.status,'active');
 await demo.request('/api/admin/tenants/'+tenantId+'/members/'+member.id,{method:'PATCH',body:JSON.stringify({status:'suspended'})});
 const after=(await demo.request('/api/admin/tenants/'+tenantId+'/members')).members;
 assert.equal(after.find(m=>m.id===member.id).status,'suspended');
 // La consola del tenant ya no lista al suspendido: su sesión deja de autorizar.
 const config=await demo.request(base+'/config');
 assert.ok(!config.members.some(m=>m.email==='miembro@ejemplo.invalid'));
 await demo.request('/api/admin/tenants/'+tenantId+'/members/'+member.id,{method:'PATCH',body:JSON.stringify({status:'active'})});
 assert.ok((await demo.request(base+'/config')).members.some(m=>m.email==='miembro@ejemplo.invalid'));
});
