// Miembros del equipo (memberships activas) para responsables reales.
// Un "responsable" es siempre un user_id de la empresa; la UI muestra el email.
import {executeSql as realExecuteSql} from '../database.mjs';

const rows=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];

export async function listTeamMembers(organizationId,deps={}){
 const executeSql=deps.executeSql||realExecuteSql;
 const result=await executeSql(
  "SELECT m.user_id,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id "+
  "WHERE m.organization_id=? AND m.status='active' ORDER BY u.email LIMIT 100",[organizationId]);
 return rows(result).map(r=>({userId:r[0],email:r[1],role:r[2]}));
}

export async function assertTeamMember(organizationId,userId,deps={}){
 if(!userId)return;
 const members=await listTeamMembers(organizationId,deps);
 if(!members.some(m=>m.userId===userId))throw Error('Assignee not found');
 return members.find(m=>m.userId===userId);
}
