import {executeSql,executeBatch} from '../database.mjs';
import {createTenant} from '../admin.mjs';
import {QA_COMPANY,makeQaSeedPlan,QA_VERIFY_SQL,checkQaCounts} from './staging-qa-fixture.mjs';

const rows=r=>r?.rows?.map(a=>a.map(c=>c?.value??null))??[];
const LIVE_STAGING_ORIGIN='https://hubie-pwa-staging.onrender.com';
const TRIGGER='create-qa-pilot-2026-11';

/** Safe, opt-in, once-per-service staging fixture; never exposes or creates credentials. */
export async function seedQaCompanyIfRequested(){
 if(process.env.HUBIE_SEED_QA_COMPANY!==TRIGGER)return {skipped:true};
 if(process.env.HUBIE_PUBLIC_ORIGIN!==LIVE_STAGING_ORIGIN||
    process.env.HUBIE_AUTH_ENABLED!=='true')throw Error('QA fixture requires Hubie staging with Google authentication enabled');
 const email=String(process.env.HUBIE_INITIAL_ADMIN_EMAIL||'').trim().toLowerCase();
 if(!email)throw Error('QA fixture requires existing initial admin');
 const actor=rows(await executeSql(`SELECT u.id FROM users u
  INNER JOIN platform_admins a ON a.user_id=u.id
  WHERE LOWER(u.email)=? LIMIT 1`,[email]))[0];
 if(!actor)throw Error('QA fixture requires existing verified platform admin login');
 const actorId=actor[0];
 const found=rows(await executeSql(`SELECT o.id,o.name,s.suite_id,m.role
   FROM organizations o JOIN tenant_settings s ON s.organization_id=o.id
   LEFT JOIN memberships m ON m.organization_id=o.id AND m.user_id=?
   WHERE o.slug=? LIMIT 1`,[actorId,QA_COMPANY.slug]))[0];
 let orgId=found?.[0]||null;
 if(found&&(found[1]!==QA_COMPANY.name||found[2]!==QA_COMPANY.suiteId||found[3]!=='owner'))
  throw Error('QA fixture slug already belongs to a different company; no changes made');
 if(!orgId){
  const created=await createTenant(QA_COMPANY,actorId);
  orgId=created.id;
 }
 // Enable T021 only in the already verified QA company, never for other tenants.
 await executeSql("INSERT INTO tenant_tools(organization_id,tool_id,enabled) VALUES(?,'T021',1) ON CONFLICT(organization_id,tool_id) DO UPDATE SET enabled=1",[orgId]);
 // INSERT OR IGNORE plus deterministic IDs avoids duplicates on re-deployment.
 await executeBatch(makeQaSeedPlan(orgId,actorId));
 const result=await executeSql(QA_VERIFY_SQL,Array(10).fill(orgId));
 const counts=rows(result)[0]?.map(Number)||[];
 if(!checkQaCounts(counts))throw Error('QA fixture integrity check failed');
 const surveyCount=rows(await executeSql('SELECT COUNT(*) FROM tenant_surveys WHERE organization_id=? AND title=?',[orgId,'[DEMO] Encuesta de satisfacción posventa']))[0]?.[0];
 if(Number(surveyCount||0)<1)throw Error('QA satisfaction survey was not created');
 // No IDs, emails, token values or confidential data in logs.
 console.log('Hubie QA fixture verified: hubie-qa-piloto; 1 client, 1 CRM, 1 case, 1 appointment, 1 item, 2 optional records and 1 satisfaction survey');
 return {slug:QA_COMPANY.slug,verified:true};
}
