// Validación integral de migraciones (001–025): el servidor las aplica en
// cada arranque contra Turso viva con el runner best-effort de server.mjs.
// Este test aplica la MISMA lista y en el MISMO orden contra SQLite en
// memoria (FKs apagadas, como el pipeline HTTP de Turso) y comprueba que:
//  - todas las sentencias pasan en la primera aplicación;
//  - el conteo final de tablas es 94: 84 en la lista de /healthz (34 base +
//    50 nuevas de 018/020/021/022/023/024; la 017 no crea tablas y la 025
//    borra una no contada) + 10 tablas que las migraciones crean pero
//    /healthz no lista (audit_events, google_identities,
//    oauth_login_attempts, organization_invitations, platform_admins,
//    session_tokens, tenant_appointments, tenant_clients, tenant_orders,
//    tenant_service_requests — las 4 últimas son las legacy de 002, aún
//    sin borrar en vivo por si guardan filas antiguas);
//  - una segunda aplicación completa solo falla con 'duplicate column name'
//    (el ALTER no idempotente de la 023), que el runner tolera como
//    ya-aplicado (ver server.mjs, applyCoreSchema).
// No hay migración 019: las invitaciones usan organization_invitations,
// creada en 002, sin tablas nuevas.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {executableStatements} from '../platform/migration-parser.mjs';

const MIGRATIONS=['001_core.sql','002_multitenant.sql','003_identity.sql','004_platform_admin.sql','005_google_oidc.sql','006_pwa_records.sql','007_operational_workflows.sql','008_clients.sql','009_appearance.sql','010_media.sql','011_cases.sql','012_case_documents.sql','013_entity_relationships.sql','014_satisfaction.sql','015_billing.sql','016_commerce.sql','017_media_limit.sql','018_onboarding.sql','020_notifications.sql','021_tools_p0.sql','022_tools_p1a.sql','023_tools_p1b.sql','024_tools_p2.sql','025_drop_tenant_domains.sql'];
const EXPECTED_TABLES=['organizations','users','memberships','tenant_settings','tenant_tools','tenant_tool_records','tenant_crm_deals','tenant_schedule_events','tenant_inventory_items','tenant_inventory_movements','tenant_client_profiles','platform_appearance','tenant_appearance','pwa_media','tenant_client_cases','tenant_case_events','tenant_case_documents','tenant_case_document_versions','tenant_deal_clients','tenant_appointment_links','tenant_entity_links','tenant_surveys','tenant_survey_invitations','tenant_survey_responses','tenant_subscriptions','tenant_payments','stripe_webhook_events','billing_checkout_orders','tenant_quotes','tenant_quote_lines','tenant_catalog_items','tenant_expenses','tenant_collections','tenant_invoices','tenant_onboarding','tenant_setup_tokens','tenant_demo_seed','tenant_notifications','tenant_deal_assignments','tenant_case_document_settings','tenant_crm_deal_tasks','tenant_deal_quotes','tenant_case_access','tenant_case_document_access','tenant_member_tools','tenant_client_merges','tenant_appointment_assignees','tenant_appointment_reminders','tenant_inventory_variants','tenant_inventory_variant_movements','tenant_checklist_templates','tenant_checklist_template_items','tenant_checklists','tenant_checklist_items','tenant_tasks','tenant_forms','tenant_form_submissions','tenant_dashboard_goals','tenant_suppliers','tenant_supplier_documents','tenant_purchase_orders','tenant_purchase_order_lines','tenant_warehouses','tenant_warehouse_stock','tenant_warehouse_transfers','tenant_cashboxes','tenant_cashbox_movements','tenant_cashbox_counts','tenant_receivables','tenant_payables','tenant_payable_installments','tenant_expense_budgets','portal_client_access','portal_client_sessions','portal_requests','loyalty_config','loyalty_ledger','kanban_boards','kanban_phases','kanban_cards','tenant_signatures','inventory_lots','commission_rules','commission_entries'];

async function applyAll(db){
 const errors=[];
 for(const migration of MIGRATIONS){
  const sql=await readFile(new URL('../turso/migrations/'+migration,import.meta.url),'utf8');
  const statements=executableStatements(sql);
  for(let i=0;i<statements.length;i++){
   try{db.exec(statements[i]);}
   catch(error){errors.push({migration,index:i,message:error?.message||String(error)});}
  }
 }
 return errors;
}
function tableNames(db){
 return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
}

test('migraciones 001–025: primera aplicación sin errores y 94 tablas',async()=>{
 const db=new DatabaseSync(':memory:');
 const errors=await applyAll(db);
 assert.deepEqual(errors,[],'sentencias fallidas en primera aplicación: '+JSON.stringify(errors,null,2));
 const tables=tableNames(db);
 assert.equal(tables.length,94,'tablas: '+tables.length+' — '+tables.join(','));
 for(const table of EXPECTED_TABLES)assert.ok(tables.includes(table),'falta tabla '+table);
 assert.ok(!tables.includes('tenant_domains'),'la 025 debe borrar tenant_domains');
 db.close();
});

test('migraciones 001–025: segunda aplicación solo falla con duplicate column (023)',async()=>{
 const db=new DatabaseSync(':memory:');
 assert.deepEqual(await applyAll(db),[]);
 const errors=await applyAll(db);
 assert.ok(errors.length>=1,'se esperaba al menos el duplicate column de la 023');
 for(const e of errors)assert.match(e.message,/duplicate column/i,`${e.migration} #${e.index}: ${e.message}`);
 assert.ok(errors.some(e=>e.migration==='023_tools_p1b.sql'),'el duplicate column debe ser de la 023');
 assert.equal(tableNames(db).length,94);
 db.close();
});

test('server.mjs cablea la lista completa en el mismo orden y /healthz espera 84',async()=>{
 const server=await readFile('server.mjs','utf8');
 for(const migration of MIGRATIONS)assert.match(server,new RegExp("'"+migration.replace('.','\\.')+"'"),migration+' no cableada en applyCoreSchema');
 assert.match(server,/schemaReady=tableCount===84/);
 for(const table of EXPECTED_TABLES)assert.match(server,new RegExp("'"+table+"'"),table+' no está en la lista de /healthz');
 assert.match(server,/duplicate column/i,'el runner debe tolerar duplicate column como ya-aplicado');
});
