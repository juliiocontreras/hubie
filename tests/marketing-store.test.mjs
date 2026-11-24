import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketingFakeDb,marketingDeps} from './marketing-fake-db.mjs';
import {listSegments,createSegment,updateSegment,deleteSegment,listCampaigns,createCampaign,
 updateCampaign,setCampaignStatus,getCampaign,previewRecipients,listSends,sendCampaign,dashboard} from '../platform/marketing-store.mjs';

const token='<redacted>',slug='demo',otherSlug='demo-b';
const setup=(opts)=>{const fake=createMarketingFakeDb();return {fake,deps:marketingDeps(fake,opts)};};
const seedClients=(fake,org)=>{
 fake.tables.clients.push(
  {organization_id:org,id:'a1111111-1111-4111-8111-111111111111',name:'Ana Ruiz',company:'Café Central',email:'ana@cafe.mx',status:'active',archived_at:null},
  {organization_id:org,id:'b2222222-2222-4222-8222-222222222222',name:'Bruno Méndez',company:'Taller Norte',email:'bruno@taller.mx',status:'prospect',archived_at:null},
  {organization_id:org,id:'c3333333-3333-4333-8333-333333333333',name:'Carla Soto',company:'Café Central',email:'',status:'active',archived_at:null});
};
const segmentInput=(over={})=>({name:'Clientes activos',description:'',status:'active',companyContains:'',...over});
const campaignInput=(over={})=>({name:'Oferta de apertura',subject:'10% en tu primera compra',content:'Hola, tenemos una oferta para ti.',...over});

test('segmentos: crear, contar destinatarios por regla real y actualizar',async()=>{
 const {fake,deps}=setup();
 seedClients(fake,fake.orgA);
 const all=(await createSegment(token,slug,{name:'Todos'},deps)).segment;
 const actives=(await createSegment(token,slug,segmentInput(),deps)).segment;
 const cafe=(await createSegment(token,slug,segmentInput({name:'Café Central',status:'',companyContains:'café'}),deps)).segment;
 const list=(await listSegments(token,slug,deps)).segments;
 assert.equal(list.find(s=>s.id===all.id).recipients,3,'Todos: Ana, Bruno y Carla (el conteo del segmento es de clientes; el correo se filtra al enviar)');
 assert.equal(list.find(s=>s.id===actives.id).recipients,2,'Activos: Ana y Carla');
 assert.equal(list.find(s=>s.id===cafe.id).recipients,2,'Café Central: Ana y Carla');
 const updated=await updateSegment(token,slug,actives.id,{status:'prospect'},deps);
 assert.equal(updated.segment.status,'prospect');
 assert.equal((await listSegments(token,slug,deps)).segments.find(s=>s.id===actives.id).recipients,1);
 await assert.rejects(()=>createSegment(token,slug,{name:'X',status:'vip'},deps),/Invalid segment/);
 await assert.rejects(()=>listSegments('bad-token',slug,deps),/Unauthorized/);
});

test('segmentos: borrar libera las campañas que lo usaban (segmento en null)',async()=>{
 const {fake,deps}=setup();
 seedClients(fake,fake.orgA);
 const seg=(await createSegment(token,slug,segmentInput(),deps)).segment;
 const camp=(await createCampaign(token,slug,campaignInput({segmentId:seg.id}),deps)).campaign;
 await deleteSegment(token,slug,seg.id,deps);
 assert.equal((await listSegments(token,slug,deps)).segments.length,0);
 assert.equal((await getCampaign(token,slug,camp.id,deps)).campaign.segmentId,null);
 assert.equal((await getCampaign(token,slug,camp.id,deps)).recipients.length,2);
});

