import { isSameOrigin } from './platform/public-origin.mjs';
import {configurationStatus} from './platform/setup-health.mjs';
import {sqlStatements} from './platform/migration-parser.mjs';
import { databaseHealth, executeSql } from './database.mjs';
import {readSessionCookie,verifySession,revokeSession} from './auth.mjs';
import {requireSuperAdmin,createTenant,listTenants,getAdminCatalog,getTenantAdmin,setTenantTool,updateTenant,listTenantMembers,addTenantMember,setTenantMemberStatus} from './admin.mjs';
import {userOrganizations,tenantConfig,toolRecords,saveToolRecord,archiveToolRecord} from './platform/records.mjs';
import {getPlatformAppearance,setPlatformAppearance,setTenantAppearance,setOwnTenantAppearance} from './platform/appearance-store.mjs';
import {mediaBackgroundUrls,uploadBackground,clearBackground,findBackground,authorizeOwnBackground,listAttachments,addAttachment,getAttachment,removeAttachment,updateCaseDocument} from './platform/media-store.mjs';
import {listClients,createClient,updateClient,archiveClient} from './platform/operations-clients.mjs';
import {listCases,createCase,updateCase,archiveCase,caseHistory} from './platform/operations-cases.mjs';
import {listEntityLinks,linkEntities,unlinkEntities,relationCandidates} from './platform/entity-links-store.mjs';
import {getClientSummary} from './platform/client-summary.mjs';
import {listDeals,createDeal,updateDeal,archiveDeal} from './platform/operations-crm.mjs';
import {listAppointments,createAppointment,updateAppointment} from './platform/operations-agenda.mjs';
import {listInventory,createStockItem,updateStockItem,moveStock} from './platform/operations-inventory.mjs';
import {googleConfigured,startGoogleLogin,completeGoogleLogin} from './google-oidc.mjs';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const root=process.cwd();
let migrationsReady=Promise.resolve(false);
const types={'.webmanifest':'application/manifest+json','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
const port=Number(process.env.PORT||10000);
const nav=`<button class="hubie-menu-toggle" type="button" aria-expanded="false" aria-controls="hubie-main-nav" aria-label="Abrir menú">☰ <span>Menú</span></button>
<nav id="hubie-main-nav" class="hubie-navigation" aria-label="Navegación principal">
<a href="/index.html">Inicio</a>
<details><summary>Suites</summary><div class="hubie-submenu"><a href="/suite.html">Explorar Suites</a><a href="/suite.html">Beauty · Health · Realty · Commerce · Food · Office · Jobs · Pet · Academy · Events</a></div></details>
<details><summary>Tools</summary><div class="hubie-submenu"><a href="/tools.html">Explorar herramientas</a><a href="/tools.html#crm">CRM y clientes</a><a href="/tools.html#inventario">Inventario</a><a href="/tools.html#agenda">Agenda</a></div></details>
<details><summary>Soluciones</summary><div class="hubie-submenu"><a href="/servicios.html">Servicios profesionales</a><a href="/shop.html">Hubie Shop</a></div></details>
<a href="/precios.html">Cotizador</a><a href="/contacto.html">Contacto</a>
</nav>`;
const navStyles='<link rel="stylesheet" href="/assets/navigation.css">';
const navScript="<script>(function(){\nconst button=document.querySelector('.hubie-menu-toggle');\nconst nav=document.getElementById('hubie-main-nav');\nif(!button||!nav)return;\nconst groups=Array.from(nav.querySelectorAll('details'));\nfunction closeMenu(){\n nav.classList.remove('is-open');\n button.setAttribute('aria-expanded','false');\n button.setAttribute('aria-label','Abrir menú');\n groups.forEach(group=>{group.open=false;});\n}\nbutton.addEventListener('click',()=>{\n const next=!nav.classList.contains('is-open');\n if(!next){closeMenu();return;}\n nav.classList.add('is-open');\n button.setAttribute('aria-expanded','true');\n button.setAttribute('aria-label','Cerrar menú');\n});\ngroups.forEach(group=>group.addEventListener('toggle',()=>{\n if(group.open)groups.forEach(other=>{if(other!==group)other.open=false;});\n}));\ndocument.addEventListener('pointerdown',event=>{\n if(!event.target.closest('.site-header'))closeMenu();\n else if(!event.target.closest('.hubie-navigation details'))groups.forEach(group=>{group.open=false;});\n});\ndocument.addEventListener('keydown',event=>{\n if(event.key==='Escape'){closeMenu();button.focus();}\n});\nnav.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));\nwindow.addEventListener('resize',()=>{if(window.innerWidth>1050)closeMenu();});\n})();</script>";
const sharedHeader="<header class=\"site-header\"><div class=\"container nav\"><a href=\"/index.html\" class=\"hubie-brand\" aria-label=\"Hubie, inicio\"><img src=\"/assets/hubie-logo-official.png\" alt=\"Hubie\" width=\"176\" height=\"46\"></a><button class=\"hubie-menu-toggle\" type=\"button\" aria-expanded=\"false\" aria-controls=\"hubie-main-nav\" aria-label=\"Abrir menú\">☰ <span>Menú</span></button>\n<nav id=\"hubie-main-nav\" class=\"hubie-navigation\" aria-label=\"Navegación principal\">\n<a href=\"/index.html\">Inicio</a>\n<details><summary>Suites</summary><div class=\"hubie-submenu\"><a href=\"/suite.html\">Explorar Suites</a><a href=\"/suite.html\">Beauty · Health · Realty · Commerce · Food · Office · Jobs · Pet · Academy · Events</a></div></details>\n<details><summary>Tools</summary><div class=\"hubie-submenu\"><a href=\"/tools.html\">Explorar herramientas</a><a href=\"/tools.html#crm\">CRM y clientes</a><a href=\"/tools.html#inventario\">Inventario</a><a href=\"/tools.html#agenda\">Agenda</a></div></details>\n<details><summary>Soluciones</summary><div class=\"hubie-submenu\"><a href=\"/servicios.html\">Servicios profesionales</a><a href=\"/shop.html\">Hubie Shop</a></div></details>\n<a href=\"/precios.html\">Cotizador</a><a href=\"/contacto.html\">Contacto</a>\n</nav><a href=\"/contacto.html\" class=\"btn btn--primary btn--sm hubie-header-cta\">Solicitar información</a></div></header>";
const sharedFooter="<footer class=\"hubie-site-footer\"><div class=\"container hubie-footer-inner\"><a class=\"hubie-footer-brand\" href=\"/index.html\">Hubie</a><nav aria-label=\"Enlaces del pie de página\"><a href=\"/suite.html\">Suites</a><a href=\"/tools.html\">Tools</a><a href=\"/servicios.html\">Servicios</a><a href=\"/shop.html\">Shop</a><a href=\"/precios.html\">Cotizador</a><a href=\"/contacto.html\">Contacto</a></nav><small>© 2026 Hubie · Todos los derechos reservados.</small></div></footer>";
function enhanceHtml(html){
 let updated=html.replace(/<header\b[^>]*>[\s\S]*?<\/header>/i,sharedHeader);
 updated=updated.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/i,sharedFooter);
 if(!/<footer\b/i.test(updated))updated=updated.replace('</body>',sharedFooter+'</body>');
 updated=updated.replace(/href=["'](?:\.\/)?productos\.html(["'])/g,'href="/shop.html"');
 updated=updated.replace(/https:\/\/fonts.googleapis.com\/css2\?family=Nunito:[^"']+/g,'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
 if(!updated.includes('fonts.googleapis.com/css2?family=Poppins'))updated=updated.replace('</head>','<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet"></head>');
 updated=updated.replace('</head>',navStyles+'</head>');
 return updated.replace('</body>',navScript+'<script src="/assets/catalog-ui.js" defer></script><script src="/assets/ambient-motion.js" defer></script></body>');
}
function decodedProtected(path){return /^(?:\/\.git|\/platform\/|\/turso\/|\/scripts\/|\/tests\/|\/docs\/|\/data\/backup\/|\/package(?:-lock)?\.json$)/i.test(path)||/\.(?:mjs|sql|map)$/i.test(path);}
async function applyCoreSchema(){
 const health=await databaseHealth();
 if(health.status!=='connected'){console.error('Core migration skipped: database '+health.status+' '+(health.reason||''));return;}
 for(const migration of ['001_core.sql','002_multitenant.sql','003_identity.sql','004_platform_admin.sql','005_google_oidc.sql','006_pwa_records.sql','007_operational_workflows.sql','008_clients.sql','009_appearance.sql','010_media.sql','011_cases.sql','012_case_documents.sql','013_entity_relationships.sql']){
  const sql=await readFile(resolve(root,'turso/migrations',migration),'utf8');
  for(const statement of sqlStatements(sql))await executeSql(statement);
 }
 const result=await executeSql("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name IN ('organizations','users','memberships','organization_invitations','audit_events')");
 const count=Number(result?.rows?.[0]?.[0]?.value??0);
 if(count!==5)throw new Error('Core schema verification failed');
 console.log('Hubie core schema verified; operational migrations applied');
 await executeSql('CREATE TABLE IF NOT EXISTS marketing_leads (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, negocio TEXT, giro TEXT, email TEXT NOT NULL, tel TEXT, mensaje TEXT, created_at TEXT NOT NULL)');
}
// All mutable cookie-authenticated API requests require a same-origin browser context.
function sameOrigin(req){return isSameOrigin(req.headers.origin,process.env.HUBIE_PUBLIC_ORIGIN);}
function sendApi(res,status,data){
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
 res.end(JSON.stringify(data));
}
async function readApiBody(req,maxBytes=16000){
 if(req.headers['content-type']?.split(';')[0]!=='application/json')throw Error('Unsupported media type');
 let raw='',size=0;
 for await(const chunk of req){size+=chunk.length;if(size>maxBytes)throw Error('Payload too large');raw+=chunk.toString('utf8');}
 try{return JSON.parse(raw);}catch{throw Error('Invalid JSON');}
}
async function processApi(req,res,fn,{admin=false,methods=['GET'],maxBytes=16000}={}){
 if(!configurationStatus().readyForLive)return sendApi(res,503,{error:'Autenticación o base de datos no configurada'});
 if(!(await migrationsReady))return sendApi(res,503,{error:'La base de datos no está inicializada'});
 if(!methods.includes(req.method)){res.writeHead(405,{'allow':methods.join(', ')});res.end();return;}
 if(!['GET','HEAD'].includes(req.method)&&!sameOrigin(req))return sendApi(res,403,{error:'Origin forbidden'});
 try{
  const token=readSessionCookie(req.headers.cookie);
  const actor=admin?await requireSuperAdmin(token):null;
  const body=['GET','HEAD','DELETE'].includes(req.method)?null:await readApiBody(req,maxBytes);
  const result=await fn({actor,token,body});
  return sendApi(res,req.method==='POST'?201:200,result);
 }catch(error){
  const message=error?.message||'';
  const status=message==='Unauthorized'?401:message==='Forbidden'||message==='Tool disabled'||message==='Authentication required'?403:['Not found','Client not found','Deal not found'].includes(message)?404:['Schedule conflict','Duplicate SKU','Insufficient stock','Duplicate client email','Duplicate relation','Relation mismatch'].includes(message)?409:message==='Unsupported media type'?415:message==='Payload too large'?413:message==='Storage quota exceeded'?409:message.startsWith('Invalid')||message==='Payload too large'||message==='Read only tool'?400:503;
  return sendApi(res,status,{error:status===503?'Operación temporalmente no disponible':message});
 }
}
createServer(async(req,res)=>{
  const pathname=new URL(req.url||'/','http://localhost').pathname;
  if(pathname==='/api/auth/google/start'){
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    if(!googleConfigured()||!(await migrationsReady)){
      res.writeHead(303,{'location':'/auth/configuracion.html','cache-control':'no-store'});res.end();return;
    }
    try{const url=await startGoogleLogin();res.writeHead(302,{'location':url,'cache-control':'no-store'});res.end();}
    catch{res.writeHead(503,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});res.end('No se pudo iniciar el acceso con Google.');}
    return;
  }
  if(pathname==='/api/auth/google/callback'){
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    try{if(!(await migrationsReady))throw Error('Database setup not ready');const query=new URL(req.url,'http://localhost').searchParams;const session=await completeGoogleLogin(query.get('state'),query.get('code'));res.writeHead(303,{'location':session.isSuperAdmin?'/madre/app.html':'/app/','set-cookie':'__Host-hubie_session='+encodeURIComponent(session.token)+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400','cache-control':'no-store'});res.end();}catch{res.writeHead(303,{'location':'/admin.html?login=failed','cache-control':'no-store'});res.end();}return;
  }
  if(pathname==='/api/admin/tenants'){
    if(req.method==='POST'&&!sameOrigin(req)){sendApi(res,403,{error:'Origin forbidden'});return;}
    if(process.env.HUBIE_AUTH_ENABLED!=='true'){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Administración no habilitada'}));return;}
    if(!['GET','POST'].includes(req.method)){res.writeHead(405,{'allow':'GET, POST'});res.end();return;}
    try{
      const actorId=await requireSuperAdmin(readSessionCookie(req.headers.cookie));
      if(req.method==='GET'){const tenants=await listTenants();res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({tenants}));return;}
      if(req.headers['content-type']?.split(';')[0]!=='application/json'){res.writeHead(415);res.end();return;}
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw Error('Payload too large');}
      const tenant=await createTenant(JSON.parse(raw),actorId);res.writeHead(201,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({tenant}));return;
    }catch(error){const status=error.message==='Unauthorized'?401:error.message==='Forbidden'?403:error instanceof SyntaxError||error.message==='Invalid tenant data'||error.message==='Payload too large'?400:503;res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:status===503?'No se pudo completar la operación':error.message}));return;}
  }
  if(pathname==='/api/auth/session'){
    if(process.env.HUBIE_AUTH_ENABLED!=='true'){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Autenticación pendiente de configurar'}));return;}
    if(req.method!=='GET'){res.writeHead(405,{'allow':'GET'});res.end();return;}
    try{const token=readSessionCookie(req.headers.cookie);const session=token?await verifySession(token):null;res.writeHead(session?200:401,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(session?{authenticated:true}:{authenticated:false}));}catch{res.writeHead(503);res.end();}return;
  }
  if(pathname==='/api/auth/logout'){
    if(req.method!=='POST'){res.writeHead(405,{'allow':'POST'});res.end();return;}
    try{const token=readSessionCookie(req.headers.cookie);if(token)await revokeSession(token);}catch{}
    res.writeHead(204,{'set-cookie':'__Host-hubie_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0','cache-control':'no-store'});res.end();return;
  }
  // Media: session-scoped binary GET, safe JSON uploads. All records are in Turso, never Render's disk.
  const mediaMother=pathname.match(/^\/api\/admin\/media\/(dashboard|sidebar)$/);
  const mediaTenantAdmin=pathname.match(/^\/api\/admin\/tenants\/([0-9a-f-]{36})\/media\/(dashboard|sidebar)$/);
  const mediaTenantOwn=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/media\/(dashboard|sidebar)$/);
  const mediaAttachList=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/tools\/([A-Z][0-9]{3})\/records\/([0-9a-f-]{36})\/attachments$/);
  const mediaAttachment=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/attachments\/([0-9a-f-]{36})$/);
  if(mediaMother||mediaTenantAdmin||mediaTenantOwn||mediaAttachment){
    const binaryGet=req.method==='GET'&&!mediaAttachList;
    if(binaryGet){
      if(process.env.HUBIE_AUTH_ENABLED!=='true')return sendApi(res,503,{error:'Autenticación no configurada'});
      try{
        const token=readSessionCookie(req.headers.cookie);
        let result;
        if(mediaMother){await requireSuperAdmin(token);result=await findBackground('madre',null,mediaMother[1]);}
        else if(mediaTenantAdmin){await requireSuperAdmin(token);result=await findBackground('tenant',mediaTenantAdmin[1],mediaTenantAdmin[2]);}
        else if(mediaTenantOwn){const {tenant}=await authorizeOwnBackground(token,mediaTenantOwn[1]);result=await findBackground('tenant',tenant.id,mediaTenantOwn[2]);}
        else result=await getAttachment(token,mediaAttachment[1],mediaAttachment[2]);
        res.writeHead(200,{'content-type':result.mime,'content-length':result.buffer.length,'cache-control':'private, no-store',
          'x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin',
          'content-security-policy':"default-src 'none'; sandbox",
          'content-disposition':result.disposition+'; filename="'+result.filename.replace(/[^a-zA-Z0-9._ -]/g,'_')+'"'});
        res.end(result.buffer);return;
      }catch(error){
        const msg=error?.message;
        return sendApi(res,msg==='Not found'?404:msg==='Unauthorized'?401:msg==='Forbidden'||msg==='Tool disabled'?403:503,{error:msg==='Not found'?'Not found':'Media unavailable'});
      }
    }
    if(mediaMother||mediaTenantAdmin||mediaTenantOwn){
      const scoped=mediaMother?{scope:'madre',key:null,kind:mediaMother[1]}:
       mediaTenantAdmin?{scope:'tenant',key:mediaTenantAdmin[1],kind:mediaTenantAdmin[2]}:
        {scope:'tenant',key:mediaTenantOwn[1],kind:mediaTenantOwn[2]};
      return processApi(req,res,async({actor,token,body})=>{
        let org=scoped.key,owner=actor;
        if(mediaTenantOwn){const {tenant,session}=await authorizeOwnBackground(token,scoped.key,true);org=tenant.id;owner=session.userId;}
        if(req.method==='DELETE')return clearBackground(scoped.scope,org,scoped.kind);
        return {media:await uploadBackground(scoped.scope,org,scoped.kind,body,owner)};
      },{admin:!mediaTenantOwn,methods:['POST','DELETE'],maxBytes:1_300_000});
    }
    return processApi(req,res,async({token})=>({removed:await removeAttachment(token,mediaAttachment[1],mediaAttachment[2])}),{methods:['DELETE']});
  }
  if(mediaAttachList){
    return processApi(req,res,async({token,body})=>req.method==='GET'?
      listAttachments(token,mediaAttachList[1],mediaAttachList[2],mediaAttachList[3]):
      {attachment:await addAttachment(token,mediaAttachList[1],mediaAttachList[2],mediaAttachList[3],body)},
     {methods:['GET','POST'],maxBytes:2_800_000});
  }
  const documentEditPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/case-documents\/([0-9a-f-]{36})$/);
  if(documentEditPath){
    return processApi(req,res,async({token,body})=>({document:await updateCaseDocument(token,documentEditPath[1],documentEditPath[2],body)}),
      {methods:['PATCH']});
  }
  if(pathname==='/api/admin/appearance'){
    return processApi(req,res,async({actor,body})=>({appearance:req.method==='GET'?await getPlatformAppearance():await setPlatformAppearance(body,actor),backgrounds:await mediaBackgroundUrls('madre',null)}),{admin:true,methods:['GET','PUT']});
  }
  const adminAppearancePath=pathname.match(/^\/api\/admin\/tenants\/([0-9a-f-]{36})\/appearance$/);
  if(adminAppearancePath){
    return processApi(req,res,async({actor,body})=>({appearance:await setTenantAppearance(adminAppearancePath[1],body,actor)}),{admin:true,methods:['PUT']});
  }
  const ownAppearancePath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/appearance$/);
  if(ownAppearancePath){
    return processApi(req,res,async({token,body})=>({appearance:await setOwnTenantAppearance(token,ownAppearancePath[1],body)}),{methods:['PUT']});
  }
  if(pathname==='/api/admin/catalog'){
    return processApi(req,res,async()=>({catalog:getAdminCatalog()}),{admin:true,methods:['GET']});
  }
  const memberStatusPath=pathname.match(/^\/api\/admin\/tenants\/([0-9a-f-]{36})\/members\/([0-9a-f-]{36})$/);
  if(memberStatusPath){
    return processApi(req,res,async({actor,body})=>({members:await setTenantMemberStatus(memberStatusPath[1],memberStatusPath[2],body?.status,actor)}),{admin:true,methods:['PATCH']});
  }
  const adminDetail=pathname.match(/^\/api\/admin\/tenants\/([0-9a-f-]{36})(?:\/(tools\/([A-Z][0-9]{3})|members))?$/);
  if(adminDetail){
    const id=adminDetail[1],toolId=adminDetail[3],members=adminDetail[2]==='members';
    return processApi(req,res,async({actor,body})=>{
      if(toolId)return {tool:await setTenantTool(id,toolId,body?.enabled,actor)};
      if(members)return req.method==='GET'?{members:await listTenantMembers(id)}:{members:await addTenantMember(id,body,actor)};
      return {tenant:req.method==='GET'?await getTenantAdmin(id):await updateTenant(id,body,actor)};
    },{admin:true,methods:toolId?['PUT']:members?['GET','POST']:['GET','PATCH']});
  }
  if(pathname==='/api/app/organizations'){
    return processApi(req,res,async({token})=>({organizations:await userOrganizations(token)}),{methods:['GET']});
  }
  const appPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/(config|tools\/([A-Z][0-9]{3})\/records(?:\/([a-zA-Z0-9-]{1,100}))?)$/);
  if(appPath){
    const slug=appPath[1],toolId=appPath[3],recordId=appPath[4];
    return processApi(req,res,async({token,body})=>{
      if(appPath[2]==='config')return await tenantConfig(token,slug);
      if(req.method==='GET')return await toolRecords(token,slug,toolId);
      if(req.method==='DELETE')return await archiveToolRecord(token,slug,toolId,recordId);
      return {record:await saveToolRecord(token,slug,toolId,body,recordId||null)};
    },{methods:appPath[2]==='config'?['GET']:recordId?['PATCH','DELETE']:['GET','POST']});
  }
  const casesPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/cases(?:\/([0-9a-f-]{36}))?(?:\/(history))?$/);
  if(casesPath){
    const slug=casesPath[1],caseId=casesPath[2],action=casesPath[3];
    return processApi(req,res,async({token,body})=>{
      if(action==='history')return caseHistory(token,slug,caseId);
      if(req.method==='GET')return listCases(token,slug);
      if(req.method==='POST')return createCase(token,slug,body);
      if(req.method==='DELETE')return archiveCase(token,slug,caseId);
      return updateCase(token,slug,caseId,body);
    },{methods:action==='history'?['GET']:caseId?['PATCH','DELETE']:['GET','POST']});
  }
  const entityLinksPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/tools\/([A-Z][0-9]{3})\/records\/([0-9a-f-]{36})\/links$/);
  if(entityLinksPath){
    return processApi(req,res,async({token,body})=>req.method==='GET'?
     listEntityLinks(token,entityLinksPath[1],entityLinksPath[2],entityLinksPath[3]):
     linkEntities(token,entityLinksPath[1],entityLinksPath[2],entityLinksPath[3],body),
    {methods:['GET','POST']});
  }
  const entityCandidatesPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/relations\/options\/([A-Z][0-9]{3})$/);
  if(entityCandidatesPath)return processApi(req,res,async({token})=>relationCandidates(token,entityCandidatesPath[1],entityCandidatesPath[2]),{methods:['GET']});
  const entityUnlinkPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/relations\/([0-9a-f-]{36})$/);
  if(entityUnlinkPath)return processApi(req,res,async({token})=>unlinkEntities(token,entityUnlinkPath[1],entityUnlinkPath[2]),{methods:['DELETE']});
  const clientSummaryPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/clients\/([0-9a-f-]{36})\/summary$/);
  if(clientSummaryPath)return processApi(req,res,async({token})=>getClientSummary(token,clientSummaryPath[1],clientSummaryPath[2]),{methods:['GET']});
  const workflowPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/(clients|crm|agenda|inventory)(?:\/([0-9a-f-]{36}))?(?:\/(movements))?$/);
  if(workflowPath){
    const slug=workflowPath[1],module=workflowPath[2],id=workflowPath[3],action=workflowPath[4];
    const methods=module==='clients'?(id?['PATCH','DELETE']:['GET','POST']):
      module==='crm'?(id?['PATCH','DELETE']:['GET','POST']):
      module==='agenda'?(id?['PATCH']:['GET','POST']):
      action==='movements'?['POST']:id?['PATCH']:['GET','POST'];
    return processApi(req,res,async({token,body})=>{
      if(module==='clients'){
        if(req.method==='GET')return listClients(token,slug);
        if(req.method==='POST')return createClient(token,slug,body);
        if(req.method==='DELETE')return archiveClient(token,slug,id);
        return updateClient(token,slug,id,body);
      }
      if(module==='crm'){
        if(req.method==='GET')return listDeals(token,slug);
        if(req.method==='POST')return createDeal(token,slug,body);
        if(req.method==='DELETE')return archiveDeal(token,slug,id);
        return updateDeal(token,slug,id,body);
      }
      if(module==='agenda'){
        if(req.method==='GET')return listAppointments(token,slug);
        if(req.method==='POST')return createAppointment(token,slug,body);
        return updateAppointment(token,slug,id,body);
      }
      if(req.method==='GET')return listInventory(token,slug);
      if(action==='movements')return moveStock(token,slug,id,body);
      if(id)return updateStockItem(token,slug,id,body);
      return createStockItem(token,slug,body);
    },{methods});
  }
  if(pathname==='/api/leads'){
    if(req.method!=='POST'){res.writeHead(405,{'allow':'POST'});res.end();return;}
    let raw='';try{for await(const chunk of req){raw+=chunk;if(raw.length>12000)throw Error('too-large');}
      const data=JSON.parse(raw);
      const clean=(key,max=300)=>typeof data[key]==='string'?data[key].trim().slice(0,max):'';
      const nombre=clean('nombre',120),email=clean('email',254),negocio=clean('negocio',160),giro=clean('giro',100),tel=clean('tel',40),mensaje=clean('mensaje',2000);
      if(!nombre||!/^\S+@\S+\.\S+$/.test(email)){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:'Datos incompletos'}));return;}
      await executeSql('INSERT INTO marketing_leads (id,nombre,negocio,giro,email,tel,mensaje,created_at) VALUES (?,?,?,?,?,?,?,?)',[randomUUID(),nombre,negocio,giro,email,tel,mensaje,new Date().toISOString()]);
      res.writeHead(201,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:true}));return;
    }catch(error){const bad=error instanceof SyntaxError||error.message==='too-large';res.writeHead(bad?400:503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:bad?'Solicitud inválida':'No se pudo guardar la solicitud'}));return;}
  }
  if(pathname==='/healthz'){
    const db=await databaseHealth();
    let schemaReady=false;
    if(db.status==='connected'){
      try{
        const result=await executeSql("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('organizations','users','memberships','tenant_settings','tenant_tools','tenant_tool_records','tenant_crm_deals','tenant_schedule_events','tenant_inventory_items','tenant_inventory_movements','tenant_client_profiles','platform_appearance','tenant_appearance','pwa_media','tenant_client_cases','tenant_case_events','tenant_case_documents','tenant_case_document_versions','tenant_deal_clients','tenant_appointment_links','tenant_entity_links')");
        schemaReady=Number(result?.rows?.[0]?.[0]?.value??0)===21;
      }catch{schemaReady=false;}
    }
    const setup=configurationStatus();
    const ready=await migrationsReady;
    const healthy=db.status==='connected'&&schemaReady&&ready&&setup.readyForLive;
    res.writeHead(healthy?200:503,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({status:healthy?'ok':'degraded',service:'hubie-dev',database:db.status,schema:schemaReady?'ready':'not-ready',setup,...(db.reason?{reason:db.reason}:{})}));
    return;
  }
  if(decodedProtected(pathname)){res.writeHead(404);res.end('Not found');return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let decoded;try{decoded=decodeURIComponent(pathname);}catch{res.writeHead(400);res.end();return;}
  const file=resolve(root,'.'+(decoded==='/'?'/index.html':decoded==='/app/'?'/app/index.html':decoded));
  if(!(file===root||file.startsWith(root+sep))||decoded.split('/').some(p=>p.startsWith('.'))){res.writeHead(403);res.end();return;}
  try{
    const s=await stat(file);if(!s.isFile())throw Error('not file');
    const isHtml=extname(file).toLowerCase()==='.html';
    const raw=await readFile(file);
    const appShell=decoded==='/admin.html'||decoded==='/madre/app.html'||decoded==='/auth/configuracion.html'||decoded.startsWith('/app/');
    const data=isHtml?Buffer.from(appShell?raw.toString('utf8'):enhanceHtml(raw.toString('utf8'))):raw;
    const isPwaAsset=decoded.startsWith('/assets/pwa-')||['/assets/appearance-ui.js','/assets/ui-icons.js','/assets/media-ui.js','/assets/attachments-ui.js','/assets/admin-console.js','/assets/app-console.js','/assets/demo-backend.js'].includes(decoded);
    res.writeHead(200,{'content-type':types[extname(file).toLowerCase()]||'application/octet-stream',
      'cache-control':appShell||isPwaAsset?'no-store':'public, max-age=300',
      'x-content-type-options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'0.0.0.0',()=>console.log('Hubie listening on '+port));
migrationsReady=applyCoreSchema().then(()=>Boolean(configurationStatus().databaseConfigured))
 .catch(error=>{console.error('Core migration failed:',error?.code||error?.name||'unknown');return false;});
