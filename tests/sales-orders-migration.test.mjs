import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {sqlStatements,executableStatements} from '../platform/migration-parser.mjs';

const EXPECTED_TABLES=['tenant_sales_orders','tenant_sales_order_lines'];

test('029: migración T024 crea las 2 tablas con scope por tenant',async()=>{
 const sql=await readFile('turso/migrations/029_sales_orders.sql','utf8');
 for(const table of EXPECTED_TABLES){
  assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+table+'\\('),table+' no creada');
  assert.match(sql,new RegExp(table+'\\(\\n organization_id TEXT NOT NULL'),table+' sin organization_id primero');
 }
 const statements=executableStatements(sql);
 assert.equal(statements.length,6,'la 029 debe tener 6 sentencias ejecutables');
 assert.equal(statements.filter(s=>/^CREATE TABLE/i.test(s)).length,2);
 assert.equal(statements.filter(s=>/^CREATE INDEX/i.test(s)).length,4);
});

test('029: sin PRAGMA, sin índices parciales y sin índices de 4+ columnas',async()=>{
 const sql=await readFile('turso/migrations/029_sales_orders.sql','utf8');
 const statements=executableStatements(sql);
 assert.ok(statements.every(s=>!/^pragma/i.test(s)),'ninguna sentencia ejecutable debe ser PRAGMA');
 for(const statement of statements){
  if(!/^CREATE INDEX/i.test(statement))continue;
  assert.doesNotMatch(statement,/WHERE/i,'índice parcial rechazado por Turso en vivo: '+statement.slice(0,80));
  const columns=statement.match(/\(([^)]*)\)/)?.[1]?.split(',')||[];
  assert.ok(columns.length>=1&&columns.length<=3,'índice con '+columns.length+' columnas: '+statement.slice(0,80));
 }
 assert.equal(sqlStatements(sql).length,statements.length,'029 no debe contener PRAGMA que el parser descarte');
});

test('029: no altera tablas existentes ni toca tenant_catalog_items',async()=>{
 const sql=await readFile('turso/migrations/029_sales_orders.sql','utf8');
 const statements=executableStatements(sql);
 assert.ok(statements.every(s=>!/^ALTER TABLE/i.test(s)),'029 no altera tablas existentes');
 assert.ok(statements.every(s=>!s.includes('tenant_catalog_items')),'029 no toca tenant_catalog_items');
});

test('029: aplica limpia en SQLite en memoria y las UNIQUE se cumplen',async()=>{
 const sql=await readFile('turso/migrations/029_sales_orders.sql','utf8');
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=OFF');
 try{
  for(const statement of executableStatements(sql))db.exec(statement);
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'tenant_sales_order%' ORDER BY name").all().map(r=>r.name);
  assert.deepEqual(tables,[...EXPECTED_TABLES].sort());
  const org='11111111-1111-4111-8111-111111111111';
  db.exec(`INSERT INTO tenant_sales_orders(organization_id,id,folio,quote_id,client_name,title,total_cents) VALUES('${org}','o1',1,'q1','Negocio ficticio','Pedido 1',11600)`);
  assert.throws(()=>db.exec(`INSERT INTO tenant_sales_orders(organization_id,id,folio,quote_id,client_name,title,total_cents) VALUES('${org}','o2',1,'q2','Otro','Pedido 2',100)`),/UNIQUE constraint failed/,'folio de pedido duplicado por tenant');
  db.exec(`INSERT INTO tenant_sales_order_lines(organization_id,order_id,id,description,quantity,unit_price_cents,line_total_cents,position) VALUES('${org}','o1','l1','Caja 16x12x12',2,5000,10000,0)`);
  assert.throws(()=>db.exec(`INSERT INTO tenant_sales_orders(organization_id,id,folio,quote_id,client_name,title,total_cents,status) VALUES('${org}','o3',2,'q3','Otro','Pedido 3',100,'publicado')`),/CHECK constraint failed/,'estatus de pedido fuera del enum');
  // Segunda aplicación idempotente (IF NOT EXISTS en todo).
  for(const statement of executableStatements(sql))db.exec(statement);
 }finally{db.close();}
});
