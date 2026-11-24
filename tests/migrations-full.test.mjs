// Validación integral de migraciones (001–036): el servidor las aplica en
// cada arranque contra Turso viva con el runner best-effort de server.mjs.
// Este test aplica la MISMA lista y en el MISMO orden contra SQLite en
// memoria (FKs apagadas, como el pipeline HTTP de Turso) y comprueba que:
//  - todas las sentencias pasan en la primera aplicación;
//  - el conteo final de tablas es 126: 84 en la lista de /healthz (34 base +
//    50 nuevas de 018/020/021/022/023/024; la 017 no crea tablas y la 025
//    borra una no contada) + 42 tablas que las migraciones crean pero
//    /healthz no lista (audit_events, google_identities,
//    oauth_login_attempts, organization_invitations, platform_admins,
//    session_tokens, tenant_appointments, tenant_clients, tenant_orders,
//    tenant_service_requests — las 4 últimas son las legacy de 002, aún
//    sin borrar en vivo por si guardan filas antiguas —, las 11 de la 026,
//    tenant_training_*, y las 21 de las tools Odoo (028–036): las 7 de RH
//    (tenant_hr_documents (031), tenant_hr_attendance y tenant_hr_requests
//    (032), y las 4 tenant_payroll_* (036)), las 3 de contabilidad
//    tenant_accounting_* (028), las 2 de pedidos tenant_sales_order* (029),
//    las 2 de proyectos tenant_project* (030), las 2 de mesa de ayuda
//    tenant_helpdesk_* (033), las 3 de marketing tenant_marketing_* (034)
//    y las 2 de punto de venta tenant_pos_* (035). La 031 no crea tabla de
//    empleados: reutiliza tenant_training_employees con 4 ALTER ADD COLUMN.
//  - la 027 no crea tablas: añade a tenant_catalog_items las columnas que
//    la 016 definió con CREATE TABLE IF NOT EXISTS (no-op porque la 002
//    ya había creado la tabla reducida); sin ella C006, la importación y
//    la siembra demo fallan con "no column named sku".
//  - una segunda aplicación completa solo falla con 'duplicate column name'
//    (los ALTER no idempotentes de la 023, la 027 y la 031), que el runner tolera
//    como ya-aplicado (ver server.mjs, applyCoreSchema).
// No hay migración 019: las invitaciones usan organization_invitations,
// creada en 002, sin tablas nuevas.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {executableStatements} from '../platform/migration-parser.mjs';

const MIGRATIONS=['001_core.sql','002_multitenant.sql','003_identity.sql','004_platform_admin.sql','005_google_oidc.sql','006_pwa_records.sql','007_operational_workflows.sql','008_clients.sql','009_appearance.sql','010_media.sql','011_cases.sql','012_case_documents.sql','013_entity_relationships.sql','014_satisfaction.sql','015_billing.sql','016_commerce.sql','017_media_limit.sql','018_onboarding.sql','020_notifications.sql','021_tools_p0.sql','022_tools_p1a.sql','023_tools_p1b.sql','024_tools_p2.sql','025_drop_tenant_domains.sql','026_training.sql','027_catalog_columns.sql','028_accounting.sql','029_sales_orders.sql','030_projects.sql','031_employees.sql','032_attendance.sql','033_helpdesk.sql','034_marketing.sql','035_pos.sql','036_payroll.sql'];
const TRAINING_TABLES=['tenant_training_courses','tenant_training_sessions','tenant_training_employees','tenant_training_enrollments','tenant_training_attendance','tenant_training_progress','tenant_training_evaluations','tenant_training_certificates','tenant_training_modules','tenant_training_module_completions','tenant_training_quiz_attempts'];
const HR_TABLES=['tenant_hr_documents','tenant_hr_attendance','tenant_hr_requests','tenant_payroll_periods','tenant_payroll_concepts','tenant_payroll_receipts','tenant_payroll_receipt_items'];
const FIN_TABLES=['tenant_accounting_accounts','tenant_accounting_entries','tenant_accounting_entry_lines','tenant_sales_orders','tenant_sales_order_lines'];
const OPS_TABLES=['tenant_projects','tenant_project_milestones','tenant_helpdesk_tickets','tenant_helpdesk_replies'];
const SALES_TABLES=['tenant_marketing_segments','tenant_marketing_campaigns','tenant_marketing_sends','tenant_pos_sales','tenant_pos_sale_lines'];
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

