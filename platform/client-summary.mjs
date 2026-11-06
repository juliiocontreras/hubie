import {executeSql} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {getTenantTools} from '../tenant.mjs';
const rows=r=>r?.rows?.map(x=>x.map(c=>c?.value??null))??[];
/** C001 360-degree summary: read only real linked records, never guessed by customer name. */
export async function getClientSummary(token,slug,clientId){
 const {tenant}=await authorizeTool(token,slug,'C001');
 const client=rows(await executeSql('SELECT id,name,company,email,phone,status FROM tenant_client_profiles WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,clientId]))[0];
 if(!client)throw Error('Not found');
 const enabled=new Set(await getTenantTools(tenant.id));
 const data={client:{id:client[0],name:client[1],company:client[2],email:client[3],phone:client[4],status:client[5]},
  deals:[],cases:[],appointments:[]};
 const operations=[];
 if(enabled.has('C002'))operations.push(executeSql(`SELECT d.id,d.title,d.stage,d.amount_cents,d.follow_up_at FROM tenant_crm_deals d
 JOIN tenant_deal_clients l ON l.organization_id=d.organization_id AND l.deal_id=d.id
 WHERE d.organization_id=? AND l.client_id=? AND d.archived_at IS NULL ORDER BY d.updated_at DESC LIMIT 30`,[tenant.id,clientId])
  .then(r=>{data.deals=rows(r).map(x=>({id:x[0],title:x[1],stage:x[2],amountCents:Number(x[3]),followUpAt:x[4]}));}));
 if(enabled.has('C003'))operations.push(executeSql(`SELECT id,title,kind,status,updated_at FROM tenant_client_cases
 WHERE organization_id=? AND client_id=? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 30`,[tenant.id,clientId])
  .then(r=>{data.cases=rows(r).map(x=>({id:x[0],title:x[1],kind:x[2],status:x[3],updatedAt:x[4]}));}));
 if(enabled.has('C004'))operations.push(executeSql(`SELECT e.id,e.title,e.starts_at,e.status FROM tenant_schedule_events e
 JOIN tenant_appointment_links l ON l.organization_id=e.organization_id AND l.appointment_id=e.id
 WHERE e.organization_id=? AND l.client_id=? ORDER BY e.starts_at DESC LIMIT 30`,[tenant.id,clientId])
  .then(r=>{data.appointments=rows(r).map(x=>({id:x[0],title:x[1],startsAt:x[2],status:x[3]}));}));
 await Promise.all(operations);
 data.counts={deals:data.deals.length,cases:data.cases.length,appointments:data.appointments.length};
 return data;
}
