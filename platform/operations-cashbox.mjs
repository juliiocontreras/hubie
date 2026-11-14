import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeCashboxOpen,normalizeCashboxMovement,normalizeCashboxCount,cashboxBalance,cashboxDifference} from './tools-p1b-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const audit=(org,user,action,id,type='cashbox')=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,type,id]});
const toBox=r=>({id:r[0],responsible:r[1],shift:r[2],openingCents:Number(r[3]),status:r[4],notes:r[5],
 openedAt:r[6],closedAt:r[7]||null,countedCents:r[8]===null?null:Number(r[8]),differenceCents:r[9]===null?null:Number(r[9])});
const toMovement=r=>({id:r[0],direction:r[1],kind:r[2],amountCents:Number(r[3]),sourceType:r[4]||null,sourceId:r[5]||null,notes:r[6],createdAt:r[7]});
const toCount=r=>({id:r[0],countedCents:Number(r[1]),expectedCents:Number(r[2]),differenceCents:Number(r[3]),notes:r[4],createdAt:r[5]});

async function loadBox(org,id){
 const found=rows(await executeSql('SELECT id,responsible,shift,opening_cents,status,notes,opened_at,closed_at,counted_cents,difference_cents FROM tenant_cashboxes WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!found)throw Error('Not found');
 return toBox(found);
}
async function loadMovements(org,boxId){
 const result=await executeSql('SELECT id,direction,kind,amount_cents,source_type,source_id,notes,created_at FROM tenant_cashbox_movements WHERE organization_id=? AND cashbox_id=? ORDER BY created_at',[org,boxId]);
 return rows(result).map(toMovement);
}
async function loadCounts(org,boxId){
 const result=await executeSql('SELECT id,counted_cents,expected_cents,difference_cents,notes,created_at FROM tenant_cashbox_counts WHERE organization_id=? AND cashbox_id=? ORDER BY created_at DESC LIMIT 50',[org,boxId]);
 return rows(result).map(toCount);
}
async function systemBalance(org,box){
 const movements=await loadMovements(org,box.id);
 return {...cashboxBalance(box.openingCents,movements),movements};
}

export async function listCashboxes(token,slug){
 const {tenant}=await authorizeTool(token,slug,'T016');
 const result=await executeSql('SELECT id,responsible,shift,opening_cents,status,notes,opened_at,closed_at,counted_cents,difference_cents FROM tenant_cashboxes WHERE organization_id=? ORDER BY opened_at DESC LIMIT 50',[tenant.id]);
 const boxes=rows(result).map(toBox);
 const detailed=[];
 for(const box of boxes){
  const balance=await systemBalance(tenant.id,box);
  detailed.push({...box,...balance,counts:await loadCounts(tenant.id,box.id)});
 }
 return {cashboxes:detailed,open:detailed.find(b=>b.status==='open')||null};
}
export async function openCashbox(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T016',true);
 const data=normalizeCashboxOpen(input),id=randomUUID();
 const open=rows(await executeSql("SELECT id FROM tenant_cashboxes WHERE organization_id=? AND status='open' LIMIT 1",[tenant.id]));
 if(open.length)throw Error('Cashbox already open');
 await executeBatch([
  {sql:'INSERT INTO tenant_cashboxes(organization_id,id,responsible,shift,opening_cents,status,notes,opened_by) VALUES(?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,data.responsible,data.shift,data.openingCents,'open',data.notes,session.userId]},
  audit(tenant.id,session.userId,'cashbox.opened',id)
 ]);
 return {cashbox:{id,...data,status:'open',inCents:0,outCents:0,expectedCents:data.openingCents,movements:[],counts:[]}};
}
export async function addCashboxMovement(token,slug,boxId,input){
 const {tenant,session}=await authorizeTool(token,slug,'T016',true);
 const data=normalizeCashboxMovement(input);
 const box=await loadBox(tenant.id,boxId);
 if(box.status!=='open')throw Error('Cashbox is closed');
 if(data.sourceType==='collection'&&data.sourceId){
  const found=rows(await executeSql('SELECT id FROM tenant_collections WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,data.sourceId]));
  if(!found.length)throw Error('Collection not found');
 }
 if(data.sourceType==='expense'&&data.sourceId){
  const found=rows(await executeSql('SELECT id FROM tenant_expenses WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,data.sourceId]));
  if(!found.length)throw Error('Expense not found');
 }
 const id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO tenant_cashbox_movements(organization_id,cashbox_id,id,direction,kind,amount_cents,source_type,source_id,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,boxId,id,data.direction,data.kind,data.amountCents,data.sourceType,data.sourceId,data.notes,session.userId]},
  audit(tenant.id,session.userId,'cashbox.movement',id,'cashbox_movement')
 ]);
 return {movement:{id,cashboxId:boxId,...data}};
}
// Arqueo sin cerrar: conteo físico contra el saldo del sistema, diferencia registrada.
export async function recordCashboxCount(token,slug,boxId,input){
 const {tenant,session}=await authorizeTool(token,slug,'T016',true);
 const data=normalizeCashboxCount(input);
 const box=await loadBox(tenant.id,boxId);
 if(box.status!=='open')throw Error('Cashbox is closed');
 const balance=await systemBalance(tenant.id,box);
 const difference=cashboxDifference(balance.expectedCents,data.countedCents);
 const id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO tenant_cashbox_counts(organization_id,cashbox_id,id,counted_cents,expected_cents,difference_cents,notes,created_by) VALUES(?,?,?,?,?,?,?,?)',
   args:[tenant.id,boxId,id,data.countedCents,balance.expectedCents,difference,data.notes,session.userId]},
  audit(tenant.id,session.userId,'cashbox.counted',id,'cashbox_count')
 ]);
 return {count:{id,countedCents:data.countedCents,expectedCents:balance.expectedCents,differenceCents:difference}};
}
export async function closeCashbox(token,slug,boxId,input){
 const {tenant,session}=await authorizeTool(token,slug,'T016',true);
 const data=normalizeCashboxCount(input);
 const box=await loadBox(tenant.id,boxId);
 if(box.status!=='open')throw Error('Cashbox is closed');
 const balance=await systemBalance(tenant.id,box);
 const difference=cashboxDifference(balance.expectedCents,data.countedCents);
 const countId=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO tenant_cashbox_counts(organization_id,cashbox_id,id,counted_cents,expected_cents,difference_cents,notes,created_by) VALUES(?,?,?,?,?,?,?,?)',
   args:[tenant.id,boxId,countId,data.countedCents,balance.expectedCents,difference,data.notes,session.userId]},
  {sql:'UPDATE tenant_cashboxes SET status=?,closed_at=CURRENT_TIMESTAMP,closed_by=?,counted_cents=?,difference_cents=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND status=?',
   args:['closed',session.userId,data.countedCents,difference,tenant.id,boxId,'open']},
  audit(tenant.id,session.userId,'cashbox.closed',boxId)
 ]);
 return {cashbox:{...box,status:'closed',countedCents:data.countedCents,differenceCents:difference,expectedCents:balance.expectedCents}};
}
