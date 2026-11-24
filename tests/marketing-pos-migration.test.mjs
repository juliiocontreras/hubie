import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {sqlStatements,executableStatements} from '../platform/migration-parser.mjs';

const MARKETING_TABLES=['tenant_marketing_segments','tenant_marketing_campaigns','tenant_marketing_sends'];
const POS_TABLES=['tenant_pos_sales','tenant_pos_sale_lines'];

test('034: migración T029 crea las 3 tablas con scope por tenant',async()=>{
 const sql=await readFile('turso/migrations/034_marketing.sql','utf8');
 for(const table of MARKETING_TABLES){
  assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+table+'\\('),table+' no creada');
  assert.match(sql,new RegExp(table+'\\(\\n organization_id TEXT NOT NULL'),table+' sin organization_id primero');
 }
 const statements=executableStatements(sql);
 assert.equal(statements.length,8,'la 034 debe tener 8 sentencias ejecutables');
 assert.equal(statements.filter(s=>/^CREATE TABLE/i.test(s)).length,3);
 assert.equal(statements.filter(s=>/^CREATE INDEX/i.test(s)).length,5);
});

test('035: migración T030 crea las 2 tablas con scope por tenant y folio único por tenant',async()=>{
 const sql=await readFile('turso/migrations/035_pos.sql','utf8');
 for(const table of POS_TABLES){
  assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+table+'\\('),table+' no creada');
  assert.match(sql,new RegExp(table+'\\(\\n organization_id TEXT NOT NULL'),table+' sin organization_id primero');
 }
 assert.match(sql,/UNIQUE\(organization_id,folio\)/,'el folio debe ser único por tenant');
 assert.match(sql,/mode TEXT NOT NULL DEFAULT 'para_llevar' CHECK\(mode IN \('para_llevar','en_local','a_domicilio'\)\)/);
 const statements=executableStatements(sql);
 assert.equal(statements.length,5,'la 035 debe tener 5 sentencias ejecutables');
 assert.equal(statements.filter(s=>/^CREATE TABLE/i.test(s)).length,2);
 assert.equal(statements.filter(s=>/^CREATE INDEX/i.test(s)).length,3);
});

test('034/035: sin PRAGMA, sin índices parciales y sin índices de 4+ columnas',async()=>{
 for(const file of ['turso/migrations/034_marketing.sql','turso/migrations/035_pos.sql']){
  const sql=await readFile(file,'utf8');
  const statements=executableStatements(sql);
  assert.ok(statements.every(s=>!/^pragma/i.test(s)),'ninguna sentencia ejecutable debe ser PRAGMA: '+file);
  for(const statement of statements){
   if(!/^CREATE INDEX/i.test(statement))continue;
   assert.doesNotMatch(statement,/WHERE/i,'índice parcial rechazado por Turso en vivo: '+statement.slice(0,80));
   const columns=statement.match(/\(([^)]*)\)/)?.[1]?.split(',')||[];
   assert.ok(columns.length>=1&&columns.length<=3,'índice con '+columns.length+' columnas: '+statement.slice(0,80));
  }
  assert.equal(sqlStatements(sql).length,statements.length,file+' no debe contener PRAGMA que el parser descarte');
 }
});

test('034/035: las tablas se crean en una base vacía y aceptan una venta y una campaña',async()=>{
 const db=new DatabaseSync(':memory:');
 for(const file of ['turso/migrations/001_core.sql','turso/migrations/002_multitenant.sql','turso/migrations/034_marketing.sql','turso/migrations/035_pos.sql']){
  const sql=await readFile(file,'utf8');
  for(const statement of executableStatements(sql))db.exec(statement);
 }
 const org='11111111-1111-4111-8111-111111111111';
 db.exec("INSERT INTO organizations(id,slug,name) VALUES('"+org+"','demo','Demo')");
 db.exec("INSERT INTO tenant_marketing_segments(organization_id,id,name) VALUES('"+org+"','22222222-2222-4222-8222-222222222222','Todos')");
 db.exec("INSERT INTO tenant_marketing_campaigns(organization_id,id,name,subject,segment_id) VALUES('"+org+"','33333333-3333-4333-8333-333333333333','Oferta','10% hoy','22222222-2222-4222-8222-222222222222')");
 db.exec("INSERT INTO tenant_pos_sales(organization_id,id,folio,method,mode,subtotal_cents,vat_cents,total_cents) VALUES('"+org+"','44444444-4444-4444-8444-444444444444',1,'efectivo','para_llevar',10000,1600,11600)");
 db.exec("INSERT INTO tenant_pos_sale_lines(organization_id,id,sale_id,catalog_item_id,sku,name,quantity,unit_price_cents,line_total_cents) VALUES('"+org+"','55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444','66666666-6666-4666-8666-666666666666','CAFE-500','Café molido 500 g',2,5000,10000)");
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tenant_marketing_campaigns').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tenant_pos_sale_lines').get().n,1);
 db.close();
});
