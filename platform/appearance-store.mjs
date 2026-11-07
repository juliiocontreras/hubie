import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {appearanceDefaults,normalizeAppearance} from './appearance.mjs';
import {requireTenantSession} from '../auth.mjs';
import {resolveTenant} from '../tenant.mjs';
const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const cols=['dashboardPreset','sidebarPreset','dashboardColor','sidebarColor'];
const map=row=>row?normalizeAppearance(Object.fromEntries(cols.map((key,i)=>[key,row[i]]))):{...appearanceDefaults};
export async function getPlatformAppearance(){
 const r=await executeSql("SELECT dashboard_preset,sidebar_preset,dashboard_color,sidebar_color FROM platform_appearance WHERE id='madre'");
 return map(rows(r)[0]);
}
export async function setPlatformAppearance(input,actorId){
 const t=normalizeAppearance(input);
 await executeBatch([
  {sql:`INSERT INTO platform_appearance(id,dashboard_preset,sidebar_preset,dashboard_color,sidebar_color)
  VALUES('madre',?,?,?,?) ON CONFLICT(id) DO UPDATE SET
  dashboard_preset=excluded.dashboard_preset,sidebar_preset=excluded.sidebar_preset,
  dashboard_color=excluded.dashboard_color,sidebar_color=excluded.sidebar_color,updated_at=CURRENT_TIMESTAMP`,
  args:cols.map(k=>t[k])},
  {sql:"INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id) VALUES(?,?,'appearance.platform_updated','platform','madre')",args:[randomUUID(),actorId]}
 ]);
 return t;
}
export async function getTenantAppearance(organizationId){
 const r=await executeSql('SELECT dashboard_preset,sidebar_preset,dashboard_color,sidebar_color FROM tenant_appearance WHERE organization_id=?',[organizationId]);
 return map(rows(r)[0]);
}
export async function setTenantAppearance(organizationId,input,actorId){
 const t=normalizeAppearance(input);
 const found=rows(await executeSql('SELECT id FROM organizations WHERE id=?',[organizationId]));
 if(!found.length)throw Error('Not found');
 await executeBatch([
  {sql:`INSERT INTO tenant_appearance(organization_id,dashboard_preset,sidebar_preset,dashboard_color,sidebar_color)
  VALUES(?,?,?,?,?) ON CONFLICT(organization_id) DO UPDATE SET
  dashboard_preset=excluded.dashboard_preset,sidebar_preset=excluded.sidebar_preset,
  dashboard_color=excluded.dashboard_color,sidebar_color=excluded.sidebar_color,updated_at=CURRENT_TIMESTAMP`,
  args:[organizationId,...cols.map(k=>t[k])]},
  {sql:"INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,'appearance.tenant_updated','organization',?)",args:[randomUUID(),organizationId,actorId,organizationId]}
 ]);
 return t;
}
export async function setOwnTenantAppearance(token,slug,input){
 const tenant=await resolveTenant(slug);
 if(!tenant)throw Error('Not found');
 const session=await requireTenantSession(token,tenant.id,['owner','admin']);
 return setTenantAppearance(tenant.id,input,session.userId);
}
