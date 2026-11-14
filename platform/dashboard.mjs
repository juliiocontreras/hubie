// C008 Dashboard real: deja de ser solo conteos por tool. Filtros (rango de
// fechas, módulo), métricas reales de operación, metas (objetivo mensual de
// cobros configurable por tenant, con progreso) y series temporales de las
// últimas 12 semanas (cotizaciones creadas y cobros), con gráfica SVG simple
// sin librerías externas (platform/tools-p1a-domain.mjs).
import {randomUUID} from 'node:crypto';
import {executeSql as realExecuteSql} from '../database.mjs';
import {authorizeTool as realAuthorize} from './records.mjs';
import {normalizeDashboardGoal,normalizeDashboardQuery,weeklySeries,goalProgress,dashboardSvg} from './tools-p1a-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const num=r=>Number(r?.[0]||0);
const depsOf=d=>({executeSql:d?.executeSql||realExecuteSql,authorize:d?.authorize||realAuthorize});
const monthOf=(d=new Date())=>d.toISOString().slice(0,7);
const todayStr=(d=new Date())=>d.toISOString().slice(0,10);
const lastWeeksStart=(weeks=12,now=new Date())=>{
 const d=new Date(now.toISOString().slice(0,10)+'T00:00:00Z');
 const dow=(d.getUTCDay()+6)%7;
 return new Date(d.getTime()-(dow+(weeks-1)*7)*86400000).toISOString().slice(0,10);
};

// Métricas que solo existen si su tool está habilitada: el dashboard nunca
// muestra datos de un módulo desactivado (mismo criterio que C008 parcial).
const MODULE_TOOLS=Object.freeze({clients:'C001',quotes:'T013',payments:'T014',
 expenses:'C007',agenda:'C004',inventory:'C005'});