test('migraciones 001–036: primera aplicación sin errores y 126 tablas',async()=>{
 const db=new DatabaseSync(':memory:');
 const errors=await applyAll(db);
 assert.deepEqual(errors,[],'sentencias fallidas en primera aplicación: '+JSON.stringify(errors,null,2));
 const tables=tableNames(db);
 assert.equal(tables.length,126,'tablas: '+tables.length+' — '+tables.join(','));
 for(const table of [...EXPECTED_TABLES,...TRAINING_TABLES,...HR_TABLES,...FIN_TABLES,...OPS_TABLES,...SALES_TABLES])assert.ok(tables.includes(table),'falta tabla '+table);
 assert.ok(!tables.includes('tenant_domains'),'la 025 debe borrar tenant_domains');
 db.close();
});

test('migraciones 001–036: segunda aplicación solo falla con duplicate column (023, 027 y 031)',async()=>{
 const db=new DatabaseSync(':memory:');
 assert.deepEqual(await applyAll(db),[]);
 const errors=await applyAll(db);
 assert.ok(errors.length>=1,'se esperaba al menos el duplicate column de la 023');
 for(const e of errors)assert.match(e.message,/duplicate column/i,`${e.migration} #${e.index}: ${e.message}`);
 assert.ok(errors.some(e=>e.migration==='023_tools_p1b.sql'),'el duplicate column debe ser de la 023');
 assert.ok(errors.some(e=>e.migration==='027_catalog_columns.sql'),'el duplicate column debe incluir la 027');
 assert.ok(errors.some(e=>e.migration==='031_employees.sql'),'el duplicate column debe incluir la 031');
 assert.equal(tableNames(db).length,126);
 db.close();
});

test('027: tenant_catalog_items tiene las columnas de la 016 (regresión sku)',async()=>{
 const db=new DatabaseSync(':memory:');
 assert.deepEqual(await applyAll(db),[]);
 const cols=db.prepare("SELECT name FROM pragma_table_info('tenant_catalog_items')").all().map(r=>r.name);
 for(const c of ['sku','description','category','created_by','created_at','updated_at','archived_at'])
  assert.ok(cols.includes(c),'falta columna '+c+' en tenant_catalog_items: '+cols.join(','));
 // Las sentencias del catálogo (C006) y de la siembra demo deben pasar
 // contra el esquema final: sin estas columnas daban "no column named sku".
 db.prepare("INSERT INTO organizations(id,slug,name) VALUES('o1','org-a','A')").run();
 db.prepare("INSERT INTO users(id,email) VALUES('u1','a@x')").run();
 db.prepare("INSERT INTO tenant_catalog_items(organization_id,id,sku,name,description,price_cents,category,active,created_by) VALUES('o1','i1','SKU-1','Item','desc',100,'General',1,'u1')").run();
 assert.equal(db.prepare("SELECT sku FROM tenant_catalog_items WHERE organization_id='o1'").all()[0].sku,'SKU-1');
 db.close();
});

test('031: tenant_training_employees gana las 4 columnas RH sin romper T022',async()=>{
 const db=new DatabaseSync(':memory:');
 assert.deepEqual(await applyAll(db),[]);
 const cols=db.prepare("SELECT name FROM pragma_table_info('tenant_training_employees')").all().map(r=>r.name);
 for(const c of ['fecha_ingreso','tipo_contrato','salario_mensual_cents','estado'])
  assert.ok(cols.includes(c),'falta columna '+c+' en tenant_training_employees: '+cols.join(','));
 // La alta de T022 (solo columnas base) sigue pasando: las nuevas van con defaults.
 db.prepare("INSERT INTO organizations(id,slug,name) VALUES('o1','org-a','A')").run();
 db.prepare("INSERT INTO users(id,email) VALUES('u1','a@x')").run();
 db.prepare("INSERT INTO tenant_training_employees(organization_id,id,name,email,position,area,created_by) VALUES('o1','e1','Ana Ruiz','ana@x','Cajera','Ventas','u1')").run();
 const row=db.prepare("SELECT estado,salario_mensual_cents FROM tenant_training_employees WHERE organization_id='o1'").all()[0];
 assert.equal(row.estado,'activo');
 assert.equal(row.salario_mensual_cents,null);
 db.close();
});

test('server.mjs cablea la lista completa en el mismo orden y /healthz espera 84',async()=>{
 const server=await readFile('server.mjs','utf8');
 for(const migration of MIGRATIONS)assert.match(server,new RegExp("'"+migration.replace('.','\\.')+"'"),migration+' no cableada en applyCoreSchema');
 assert.match(server,/schemaReady=tableCount===84/);
 for(const table of EXPECTED_TABLES)assert.match(server,new RegExp("'"+table+"'"),table+' no está en la lista de /healthz');
 assert.match(server,/duplicate column/i,'el runner debe tolerar duplicate column como ya-aplicado');
});