test('campañas: crear con defaults, listar con contadores y cambiar estatus',async()=>{
 const {deps}=setup();
 const created=await createCampaign(token,slug,{name:'Oferta',subject:'Hola'},deps);
 assert.equal(created.campaign.status,'borrador');
 assert.equal(created.campaign.segmentId,null);
 const full=await createCampaign(token,slug,campaignInput({status:'programada'}),deps);
 assert.equal((await listCampaigns(token,slug,{},deps)).campaigns.length,2);
 assert.equal((await listCampaigns(token,slug,{status:'programada'},deps)).campaigns.length,1);
 assert.equal((await listCampaigns(token,slug,{status:'programada'},deps)).campaigns[0].sends,0);
 const updated=await updateCampaign(token,slug,full.campaign.id,{subject:'Nuevo asunto'},deps);
 assert.equal(updated.campaign.subject,'Nuevo asunto');
 assert.equal(updated.campaign.status,'programada');
 const back=await setCampaignStatus(token,slug,full.campaign.id,{status:'borrador'},deps);
 assert.equal(back.status,'borrador');
 await assert.rejects(()=>setCampaignStatus(token,slug,full.campaign.id,{status:'enviada'},deps),/Invalid campaign/);
 await assert.rejects(()=>createCampaign(token,slug,campaignInput({segmentId:'00000000-0000-4000-8000-000000000000'}),deps),/Not found/);
 await assert.rejects(()=>updateCampaign(token,slug,'00000000-0000-4000-8000-000000000000',{subject:'Nada'},deps),/Not found/);
});

test('destinatarios: vista previa por segmento y por campaña sin segmento',async()=>{
 const {fake,deps}=setup();
 seedClients(fake,fake.orgA);
 const seg=(await createSegment(token,slug,segmentInput({name:'Café',status:'',companyContains:'café'}),deps)).segment;
 const camp=(await createCampaign(token,slug,campaignInput({segmentId:seg.id}),deps)).campaign;
 const bySegment=await previewRecipients(token,slug,{segmentId:seg.id},deps);
 assert.equal(bySegment.count,1,'solo Ana tiene correo y es de Café Central (Carla no tiene correo)');
 assert.equal(bySegment.recipients[0].email,'ana@cafe.mx');
 const byCampaign=await previewRecipients(token,slug,{campaignId:camp.id},deps);
 assert.equal(byCampaign.count,1);
 const noSegment=await createCampaign(token,slug,campaignInput({name:'A todos'}),deps);
 assert.equal((await previewRecipients(token,slug,{campaignId:noSegment.campaign.id},deps)).count,2);
});

test('envío SIN clave Resend: no se envía nada real, no se marca enviada, queda sin_envio',async()=>{
 const calls=[];
 const {fake,deps}=setup({emailConfigured:false,sendEmail:async()=>{calls.push(1);return {sent:true};}});
 seedClients(fake,fake.orgA);
 const camp=(await createCampaign(token,slug,campaignInput({status:'programada'}),deps)).campaign;
 const result=await sendCampaign(token,slug,camp.id,deps);
 assert.equal(result.sent,false);
 assert.equal(result.reason,'email-not-configured');
 assert.equal(result.recipients,2);
 assert.match(result.message,/Sin envío real \(falta clave Resend\)/);
 assert.equal(calls.length,0,'sin clave no se llama al envío ni una vez');
 assert.equal((await getCampaign(token,slug,camp.id,deps)).campaign.status,'programada','la campaña NO se marca como enviada');
 const sends=(await listSends(token,slug,camp.id,deps)).sends;
 assert.equal(sends.length,2);
 assert.ok(sends.every(s=>s.status==='sin_envio'));
 assert.ok(sends.every(s=>/Sin envío real/.test(s.error)));
 assert.equal((await dashboard(token,slug,deps)).kpis.unsentSends,2);
});

