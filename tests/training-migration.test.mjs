import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {sqlStatements,executableStatements} from '../platform/migration-parser.mjs';

const EXPECTED_TABLES=['tenant_training_courses','tenant_training_sessions','tenant_training_employees',
 'tenant_training_enrollments','tenant_training_attendance','tenant_training_progress',
 'tenant_training_evaluations','tenant_training_certificates','tenant_training_modules',
 'tenant_training_module_completions','tenant_training_quiz_attempts'];

test('026: migración T022 crea las 11 tablas con scope por tenant',async()=>{
 const sql=await readFile('turso/migrations/026_training.sql','utf8');
 for(const table of EXPECTED_TABLES){
  assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+table+'\\('),table+' no creada');
  assert.match(sql,new RegExp(table+'\\(\\n organization_id TEXT NOT NULL'),table+' sin organization_id primero');
 }
 const statements=executableStatements(sql);
 assert.equal(statements.length,26,'la 026 debe tener 26 sentencias ejecutables');
 assert.equal(statements.filter(s=>/^CREATE TABLE/i.test(s)).length,11);
 assert.equal(statements.filter(s=>/^CREATE INDEX/i.test(s)).length,15);
});

test('026: sin PRAGMA, sin índices parciales y sin índices de 4+ columnas',async()=>{
 const sql=await readFile('turso/migrations/026_training.sql','utf8');
 const statements=executableStatements(sql);
 assert.ok(statements.every(s=>!/^pragma/i.test(s)),'ninguna sentencia ejecutable debe ser PRAGMA');
 for(const statement of statements){
  if(!/^CREATE INDEX/i.test(statement))continue;
  assert.doesNotMatch(statement,/WHERE/i,'índice parcial rechazado por Turso en vivo: '+statement.slice(0,80));
  const columns=statement.match(/\(([^)]*)\)/)?.[1]?.split(',')||[];
  assert.ok(columns.length>=1&&columns.length<=3,'índice con '+columns.length+' columnas: '+statement.slice(0,80));
 }
 assert.equal(sqlStatements(sql).length,statements.length,'026 no debe contener PRAGMA que el parser descarte');
});

test('026: no usa números de migración de otros frentes ni toca tablas ajenas',async()=>{
 const sql=await readFile('turso/migrations/026_training.sql','utf8');
 const statements=executableStatements(sql);
 assert.ok(statements.every(s=>!s.includes('tenant_notifications')),'ninguna sentencia debe crear ni tocar tenant_notifications');
 assert.ok(statements.every(s=>!/^ALTER TABLE/i.test(s)),'026 no altera tablas existentes');
 assert.ok(statements.every(s=>!s.includes('tenant_catalog_items')),'026 no toca tenant_catalog_items');
});

test('026: aplica limpia en SQLite en memoria y las UNIQUE se cumplen',async()=>{
 const sql=await readFile('turso/migrations/026_training.sql','utf8');
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=OFF');
 try{
  for(const statement of executableStatements(sql))db.exec(statement);
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'tenant_training_%' ORDER BY name").all().map(r=>r.name);
  assert.deepEqual(tables,[...EXPECTED_TABLES].sort());
  const org='11111111-1111-4111-8111-111111111111';
  db.exec(`INSERT INTO tenant_training_courses(organization_id,id,name) VALUES('${org}','c1','Seguridad en almacén')`);
  db.exec(`INSERT INTO tenant_training_sessions(organization_id,id,course_id,starts_at,ends_at,capacity) VALUES('${org}','s1','c1','2027-01-15T09:00:00Z','2027-01-15T12:00:00Z',25)`);
  db.exec(`INSERT INTO tenant_training_employees(organization_id,id,name,email) VALUES('${org}','e1','María López','maria@empresa.mx')`);
  db.exec(`INSERT INTO tenant_training_enrollments(organization_id,id,employee_id,course_id) VALUES('${org}','n1','e1','c1')`);
  db.exec(`INSERT INTO tenant_training_attendance(organization_id,id,session_id,employee_id,status) VALUES('${org}','a1','s1','e1','presente')`);
  assert.throws(()=>db.exec(`INSERT INTO tenant_training_attendance(organization_id,id,session_id,employee_id,status) VALUES('${org}','a2','s1','e1','ausente')`),/UNIQUE constraint failed/,'asistencia duplicada sesión+empleado');
  assert.throws(()=>db.exec(`INSERT INTO tenant_training_employees(organization_id,id,name,email) VALUES('${org}','e2','Otra','maria@empresa.mx')`),/UNIQUE constraint failed/,'correo de empleado duplicado por tenant');
  db.exec(`INSERT INTO tenant_training_certificates(organization_id,id,employee_id,course_id,enrollment_id,folio) VALUES('${org}','t1','e1','c1','n1','CAP-2026-ABCDEF')`);
  assert.throws(()=>db.exec(`INSERT INTO tenant_training_certificates(organization_id,id,employee_id,course_id,enrollment_id,folio) VALUES('${org}','t2','e1','c1','n1','CAP-2026-ABCDEF')`),/UNIQUE constraint failed/,'folio de constancia duplicado');
  db.exec(`INSERT INTO tenant_training_progress(organization_id,id,enrollment_id,completed_modules,total_modules,percent) VALUES('${org}','p1','n1',1,2,50)`);
  assert.throws(()=>db.exec(`INSERT INTO tenant_training_progress(organization_id,id,enrollment_id,completed_modules,total_modules,percent) VALUES('${org}','p2','n1',0,0,0)`),/UNIQUE constraint failed/,'avance duplicado por inscripción');
  // Segunda aplicación idempotente (IF NOT EXISTS en todo).
  for(const statement of executableStatements(sql))db.exec(statement);
 }finally{db.close();}
});
