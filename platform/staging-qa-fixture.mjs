import {createHash} from 'node:crypto';
import {defaultToolIds} from './catalog.mjs';

// One authorized, explicitly enabled staging-only QA organization.
// This never runs in the public landing or the production Hubie service.
export const QA_COMPANY=Object.freeze({
 name:'Hubie QA · Empresa de Prueba',
 displayName:'Hubie QA · Empresa de Prueba',
 slug:'hubie-qa-piloto',
 suiteId:'S006',
 primaryColor:'#4768ee',
 secondaryColor:'#8760f4',
 toolIds:[...defaultToolIds(),'T004','T013']
});
const stable=(org,label)=>{
 const hex=createHash('sha256').update('hubie-qa-piloto:v1:'+org+':'+label).digest('hex').slice(0,32);
 return [hex.slice(0,8),hex.slice(8,12),'4'+hex.slice(13,16),'8'+hex.slice(17,20),hex.slice(20)].join('-');
};
export function fixtureIds(org){
 return Object.fromEntries(['client','deal','case','appointment','item','movement',
  'task','quote','document','media','caseCreated','documentAdded','taskLink','quoteLink'].map(label=>[label,stable(org,label)]));
}
const fakeNote='DOCUMENTO FICTICIO - HUBIE QA. Solo demuestra almacenamiento, consulta y control de versiones. No contiene información personal.\n';
export function makeQaSeedPlan(org,owner){
 const id=fixtureIds(org),file=Buffer.from(fakeNote,'utf8');
 const q=(table,fields,values)=>({sql:`INSERT OR IGNORE INTO ${table}(${fields.join(',')}) VALUES(${fields.map(()=>'?').join(',')})`,args:values});
 return [
  q('tenant_client_profiles',['organization_id','id','name','company','email','phone','status','notes','created_by'],
   [org,id.client,'Cliente Demo Norte','Empresa ficticia','', '', 'active','DATOS FICTICIOS para pruebas de Hubie',owner]),
  q('tenant_crm_deals',['organization_id','id','title','customer','amount_cents','stage','notes','created_by'],
   [org,id.deal,'[DEMO] Proyecto de servicios','Cliente Demo Norte',4500000,'proposal','Oportunidad ficticia · no facturar',owner]),
  q('tenant_deal_clients',['organization_id','deal_id','client_id'],[org,id.deal,id.client]),
  q('tenant_client_cases',['organization_id','id','client_id','title','kind','status','notes','created_by'],
   [org,id.case,id.client,'[DEMO] Expediente comercial','commercial','in_progress','Carpeta ficticia para probar adjuntos e historial',owner]),
  q('tenant_case_events',['organization_id','id','case_id','action','description','actor_user_id'],
   [org,id.caseCreated,id.case,'created','Expediente piloto creado',owner]),
  q('tenant_schedule_events',['organization_id','id','title','customer','resource','starts_at','ends_at','status','notes','created_by'],
   [org,id.appointment,'[DEMO] Revisión comercial','Cliente Demo Norte','sala-demo','2026-11-10T16:00:00.000Z','2026-11-10T17:00:00.000Z','scheduled','Reunión ficticia, sin asistentes reales',owner]),
  q('tenant_appointment_links',['organization_id','appointment_id','client_id','deal_id'],
   [org,id.appointment,id.client,id.deal]),
  q('tenant_inventory_items',['organization_id','id','sku','title','location','quantity','low_stock'],
   [org,id.item,'QA-DEMO-001','[DEMO] Etiquetas de prueba','Almacén de prueba',8,2]),
  q('tenant_inventory_movements',['organization_id','id','item_id','delta','note','created_by'],
   [org,id.movement,id.item,8,'Existencia inicial ficticia',owner]),
  q('tenant_tool_records',['organization_id','id','tool_id','title','status','fields_json','created_by'],
   [org,id.task,'T004','[DEMO] Revisar oportunidad del piloto','active',
    JSON.stringify({responsable:'Equipo QA',prioridad:'media',es_demostracion:true}),owner]),
  q('tenant_tool_records',['organization_id','id','tool_id','title','status','fields_json','created_by'],
   [org,id.quote,'T013','[DEMO] Cotización sin valor comercial','draft',
    JSON.stringify({concepto:'Servicio de demostración',total_estimado:45000,moneda:'MXN',es_demostracion:true}),owner]),
  q('tenant_entity_links',['organization_id','id','left_tool_id','left_record_id','right_tool_id','right_record_id','relation_type','created_by'],
   [org,id.taskLink,'C001',id.client,'T004',id.task,'related',owner]),
  q('tenant_entity_links',['organization_id','id','left_tool_id','left_record_id','right_tool_id','right_record_id','relation_type','created_by'],
   [org,id.quoteLink,'C002',id.deal,'T013',id.quote,'related',owner]),
  q('pwa_media',['organization_id','id','scope','kind','tool_id','record_id','name','mime','size_bytes','content_b64','created_by'],
   [org,id.media,'tenant','attachment','C003',id.case,'LEEME-expediente-demo.txt','text/plain',file.byteLength,file.toString('base64'),owner]),
  q('tenant_case_documents',['organization_id','id','case_id','document_type','latest_version','created_by'],
   [org,id.document,id.case,'other',1,owner]),
  q('tenant_case_document_versions',['organization_id','document_id','media_id','version'],
   [org,id.document,id.media,1]),
  q('tenant_case_events',['organization_id','id','case_id','action','description','actor_user_id'],
   [org,id.documentAdded,id.case,'document_added','Documento ficticio añadido',owner])
 ];
}
export const QA_VERIFY_SQL=`SELECT
 (SELECT COUNT(*) FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL),
 (SELECT COUNT(*) FROM tenant_crm_deals WHERE organization_id=? AND archived_at IS NULL),
 (SELECT COUNT(*) FROM tenant_deal_clients WHERE organization_id=?),
 (SELECT COUNT(*) FROM tenant_client_cases WHERE organization_id=? AND archived_at IS NULL),
 (SELECT COUNT(*) FROM tenant_schedule_events WHERE organization_id=?),
 (SELECT COUNT(*) FROM tenant_appointment_links WHERE organization_id=?),
 (SELECT COUNT(*) FROM tenant_inventory_items WHERE organization_id=? AND archived_at IS NULL),
 (SELECT COUNT(*) FROM tenant_case_document_versions WHERE organization_id=?),
 (SELECT COUNT(*) FROM tenant_entity_links WHERE organization_id=?),
 (SELECT COUNT(*) FROM tenant_tool_records WHERE organization_id=? AND archived_at IS NULL)`;
export function checkQaCounts(counts){
 return Array.isArray(counts)&&counts.length===10&&
 counts.slice(0,8).every(n=>Number(n)>=1)&&Number(counts[8])>=2&&Number(counts[9])>=2;
}
