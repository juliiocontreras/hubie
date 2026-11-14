// T002 Programa de lealtad. Libro de puntos transaccional: se gana al pagar
// (cobro confirmado en tenant_collections) o al aceptarse una cotización que
// se cobra, y se canjea con reglas configurables por tenant (puntos por peso,
// valor del punto, mínimo de canje). Nada de campos manuales sueltos: cada
// movimiento queda en loyalty_ledger con su origen y su saldo resultante.
import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeLoyaltyConfig,defaultLoyaltyConfig,earnPointsForPayment,redeemValueCents,normalizeLoyaltyRedeem,loyaltyBalance} from './tools-p2-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const audit=(org,user,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,'loyalty_ledger',id]});

async function getConfig(org){
 const row=rows(await executeSql('SELECT points_per_peso,point_value_cents,min_redeem_points,active FROM loyalty_config WHERE organization_id=?',[org]))[0];
 if(!row)return {...defaultLoyaltyConfig};
 return {pointsPerPeso:Number(row[0]),pointValueCents:Number(row[1]),minRedeemPoints:Number(row[2]),active:row[3]===1||row[3]==='1'};
}
async function balanceFor(org,clientId){
 const result=await executeSql('SELECT delta_points FROM loyalty_ledger WHERE organization_id=? AND client_id=?',[org,clientId]);
 return loyaltyBalance(rows(result).map(r=>({deltaPoints:Number(r[0])})));
}
async function ensureClient(org,clientId){
 const found=rows(await executeSql('SELECT id,name FROM tenant_client_profiles WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,clientId]));
 if(!found.length)throw Error('Client not found');
 return {id:found[0][0],name:found[0][1]};
}
function requireAdmin(session){
 if(!['owner','admin'].includes(session.role))throw Error('Forbidden');
}

export async function getLoyalty(token,slug){
 const {tenant}=await authorizeTool(token,slug,'T002');
 const [clients,ledger]=await Promise.all([
  executeSql('SELECT id,name,company FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL ORDER BY name LIMIT 250',[tenant.id]),
  executeSql('SELECT id,client_id,delta_points,kind,source_type,source_id,balance_after,note,created_at FROM loyalty_ledger WHERE organization_id=? ORDER BY created_at DESC,id DESC LIMIT 250',[tenant.id])
 ]);
 const balances={};
 for(const row of rows(ledger))balances[row[1]]=(balances[row[1]]||0)+Number(row[2]);
 return {config:await getConfig(tenant.id),
  clients:rows(clients).map(c=>({id:c[0],name:c[1],company:c[2],points:balances[c[0]]||0})),
  movements:rows(ledger).map(m=>({id:m[0],clientId:m[1],deltaPoints:Number(m[2]),kind:m[3],sourceType:m[4],sourceId:m[5],balanceAfter:Number(m[6]),note:m[7],createdAt:m[8]}))};
}
export async function setLoyaltyConfig(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T002',true);
 requireAdmin(session);
 const cfg=normalizeLoyaltyConfig(input);
 await executeSql('INSERT INTO loyalty_config(organization_id,points_per_peso,point_value_cents,min_redeem_points,active) VALUES(?,?,?,?,?) ON CONFLICT(organization_id) DO UPDATE SET points_per_peso=excluded.points_per_peso,point_value_cents=excluded.point_value_cents,min_redeem_points=excluded.min_redeem_points,active=excluded.active,updated_at=CURRENT_TIMESTAMP',
  [tenant.id,cfg.pointsPerPeso,cfg.pointValueCents,cfg.minRedeemPoints,cfg.active?1:0]);
 const a=audit(tenant.id,session.userId,'loyalty.config_updated',tenant.id);
 await executeSql(a.sql,a.args);
 return {config:cfg};
}
// Gana puntos por un cobro confirmado. Idempotente por (payment, earn): si el
// cobro ya generó puntos, no se duplica. Sin cobro confirmado no hay puntos.
export async function awardLoyaltyForPayment(token,slug,paymentId){
 const {tenant,session}=await authorizeTool(token,slug,'T002',true);
 const payment=rows(await executeSql('SELECT id,client_id,amount_cents,created_by FROM tenant_collections WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,paymentId]))[0];
 if(!payment)throw Error('Not found');
 if(!payment[1])throw Error('Client not found');
 const cfg=await getConfig(tenant.id);
 const points=earnPointsForPayment(Number(payment[2]),cfg);
 if(points<=0)return {awarded:0,reason:'no_points_for_amount'};
 const existing=rows(await executeSql("SELECT id FROM loyalty_ledger WHERE organization_id=? AND source_type='payment' AND source_id=? AND kind='earn' LIMIT 1",[tenant.id,paymentId]));
 if(existing.length)throw Error('Duplicate loyalty earn');
 await ensureClient(tenant.id,payment[1]);
 const balance=await balanceFor(tenant.id,payment[1]);
 const id=randomUUID();
 await executeBatch([
  {sql:"INSERT INTO loyalty_ledger(organization_id,id,client_id,delta_points,kind,source_type,source_id,balance_after,note,created_by) VALUES(?,?,?,?,?,'earn','payment',?,?,?,?)",
   args:[tenant.id,id,payment[1],points,balance+points,'Puntos por cobro confirmado',session.userId]},
  audit(tenant.id,session.userId,'loyalty.earned',id)
 ]);
 return {awarded:points,balance:balance+points,clientId:payment[1]};
}
export async function redeemLoyalty(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T002',true);
 const cfg=await getConfig(tenant.id);
 const balance=await balanceFor(tenant.id,input?.clientId);
 const data=normalizeLoyaltyRedeem(input,{balancePoints:balance,config:cfg});
 await ensureClient(tenant.id,data.clientId);
 const id=randomUUID();
 await executeBatch([
  {sql:"INSERT INTO loyalty_ledger(organization_id,id,client_id,delta_points,kind,source_type,source_id,balance_after,note,created_by) VALUES(?,?,?,?,?,'redeem','','',?,?,?)",
   args:[tenant.id,id,data.clientId,-data.points,balance-data.points,data.note,session.userId]},
  audit(tenant.id,session.userId,'loyalty.redeemed',id)
 ]);
 return {redeemed:data.points,valueCents:redeemValueCents(data.points,cfg),balance:balance-data.points};
}
export async function adjustLoyalty(token,slug,input){
 // Ajuste manual solo por owner/admin y siempre con motivo: queda en el libro.
 const {tenant,session}=await authorizeTool(token,slug,'T002',true);
 requireAdmin(session);
 const clientId=input?.clientId,delta=input?.deltaPoints;
 const note=typeof input?.note==='string'&&input.note.trim().length>=2&&input.note.trim().length<=300?input.note.trim():null;
 if(!clientId||!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>1_000_000||note===null)throw Error('Invalid loyalty adjust');
 await ensureClient(tenant.id,clientId);
 const balance=await balanceFor(tenant.id,clientId);
 if(balance+delta<0)throw Error('Insufficient loyalty points');
 const id=randomUUID();
 await executeBatch([
  {sql:"INSERT INTO loyalty_ledger(organization_id,id,client_id,delta_points,kind,source_type,source_id,balance_after,note,created_by) VALUES(?,?,?,?,?,'adjust','','',?,?,?)",
   args:[tenant.id,id,clientId,delta,balance+delta,note,session.userId]},
  audit(tenant.id,session.userId,'loyalty.adjusted',id)
 ]);
 return {balance:balance+delta};
}