export async function getDashboard(token,slug,query={},deps,now=new Date()){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant}=await authorize(token,slug,'C008');
 const q=normalizeDashboardQuery(query);
 const getTenantTools=deps?.getTenantTools||
  (await import('../tenant.mjs')).getTenantTools;
 const enabled=new Set(await getTenantTools(tenant.id));
 const has=key=>enabled.has(MODULE_TOOLS[key]);
 const month=q.from?q.from.slice(0,7):monthOf(now);
 const from=q.from||month+'-01',to=q.to||month+'-31';
 const today=todayStr(now);
 const wantModule=mod=>!q.module||q.module===mod;
 const metrics={};
 const jobs=[];
 if(has('clients')&&wantModule('C001')){
  jobs.push(executeSql("SELECT COUNT(*) FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL AND status='active'",
   [tenant.id]).then(r=>{metrics.activeClients=num(rows(r)[0]);}));
 }
 if(has('quotes')&&wantModule('T013')){
  jobs.push(executeSql("SELECT COUNT(*),COALESCE(SUM(total_cents),0) FROM tenant_quotes WHERE organization_id=? AND archived_at IS NULL AND status IN ('draft','sent') AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?",
   [tenant.id,from,to]).then(r=>{const row=rows(r)[0]||[];metrics.openQuotes=num([row[0]]);metrics.openQuotesCents=num([row[1]]);}));
 }
 if(has('payments')&&wantModule('T014')){
  jobs.push(executeSql('SELECT COUNT(*),COALESCE(SUM(amount_cents),0) FROM tenant_collections WHERE organization_id=? AND archived_at IS NULL AND paid_on>=? AND paid_on<=?',
   [tenant.id,from,to]).then(r=>{const row=rows(r)[0]||[];metrics.paymentsCount=num([row[0]]);metrics.paymentsCents=num([row[1]]);}));
 }
 if(has('expenses')&&wantModule('C007')){
  jobs.push(executeSql('SELECT COUNT(*),COALESCE(SUM(amount_cents),0) FROM tenant_expenses WHERE organization_id=? AND archived_at IS NULL AND occurred_on>=? AND occurred_on<=?',
   [tenant.id,from,to]).then(r=>{const row=rows(r)[0]||[];metrics.expensesCount=num([row[0]]);metrics.expensesCents=num([row[1]]);}));
 }
 if(has('agenda')&&wantModule('C004')){
  jobs.push(executeSql("SELECT COUNT(*) FROM tenant_schedule_events WHERE organization_id=? AND status IN ('scheduled','confirmed') AND substr(starts_at,1,10)=?",
   [tenant.id,today]).then(r=>{metrics.appointmentsToday=num(rows(r)[0]);}));
 }
 if(has('inventory')&&wantModule('C005')){
  jobs.push(Promise.all([
   executeSql('SELECT COUNT(*) FROM tenant_inventory_items WHERE organization_id=? AND archived_at IS NULL AND quantity<=low_stock',[tenant.id]),
   executeSql('SELECT COUNT(*) FROM tenant_inventory_variants WHERE organization_id=? AND archived_at IS NULL AND quantity<=low_stock',[tenant.id])
  ]).then(([a,b])=>{metrics.lowStockItems=num(rows(a)[0])+num(rows(b)[0]);}));
 }
 // Serie de 12 semanas: siempre completa, con independencia del filtro de
 // fechas (el filtro acota las métricas del periodo, no la serie).
 const seriesJobs=[];
 if(has('quotes')){
  seriesJobs.push(executeSql('SELECT substr(created_at,1,10) FROM tenant_quotes WHERE organization_id=? AND archived_at IS NULL AND substr(created_at,1,10)>=?',
   [tenant.id,lastWeeksStart(12,now)]).then(r=>rows(r).map(x=>({createdAt:x[0]}))));
 }else seriesJobs.push(Promise.resolve([]));
 if(has('payments')){
  seriesJobs.push(executeSql('SELECT paid_on,amount_cents FROM tenant_collections WHERE organization_id=? AND archived_at IS NULL AND paid_on>=?',
   [tenant.id,lastWeeksStart(12,now)]).then(r=>rows(r).map(x=>({paidOn:x[0],amountCents:Number(x[1])}))));
 }else seriesJobs.push(Promise.resolve([]));
 const [goalRow,seriesQuotes,seriesPayments]=await Promise.all([
  executeSql('SELECT target_cents FROM tenant_dashboard_goals WHERE organization_id=? AND month=?',[tenant.id,month]),
  ...seriesJobs
 ]);
 await Promise.all(jobs);
 const goalTarget=goalRow&&rows(goalRow)[0]?Number(rows(goalRow)[0][0]):null;
 const series=weeklySeries(seriesQuotes,seriesPayments,12,now);
 return {dashboard:true,from,to,month,module:q.module||null,
  metrics,goal:goalTarget===null?null:{month,...goalProgress(goalTarget,metrics.paymentsCents||0)},
  series,chartSvg:dashboardSvg(series)};
}
export async function setDashboardGoal(token,slug,input,deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant,session}=await authorize(token,slug,'C008',true);
 const data=normalizeDashboardGoal(input);
 const id=randomUUID();
 await executeSql('INSERT INTO tenant_dashboard_goals(organization_id,id,month,target_cents,created_by) VALUES(?,?,?,?,?) '+
  'ON CONFLICT(organization_id,month) DO UPDATE SET target_cents=excluded.target_cents,updated_at=CURRENT_TIMESTAMP',
  [tenant.id,id,data.month,data.targetCents,session.userId]);
 return {goal:{month:data.month,targetCents:data.targetCents}};
}
export async function listDashboardGoals(token,slug,deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant}=await authorize(token,slug,'C008');
 const result=await executeSql('SELECT month,target_cents,updated_at FROM tenant_dashboard_goals WHERE organization_id=? ORDER BY month DESC LIMIT 24',[tenant.id]);
 return {goals:rows(result).map(r=>({month:r[0],targetCents:Number(r[1]),updatedAt:r[2]}))};
}
