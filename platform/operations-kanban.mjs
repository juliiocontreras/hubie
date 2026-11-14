// T005 Kanban. Tablero real: fases configurables por tablero, tarjetas
// ligadas a registros reales (tratos C002, expedientes C003 o registros
// genéricos) y arrastrar y soltar (HTML5 drag-and-drop en kanban-p2.js) que
// persiste la fase. Solo owner/admin/member escriben; viewer solo mira.
import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeKanbanBoard,normalizeKanbanPhase,normalizeKanbanCard,kanbanMoveAllowed,defaultKanbanPhases} from './tools-p2-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const audit=(org,user,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,'kanban_card',id]});

const sourceTables={C002:'tenant_crm_deals',C003:'tenant_client_cases',generic:'tenant_tool_records'};
async function ensureSourceRecord(org,sourceToolId,sourceRecordId){
 const table=sourceTables[sourceToolId];
 if(!table)throw Error('Invalid kanban card');
 const found=rows(await executeSql(`SELECT id FROM ${table} WHERE organization_id=? AND id=? AND archived_at IS NULL`,[org,sourceRecordId]));
 if(!found.length)throw Error('Not found');
}
async function ensureBoard(org,boardId){
 const found=rows(await executeSql('SELECT id,source_tool_id FROM kanban_boards WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,boardId]));
 if(!found.length)throw Error('Not found');
 return {id:found[0][0],sourceToolId:found[0][1]};
}
async function phasesFor(org,boardId){
 const result=await executeSql('SELECT id,title,position FROM kanban_phases WHERE organization_id=? AND board_id=? ORDER BY position,id',[org,boardId]);
 return rows(result).map(p=>({id:p[0],title:p[1],position:Number(p[2])}));
}

export async function listKanbanBoards(token,slug){
 const {tenant}=await authorizeTool(token,slug,'T005');
 const result=await executeSql('SELECT id,name,source_tool_id,created_at FROM kanban_boards WHERE organization_id=? AND archived_at IS NULL ORDER BY created_at LIMIT 100',[tenant.id]);
 return {boards:rows(result).map(b=>({id:b[0],name:b[1],sourceToolId:b[2],createdAt:b[3]}))};
}
export async function createKanbanBoard(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T005',true);
 const data=normalizeKanbanBoard(input);
 const id=randomUUID();
 const phaseRows=defaultKanbanPhases.map((title,i)=>({sql:'INSERT INTO kanban_phases(organization_id,id,board_id,title,position) VALUES(?,?,?,?,?)',args:[tenant.id,randomUUID(),id,title,i]}));
 await executeBatch([
  {sql:'INSERT INTO kanban_boards(organization_id,id,name,source_tool_id,created_by) VALUES(?,?,?,?,?)',args:[tenant.id,id,data.name,data.sourceToolId,session.userId]},
  ...phaseRows,
  audit(tenant.id,session.userId,'kanban.board_created',id)
 ]);
 return {board:{id,...data,phases:defaultKanbanPhases.map((title,i)=>({title,position:i}))}};
}
export async function getKanbanBoard(token,slug,boardId){
 const {tenant}=await authorizeTool(token,slug,'T005');
 const board=await ensureBoard(tenant.id,boardId);
 const phases=await phasesFor(tenant.id,boardId);
 const cards=await executeSql('SELECT id,phase_id,source_tool_id,source_record_id,assigned_user_id,position,created_at FROM kanban_cards WHERE organization_id=? AND board_id=? AND archived_at IS NULL ORDER BY position,id',[tenant.id,boardId]);
 const titles={};
 if(board.sourceToolId==='C002'){
  const result=await executeSql('SELECT id,title FROM tenant_crm_deals WHERE organization_id=? AND archived_at IS NULL',[tenant.id]);
  for(const r of rows(result))titles[r[0]]=r[1];
 }else if(board.sourceToolId==='C003'){
  const result=await executeSql('SELECT id,title FROM tenant_client_cases WHERE organization_id=? AND archived_at IS NULL',[tenant.id]);
  for(const r of rows(result))titles[r[0]]=r[1];
 }else{
  const result=await executeSql('SELECT id,title FROM tenant_tool_records WHERE organization_id=? AND archived_at IS NULL',[tenant.id]);
  for(const r of rows(result))titles[r[0]]=r[1];
 }
 return {board:{id:board.id,sourceToolId:board.sourceToolId,phases},
  cards:rows(cards).map(c=>({id:c[0],phaseId:c[1],sourceToolId:c[2],sourceRecordId:c[3],assignedUserId:c[4],position:Number(c[5]),createdAt:c[6],title:titles[c[3]]||c[3]}))};
}
export async function createKanbanPhase(token,slug,boardId,input){
 const {tenant,session}=await authorizeTool(token,slug,'T005',true);
 await ensureBoard(tenant.id,boardId);
 const data=normalizeKanbanPhase(input);
 const phases=await phasesFor(tenant.id,boardId);
 const id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO kanban_phases(organization_id,id,board_id,title,position) VALUES(?,?,?,?,?)',args:[tenant.id,id,boardId,data.title,phases.length]},
  audit(tenant.id,session.userId,'kanban.phase_created',id)
 ]);
 return {phase:{id,...data,position:phases.length}};
}
export async function deleteKanbanPhase(token,slug,boardId,phaseId){
 const {tenant,session}=await authorizeTool(token,slug,'T005',true);
 await ensureBoard(tenant.id,boardId);
 const cards=rows(await executeSql('SELECT id FROM kanban_cards WHERE organization_id=? AND board_id=? AND phase_id=? AND archived_at IS NULL LIMIT 1',[tenant.id,boardId,phaseId]));
 if(cards.length)throw Error('Invalid kanban phase');
 const result=await executeSql('DELETE FROM kanban_phases WHERE organization_id=? AND board_id=? AND id=?',[tenant.id,boardId,phaseId]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'kanban.phase_deleted',phaseId);
 await executeSql(a.sql,a.args);
 return {deleted:true};
}
export async function createKanbanCard(token,slug,boardId,input){
 const {tenant,session}=await authorizeTool(token,slug,'T005',true);
 const board=await ensureBoard(tenant.id,boardId);
 const data=normalizeKanbanCard({...input,sourceToolId:board.sourceToolId});
 if(data.sourceToolId!==board.sourceToolId)throw Error('Invalid kanban card');
 const phases=await phasesFor(tenant.id,boardId);
 if(!phases.some(p=>p.id===data.phaseId))throw Error('Invalid kanban card');
 await ensureSourceRecord(tenant.id,data.sourceToolId,data.sourceRecordId);
 const clash=rows(await executeSql('SELECT id FROM kanban_cards WHERE organization_id=? AND board_id=? AND source_record_id=? AND archived_at IS NULL LIMIT 1',[tenant.id,boardId,data.sourceRecordId]));
 if(clash.length)throw Error('Duplicate kanban card');
 const count=rows(await executeSql('SELECT COUNT(*) FROM kanban_cards WHERE organization_id=? AND board_id=? AND phase_id=? AND archived_at IS NULL',[tenant.id,boardId,data.phaseId]))[0]?.[0]||0;
 const id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO kanban_cards(organization_id,id,board_id,phase_id,source_tool_id,source_record_id,assigned_user_id,position,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,boardId,data.phaseId,data.sourceToolId,data.sourceRecordId,data.assignedUserId,Number(count),session.userId]},
  audit(tenant.id,session.userId,'kanban.card_created',id)
 ]);
 return {card:{id,boardId,...data,position:Number(count)}};
}
export async function moveKanbanCard(token,slug,boardId,cardId,input){
 const {tenant,session}=await authorizeTool(token,slug,'T005',true);
 await ensureBoard(tenant.id,boardId);
 const toPhaseId=input?.phaseId;
 const phases=await phasesFor(tenant.id,boardId);
 const current=rows(await executeSql('SELECT phase_id FROM kanban_cards WHERE organization_id=? AND board_id=? AND id=? AND archived_at IS NULL',[tenant.id,boardId,cardId]))[0];
 if(!current)throw Error('Not found');
 const move=kanbanMoveAllowed({phases,fromPhaseId:current[0],toPhaseId});
 if(!move.moved)return {moved:false};
 const result=await executeBatch([
  {sql:'UPDATE kanban_cards SET phase_id=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND board_id=? AND id=? AND archived_at IS NULL',args:[toPhaseId,tenant.id,boardId,cardId]},
  audit(tenant.id,session.userId,'kanban.card_moved',cardId)
 ]);
 if(!changed(result?.[0]))throw Error('Not found');
 return {moved:true,phaseId:toPhaseId};
}
export async function archiveKanbanCard(token,slug,boardId,cardId){
 const {tenant,session}=await authorizeTool(token,slug,'T005',true);
 await ensureBoard(tenant.id,boardId);
 const result=await executeBatch([
  {sql:'UPDATE kanban_cards SET archived_at=CURRENT_TIMESTAMP WHERE organization_id=? AND board_id=? AND id=? AND archived_at IS NULL',args:[tenant.id,boardId,cardId]},
  audit(tenant.id,session.userId,'kanban.card_archived',cardId)
 ]);
 if(!changed(result?.[0]))throw Error('Not found');
 return {archived:true};
}
