import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sqlStatements,executableStatements} from '../platform/migration-parser.mjs';

const EXPECTED_TABLES=['portal_client_access','portal_client_sessions','portal_requests','loyalty_config','loyalty_ledger','kanban_boards','kanban_phases','kanban_cards','tenant_signatures','inventory_lots','commission_rules','commission_entries'];

test('024: migración P2 crea las 12 tablas con scope por tenant',async()=>{
 const sql=await readFile('turso/migrations/024_tools_p2.sql','utf8');
 for(const table of EXPECTED_TABLES){
  assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+table+'\\('),table+' no creada');
  assert.match(sql,new RegExp(table+'\\(\\n organization_id TEXT NOT NULL'),table+' sin organization_id primero');
 }
});
test('024: sin PRAGMA, sin índices parciales y sin índices de 4+ columnas',async()=>{
 const sql=await readFile('turso/migrations/024_tools_p2.sql','utf8');
 const statements=executableStatements(sql);
 assert.ok(statements.every(s=>!/^pragma/i.test(s)),'ninguna sentencia ejecutable debe ser PRAGMA');
 assert.ok(statements.length>=12,'la migración debe tener al menos 12 sentencias ejecutables');
 for(const statement of statements){
  if(!/^CREATE INDEX/i.test(statement))continue;
  assert.doesNotMatch(statement,/WHERE/i,'índice parcial rechazado por Turso en vivo: '+statement.slice(0,80));
  const columns=statement.match(/\(([^)]*)\)/)?.[1]?.split(',')||[];
  assert.ok(columns.length>=1&&columns.length<=3,'índice con '+columns.length+' columnas: '+statement.slice(0,80));
 }
 // El parser del servidor debe ver las mismas sentencias que se ejecutarían.
 assert.equal(sqlStatements(sql).length,statements.length,'024 no debe contener PRAGMA que el parser descarte');
});
test('024: no usa números de migración de otros frentes ni toca tablas ajenas',async()=>{
 const sql=await readFile('turso/migrations/024_tools_p2.sql','utf8');
 const statements=executableStatements(sql);
 assert.ok(statements.every(s=>!s.includes('tenant_notifications')),'ninguna sentencia debe crear ni tocar tenant_notifications (la crea el frente search)');
 assert.ok(statements.every(s=>!/^ALTER TABLE/i.test(s)),'024 no altera tablas existentes');
});