test('envío CON clave Resend: se envía a cada destinatario y la campaña queda enviada',async()=>{
 const calls=[];
 const {fake,deps}=setup({emailConfigured:true,sendEmail:async({to,subject})=>{calls.push({to,subject});return {sent:true};}});
 seedClients(fake,fake.orgA);
 const camp=(await createCampaign(token,slug,campaignInput(),deps)).campaign;
 const result=await sendCampaign(token,slug,camp.id,deps);
 assert.equal(result.sent,true);
 assert.equal(result.sentCount,2);
 assert.equal(result.failedCount,0);
 assert.deepEqual(calls.map(c=>c.to).sort(),['ana@cafe.mx','bruno@taller.mx']);
 assert.equal(calls[0].subject,'10% en tu primera compra');
 assert.equal((await getCampaign(token,slug,camp.id,deps)).campaign.status,'enviada');
 assert.ok((await getCampaign(token,slug,camp.id,deps)).campaign.sentAt);
 assert.equal((await listSends(token,slug,camp.id,deps)).sends.filter(s=>s.status==='enviado').length,2);
 await assert.rejects(()=>sendCampaign(token,slug,camp.id,deps),/Invalid campaign/,'una campaña enviada no se vuelve a enviar');
});

test('envío CON clave pero con fallos: fallidos quedan registrados y sin enviados no se marca enviada',async()=>{
 const {fake,deps}=setup({emailConfigured:true,sendEmail:async()=>({sent:false,reason:'email-send-failed'})});
 seedClients(fake,fake.orgA);
 const camp=(await createCampaign(token,slug,campaignInput(),deps)).campaign;
 const result=await sendCampaign(token,slug,camp.id,deps);
 assert.equal(result.sent,false);
 assert.equal(result.reason,'email-send-failed');
 assert.equal(result.failedCount,2);
 assert.equal((await getCampaign(token,slug,camp.id,deps)).campaign.status,'borrador');
 assert.equal((await listSends(token,slug,camp.id,deps)).sends.filter(s=>s.status==='fallido').length,2);
});

test('envío sin destinatarios: no se envía y no se marca nada',async()=>{
 const {deps}=setup({emailConfigured:true});
 const camp=(await createCampaign(token,slug,campaignInput(),deps)).campaign;
 await assert.rejects(()=>sendCampaign(token,slug,camp.id,deps),/Invalid campaign/);
 assert.equal((await listSends(token,slug,camp.id,deps)).sends.length,0);
});

test('aislamiento entre tenants: un tenant no ve campañas ni segmentos del otro',async()=>{
 const {fake,deps}=setup();
 seedClients(fake,fake.orgA);
 seedClients(fake,fake.orgB);
 await createSegment(token,slug,segmentInput(),deps);
 await createCampaign(token,slug,campaignInput(),deps);
 assert.equal((await listSegments(token,slug,deps)).segments.length,1);
 assert.equal((await listSegments(token,otherSlug,deps)).segments.length,0);
 assert.equal((await listCampaigns(token,slug,{},deps)).campaigns.length,1);
 assert.equal((await listCampaigns(token,otherSlug,{},deps)).campaigns.length,0);
 const otherCamp=(await createCampaign(token,otherSlug,campaignInput(),deps)).campaign;
 await assert.rejects(()=>getCampaign(token,slug,otherCamp.id,deps),/Not found/);
 await assert.rejects(()=>listCampaigns(token,'sin-tenant',{},deps),/Not found/);
});

test('tablero: contadores por estatus y envíos',async()=>{
 const {fake,deps}=setup({emailConfigured:false});
 seedClients(fake,fake.orgA);
 await createCampaign(token,slug,campaignInput(),deps);
 const sent=(await createCampaign(token,slug,campaignInput({name:'Segunda',status:'programada'}),deps)).campaign;
 await sendCampaign(token,slug,sent.id,deps);
 const k=(await dashboard(token,slug,deps)).kpis;
 assert.equal(k.draftCampaigns,1);
 assert.equal(k.scheduledCampaigns,1);
 assert.equal(k.sentCampaigns,0,'sin clave Resend ninguna campaña queda enviada');
 assert.equal(k.totalSends,2);
 assert.equal(k.unsentSends,2);
 assert.equal(k.deliveredSends,0);
});
