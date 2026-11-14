import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sqlStatements,executableStatements} from '../platform/migration-parser.mjs';

const sql=readFileSync(new URL('../turso/migrations/022_tools_p1a.sql',import.meta.url),'utf8');
const statements=executableStatements(sql);

test('migración 022: reglas Turso vivas — sin PRAGMA, sin índices parciales, máximo 3 columnas',()=>{
 assert.doesNotMatch(sql,/^\s*pragma\b/im);
 for(const statement of statements){
  assert.doesNotMatch(statement,/^\s*pragma\b/i);
  if(/^create index/i.test(statement)){
   assert.doesNotMatch(statement,/\bwhere\b/i,'Índice parcial prohibido: '+statement.slice(0,80));
   const columns=statement.match(/\(([^)]*)\)\s*;?\s*$/)[1].split(',').map(c=>c.trim()).filter(Boolean);
   assert.ok(columns.length>=1&&columns.length<=3,'Índice de '+columns.length+' columnas: '+statement.slice(0,80));
  }
 }
});
test('migración 022: sin ningún índice sobre tenant_catalog_items (regla 2b857e5)',()=>{
 assert.doesNotMatch(sql,/tenant_catalog_items/);
 for(const statement of statements){
  if(/^create index/i.test(statement))assert.doesNotMatch(statement,/catalog/i);
 }
});
test('migración 022: 12 tablas nuevas, todas con organization_id primero y sin PRAGMA',()=>{
 const tables=[...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([^;]*?)(?:,?\s*PRIMARY KEY|\n\)|\)\s*;)/gis)]
  .map(m=>({name:m[1],firstColumn:m[2].trim().split(/\s+/)[0]}));
 assert.deepEqual(tables.map(t=>t.name).sort(),[
  'tenant_appointment_assignees','tenant_appointment_reminders','tenant_checklist_items',
  'tenant_checklist_template_items','tenant_checklist_templates','tenant_checklists',
  'tenant_dashboard_goals','tenant_form_submissions','tenant_forms','tenant_inventory_variant_movements',
  'tenant_inventory_variants','tenant_tasks'].sort());
 for(const table of tables)assert.equal(table.firstColumn,'organization_id',table.name);
 assert.equal(sqlStatements(sql).length,statements.length,'executableStatements no debe filtrar nada de la 022');
});
