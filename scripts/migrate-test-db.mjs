// Aplica las migraciones 001–036 de turso/migrations/ a una base Turso
// (o libSQL local) dada SOLO por variables de entorno. Herramienta CLI de
// Node, fuera del Worker: el Worker nunca migra en arranque.
// Uso:
//   TURSO_DATABASE_URL='libsql://hubie-test-....turso.io' \
//   TURSO_AUTH_TOKEN="$(cat ~/workspace/hubie-test-token.txt)" \
//   node scripts/migrate-test-db.mjs --apply
// Idempotente: una segunda aplicación solo produce 'duplicate column'
// (los ALTER ADD COLUMN no idempotentes de 023, 027 y 031), que se
// tolera igual que en applyCoreSchema de server.mjs. NUNCA apuntes este
// script a la base viva (hubie-staging): solo a bases de pruebas.
// Los secretos solo se leen de env vars; nada se hardcodea ni se registra.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createClient} from '@libsql/client';
import {executableStatements} from '../platform/migration-parser.mjs';

// Misma lista y mismo orden que applyCoreSchema (server.mjs). No hay 019.
export const MIGRATIONS = [
 '001_core.sql', '002_multitenant.sql', '003_identity.sql', '004_platform_admin.sql',
 '005_google_oidc.sql', '006_pwa_records.sql', '007_operational_workflows.sql',
 '008_clients.sql', '009_appearance.sql', '010_media.sql', '011_cases.sql',
 '012_case_documents.sql', '013_entity_relationships.sql', '014_satisfaction.sql',
 '015_billing.sql', '016_commerce.sql', '017_media_limit.sql', '018_onboarding.sql',
 '020_notifications.sql', '021_tools_p0.sql', '022_tools_p1a.sql', '023_tools_p1b.sql',
 '024_tools_p2.sql', '025_drop_tenant_domains.sql', '026_training.sql',
 '027_catalog_columns.sql', '028_accounting.sql', '029_sales_orders.sql',
 '030_projects.sql', '031_employees.sql', '032_attendance.sql', '033_helpdesk.sql',
 '034_marketing.sql', '035_pos.sql', '036_payroll.sql'
];
export const CORE_TABLES = ['organizations', 'users', 'memberships', 'organization_invitations', 'audit_events'];

export async function migrateDatabase({url, authToken, migrationsDir = new URL('../turso/migrations/', import.meta.url), log = () => {}} = {}) {
 if (!url || !authToken) throw Error('Faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN');
 const client = createClient({url, authToken});
 const summary = {applied: 0, alreadyApplied: 0, failures: [], tableCount: 0, coreCount: 0};
 try {
  for (const migration of MIGRATIONS) {
   const sql = await readFile(new URL(migration, migrationsDir), 'utf8');
   const statements = executableStatements(sql);
   let applied = 0, already = 0;
   for (let i = 0; i < statements.length; i++) {
    try {
     await client.execute(statements[i]);
     applied++;
    } catch (error) {
     if (/duplicate column/i.test(error?.message || '')) {
      log(`Migration already applied: ${migration} #${i}`);
      already++;
      continue;
     }
     const snippet = statements[i].slice(0, 120).replace(/\s+/g, ' ');
     log(`Migration failed: ${migration} #${i}: ${snippet} :: ${error?.message || error}`);
     summary.failures.push(migration + ' #' + i);
    }
   }
   summary.applied += applied;
   summary.alreadyApplied += already;
   log(`${migration}: ${statements.length} sentencias, ${applied} aplicadas, ${already} ya aplicadas`);
  }
  // marketing_leads se creaba inline en server.mjs:137, fuera de las
  // migraciones 001–036: mismo CREATE TABLE IF NOT EXISTS aquí, para que
  // la base de pruebas tenga las mismas 127 tablas que el esquema vivo.
  await client.execute('CREATE TABLE IF NOT EXISTS marketing_leads (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, negocio TEXT, giro TEXT, email TEXT NOT NULL, tel TEXT, mensaje TEXT, created_at TEXT NOT NULL)');
  summary.marketingLeads = true;
  log('marketing_leads: tabla creada/verificada (server.mjs:137)');
  const core = await client.execute(
   `SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name IN (${CORE_TABLES.map(() => '?').join(',')})`,
   CORE_TABLES);
  summary.coreCount = Number(core.rows[0]?.total ?? core.rows[0]?.[0] ?? 0);
  const tables = await client.execute("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  summary.tableCount = Number(tables.rows[0]?.total ?? tables.rows[0]?.[0] ?? 0);
  log(`Hubie core schema verified: ${summary.coreCount}/5 tablas core; ${summary.tableCount} tablas en total`);
  return summary;
 } finally {
  client.close();
 }
}

async function main() {
 if (process.argv[2] !== '--apply') {
  console.error('Uso: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/migrate-test-db.mjs --apply');
  process.exitCode = 2;
  return;
 }
 const url = process.env.TURSO_DATABASE_URL;
 const authToken = process.env.TURSO_AUTH_TOKEN;
 if (!url || !authToken) {
  console.error('Faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN');
  process.exitCode = 2;
  return;
 }
 const summary = await migrateDatabase({url, authToken, log: s => console.log(s)});
 if (summary.failures.length) {
  console.error('Migration failures: ' + summary.failures.join(', '));
  process.exitCode = 1;
  return;
 }
 if (summary.coreCount !== CORE_TABLES.length) {
  console.error('Core schema verification failed: ' + summary.coreCount + '/' + CORE_TABLES.length);
  process.exitCode = 1;
  return;
 }
 console.log(`Migraciones aplicadas: ${summary.applied} sentencias, ${summary.alreadyApplied} ya aplicadas, ${summary.tableCount} tablas`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 await main();
}
