// Migración 017: el límite de adjuntos sube de 2 MB a 10 MB.
// Se aplica 010 y luego 017 sobre SQLite en memoria (node:sqlite) con filas
// de ejemplo y una versión de documento de expediente que referencia a
// pwa_media, y se comprueba que los datos sobreviven, que 5 MB pasa y que
// 11 MB falla. También se documenta con evidencia el caso con claves
// foráneas encendidas: el DROP propaga el CASCADE a las versiones (ver
// INTEGRATION.md); el pipeline HTTP de Turso nunca las enciende por
// conexión, así que en vivo aplica el caso FK OFF.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {executableStatements} from '../platform/migration-parser.mjs';
import {MAX_ATTACHMENT_BYTES} from '../platform/media-policy.mjs';

const m010=readFileSync(new URL('../turso/migrations/010_media.sql',import.meta.url),'utf8');
const m017=readFileSync(new URL('../turso/migrations/017_media_limit.sql',import.meta.url),'utf8');

function seedDb(fk=false){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys='+(fk?'ON':'OFF'));
 db.exec("CREATE TABLE organizations(id TEXT PRIMARY KEY); CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO organizations VALUES('org-1'); INSERT INTO users VALUES('u-1');");
 for(const s of executableStatements(m010))db.exec(s);
 db.prepare("INSERT INTO pwa_media(id,scope,organization_id,kind,tool_id,record_id,name,mime,size_bytes,content_b64,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
  .run('m1','tenant','org-1','attachment','C003','r1','doc.pdf','application/pdf',1500000,'JVBERi0x','u-1');
 db.prepare("INSERT INTO pwa_media(id,scope,organization_id,kind,tool_id,record_id,name,mime,size_bytes,content_b64,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
  .run('m2','madre',null,'dashboard_bg',null,null,'bg.png','image/png',500000,'iVBORw0','u-1');
 db.exec(`CREATE TABLE tenant_case_document_versions(organization_id TEXT, document_id TEXT, media_id TEXT NOT NULL UNIQUE REFERENCES pwa_media(id) ON DELETE CASCADE, version INTEGER, PRIMARY KEY(organization_id,document_id,version)); INSERT INTO tenant_case_document_versions VALUES('org-1','d1','m1',1);`);
 return db;
}
function apply017(db){
 for(const s of executableStatements(m017))db.exec(s);
}
const insertMedia=(db,id,size)=>db.prepare("INSERT INTO pwa_media(id,scope,organization_id,kind,tool_id,record_id,name,mime,size_bytes,content_b64) VALUES(?,?,?,?,?,?,?,?,?,?)")
 .run(id,'tenant','org-1','attachment','C006','r2','a.pdf','application/pdf',size,'eA');

test('017: con 010 vigente un adjunto de 5 MB falla; tras 017 pasa y 11 MB sigue fallando',()=>{
 const db=seedDb();
 assert.throws(()=>insertMedia(db,'m3',5000000),/CHECK constraint failed/);
 apply017(db);
 insertMedia(db,'m3',5000000);
 assert.throws(()=>insertMedia(db,'m4',11000000),/CHECK constraint failed/);
 insertMedia(db,'m5',10000000);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM pwa_media').get().c,4);
 db.close();
});

test('017: los datos y la versión de documento sobreviven al rebuild (FK apagadas, caso Turso)',()=>{
 const db=seedDb();
 apply017(db);
 const rows=db.prepare('SELECT id,name,size_bytes FROM pwa_media ORDER BY id').all();
 assert.deepEqual(rows.map(r=>r.id),['m1','m2']);
 assert.equal(rows[0].size_bytes,1500000);
 assert.equal(rows[1].name,'bg.png');
 assert.equal(db.prepare('SELECT COUNT(*) c FROM tenant_case_document_versions').get().c,1);
 assert.equal(db.prepare("SELECT media_id FROM tenant_case_document_versions WHERE document_id='d1'").get().media_id,'m1');
 // La FK sigue apuntando a pwa_media por nombre tras el renombre.
 assert.equal(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tenant_case_document_versions'").get().sql.includes('REFERENCES pwa_media(id)'),true);
 db.close();
});

test('017: es idempotente (correrla dos veces no duplica ni pierde filas)',()=>{
 const db=seedDb();
 apply017(db);apply017(db);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM pwa_media').get().c,2);
 insertMedia(db,'m3',5000000);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM pwa_media').get().c,3);
 db.close();
});

test('017: índices recreados con 3 columnas como máximo y sin WHERE (regla Turso)',()=>{
 const db=seedDb();
 apply017(db);
 const indexes=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name='pwa_media' AND sql IS NOT NULL").all();
 assert.ok(indexes.length>=2);
 for(const idx of indexes){
  assert.doesNotMatch(idx.sql||'',/WHERE/i);
  const cols=(idx.sql.match(/\(([^)]+)\)/)?.[1]||'').split(',').length;
  assert.ok(cols<=3,'índice '+idx.name+' tiene '+cols+' columnas');
 }
 const check=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pwa_media'").get().sql;
 assert.match(check,/size_bytes<=10000000/);
 assert.doesNotMatch(check,/size_bytes<=2000000/);
 db.close();
});

test('017: evidencia del riesgo con FK encendidas: el DROP propaga el CASCADE a versiones',()=>{
 const db=seedDb(true);
 apply017(db);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM pwa_media').get().c,2);
 // Con foreign_keys=ON el DROP TABLE de la tabla padre borra las filas
 // hijas por el ON DELETE CASCADE de tenant_case_document_versions.
 assert.equal(db.prepare('SELECT COUNT(*) c FROM tenant_case_document_versions').get().c,0);
 db.close();
});

test('política y migración coinciden en 10 MB (no en 2 MB)',()=>{
 assert.equal(MAX_ATTACHMENT_BYTES,10_000_000);
 assert.match(m017,/10000000/);
 // El 2000000 solo aparece en el comentario de cabecera (el valor viejo que
 // se sustituye); ninguna sentencia SQL ejecutable lo contiene.
 assert.doesNotMatch(executableStatements(m017).join(';'),/2000000/);
 assert.doesNotMatch(executableStatements(m017).join(';'),/pragma/i);
});
