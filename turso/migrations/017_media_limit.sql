-- 017: Subir el límite de adjuntos de 2 MB a 10 MB (P0, auditoría §2.3.2).
-- Decisión con evidencia: MAX_ATTACHMENT_BYTES = 10_000_000 en
-- platform/media-policy.mjs y el servidor acepta hasta 13,6 MB en el endpoint
-- de adjuntos; solo el CHECK de 010_media.sql (size_bytes <= 2000000)
-- discrepaba. La política y el servidor coinciden, así que se alinea la base
-- de datos a 10 MB, no la política a 2 MB.
-- SQLite no permite ALTER TABLE para cambiar un CHECK: se recrea la tabla
-- (crear tabla nueva, copiar datos, eliminar vieja, renombrar), que es el
-- patrón documentado de SQLite. La recreación es idempotente: si se vuelve
-- a correr, copia la tabla ya migrada y renombra de nuevo sin perder filas.
-- Los índices originales de 010 eran de 4 columnas (scope, organization_id,
-- kind, created_at) y (organization_id, tool_id, record_id, created_at): el
-- motor Turso en vivo rechaza índices de 4+ columnas con SQL_INPUT_ERROR
-- "invalid expression in CREATE INDEX" (ver 016_commerce.sql), así que se
-- recrean con 3 columnas como máximo y sin WHERE. Las consultas ordenan por
-- rowid, no por created_at, así que no cambia ningún plan de lectura.
-- RIESGO RESIDUAL (verificado en SQLite en memoria, tests/media-limit.test.mjs):
-- tenant_case_document_versions.media_id referencia pwa_media(id) ON DELETE
-- CASCADE. Con claves foráneas APAGADAS (el default del pipeline HTTP de
-- Turso: ningún PRAGMA se ejecuta por conexión, auditoría §2.3.1) el DROP
-- conserva las versiones y los datos sobreviven. Con claves foráneas
-- ENCENDIDAS el DROP propagaría el CASCADE y borraría las versiones de
-- documentos de expedientes. Por eso, tras el despliegue hay que verificar
-- en Turso viva: /healthz en ready, SELECT COUNT(*) de pwa_media y de
-- tenant_case_document_versions antes/después, y una subida de prueba de
-- 5 MB (debe pasar) y de 11 MB (debe fallar con Invalid media).
-- Si esa verificación mostrara pérdida de versiones, la alternativa es
-- alinear la política a 2 MB en vez de este rebuild; no se ha visto
-- evidencia de ello en el pipeline actual.

CREATE TABLE pwa_media_new (
 id TEXT PRIMARY KEY,
 scope TEXT NOT NULL CHECK(scope IN ('madre','tenant')),
 organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('dashboard_bg','sidebar_bg','attachment')),
 tool_id TEXT,
 record_id TEXT,
 name TEXT NOT NULL,
 mime TEXT NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=10000000),
 content_b64 TEXT NOT NULL,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((scope='madre' AND organization_id IS NULL AND kind!='attachment' AND tool_id IS NULL AND record_id IS NULL)
  OR (scope='tenant' AND organization_id IS NOT NULL)),
 CHECK ((kind='attachment' AND tool_id IS NOT NULL AND record_id IS NOT NULL)
  OR (kind!='attachment' AND tool_id IS NULL AND record_id IS NULL))
);
INSERT INTO pwa_media_new(id,scope,organization_id,kind,tool_id,record_id,name,mime,size_bytes,content_b64,created_by,created_at)
 SELECT id,scope,organization_id,kind,tool_id,record_id,name,mime,size_bytes,content_b64,created_by,created_at FROM pwa_media;
DROP TABLE IF EXISTS pwa_media;
ALTER TABLE pwa_media_new RENAME TO pwa_media;
CREATE INDEX IF NOT EXISTS idx_pwa_media_background ON pwa_media(scope,organization_id,kind);
CREATE INDEX IF NOT EXISTS idx_pwa_media_record ON pwa_media(organization_id,tool_id,record_id);
