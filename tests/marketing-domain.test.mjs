import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSegment,normalizeCampaign,segmentMatchesClient,campaignRecipients,isSendableStatus} from '../platform/marketing-domain.mjs';

const client=(over={})=>({id:'11111111-1111-4111-8111-111111111111',name:'Ana Ruiz',company:'Café Central',email:'ana@cafe.mx',status:'active',...over});

test('segmentos: defaults, reglas solo con campos reales de clientes (status, company)',async()=>{
 const seg=normalizeSegment({name:'Activos'});
 assert.equal(seg.status,'');
 assert.equal(seg.companyContains,'');
 assert.equal(segmentMatchesClient(seg,client()),true);
 assert.equal(segmentMatchesClient(normalizeSegment({name:'Activos',status:'active'}),client()),true);
 assert.equal(segmentMatchesClient(normalizeSegment({name:'Activos',status:'prospect'}),client()),false);
 assert.equal(segmentMatchesClient(normalizeSegment({name:'Café',companyContains:'café'}),client()),true);
 assert.equal(segmentMatchesClient(normalizeSegment({name:'Café',companyContains:'CAFÉ'}),client()),true);
 assert.equal(segmentMatchesClient(normalizeSegment({name:'Café',companyContains:'taller'}),client()),false);
 await assert.rejects(async()=>normalizeSegment({name:'Segmento',status:'vip'}),/Invalid segment/);
 await assert.rejects(async()=>normalizeSegment({name:'Segmento',ciudad:'Saltillo'}),/Invalid segment/);
 await assert.rejects(async()=>normalizeSegment({name:'A'}),/Invalid/);
});

test('campañas: defaults borrador, segmento opcional, fecha programada validada',async()=>{
 const c=normalizeCampaign({name:'Oferta',subject:'10% hoy',content:'Hola'});
 assert.equal(c.status,'borrador');
 assert.equal(c.segmentId,null);
 assert.equal(c.scheduledAt,null);
 assert.equal(normalizeCampaign({name:'Oferta',subject:'10% hoy',content:'',status:'programada',scheduledAt:'2026-12-01T10:00:00Z'}).status,'programada');
 assert.throws(()=>normalizeCampaign({name:'Oferta',subject:'10% hoy',content:'',status:'enviada',segmentId:'no-uuid'}),/Invalid campaign/);
 assert.throws(()=>normalizeCampaign({name:'Oferta',subject:'10% hoy',content:'',scheduledAt:'ayer'}),/Invalid campaign/);
 assert.throws(()=>normalizeCampaign({name:'Oferta',subject:'X'}),/Invalid/);
 assert.equal(isSendableStatus('borrador'),true);
 assert.equal(isSendableStatus('programada'),true);
 assert.equal(isSendableStatus('enviada'),false);
});

test('destinatarios: solo clientes con correo válido y dentro del segmento',async()=>{
 const clients=[client(),client({id:'22222222-2222-4222-8222-222222222222',email:'sin-correo',status:'prospect'}),
  client({id:'33333333-3333-4333-8333-333333333333',email:'  LUIS@TALLER.MX ',company:'Taller Norte',status:'prospect'})];
 const all=campaignRecipients(null,clients);
 assert.equal(all.length,2);
 assert.equal(all[1].email,'luis@taller.mx');
 const scoped=campaignRecipients({status:'prospect',companyContains:''},clients);
 assert.equal(scoped.length,1);
 assert.equal(scoped[0].email,'luis@taller.mx');
});
