import {executeSql} from '../database.mjs';
const rows=r=>r?.rows?.map(x=>x.map(c=>c?.value??null))??[];
/** Relationships already implied by normalized client/deal/case/appointment foreign keys. */
export async function implicitRelations(org,tool,id){
 let sql='',args=[];
 if(tool==='C001'){
  sql=`SELECT 'C002',dc.deal_id FROM tenant_deal_clients dc
   JOIN tenant_crm_deals d ON d.organization_id=dc.organization_id AND d.id=dc.deal_id
   WHERE dc.organization_id=? AND dc.client_id=? AND d.archived_at IS NULL
   UNION ALL SELECT 'C003',c.id FROM tenant_client_cases c
   WHERE c.organization_id=? AND c.client_id=? AND c.archived_at IS NULL
   UNION ALL SELECT 'C004',a.appointment_id FROM tenant_appointment_links a
   WHERE a.organization_id=? AND a.client_id=? LIMIT 90`;
  args=[org,id,org,id,org,id];
 }else if(tool==='C002'){
  sql=`SELECT 'C001',client_id FROM tenant_deal_clients WHERE organization_id=? AND deal_id=?
   UNION ALL SELECT 'C004',appointment_id FROM tenant_appointment_links WHERE organization_id=? AND deal_id=? LIMIT 60`;
  args=[org,id,org,id];
 }else if(tool==='C003'){
  sql=`SELECT 'C001',client_id FROM tenant_client_cases WHERE organization_id=? AND id=? AND archived_at IS NULL`;
  args=[org,id];
 }else if(tool==='C004'){
  sql=`SELECT 'C001',client_id FROM tenant_appointment_links WHERE organization_id=? AND appointment_id=? AND client_id IS NOT NULL
   UNION ALL SELECT 'C002',deal_id FROM tenant_appointment_links WHERE organization_id=? AND appointment_id=? AND deal_id IS NOT NULL`;
  args=[org,id,org,id];
 }
 if(!sql)return [];
 return rows(await executeSql(sql,args)).map(([targetToolId,targetRecordId])=>({targetToolId,targetRecordId}));
}
