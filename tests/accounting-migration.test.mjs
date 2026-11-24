import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {sqlStatements,executableStatements} from '../platform/migration-parser.mjs';

const EXPECTED_TABLES=['tenant_accounting_accounts','tenant_accounting_entries','tenant_accounting_entry_lines'];

test('028: migración T023 crea las 3 tablas con scope por tenant',async()=>{
 const sql=await readFile('turso/migrations/028_accounting.sql','utf8');
 for(const table of EXPECTED_TABLES){
  assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+table+'\\('),table+' no creada');
  assert.match(sql,new RegExp(table+'\\(\\n organization_id TEXT NOT NULL'),table+' sin organization_id primero');
 }
 const statements=executableStatements(sql);
 assert.equal(statements.length,9,'la 028 debe tener 9 sentencias ejecutables');
 assert.equal(statements.filter(s=>/^CREATE TABLE/i.test(s)).length,3);
 assert.equal(statements.filter(s=>/^CREATE INDEX/i.test(s)).length,6);
});

test('028: sin PRAGMA, sin índices parciales y sin índices de 4+ columnas',async()=>{
 const sql=await readFile('turso/migrations/028_accounting.sql','utf8');
 const statements=executableStatements(sql);
 assert.ok(statements.every(s=>!/^pragma/i.test(s)),'ninguna sentencia ejecutable debe ser PRAGMA');
 for(const statement of statements){
  if(!/^CREATE INDEX/i.test(statement))continue;
  assert.doesNotMatch(statement,/WHERE/i,'índice parcial rechazado por Turso en vivo: '+statement.slice(0,80));
  const columns=statement.match(/\(([^)]*)\)/)?.[1]?.split(',')||[];
  assert.ok(columns.length>=1&&columns.length<=3,'índice con '+columns.length+' columnas: '+statement.slice(0,80));
 }
 assert.equal(sqlStatements(sql).length,statements.length,'028 no debe contener PRAGMA que el parser descarte');
});

test('028: no altera tablas existentes ni toca tenant_catalog_items',async()=>{
 const sql=await readFile('turso/migrations/028_accounting.sql','utf8');
 const statements=executableStatements(sql);
 assert.ok(statements.every(s=>!/^ALTER TABLE/i.test(s)),'028 no altera tablas existentes');
 assert.ok(statements.every(s=>!s.includes('tenant_catalog_items')),'028 no toca tenant_catalog_items');
});

test('028: aplica limpia en SQLite en memoria y las UNIQUE se cumplen',async()=>{
 const sql=await readFile('turso/migrations/028_accounting.sql','utf8');
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=OFF');
 try{
  for(const statement of executableStatements(sql))db.exec(statement);
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'tenant_accounting_%' ORDER BY name").all().map(r=>r.name);
  assert.deepEqual(tables,[...EXPECTED_TABLES].sort());
  const org='11111111-1111-4111-8111-111111111111';
  db.exec(`INSERT INTO tenant_accounting_accounts(organization_id,id,code,name,type,nature) VALUES('${org}','a1','1000','Caja','activo','deudora')`);
  db.exec(`INSERT INTO tenant_accounting_accounts(organization_id,id,code,name,type,nature) VALUES('${org}','a2','4000','Ventas','ingreso','acreedora')`);
  assert.throws(()=>db.exec(`INSERT INTO tenant_accounting_accounts(organization_id,id,code,name,type,nature) VALUES('${org}','a3','1000','Otra caja','activo','deudora')`),/UNIQUE constraint failed/,'código de cuenta duplicado por tenant');
  db.exec(`INSERT INTO tenant_accounting_entries(organization_id,id,folio,entry_date,concept) VALUES('${org}','e1',1,'2026-11-10','Venta del día')`);
  assert.throws(()=>db.exec(`INSERT INTO tenant_accounting_entries(organization_id,id,folio,entry_date,concept) VALUES('${org}','e2',1,'2026-11-11','Otra')`),/UNIQUE constraint failed/,'folio de póliza duplicado por tenant');
  db.exec(`INSERT INTO tenant_accounting_entry_lines(organization_id,id,entry_id,account_id,debit_cents,credit_cents) VALUES('${org}','l1','e1','a1',11600,0)`);
  db.exec(`INSERT INTO tenant_accounting_entry_lines(organization_id,id,entry_id,account_id,debit_cents,credit_cents) VALUES('${org}','l2','e1','a2',0,11600)`);
  assert.throws(()=>db.exec(`INSERT INTO tenant_accounting_entry_lines(organization_id,id,entry_id,account_id,debit_cents,credit_cents) VALUES('${org}','l3','e1','a1',100,100)`),/CHECK constraint failed/,'línea con debe y haber a la vez');
  assert.throws(()=>db.exec(`INSERT INTO tenant_accounting_entry_lines(organization_id,id,entry_id,account_id,debit_cents,credit_cents) VALUES('${org}','l4','e1','a1',0,0)`),/CHECK constraint failed/,'línea sin debe ni haber');
  // Segunda aplicación idempotente (IF NOT EXISTS en todo).
  for(const statement of executableStatements(sql))db.exec(statement);
 }finally{db.close();}
});
