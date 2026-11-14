// T019 Comisiones. Reglas por tenant (porcentaje por miembro, por producto
// o general) ligadas a cierres validados: solo los cobros confirmados
// (tenant_collections no archivados) generan comisión. Sin cobro confirmado
// no hay comisión. La regla por producto se aplica al registrar la comisión
// de un cobro concreto con su producto: las líneas de cotización no guardan
// catalog_item_id, así que no se puede emparejar producto automáticamente
// desde la cotización (ver INTEGRATION.md); el cálculo por periodo usa la
// regla del miembro que registró el cobro o, en su defecto, la general.
import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeCommissionRule,resolveCommissionRule,commissionForPayment,summarizeCommissions,commissionPeriod} from './tools-p2-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const audit=(org,user,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,'commission_entry',id]});
const toRule=r=>({id:r[0],scope:r[1],memberUserId:r[2],catalogItemId:r[3],percentBp:Number(r[4]),active:r[5]===1||r[5]==='1',createdAt:r[6]});
const toEntry=r=>({id:r[0],paymentId:r[1],memberUserId:r[2],catalogItemId:r[3],baseCents:Number(r[4]),percentBp:Number(r[5]),amountCents:Number(r[6]),period:r[7],ruleId:r[8],createdAt:r[9]});

async function listRules(org){
 const result=await executeSql('SELECT id,scope,member_user_id,catalog_item_id,percent_bp,active,created_at FROM commission_rules WHERE organization_id=? AND archived_at IS NULL ORDER BY scope,created_at',[org]);
 return rows(result).map(toRule);
}
async function ensureMember(org,userId){
 const found=rows(await executeSql("SELECT user_id FROM memberships WHERE organization_id=? AND user_id=? AND status='active'",[org,userId]));
 if(!found.length)throw Error('Not found');
}
async function ensureCatalogItem(org,itemId){
 const found=rows(await executeSql('SELECT id FROM tenant_catalog_items WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,itemId]));
 if(!found.length)throw Error('Not found');
}

export async function listCommissions(token,slug,{from=null,to=null}={}){
 const {tenant}=await authorizeTool(token,slug,'T019');
 const rules=await listRules(tenant.id);
 let sql='SELECT id,payment_id,member_user_id,catalog_item_id,base_cents,percent_bp,amount_cents,period,rule_id,created_at FROM commission_entries WHERE organization_id=?';
 const args=[tenant.id];
 if(from){sql+=' AND period>=?';args.push(from.slice(0,7));}
 if(to){sql+=' AND period<=?';args.push(to.slice(0,7));}
 sql+=' ORDER BY period DESC,created_at DESC LIMIT 500';
 const [entries,members,items]=await Promise.all([
  executeSql(sql,args),
  executeSql('SELECT u.id,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND m.status=? ORDER BY u.email',[tenant.id,'active']),
  executeSql('SELECT id,sku,name FROM tenant_catalog_items WHERE organization_id=? AND archived_at IS NULL ORDER BY name LIMIT 250',[tenant.id])
 ]);
 const list=rows(entries).map(toEntry);
 return {rules,entries:list,summary:summarizeCommissions(list),
  members:rows(members).map(m=>({id:m[0],email:m[1],role:m[2]})),
  items:rows(items).map(i=>({id:i[0],sku:i[1],name:i[2]}))};
}
export async function createCommissionRule(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T019',true);
 if(!['owner','admin'].includes(session.role))throw Error('Forbidden');
 const data=normalizeCommissionRule(input);
 if(data.scope==='member')await ensureMember(tenant.id,data.memberUserId);
 if(data.scope==='product')await ensureCatalogItem(tenant.id,data.catalogItemId);
 if(data.scope==='default'){
  const existing=rows(await executeSql("SELECT id FROM commission_rules WHERE organization_id=? AND scope='default' AND archived_at IS NULL LIMIT 1",[tenant.id]));
  if(existing.length)throw Error('Duplicate commission rule');
 }
 if(data.scope==='member'){
  const existing=rows(await executeSql("SELECT id FROM commission_rules WHERE organization_id=? AND scope='member' AND member_user_id=? AND archived_at IS NULL LIMIT 1",[tenant.id,data.memberUserId]));
  if(existing.length)throw Error('Duplicate commission rule');
 }
 if(data.scope==='product'){
  const existing=rows(await executeSql("SELECT id FROM commission_rules WHERE organization_id=? AND scope='product' AND catalog_item_id=? AND archived_at IS NULL LIMIT 1",[tenant.id,data.catalogItemId]));
  if(existing.length)throw Error('Duplicate commission rule');
 }
 const id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO commission_rules(organization_id,id,scope,member_user_id,catalog_item_id,percent_bp,active,created_by) VALUES(?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,data.scope,data.memberUserId,data.catalogItemId,data.percentBp,data.active?1:0,session.userId]},
  audit(tenant.id,session.userId,'commissions.rule_created',id)
 ]);
 return {rule:{id,...data}};
}
export async function archiveCommissionRule(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'T019',true);
 if(!['owner','admin'].includes(session.role))throw Error('Forbidden');
 const result=await executeBatch([
  {sql:'UPDATE commission_rules SET archived_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',args:[tenant.id,id]},
  audit(tenant.id,session.userId,'commissions.rule_archived',id)
 ]);
 if(!changed(result?.[0]))throw Error('Not found');
 return {archived:true};
}
// Calcula comisiones del periodo desde cobros confirmados sin comisión aún.
// Idempotente: un cobro no genera dos entradas.
export async function calculateCommissions(token,slug,{from,to}){
 const {tenant,session}=await authorizeTool(token,slug,'T019',true);
 if(!from||!/^\d{4}-\d{2}$/.test(from)||!to||!/^\d{4}-\d{2}$/.test(to)||from>to)throw Error('Invalid commission period');
 const rules=await listRules(tenant.id);
 const payments=await executeSql('SELECT id,client_id,amount_cents,paid_on,created_by FROM tenant_collections WHERE organization_id=? AND archived_at IS NULL AND substr(paid_on,1,7)>=? AND substr(paid_on,1,7)<=? ORDER BY paid_on',[tenant.id,from,to]);
 const existing=rows(await executeSql('SELECT payment_id FROM commission_entries WHERE organization_id=?',[tenant.id])).map(r=>r[0]);
 const existingSet=new Set(existing);
 const created=[];
 for(const p of rows(payments)){
  const paymentId=p[0],amountCents=Number(p[2]),paidOn=p[3],createdBy=p[4];
  if(existingSet.has(paymentId))continue;
  const rule=resolveCommissionRule({rules,paymentCreatedBy:createdBy});
  if(!rule)continue;
  const calc=commissionForPayment(amountCents,rule);
  if(calc.amountCents<=0)continue;
  const id=randomUUID();
  created.push({sql:'INSERT INTO commission_entries(organization_id,id,payment_id,member_user_id,base_cents,percent_bp,amount_cents,period,rule_id,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,paymentId,createdBy,amountCents,calc.percentBp,calc.amountCents,commissionPeriod(paidOn),rule.id,session.userId]});
 }
 if(created.length){
  await executeBatch([...created,audit(tenant.id,session.userId,'commissions.calculated',tenant.id)]);
 }
 return {created:created.length};
}
// Comisión por producto: se registra sobre un cobro confirmado concreto.
export async function recordProductCommission(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T019',true);
 const paymentId=input?.paymentId,catalogItemId=input?.catalogItemId;
 const payment=rows(await executeSql('SELECT id,amount_cents,paid_on FROM tenant_collections WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,paymentId]))[0];
 if(!payment)throw Error('Not found');
 await ensureCatalogItem(tenant.id,catalogItemId);
 const rule=rows(await executeSql("SELECT id,percent_bp FROM commission_rules WHERE organization_id=? AND scope='product' AND catalog_item_id=? AND active=1 AND archived_at IS NULL LIMIT 1",[tenant.id,catalogItemId]))[0];
 if(!rule)throw Error('Not found');
 const existing=rows(await executeSql('SELECT id FROM commission_entries WHERE organization_id=? AND payment_id=? AND catalog_item_id=? LIMIT 1',[tenant.id,paymentId,catalogItemId]));
 if(existing.length)throw Error('Duplicate commission entry');
 const calc=commissionForPayment(Number(payment[1]),{percentBp:Number(rule[1])});
 if(calc.amountCents<=0)throw Error('Invalid commission base');
 const id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO commission_entries(organization_id,id,payment_id,member_user_id,catalog_item_id,base_cents,percent_bp,amount_cents,period,rule_id,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,paymentId,session.userId,catalogItemId,Number(payment[1]),calc.percentBp,calc.amountCents,commissionPeriod(payment[2]),rule[0],session.userId]},
  audit(tenant.id,session.userId,'commissions.recorded',id)
 ]);
 return {entry:{id,paymentId,catalogItemId,baseCents:Number(payment[1]),percentBp:calc.percentBp,amountCents:calc.amountCents,period:commissionPeriod(payment[2])}};
}
