import { isSameOrigin } from './platform/public-origin.mjs';
import {configurationStatus} from './platform/setup-health.mjs';
import {seedQaCompanyIfRequested} from './platform/staging-qa-seed.mjs';
import {listSurveys,createSurvey,setSurveyStatus,createSurveyInvitation,surveyReport,publicSurvey,submitSurvey} from './platform/satisfaction-store.mjs';
import {sqlStatements,executableStatements} from './platform/migration-parser.mjs';
import { databaseHealth, databaseConfigured, executeSql } from './database.mjs';
import { resolveTenant, getTenantTools } from './tenant.mjs';
import { searchTenant, searchTenants } from './platform/search.mjs';
import { listNotifications, markNotificationRead, markAllNotificationsRead, listAdminNotifications, generateNotificationsForTenant, generateNotificationsForAllTenants } from './platform/notifications.mjs';
import { quoteCheckout, validateCheckoutEmail, validateOrganizationId } from './platform/billing-domain.mjs';
import { getBillingStatus, listBillingForAdmin, createCheckoutOrder, sweepPastDueSuspensions } from './platform/billing-store.mjs';
import { getOnboardingProgress, completeOnboardingStep, resetOnboardingProgress, seedDemoData, clearDemoData, listDemoData, redeemSetupToken, issueSetupToken, getTenantOwner } from './platform/onboarding-store.mjs';
import { getSuite } from './platform/catalog.mjs';
import { stripeConfigured, webhookSecretConfigured, createStripeClient, buildCheckoutSessionParams, createCheckoutSession, verifyWebhookEvent, handleStripeEvent } from './platform/billing-webhook.mjs';
import {readSessionCookie,verifySession,revokeSession,requireTenantSession,createSession} from './auth.mjs';
import {requireSuperAdmin,createTenant,listTenants,getAdminCatalog,getTenantAdmin,setTenantTool,updateTenant,listTenantMembers,addTenantMember,setTenantMemberStatus} from './admin.mjs';
import {createInvitation,listInvitations,lookupInvitation,acceptInvitation,revokeInvitation,resendInvitation} from './platform/invitations.mjs';
import {listAuditEvents,KNOWN_AUDIT_ACTIONS} from './platform/audit.mjs';
import {emailConfigured} from './platform/email.mjs';
import {userOrganizations,tenantConfig,toolRecords,saveToolRecord,archiveToolRecord} from './platform/records.mjs';
import {getPlatformAppearance,setPlatformAppearance,setTenantAppearance,setOwnTenantAppearance} from './platform/appearance-store.mjs';
import {mediaBackgroundUrls,uploadBackground,clearBackground,findBackground,authorizeOwnBackground,listAttachments,addAttachment,getAttachment,removeAttachment,updateCaseDocument} from './platform/media-store.mjs';
import {listClients,createClient,updateClient,archiveClient} from './platform/operations-clients.mjs';
import {listCases,createCase,updateCase,archiveCase,caseHistory} from './platform/operations-cases.mjs';
import {listEntityLinks,linkEntities,unlinkEntities,relationCandidates} from './platform/entity-links-store.mjs';
import {getClientSummary} from './platform/client-summary.mjs';
import {listDeals,createDeal,updateDeal,archiveDeal} from './platform/operations-crm.mjs';
import {listAppointments,createAppointment,updateAppointment} from './platform/operations-agenda.mjs';
import {listInventory,createStockItem,updateStockItem,moveStock,createVariant,updateVariant,archiveVariant} from './platform/operations-inventory.mjs';
import {listChecklistTemplates,createChecklistTemplate,listChecklists,createChecklist,addChecklistItem,toggleChecklistItem,archiveChecklist} from './platform/operations-checklists.mjs';
import {listTasks,createTask,updateTask,archiveTask} from './platform/operations-tasks.mjs';
import {listForms,createForm,updateForm,archiveForm,submitForm,listSubmissions,exportSubmissionsCsv} from './platform/operations-forms.mjs';
import {getDashboard,setDashboardGoal,listDashboardGoals} from './platform/dashboard.mjs';
import {listQuotes,getQuote,createQuote,updateQuote,setQuoteStatus,archiveQuote,publicQuote,publicQuoteDecision} from './platform/operations-quotes.mjs';
// TOOLS P0 (021): relaciones cliente↔trato/caso/cita/cotización, tareas y
// cotizaciones del trato, búsqueda/vencimientos/acceso de expedientes y
// permisos por módulo (migración 021 cableada en applyCoreSchema y /healthz).
import {getClientTimeline,findDuplicateClients,mergeClients} from './platform/client-relations-p0.mjs';
import {listDealTasks,createDealTask,updateDealTask,archiveDealTask,listDealQuotes,linkDealQuote,unlinkDealQuote,getQuoteDeal} from './platform/deal-work-p0.mjs';
import {searchCaseDocuments,listExpiringDocuments,getCaseLinks,listCaseAccess,setCaseAccess,setDocumentVisibility,listDocumentAccess,setDocumentAccess} from './platform/case-access-p0.mjs';
import {listMyToolAccess,listMemberToolPermissions,setMemberToolPermissionsBulk,adminListMemberTools,adminSetMemberTools} from './platform/member-tools-p0.mjs';
import {listCatalog,createCatalogItem,updateCatalogItem,archiveCatalogItem} from './platform/operations-catalog.mjs';
import {listExpenses,createExpense,updateExpense,archiveExpense,listExpenseBudgets,setExpenseBudget,monthlyExpenseReport} from './platform/operations-expenses.mjs';
import {listPayments,createPayment,updatePayment,archivePayment} from './platform/operations-payments.mjs';
import {listInvoices,createInvoice,setInvoiceStatus,archiveInvoice} from './platform/operations-invoices.mjs';
import {reportSummary,exportCsv} from './platform/operations-reports.mjs';
// Tools P2 (024): portal, lealtad, kanban, firmas, lotes, escáner, comisiones.
import {createPortalAccess,listPortalAccess,revokePortalAccess,listPortalRequestsStaff,setPortalRequestStatus,activatePortalAccess,loginPortal,getPortalData,createPortalRequest,logoutPortal} from './platform/operations-portal.mjs';
import {getLoyalty,setLoyaltyConfig,awardLoyaltyForPayment,redeemLoyalty,adjustLoyalty} from './platform/operations-loyalty.mjs';
import {listKanbanBoards,createKanbanBoard,getKanbanBoard,createKanbanPhase,deleteKanbanPhase,createKanbanCard,moveKanbanCard,archiveKanbanCard} from './platform/operations-kanban.mjs';
import {listSignatures,createSignature,getSignature} from './platform/operations-signatures.mjs';
import {listLots,createLot,adjustLot,archiveLot,listExpiringLots} from './platform/operations-lots.mjs';
import {resolveCode} from './platform/operations-scanner.mjs';
import {listCommissions,createCommissionRule,archiveCommissionRule,calculateCommissions,recordProductCommission} from './platform/operations-commissions.mjs';
import {importClientsCsv,importCatalogCsv,importMigrationJson,importClientsForOrg,importCatalogForOrg,importMigrationForOrg} from './platform/import-store.mjs';
// Tools P1-B (023): proveedores, compras, almacenes, caja, CxC y CxP.
import {listSuppliers,createSupplier,updateSupplier,archiveSupplier,listSupplierDocuments,addSupplierDocument,archiveSupplierDocument} from './platform/operations-suppliers.mjs';
import {listPurchaseOrders,getPurchaseOrder,createPurchaseOrder,setPurchaseOrderStatus,receivePurchaseOrder,archivePurchaseOrder} from './platform/operations-purchases.mjs';
import {listWarehouses,createWarehouse,updateWarehouse,archiveWarehouse,transferStock} from './platform/operations-warehouses.mjs';
import {listCashboxes,openCashbox,addCashboxMovement,recordCashboxCount,closeCashbox} from './platform/operations-cashbox.mjs';
import {listReceivables,openReceivable,recordReceivableInstallment,archiveReceivable} from './platform/operations-receivables.mjs';
import {listPayables,getPayable,createPayable,setPayableStatus,recordPayableInstallment,archivePayable} from './platform/operations-payables.mjs';
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
<details><summary>Suites<svg class="hubie-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary><div class="hubie-submenu"><a href="/suite.html">Explorar Suites</a><a href="/suite.html">Beauty · Health · Realty · Commerce · Food · Office · Jobs · Pet · Academy · Events</a></div></details>
<details><summary>Tools<svg class="hubie-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary><div class="hubie-submenu"><a href="/tools.html">Explorar herramientas</a><a href="/tools.html#crm">CRM y clientes</a><a href="/tools.html#inventario">Inventario</a><a href="/tools.html#agenda">Agenda</a></div></details>
<details><summary>Soluciones<svg class="hubie-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary><div class="hubie-submenu"><a href="/servicios.html">Servicios profesionales</a><a href="/shop.html">Hubie Shop</a></div></details>
<a href="/precios.html">Cotizador</a><a href="/contacto.html">Contacto</a>
</nav>`;
const navStyles='<link rel="stylesheet" href="/assets/navigation.css">';
const navScript="<script>(function(){\nconst button=document.querySelector('.hubie-menu-toggle');\nconst nav=document.getElementById('hubie-main-nav');\nif(!button||!nav)return;\nconst groups=Array.from(nav.querySelectorAll('details'));\nfunction closeMenu(){\n nav.classList.remove('is-open');\n button.setAttribute('aria-expanded','false');\n button.setAttribute('aria-label','Abrir menú');\n groups.forEach(group=>{group.open=false;});\n}\nbutton.addEventListener('click',()=>{\n const next=!nav.classList.contains('is-open');\n if(!next){closeMenu();return;}\n nav.classList.add('is-open');\n button.setAttribute('aria-expanded','true');\n button.setAttribute('aria-label','Cerrar menú');\n});\ngroups.forEach(group=>group.addEventListener('toggle',()=>{\n if(group.open)groups.forEach(other=>{if(other!==group)other.open=false;});\n}));\ndocument.addEventListener('pointerdown',event=>{\n if(!event.target.closest('.site-header'))closeMenu();\n else if(!event.target.closest('.hubie-navigation details'))groups.forEach(group=>{group.open=false;});\n});\ndocument.addEventListener('keydown',event=>{\n if(event.key==='Escape'){closeMenu();button.focus();}\n});\nnav.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));\nwindow.addEventListener('resize',()=>{if(window.innerWidth>1050)closeMenu();});\n})();</script>";
const sharedHeader="<header class=\"site-header\"><div class=\"container nav\"><a href=\"/index.html\" class=\"hubie-brand\" aria-label=\"Hubie, inicio\"><img src=\"/assets/hubie-logo-official.png\" alt=\"Hubie\" width=\"176\" height=\"46\"></a><button class=\"hubie-menu-toggle\" type=\"button\" aria-expanded=\"false\" aria-controls=\"hubie-main-nav\" aria-label=\"Abrir menú\">☰ <span>Menú</span></button>\n<nav id=\"hubie-main-nav\" class=\"hubie-navigation\" aria-label=\"Navegación principal\">\n<a href=\"/index.html\">Inicio</a>\n<details><summary>Suites<svg class=\"hubie-chevron\" viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M6 9l6 6 6-6\"/></svg></summary><div class=\"hubie-submenu\"><a href=\"/suite.html\">Explorar Suites</a><a href=\"/suite.html\">Beauty · Health · Realty · Commerce · Food · Office · Jobs · Pet · Academy · Events</a></div></details>\n<details><summary>Tools<svg class=\"hubie-chevron\" viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M6 9l6 6 6-6\"/></svg></summary><div class=\"hubie-submenu\"><a href=\"/tools.html\">Explorar herramientas</a><a href=\"/tools.html#crm\">CRM y clientes</a><a href=\"/tools.html#inventario\">Inventario</a><a href=\"/tools.html#agenda\">Agenda</a></div></details>\n<details><summary>Soluciones<svg class=\"hubie-chevron\" viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M6 9l6 6 6-6\"/></svg></summary><div class=\"hubie-submenu\"><a href=\"/servicios.html\">Servicios profesionales</a><a href=\"/shop.html\">Hubie Shop</a></div></details>\n<a href=\"/precios.html\">Cotizador</a><a href=\"/contacto.html\">Contacto</a>\n</nav><a href=\"/contacto.html\" class=\"btn btn--primary btn--sm hubie-header-cta\">Solicitar información</a></div></header>";
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
 const failures=[];
 for(const migration of ['001_core.sql','002_multitenant.sql','003_identity.sql','004_platform_admin.sql','005_google_oidc.sql','006_pwa_records.sql','007_operational_workflows.sql','008_clients.sql','009_appearance.sql','010_media.sql','011_cases.sql','012_case_documents.sql','013_entity_relationships.sql','014_satisfaction.sql','015_billing.sql','016_commerce.sql','017_media_limit.sql','018_onboarding.sql','020_notifications.sql','021_tools_p0.sql','022_tools_p1a.sql','023_tools_p1b.sql','024_tools_p2.sql','025_drop_tenant_domains.sql']){
  const sql=await readFile(resolve(root,'turso/migrations',migration),'utf8');
  const statements=executableStatements(sql);
  for(let i=0;i<statements.length;i++){
   try{await executeSql(statements[i]);}
   catch(error){
    // SQLite no hace idempotente ALTER TABLE ADD COLUMN: en la segunda
    // aplicación la columna ya existe ('duplicate column name'). No es un
    // fallo: la migración ya está aplicada; se registra como tal y no se
    // cuenta en failures (023_tools_p1b.sql, tenant_expenses.supplier_id).
    if(/duplicate column/i.test(error?.message||'')){
     console.log(`Migration already applied: ${migration} #${i}: ${statements[i].slice(0,80).replace(/\s+/g,' ')}`);
     continue;
    }
    // Best-effort: one rejected statement must not abort the other 90, and the
    // Render log must name the exact file/statement instead of a bare error code.
    const snippet=statements[i].slice(0,120).replace(/\s+/g,' ');
    console.error(`Migration failed: ${migration} #${i}: ${snippet} :: ${error?.message||error} (${error?.code||error?.name||'unknown'})`);
    failures.push(migration+' #'+i);
   }
  }
 }
 if(failures.length)console.error('Migration failures: '+failures.join(', ')+'; /healthz reports the table count');
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
const rowsOf=r=>r?.rows?.map(row=>row.map(x=>x?.value??null))??[];
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
  const status=message==='Unauthorized'?401:message==='Forbidden'||message==='Tool disabled'||message==='Authentication required'?403:['Not found','Client not found','Deal not found','Template not found','Evidence not found','Assignee not found'].includes(message)?404:['Schedule conflict','Duplicate SKU','Duplicate variant SKU','Insufficient stock','Duplicate client email','Duplicate relation','Relation mismatch','Duplicate invitation','Duplicate loyalty earn','Duplicate lot','Duplicate kanban card','Duplicate commission rule','Duplicate commission entry','Insufficient loyalty points','Insufficient lot stock'].includes(message)?409:message==='Invitation expired'||message==='Invitation already used'?410:message==='Token expired'||message==='Token consumed'?400:message==='Unsupported media type'?415:message==='Payload too large'?413:message==='Storage quota exceeded'?409:message.startsWith('Invalid')||message==='Payload too large'||message==='Read only tool'?400:503;
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
  // Activación del cliente (018): canje del enlace de un solo uso (24 h).
  // Verifica el correo, abre sesión y lleva al cliente a su empresa. El
  // token inválido, expirado o ya usado redirige con onboarding=invalid.
  if(pathname==='/api/onboarding/activate'){
    if(req.method!=='GET'){res.writeHead(405,{'allow':'GET'});res.end();return;}
    if(!configurationStatus().databaseConfigured||!(await migrationsReady)){res.writeHead(503,{'content-type':'text/plain; charset=utf-8'});res.end('La base de datos no está inicializada');return;}
    try{
      const token=new URL(req.url,'http://localhost').searchParams.get('token')||'';
      const redeemed=await redeemSetupToken(token);
      await executeSql('UPDATE users SET email_verified_at=? WHERE id=?',[new Date().toISOString(),redeemed.userId]);
      const session=await createSession(redeemed.userId);
      const tenant=await executeSql('SELECT slug FROM organizations WHERE id=?',[redeemed.organizationId]);
      const slug=rowsOf(tenant)[0]?.[0];
      const location='/app/'+(slug?'?tenant='+encodeURIComponent(slug)+'&onboarding=activated':'?onboarding=activated');
      res.writeHead(303,{'location':location,'set-cookie':'__Host-hubie_session='+encodeURIComponent(session.token)+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400','cache-control':'no-store'});res.end();
    }catch{res.writeHead(303,{'location':'/app/?onboarding=invalid','cache-control':'no-store'});res.end();}
    return;
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
     {methods:['GET','POST'],maxBytes:13_600_000});
  }
  const documentEditPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/case-documents\/([0-9a-f-]{36})$/);
  if(documentEditPath){
    return processApi(req,res,async({token,body})=>({document:await updateCaseDocument(token,documentEditPath[1],documentEditPath[2],body)}),
      {methods:['PATCH']});
  }
  // TOOLS P0: búsqueda y vencimientos de documentos, vínculos y acceso de expedientes (C003).
  const caseDocsSearchPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/cases\/documents\/search$/);
  if(caseDocsSearchPath){
   const query=new URL(req.url,'http://localhost').searchParams;
   return processApi(req,res,async({token})=>searchCaseDocuments(token,caseDocsSearchPath[1],
    {q:query.get('q')||'',documentType:query.get('type')||'',expiry:query.get('expiry')||'',caseId:query.get('caseId')||''}),{methods:['GET']});
  }
  const caseDocsExpiringPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/cases\/documents\/expiring$/);
  if(caseDocsExpiringPath)return processApi(req,res,async({token})=>listExpiringDocuments(token,caseDocsExpiringPath[1]),{methods:['GET']});
  const caseLinksPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/cases\/([0-9a-f-]{36})\/links$/);
  if(caseLinksPath)return processApi(req,res,async({token})=>getCaseLinks(token,caseLinksPath[1],caseLinksPath[2]),{methods:['GET']});
  const caseAccessPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/cases\/([0-9a-f-]{36})\/access$/);
  if(caseAccessPath){
   const slug=caseAccessPath[1],caseId=caseAccessPath[2];
   return processApi(req,res,async({token,body})=>{
    if(req.method==='GET')return listCaseAccess(token,slug,caseId);
    return setCaseAccess(token,slug,caseId,body?.userId,body?.access??null);
   },{methods:['GET','PUT']});
  }
  const docVisibilityPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/case-documents\/([0-9a-f-]{36})\/visibility$/);
  if(docVisibilityPath)return processApi(req,res,async({token,body})=>setDocumentVisibility(token,docVisibilityPath[1],docVisibilityPath[2],body?.visibility),{methods:['PATCH']});
  const docAccessPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/case-documents\/([0-9a-f-]{36})\/access$/);
  if(docAccessPath){
   const slug=docAccessPath[1],documentId=docAccessPath[2];
   return processApi(req,res,async({token,body})=>{
    if(req.method==='GET')return listDocumentAccess(token,slug,documentId);
    return setDocumentAccess(token,slug,documentId,body?.userId,body?.access??null);
   },{methods:['GET','PUT']});
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
  // Auditoría consultable (P0): superadmin ve todo; el filtro tenant es opcional.
  if(pathname==='/api/admin/audit'){
    return processApi(req,res,async()=>{
      const query=new URL(req.url,'http://localhost').searchParams;
      return {events:await listAuditEvents({organizationId:query.get('tenant')||null,actor:query.get('actor')||null,action:query.get('action')||null,from:query.get('from')||null,to:query.get('to')||null,limit:query.get('limit')||undefined}),actions:KNOWN_AUDIT_ACTIONS};
    },{admin:true,methods:['GET']});
  }
  // Invitaciones por correo (P0) en Madre: crear/listar/revocar/reenviar por empresa.
  const adminInvites=pathname.match(/^\/api\/admin\/tenants\/([0-9a-f-]{36})\/invitations(?:\/([0-9a-f-]{36}))?(?:\/(resend))?$/);
  if(adminInvites){
    const id=adminInvites[1],invId=adminInvites[2],action=adminInvites[3];
    return processApi(req,res,async({actor,body})=>{
      const origin=(process.env.HUBIE_PUBLIC_ORIGIN||'').replace(/\/$/,'')||('http://localhost:'+port);
      if(action==='resend')return resendInvitation({organizationId:id,invitationId:invId,actorId:actor,origin});
      if(invId&&req.method==='DELETE')return revokeInvitation({organizationId:id,invitationId:invId,actorId:actor});
      if(req.method==='GET')return {invitations:await listInvitations(id),emailConfigured:emailConfigured()};
      return createInvitation({organizationId:id,email:body?.email,role:body?.role,createdBy:actor,origin});
    },{admin:true,methods:action==='resend'?['POST']:invId?['DELETE']:['GET','POST']});
  }
  // TOOLS P0 (C009): permisos por módulo y por miembro, gestionados por el superadmin.
  const adminMemberToolsPath=pathname.match(/^\/api\/admin\/tenants\/([0-9a-f-]{36})\/members\/([0-9a-f-]{36})\/tools$/);
  if(adminMemberToolsPath){
    return processApi(req,res,async({actor,body})=>{
      if(req.method==='GET')return adminListMemberTools(adminMemberToolsPath[1]);
      return adminSetMemberTools(adminMemberToolsPath[1],adminMemberToolsPath[2],body?.tools,actor);
    },{admin:true,methods:['GET','PUT']});

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
  // Auditoría del propio tenant (P0): cualquier miembro ve solo su empresa.
  const appAudit=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/audit$/);
  if(appAudit){
    return processApi(req,res,async({token})=>{
      const tenant=await resolveTenant(appAudit[1]);
      if(!tenant)throw Error('Not found');
      await requireTenantSession(token,tenant.id);
      const query=new URL(req.url,'http://localhost').searchParams;
      return {events:await listAuditEvents({organizationId:tenant.id,actor:query.get('actor')||null,action:query.get('action')||null,from:query.get('from')||null,to:query.get('to')||null,limit:query.get('limit')||undefined}),actions:KNOWN_AUDIT_ACTIONS};
    },{methods:['GET']});
  }
  // Invitaciones por correo (P0) en cliente: solo owner/admin del tenant.
  const appInvites=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/invitations(?:\/([0-9a-f-]{36}))?(?:\/(resend))?$/);
  if(appInvites){
    const slug=appInvites[1],invId=appInvites[2],action=appInvites[3];
    return processApi(req,res,async({token,body})=>{
      const tenant=await resolveTenant(slug);
      if(!tenant)throw Error('Not found');
      const session=await requireTenantSession(token,tenant.id,['owner','admin']);
      const origin=(process.env.HUBIE_PUBLIC_ORIGIN||'').replace(/\/$/,'')||('http://localhost:'+port);
      if(action==='resend')return resendInvitation({organizationId:tenant.id,invitationId:invId,actorId:session.userId,origin});
      if(invId&&req.method==='DELETE')return revokeInvitation({organizationId:tenant.id,invitationId:invId,actorId:session.userId});
      if(req.method==='GET')return {invitations:await listInvitations(tenant.id),emailConfigured:emailConfigured()};
      return createInvitation({organizationId:tenant.id,email:body?.email,role:body?.role,createdBy:session.userId,origin});
    },{methods:action==='resend'?['POST']:invId?['DELETE']:['GET','POST']});
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
  // TOOLS P0: línea de tiempo y deduplicación de clientes (C001).
  const clientTimelinePath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/clients\/([0-9a-f-]{36})\/timeline$/);
  if(clientTimelinePath)return processApi(req,res,async({token})=>getClientTimeline(token,clientTimelinePath[1],clientTimelinePath[2]),{methods:['GET']});
  const clientDuplicatesPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/clients\/duplicates$/);
  if(clientDuplicatesPath)return processApi(req,res,async({token})=>findDuplicateClients(token,clientDuplicatesPath[1]),{methods:['GET']});
  const clientMergePath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/clients\/([0-9a-f-]{36})\/merge$/);
  if(clientMergePath)return processApi(req,res,async({token,body})=>mergeClients(token,clientMergePath[1],{keptClientId:clientMergePath[2],mergedClientId:body?.mergedClientId,reason:body?.reason}),{methods:['POST']});
  // TOOLS P0: tareas y cotizaciones del trato (C002).
  const dealTasksPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/crm\/([0-9a-f-]{36})\/tasks(?:\/([0-9a-f-]{36}))?$/);
  if(dealTasksPath){
   const slug=dealTasksPath[1],dealId=dealTasksPath[2],taskId=dealTasksPath[3];
   return processApi(req,res,async({token,body})=>{
    if(req.method==='GET')return listDealTasks(token,slug,dealId);
    if(req.method==='POST')return createDealTask(token,slug,dealId,body);
    if(req.method==='DELETE')return archiveDealTask(token,slug,dealId,taskId);
    return updateDealTask(token,slug,dealId,taskId,body);
   },{methods:taskId?['PATCH','DELETE']:['GET','POST']});
  }
  const dealQuotesPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/crm\/([0-9a-f-]{36})\/quotes(?:\/([0-9a-f-]{36}))?$/);
  if(dealQuotesPath){
   const slug=dealQuotesPath[1],dealId=dealQuotesPath[2],quoteId=dealQuotesPath[3];
   return processApi(req,res,async({token})=>{
    if(req.method==='GET')return listDealQuotes(token,slug,dealId);
    if(req.method==='POST')return linkDealQuote(token,slug,dealId,quoteId);
    return unlinkDealQuote(token,slug,dealId,quoteId);
   },{methods:quoteId?['POST','DELETE']:['GET']});
  }
  const quoteDealPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/quotes\/([0-9a-f-]{36})\/deal$/);
  if(quoteDealPath)return processApi(req,res,async({token})=>getQuoteDeal(token,quoteDealPath[1],quoteDealPath[2]),{methods:['GET']});
  // TOOLS P0: acceso efectivo por módulo del miembro actual y gestión de
  // permisos por miembro (C009; owner/admin del tenant).
  const memberToolsPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/member-tools(?:\/([0-9a-f-]{36}))?$/);
  if(memberToolsPath){
   const slug=memberToolsPath[1],userId=memberToolsPath[2];
   return processApi(req,res,async({token,body})=>{
    if(req.method==='GET')return userId?listMemberToolPermissions(token,slug):listMyToolAccess(token,slug);
    return setMemberToolPermissionsBulk(token,slug,userId,body?.tools);
   },{methods:userId?['GET','PUT']:['GET']});
  }
  const surveyPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/surveys(?:\/([0-9a-f-]{36}))?(?:\/(invitations|report))?$/);
  if(surveyPath){
    const slug=surveyPath[1],id=surveyPath[2],action=surveyPath[3];
    const methods=action==='invitations'?['POST']:action==='report'?['GET']:id?['PATCH']:['GET','POST'];
    return processApi(req,res,async({token,body})=>{
      if(action==='invitations')return createSurveyInvitation(token,slug,id,body);
      if(action==='report')return surveyReport(token,slug,id);
      if(id)return setSurveyStatus(token,slug,id,body);
      return req.method==='GET'?listSurveys(token,slug):createSurvey(token,slug,body);
    },{methods,maxBytes:12000});
  }
  const surveyPublic=pathname.match(/^\/api\/public\/surveys\/([A-Za-z0-9_-]{32})$/);
  if(surveyPublic){
    if(!['GET','POST'].includes(req.method)){res.writeHead(405,{'allow':'GET, POST'});res.end();return;}
    if(req.method==='POST'&&!sameOrigin(req))return sendApi(res,403,{error:'Origin forbidden'});
    if(!configurationStatus().databaseConfigured||!(await migrationsReady))return sendApi(res,503,{error:'Encuestas temporalmente no disponibles'});
    try{
      const result=req.method==='GET'?await publicSurvey(surveyPublic[1]):
       await submitSurvey(surveyPublic[1],await readApiBody(req,7000));
      return sendApi(res,req.method==='GET'?200:201,result);
    }catch(e){
      const msg=e?.message||'';
      const status=msg==='Survey link unavailable'?404:msg==='Invalid answers'||msg==='Invalid survey token'?400:msg==='Unsupported media type'?415:msg==='Payload too large'?413:503;
      return sendApi(res,status,{error:status===503?'No fue posible registrar tu respuesta':status===404?'Este enlace ya no está disponible':msg});
    }
  }
  // Portal público (T001): sin sesión staff; la sesión del portal viaja
  // como query param ?session=<token> (hash SHA-256 guardado, 12 h).
  const portalPublic=pathname.match(/^\/api\/portal\/([a-z0-9-]{3,63})\/(activate|login|me|requests|logout)$/);
  if(portalPublic){
    const slug=portalPublic[1],action=portalPublic[2];
    const session=new URL(req.url,'http://localhost').searchParams.get('session')||'';
    if(req.method==='POST'&&!sameOrigin(req))return sendApi(res,403,{error:'Origin forbidden'});
    if(!configurationStatus().databaseConfigured||!(await migrationsReady))return sendApi(res,503,{error:'Portal temporalmente no disponible'});
    try{
      const body=['GET','HEAD'].includes(req.method)?null:await readApiBody(req,4000);
      let result;
      if(action==='activate')result=await activatePortalAccess(slug,body?.token,body);
      if(action==='login')result=await loginPortal(slug,body);
      if(action==='me')result=await getPortalData(slug,session);
      if(action==='requests')result=await createPortalRequest(slug,session,body);
      if(action==='logout')result=await logoutPortal(slug,session);
      return sendApi(res,action==='activate'||action==='login'||action==='requests'?201:200,result);
    }catch(e){
      const msg=e?.message||'';
      const status=msg==='Unauthorized'?401:['Not found','Token expired','Token consumed'].includes(msg)?404:msg.startsWith('Invalid')?400:503;
      return sendApi(res,status,{error:status===503?'Portal temporalmente no disponible':msg});
    }
  }
  // Invitación pública (P0): vista previa sin sesión y aceptación con sesión.
  if(pathname==='/invitacion'){
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    try{
      const html=await readFile(resolve(root,'invitacion.html'),'utf8');
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:html);
    }catch{res.writeHead(404);res.end('Not found');}
    return;
  }
  if(pathname==='/api/public/invitations'){
    if(!['GET','POST'].includes(req.method)){res.writeHead(405,{'allow':'GET, POST'});res.end();return;}
    if(req.method==='POST'&&!sameOrigin(req))return sendApi(res,403,{error:'Origin forbidden'});
    if(!configurationStatus().databaseConfigured||!(await migrationsReady))return sendApi(res,503,{error:'Invitación temporalmente no disponible'});
    try{
      if(req.method==='GET'){
        const token=new URL(req.url,'http://localhost').searchParams.get('token')||'';
        const found=await lookupInvitation(token);
        if(found.status==='not-found')return sendApi(res,404,{error:'Invitation not found'});
        return sendApi(res,200,{status:found.status,invitation:found.invitation});
      }
      const session=await verifySession(readSessionCookie(req.headers.cookie));
      if(!session)return sendApi(res,401,{error:'Unauthorized'});
      const accepted=await acceptInvitation({token:(await readApiBody(req,2000))?.token,userId:session.userId});
      return sendApi(res,201,accepted);
    }catch(e){
      const msg=e?.message||'';
      const status=msg==='Unauthorized'?401:msg==='Not found'||msg==='Invitation not found'?404:msg==='Invitation expired'||msg==='Invitation already used'?410:['Invalid JSON','Unsupported media type'].includes(msg)?400:503;
      return sendApi(res,status,{error:status===503?'No se pudo procesar la invitación':msg});
    }
  }
  // Tools P2 (T001/T002/T005/T006/T011/T012/T019). Rutas staff con sesión.
  const portalStaff=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/portal(?:\/([0-9a-f-]{36}))?(?:\/(requests(?:\/([0-9a-f-]{36}))?))?$/);
  if(portalStaff){
    const slug=portalStaff[1],id=portalStaff[2],reqId=portalStaff[4];
    return processApi(req,res,async({token,body})=>{
      if(portalStaff[3]==='requests'&&reqId)return setPortalRequestStatus(token,slug,reqId,body?.status);
      if(portalStaff[3]==='requests')return listPortalRequestsStaff(token,slug);
      if(req.method==='GET')return listPortalAccess(token,slug);
      if(req.method==='POST')return createPortalAccess(token,slug,body);
      return revokePortalAccess(token,slug,id);
    },{methods:reqId?['PATCH']:id?['DELETE']:['GET','POST']});
  }
  const loyaltyPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/loyalty(?:\/(config|redeem|adjust|earn\/([0-9a-f-]{36})))?$/);
  if(loyaltyPath){
    const slug=loyaltyPath[1],action=loyaltyPath[2],paymentId=loyaltyPath[3];
    return processApi(req,res,async({token,body})=>{
      if(action==='config')return setLoyaltyConfig(token,slug,body);
      if(action==='redeem')return redeemLoyalty(token,slug,body);
      if(action==='adjust')return adjustLoyalty(token,slug,body);
      if(paymentId)return awardLoyaltyForPayment(token,slug,paymentId);
      return getLoyalty(token,slug);
    },{methods:action||paymentId?['POST','PATCH']:['GET']});
  }
  const kanbanPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/kanban(?:\/([0-9a-f-]{36}))?(?:\/(phases|cards)(?:\/([0-9a-f-]{36}))?(?:\/(move))?)?$/);
  if(kanbanPath){
    const slug=kanbanPath[1],boardId=kanbanPath[2],section=kanbanPath[3],subId=kanbanPath[4],action=kanbanPath[5];
    return processApi(req,res,async({token,body})=>{
      if(!boardId)return req.method==='GET'?listKanbanBoards(token,slug):createKanbanBoard(token,slug,body);
      if(section==='phases'&&subId&&req.method==='DELETE')return deleteKanbanPhase(token,slug,boardId,subId);
      if(section==='phases')return createKanbanPhase(token,slug,boardId,body);
      if(section==='cards'&&action==='move')return moveKanbanCard(token,slug,boardId,subId,body);
      if(section==='cards'&&subId&&req.method==='DELETE')return archiveKanbanCard(token,slug,boardId,subId);
      if(section==='cards')return createKanbanCard(token,slug,boardId,body);
      return getKanbanBoard(token,slug,boardId);
    },{methods:!boardId?['GET','POST']:section==='phases'&&subId?['DELETE']:section==='cards'&&subId?['PATCH','DELETE']:['GET','POST']});
  }
  const signaturesPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/signatures(?:\/([0-9a-f-]{36}))?$/);
  if(signaturesPath){
    const slug=signaturesPath[1],id=signaturesPath[2];
    return processApi(req,res,async({token,body})=>{
      if(req.method==='GET')return id?getSignature(token,slug,id):listSignatures(token,slug);
      return createSignature(token,slug,body);
    },{methods:id?['GET']:['GET','POST'],maxBytes:300000});
  }
  const lotsPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/lots(?:\/([0-9a-f-]{36}))?(?:\/(expiring))?$/);
  if(lotsPath){
    const slug=lotsPath[1],id=lotsPath[2],action=lotsPath[3];
    return processApi(req,res,async({token,body})=>{
      if(action==='expiring')return listExpiringLots(token,slug,body||{});
      if(req.method==='GET')return listLots(token,slug);
      if(req.method==='POST')return createLot(token,slug,body);
      if(req.method==='DELETE')return archiveLot(token,slug,id);
      return adjustLot(token,slug,id,body);
    },{methods:action==='expiring'?['GET']:id?['PATCH','DELETE']:['GET','POST']});
  }
  const scannerPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/scanner\/resolve$/);
  if(scannerPath){
    return processApi(req,res,async({token,body})=>resolveCode(token,scannerPath[1],body),{methods:['POST']});
  }
  const commissionsPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/commissions(?:\/(rules|calculate|product)(?:\/([0-9a-f-]{36}))?)?$/);
  if(commissionsPath){
    const slug=commissionsPath[1],section=commissionsPath[2],id=commissionsPath[3];
    return processApi(req,res,async({token,body})=>{
      if(section==='rules'&&id&&req.method==='DELETE')return archiveCommissionRule(token,slug,id);
      if(section==='rules')return createCommissionRule(token,slug,body);
      if(section==='calculate')return calculateCommissions(token,slug,body);
      if(section==='product')return recordProductCommission(token,slug,body);
      return listCommissions(token,slug,body||{});
    },{methods:section?['POST','DELETE']:['GET']});
  }
  const workflowPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/(clients|crm|agenda|inventory)(?:\/([0-9a-f-]{36}))?(?:\/(movements))?$/);
  if(workflowPath){
    const slug=workflowPath[1],module=workflowPath[2],id=workflowPath[3],action=workflowPath[4];
    const query=new URL(req.url,'http://localhost').searchParams;
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
        if(req.method==='GET')return listAppointments(token,slug,{view:query.get('view')||'list',date:query.get('date')});
        if(req.method==='POST')return createAppointment(token,slug,body);
        return updateAppointment(token,slug,id,body);
      }
      if(req.method==='GET')return listInventory(token,slug);
      if(action==='movements')return moveStock(token,slug,id,body);
      if(id)return updateStockItem(token,slug,id,body);
      return createStockItem(token,slug,body);
    },{methods});
  }
  // TOOLS P1-A (C004 variantes ya van por workflows/inventory; aquí van las
  // variantes de inventario, T003 checklists, T004 tareas, T007 formularios
  // y C008 dashboard). La migración 022 y el conteo de /healthz NO se tocan
  // aquí: los cablea el integrador (ver INTEGRATION.md).
  const variantPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/inventory\/([0-9a-f-]{36})\/variants(?:\/([0-9a-f-]{36}))?$/);
  if(variantPath){
    const slug=variantPath[1],itemId=variantPath[2],variantId=variantPath[3];
    return processApi(req,res,async({token,body})=>{
      if(req.method==='POST')return createVariant(token,slug,itemId,body);
      if(req.method==='DELETE')return archiveVariant(token,slug,itemId,variantId);
      return updateVariant(token,slug,itemId,variantId,body);
    },{methods:variantId?['PATCH','DELETE']:['POST']});
  }
  const dashboardPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/dashboard(?:\/(goals))?$/);
  if(dashboardPath){
    const slug=dashboardPath[1],goals=dashboardPath[2];
    const query=new URL(req.url,'http://localhost').searchParams;
    return processApi(req,res,async({token,body})=>{
      if(goals)return req.method==='GET'?listDashboardGoals(token,slug):setDashboardGoal(token,slug,body);
      return getDashboard(token,slug,{from:query.get('from'),to:query.get('to'),module:query.get('module')});
    },{methods:goals?['GET','POST']:['GET']});
  }
  const checklistPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/checklists(?:\/(templates|[0-9a-f-]{36}))?(?:\/(items))?(?:\/([0-9a-f-]{36}))?$/);
  if(checklistPath){
    const slug=checklistPath[1],id=checklistPath[2],items=checklistPath[3],itemId=checklistPath[4];
    const methods=id==='templates'?['GET','POST']:items==='items'&&itemId?['PATCH']:items==='items'?['POST']:id?['DELETE']:['GET','POST'];
    return processApi(req,res,async({token,body})=>{
      if(id==='templates')return req.method==='GET'?listChecklistTemplates(token,slug):createChecklistTemplate(token,slug,body);
      if(items==='items'&&itemId)return toggleChecklistItem(token,slug,id,itemId,body);
      if(items==='items')return addChecklistItem(token,slug,id,body);
      if(id)return archiveChecklist(token,slug,id);
      return req.method==='GET'?listChecklists(token,slug):createChecklist(token,slug,body);
    },{methods});
  }
  const taskPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/tasks(?:\/([0-9a-f-]{36}))?$/);
  if(taskPath){
    const slug=taskPath[1],id=taskPath[2];
    const query=new URL(req.url,'http://localhost').searchParams;
    return processApi(req,res,async({token,body})=>{
      if(req.method==='GET')return listTasks(token,slug,{assignee:query.get('assignee'),status:query.get('status'),
       overdue:query.get('overdue')==='1',dueFrom:query.get('dueFrom'),dueTo:query.get('dueTo')});
      if(req.method==='POST')return createTask(token,slug,body);
      if(req.method==='DELETE')return archiveTask(token,slug,id);
      return updateTask(token,slug,id,body);
    },{methods:id?['PATCH','DELETE']:['GET','POST']});
  }
  const formExportPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/forms\/([0-9a-f-]{36})\/submissions\/export$/);
  if(formExportPath){
    if(req.method!=='GET'){res.writeHead(405,{'allow':'GET'});res.end();return;}
    if(!configurationStatus().readyForLive||!(await migrationsReady))return sendApi(res,503,{error:'La base de datos no está inicializada'});
    try{
      const token=readSessionCookie(req.headers.cookie);
      const {filename,csv}=await exportSubmissionsCsv(token,formExportPath[1],formExportPath[2]);
      res.writeHead(200,{'content-type':'text/csv; charset=utf-8','cache-control':'no-store',
        'content-disposition':'attachment; filename="'+filename+'"','x-content-type-options':'nosniff'});
      res.end(csv);return;
    }catch(error){
      const msg=error?.message||'';
      return sendApi(res,msg==='Unauthorized'?401:msg==='Forbidden'||msg==='Tool disabled'?403:msg==='Not found'?404:503,
        {error:msg==='Not found'?'Exportación no disponible':'No se pudo exportar'});
    }
  }
  const formPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/forms(?:\/([0-9a-f-]{36}))?(?:\/(submissions))?$/);
  if(formPath){
    const slug=formPath[1],id=formPath[2],submissions=formPath[3];
    const methods=submissions?['GET','POST']:id?['PATCH','DELETE']:['GET','POST'];
    return processApi(req,res,async({token,body})=>{
      if(submissions)return req.method==='GET'?listSubmissions(token,slug,id):submitForm(token,slug,id,body);
      if(id&&req.method==='DELETE')return archiveForm(token,slug,id);
      if(id)return updateForm(token,slug,id,body);
      return req.method==='GET'?listForms(token,slug):createForm(token,slug,body);
    },{methods});
  }
  // Commerce tools reales (T013/C006/C007/T014/T015/T020). Nada de cobro/Stripe aquí.
  const reportsExport=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/reports\/export$/);
  if(reportsExport){
    if(req.method!=='GET'){res.writeHead(405,{'allow':'GET'});res.end();return;}
    if(!configurationStatus().readyForLive||!(await migrationsReady))return sendApi(res,503,{error:'La base de datos no está inicializada'});
    try{
      const token=readSessionCookie(req.headers.cookie);
      const kind=new URL(req.url,'http://localhost').searchParams.get('kind');
      const {filename,csv}=await exportCsv(token,reportsExport[1],kind);
      res.writeHead(200,{'content-type':'text/csv; charset=utf-8','cache-control':'no-store',
        'content-disposition':'attachment; filename="'+filename+'"','x-content-type-options':'nosniff'});
      res.end(csv);return;
    }catch(error){
      const msg=error?.message||'';
      return sendApi(res,msg==='Unauthorized'?401:msg==='Forbidden'||msg==='Tool disabled'?403:msg==='Not found'?404:503,
        {error:msg==='Not found'?'Exportación no disponible':'No se pudo exportar'});
    }
  }
  // Importación CSV (P0) + migración JSON E004. El cuerpo es JSON {csv} o el
  // JSON de migración; el límite de 600 KB cubre 500 filas con holgura.
  const clientsImportPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/clients\/import$/);
  if(clientsImportPath){
    return processApi(req,res,async({token,body})=>importClientsCsv(token,clientsImportPath[1],body?.csv),
      {methods:['POST'],maxBytes:600_000});
  }
  const catalogImportPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/catalog\/import$/);
  if(catalogImportPath){
    return processApi(req,res,async({token,body})=>importCatalogCsv(token,catalogImportPath[1],body?.csv),
      {methods:['POST'],maxBytes:600_000});
  }
  const migrationPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/migration$/);
  if(migrationPath){
    return processApi(req,res,async({token,body})=>importMigrationJson(token,migrationPath[1],body),
      {methods:['POST'],maxBytes:600_000});
  }
  const adminImportPath=pathname.match(/^\/api\/admin\/tenants\/([0-9a-f-]{36})\/import$/);
  if(adminImportPath){
    return processApi(req,res,async({actor,body})=>{
      const id=adminImportPath[1];
      if(body?.kind==='clients')return importClientsForOrg(id,actor,body?.csv);
      if(body?.kind==='catalog')return importCatalogForOrg(id,actor,body?.csv);
      if(body?.kind==='migration')return importMigrationForOrg(id,actor,body?.payload);
      throw Error('Invalid import');
    },{admin:true,methods:['POST'],maxBytes:600_000});
  }
  const commercePath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/(quotes|catalog|expenses|payments|invoices|reports)(?:\/([0-9a-f-]{36}))?(?:\/(send|accept|reject|draft|issued|cancelled))?$/);
  if(commercePath){
    const slug=commercePath[1],module=commercePath[2],id=commercePath[3],action=commercePath[4];
    const query=new URL(req.url,'http://localhost').searchParams;
    const methods=action?['POST']:module==='reports'?['GET']:module==='invoices'?(id?['DELETE']:['GET','POST']):id?['PATCH','DELETE']:['GET','POST'];
    return processApi(req,res,async({token,body})=>{
      if(module==='quotes'){
        if(action)return setQuoteStatus(token,slug,id,action==='send'?'sent':action==='accept'?'accepted':action==='reject'?'rejected':'draft');
        if(req.method==='GET')return id?getQuote(token,slug,id):listQuotes(token,slug);
        if(req.method==='POST')return createQuote(token,slug,body);
        if(req.method==='DELETE')return archiveQuote(token,slug,id);
        return updateQuote(token,slug,id,body);
      }
      if(module==='catalog'){
        if(req.method==='GET')return listCatalog(token,slug);
        if(req.method==='POST')return createCatalogItem(token,slug,body);
        if(req.method==='DELETE')return archiveCatalogItem(token,slug,id);
        return updateCatalogItem(token,slug,id,body);
      }
      if(module==='expenses'){
        if(req.method==='GET')return listExpenses(token,slug,{from:query.get('from'),to:query.get('to'),category:query.get('category')});
        if(req.method==='POST')return createExpense(token,slug,body);
        if(req.method==='DELETE')return archiveExpense(token,slug,id);
        return updateExpense(token,slug,id,body);
      }
      if(module==='payments'){
        if(req.method==='GET')return listPayments(token,slug);
        if(req.method==='POST')return createPayment(token,slug,body);
        if(req.method==='DELETE')return archivePayment(token,slug,id);
        return updatePayment(token,slug,id,body);
      }
      if(module==='invoices'){
        if(action)return setInvoiceStatus(token,slug,id,action);
        if(req.method==='GET')return listInvoices(token,slug);
        if(req.method==='POST')return createInvoice(token,slug,body);
        return archiveInvoice(token,slug,id);
      }
      return reportSummary(token,slug,{month:query.get('month')});
    },{methods});
  }
  // Tools P1-B (023): proveedores (T009), compras (T008), almacenes (T010),
  // caja (T016), cuentas por cobrar (T017), cuentas por pagar (T018) y
  // presupuestos/reporte mensual de gastos (C007). La migración 023 y el
  // conteo de /healthz los cablea el integrador (ver INTEGRATION.md).
  const p1bPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/(suppliers|purchases|warehouses|cashbox|receivables|payables)(?:\/([0-9a-f-]{36}))?(?:\/(documents|receive|send|cancel|transfer|movements|count|close|installments|approve|pay))?$/);
  const expenseP1bPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/workflows\/expenses\/(budgets|report)$/);
  if(p1bPath||expenseP1bPath){
    const slug=(p1bPath||expenseP1bPath)[1];
    const module=p1bPath?p1bPath[2]:'expenses',id=p1bPath?p1bPath[3]:null,action=p1bPath?p1bPath[4]:(expenseP1bPath[2]==='budgets'?'budgets':'report');
    const query=new URL(req.url,'http://localhost').searchParams;
    const methods=action==='report'||(!id&&!action)?['GET','POST']:action?['POST']:id?['PATCH','DELETE']:['GET','POST'];
    return processApi(req,res,async({token,body})=>{
      if(module==='suppliers'){
        if(action==='documents'){
          if(req.method==='GET')return listSupplierDocuments(token,slug,id);
          if(body?.archiveDocumentId)return archiveSupplierDocument(token,slug,id,body.archiveDocumentId);
          return addSupplierDocument(token,slug,id,body);
        }
        if(req.method==='GET')return listSuppliers(token,slug);
        if(req.method==='POST')return createSupplier(token,slug,body);
        if(req.method==='DELETE')return archiveSupplier(token,slug,id);
        return updateSupplier(token,slug,id,body);
      }
      if(module==='purchases'){
        if(action==='receive')return receivePurchaseOrder(token,slug,id,body);
        if(action==='send'||action==='cancel')return setPurchaseOrderStatus(token,slug,id,action==='send'?'sent':'cancelled');
        if(req.method==='GET')return id?getPurchaseOrder(token,slug,id):listPurchaseOrders(token,slug);
        if(req.method==='POST')return createPurchaseOrder(token,slug,body);
        return archivePurchaseOrder(token,slug,id);
      }
      if(module==='warehouses'){
        if(action==='transfer')return transferStock(token,slug,body);
        if(req.method==='GET')return listWarehouses(token,slug);
        if(req.method==='POST')return createWarehouse(token,slug,body);
        if(req.method==='DELETE')return archiveWarehouse(token,slug,id);
        return updateWarehouse(token,slug,id,body);
      }
      if(module==='cashbox'){
        if(action==='movements')return addCashboxMovement(token,slug,id,body);
        if(action==='count')return recordCashboxCount(token,slug,id,body);
        if(action==='close')return closeCashbox(token,slug,id,body);
        if(req.method==='GET')return listCashboxes(token,slug);
        return openCashbox(token,slug,body);
      }
      if(module==='receivables'){
        if(action==='installments')return recordReceivableInstallment(token,slug,id,body);
        if(req.method==='GET')return listReceivables(token,slug);
        if(req.method==='POST')return openReceivable(token,slug,body);
        return archiveReceivable(token,slug,id);
      }
      if(module==='payables'){
        if(action==='installments')return recordPayableInstallment(token,slug,id,body);
        if(action==='approve'||action==='pay'||action==='cancel')return setPayableStatus(token,slug,id,action==='approve'?'approved':action==='pay'?'paid':'cancelled');
        if(req.method==='GET')return id?getPayable(token,slug,id):listPayables(token,slug);
        if(req.method==='POST')return createPayable(token,slug,body);
        return archivePayable(token,slug,id);
      }
      if(action==='budgets'){
        if(req.method==='GET')return listExpenseBudgets(token,slug,{month:query.get('month')});
        return setExpenseBudget(token,slug,body);
      }
      return monthlyExpenseReport(token,slug,{month:query.get('month')});
    },{methods});
  }
  const publicQuotePath=pathname.match(/^\/api\/public\/quotes\/([A-Za-z0-9]{32})$/);
  if(publicQuotePath){
    if(!['GET','POST'].includes(req.method)){res.writeHead(405,{'allow':'GET, POST'});res.end();return;}
    if(req.method==='POST'&&!sameOrigin(req))return sendApi(res,403,{error:'Origin forbidden'});
    if(!configurationStatus().databaseConfigured||!(await migrationsReady))return sendApi(res,503,{error:'Cotización temporalmente no disponible'});
    try{
      const result=req.method==='GET'?await publicQuote(publicQuotePath[1]):
       await publicQuoteDecision(publicQuotePath[1],(await readApiBody(req,2000)).action);
      return sendApi(res,req.method==='GET'?200:201,result);
    }catch(e){
      const msg=e?.message||'';
      const status=msg==='Not found'?404:msg==='Invalid quote status'?400:msg==='Unsupported media type'?415:msg==='Payload too large'?413:503;
      return sendApi(res,status,{error:status===503?'No fue posible consultar la cotización':status===404?'Este enlace ya no está disponible':msg});
    }
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
  // Cobro Stripe (modelo híbrido, docs/STRIPE-BILLING.md). Sin claves: 503
  // "Stripe no configurado" y la app sigue funcionando normal.
  if(pathname==='/api/checkout'){
    if(req.method!=='POST'){res.writeHead(405,{'allow':'POST'});res.end();return;}
    if(!stripeConfigured())return sendApi(res,503,{error:'Stripe no configurado'});
    if(!databaseConfigured()||!(await migrationsReady))return sendApi(res,503,{error:'La base de datos no está inicializada'});
    if(!sameOrigin(req))return sendApi(res,403,{error:'Origin forbidden'});
    try{
      const body=await readApiBody(req,8192);
      const email=validateCheckoutEmail(body?.email);
      const organizationId=validateOrganizationId(body?.organizationId);
      const quote=quoteCheckout({suiteId:body?.suiteId,toolIds:body?.toolIds,extras:body?.extras,balanceInstallments:body?.balanceInstallments});
      if(organizationId){
        const exists=await executeSql('SELECT id FROM organizations WHERE id=?',[organizationId]);
        if(!rowsOf(exists).length)return sendApi(res,404,{error:'Tenant not found'});
      }
      const stripe=await createStripeClient();
      const orderId=randomUUID();
      const origin=(process.env.HUBIE_PUBLIC_ORIGIN||'').replace(/\/$/,'')||('http://localhost:'+port);
      const session=await createCheckoutSession(stripe,buildCheckoutSessionParams({quote,email,organizationId,orderId,origin}));
      await createCheckoutOrder({id:orderId,email,quote,stripeSessionId:session.id,stripeCustomerId:typeof session.customer==='string'?session.customer:null,organizationId});
      return sendApi(res,201,{url:session.url,sessionId:session.id,orderId,depositCents:quote.depositCents,balanceCents:quote.balanceCents,monthlyFeeCents:quote.monthlyFeeCents});
    }catch(error){
      const msg=error?.message||'';
      if(msg==='Invalid checkout')return sendApi(res,400,{error:'Datos de cotización inválidos'});
      if(msg==='Unsupported media type')return sendApi(res,415,{error:msg});
      if(msg==='Payload too large')return sendApi(res,413,{error:msg});
      console.error('Checkout failed:',msg);
      return sendApi(res,503,{error:'No se pudo iniciar el pago'});
    }
  }
  if(pathname==='/api/stripe/webhook'){
    if(req.method!=='POST'){res.writeHead(405,{'allow':'POST'});res.end();return;}
    if(!stripeConfigured()||!webhookSecretConfigured())return sendApi(res,503,{error:'Stripe no configurado'});
    try{
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>1_000_000)throw Error('Payload too large');chunks.push(chunk);}
      const rawBody=Buffer.concat(chunks);
      const stripe=await createStripeClient();
      const event=verifyWebhookEvent({rawBody,signature:req.headers['stripe-signature'],stripe,secret:process.env.STRIPE_WEBHOOK_SECRET});
      const handled=await handleStripeEvent(event,{stripe});
      if(handled?.activationPath&&handled?.setupTokenIssued){
        const origin=(process.env.HUBIE_PUBLIC_ORIGIN||'').replace(/\/$/,'')||('http://localhost:'+port);
        console.info('Onboarding: alta autoservicio para '+handled.organizationId+' — enlace de activación de un solo uso (24 h): '+origin+handled.activationPath);
      }
      return sendApi(res,200,{received:true});
    }catch(error){
      const msg=error?.message||'';
      if(msg==='Invalid webhook signature')return sendApi(res,400,{error:'Invalid webhook signature'});
      if(msg==='Payload too large')return sendApi(res,413,{error:msg});
      console.error('Webhook failed:',msg);
      return sendApi(res,500,{error:'Webhook retry'});
    }
  }
  if(pathname==='/api/billing/status'){
    return processApi(req,res,async({token})=>{
      const slug=new URL(req.url,'http://localhost').searchParams.get('slug')||'';
      const tenant=await resolveTenant(slug);
      if(!tenant)throw Error('Not found');
      await requireTenantSession(token,tenant.id);
      return await getBillingStatus(tenant.id);
    },{methods:['GET']});
  }
  if(pathname==='/api/admin/billing'){
    return processApi(req,res,async()=>await listBillingForAdmin(),{admin:true,methods:['GET']});
  }
  // Guía de primer uso + datos de ejemplo (018). Sesión de tenant; la
  // siembra y el borrado de ejemplo son para owner/admin/member, no viewer.
  const onboardingPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/onboarding$/);
  if(onboardingPath){
    return processApi(req,res,async({token,body})=>{
      const tenant=await resolveTenant(onboardingPath[1]);
      if(!tenant)throw Error('Not found');
      const session=await requireTenantSession(token,tenant.id);
      if(req.method==='GET')return await getOnboardingProgress(tenant.id,session.userId);
      if(body?.action==='reset')return await resetOnboardingProgress(tenant.id,session.userId);
      if(typeof body?.step!=='string')throw Error('Invalid onboarding step');
      return await completeOnboardingStep(tenant.id,session.userId,body.step);
    },{methods:['GET','POST']});
  }
  const demoDataPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/demo-data$/);
  if(demoDataPath){
    return processApi(req,res,async({token})=>{
      const tenant=await resolveTenant(demoDataPath[1]);
      if(!tenant)throw Error('Not found');
      const session=await requireTenantSession(token,tenant.id,['owner','admin','member']);
      if(req.method==='GET')return {demo:await listDemoData(tenant.id)};
      if(req.method==='DELETE')return await clearDemoData(tenant.id);
      const settings=await executeSql('SELECT suite_id FROM tenant_settings WHERE organization_id=?',[tenant.id]);
      const suiteName=getSuite(rowsOf(settings)[0]?.[0])?.name||'';
      return await seedDemoData(tenant.id,session.userId,{},{suiteName});
    },{methods:['GET','POST','DELETE']});
  }
  // Madre reemite el enlace de activación (un solo uso, 24 h) para el owner
  // del tenant. El token en claro solo se muestra una vez en esta respuesta:
  // no se guarda en la base (solo su hash) ni se reenvía por correo, porque
  // Hubie aún no tiene envío de correo (ver docs/MULTITENANT-AUDIT §7).
  const activationLinkPath=pathname.match(/^\/api\/admin\/tenants\/([0-9a-f-]{36})\/activation-link$/);
  if(activationLinkPath){
    return processApi(req,res,async({actor})=>{
      await getTenantAdmin(activationLinkPath[1]);
      const owner=await getTenantOwner(activationLinkPath[1]);
      if(!owner)throw Error('Not found');
      const issued=await issueSetupToken({organizationId:activationLinkPath[1],userId:owner.userId,email:owner.email});
      const origin=(process.env.HUBIE_PUBLIC_ORIGIN||'').replace(/\/$/,'')||('http://localhost:'+port);
      return {email:owner.email,activationUrl:origin+issued.activationPath,expiresAt:issued.expiresAt};
    },{admin:true,methods:['POST']});
  }
  // Barrido de gracia (P0): suspende past_due con >3 días. Solo superadmin.
  // Sin cron dentro de la app: llamarlo desde un cron externo (ver
  // docs/STRIPE-BILLING.md § "Barrido de gracia").
  if(pathname==='/api/admin/billing/sweep'){
    return processApi(req,res,async()=>await sweepPastDueSuspensions(new Date()),{admin:true,methods:['POST']});
  }
  // Búsqueda global por tenant (P0): LIKE por módulo, scope por tenant.
  const searchPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/search$/);
  if(searchPath){
    return processApi(req,res,async({token})=>{
      const slug=searchPath[1];
      const tenant=await resolveTenant(slug);
      if(!tenant)throw Error('Not found');
      await requireTenantSession(token,tenant.id);
      const q=new URL(req.url,'http://localhost').searchParams.get('q')||'';
      return searchTenant(tenant.id,slug,q,{}, {enabledTools:await getTenantTools(tenant.id)});
    },{methods:['GET']});
  }
  // Buscador de empresas de Madre: nombre, slug o correo del owner + cobro.
  if(pathname==='/api/admin/tenants/search'){
    return processApi(req,res,async()=>{
      const q=new URL(req.url,'http://localhost').searchParams.get('q')||'';
      return searchTenants(q);
    },{admin:true,methods:['GET']});
  }
  // Notificaciones (P0): el GET genera recordatorios y luego lista.
  const notificationsPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/notifications$/);
  if(notificationsPath){
    return processApi(req,res,async({token})=>{
      const slug=notificationsPath[1];
      const tenant=await resolveTenant(slug);
      if(!tenant)throw Error('Not found');
      const session=await requireTenantSession(token,tenant.id);
      await generateNotificationsForTenant(tenant.id,{},new Date(),slug);
      return listNotifications(tenant.id,session.userId);
    },{methods:['GET']});
  }
  const notificationReadPath=pathname.match(/^\/api\/app\/([a-z0-9-]{3,63})\/notifications\/(read-all|[0-9a-f-]{36})(?:\/(read))?$/);
  if(notificationReadPath){
    return processApi(req,res,async({token})=>{
      const slug=notificationReadPath[1],target=notificationReadPath[2];
      const tenant=await resolveTenant(slug);
      if(!tenant)throw Error('Not found');
      const session=await requireTenantSession(token,tenant.id);
      return target==='read-all'?markAllNotificationsRead(tenant.id,session.userId)
        :markNotificationRead(tenant.id,session.userId,target);
    },{methods:['POST']});
  }
  if(pathname==='/api/admin/notifications'){
    return processApi(req,res,async()=>await listAdminNotifications(),{admin:true,methods:['GET']});
  }
  if(pathname==='/api/admin/notifications/generate'){
    return processApi(req,res,async()=>await generateNotificationsForAllTenants(),{admin:true,methods:['POST']});

  }
  if(pathname==='/healthz'){
    const db=await databaseHealth();
    let schemaReady=false;
    let tableCount=0;
    if(db.status==='connected'){
      try{
        const result=await executeSql("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('organizations','users','memberships','tenant_settings','tenant_tools','tenant_tool_records','tenant_crm_deals','tenant_schedule_events','tenant_inventory_items','tenant_inventory_movements','tenant_client_profiles','platform_appearance','tenant_appearance','pwa_media','tenant_client_cases','tenant_case_events','tenant_case_documents','tenant_case_document_versions','tenant_deal_clients','tenant_appointment_links','tenant_entity_links','tenant_surveys','tenant_survey_invitations','tenant_survey_responses','tenant_subscriptions','tenant_payments','stripe_webhook_events','billing_checkout_orders','tenant_quotes','tenant_quote_lines','tenant_catalog_items','tenant_expenses','tenant_collections','tenant_invoices','tenant_onboarding','tenant_setup_tokens','tenant_demo_seed','tenant_notifications','tenant_deal_assignments','tenant_case_document_settings','tenant_crm_deal_tasks','tenant_deal_quotes','tenant_case_access','tenant_case_document_access','tenant_member_tools','tenant_client_merges','tenant_appointment_assignees','tenant_appointment_reminders','tenant_inventory_variants','tenant_inventory_variant_movements','tenant_checklist_templates','tenant_checklist_template_items','tenant_checklists','tenant_checklist_items','tenant_tasks','tenant_forms','tenant_form_submissions','tenant_dashboard_goals','tenant_suppliers','tenant_supplier_documents','tenant_purchase_orders','tenant_purchase_order_lines','tenant_warehouses','tenant_warehouse_stock','tenant_warehouse_transfers','tenant_cashboxes','tenant_cashbox_movements','tenant_cashbox_counts','tenant_receivables','tenant_payables','tenant_payable_installments','tenant_expense_budgets','portal_client_access','portal_client_sessions','portal_requests','loyalty_config','loyalty_ledger','kanban_boards','kanban_phases','kanban_cards','tenant_signatures','inventory_lots','commission_rules','commission_entries')");
        tableCount=Number(result?.rows?.[0]?.[0]?.value??0);
        schemaReady=tableCount===84;
      }catch{schemaReady=false;}
    }
    const setup=configurationStatus();
    const ready=await migrationsReady;
    const healthy=db.status==='connected'&&schemaReady&&ready&&setup.readyForLive;
    res.writeHead(healthy?200:503,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({status:healthy?'ok':'degraded',service:'hubie-dev',database:db.status,schema:schemaReady?'ready':'not-ready',tables:tableCount,setup,...(db.reason?{reason:db.reason}:{})}));
    return;
  }
  if(decodedProtected(pathname)){res.writeHead(404);res.end('Not found');return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let decoded;try{decoded=decodeURIComponent(pathname);}catch{res.writeHead(400);res.end();return;}
  const file=resolve(root,'.'+(decoded==='/'?'/index.html':decoded==='/app/'?'/app/index.html':decoded==='/encuesta/'?'/encuesta/index.html':decoded));
  if(!(file===root||file.startsWith(root+sep))||decoded.split('/').some(p=>p.startsWith('.'))){res.writeHead(403);res.end();return;}
  try{
    const s=await stat(file);if(!s.isFile())throw Error('not file');
    const isHtml=extname(file).toLowerCase()==='.html';
    const raw=await readFile(file);
    const appShell=decoded==='/admin.html'||decoded==='/madre/app.html'||decoded==='/auth/configuracion.html'||(decoded.startsWith('/app/')||decoded.startsWith('/encuesta/'));
    const data=isHtml?Buffer.from(appShell?raw.toString('utf8'):enhanceHtml(raw.toString('utf8'))):raw;
    const isPwaAsset=decoded.startsWith('/assets/pwa-')||['/assets/appearance-ui.js','/assets/ui-icons.js','/assets/media-ui.js','/assets/attachments-ui.js','/assets/admin-console.js','/assets/app-console.js','/assets/demo-backend.js','/assets/operational-surveys.js','/assets/satisfaction-public.js','/assets/invitations-ui.js','/assets/audit-ui.js','/assets/invitation-accept.js'].includes(decoded);
    res.writeHead(200,{'content-type':types[extname(file).toLowerCase()]||'application/octet-stream',
      'cache-control':appShell||isPwaAsset?'no-store':'public, max-age=300',
      'x-content-type-options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'0.0.0.0',()=>console.log('Hubie listening on '+port));
migrationsReady=applyCoreSchema().then(async()=>{
  if(!configurationStatus().databaseConfigured)return false;
  try{await seedQaCompanyIfRequested();}
  catch(error){console.error('QA fixture failed:',error?.message||error,'('+(error?.code||error?.name||'unknown')+')');return false;}
  return true;
 }).catch(error=>{console.error('Core migration failed:',error?.message||error,'('+(error?.code||error?.name||'unknown')+')');return false;});
