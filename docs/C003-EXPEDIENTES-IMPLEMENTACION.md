# C003 Expedientes relacionados con Clientes — implementación inicial

**Estado:** funcional en la rama de desarrollo y en el modo demostración. **No** se ha activado Turso/OAuth reales en el staging de Render.

## Alcance confirmado

- Cada expediente `C003` pertenece obligatoriamente a un `C001` cliente existente de la **misma empresa**.
- En la interfaz: Crear expediente, seleccionar cliente, tipo, estado, notas; buscar por texto, filtrar cliente y estado; editar (sin poder reasignar el cliente) y archivar lógicamente.
- Desde Clientes, botón **Expedientes** que abre C003 filtrado por el cliente.
- Desde la tarjeta del expediente, **Ver documentos** selecciona el caso en el gestor existente de adjuntos, con filtro por nombre, carga/descarga y eliminación; la cantidad se actualiza tras modificaciones.
- **Historial** por caso: creado, actualizado, archivado, documento añadido y documento eliminado.
- Las imágenes y archivos se almacenan según la política existente de `pwa_media` y no en el filesystem efímero de Render.
- Autorización en cada API mediante `authorizeTool(C003)`, sesión, membresía, tenant activo, Tool habilitada y rol. `viewer` puede consultar pero no modificar.
- La UI de demo trabaja solo con datos falsos guardados en `sessionStorage`.

## APIs

- `GET/POST /api/app/:slug/workflows/cases`
- `PATCH/DELETE /api/app/:slug/workflows/cases/:id`
- `GET /api/app/:slug/workflows/cases/:id/history`
- Documentos: `GET/POST /api/app/:slug/tools/C003/records/:id/attachments` y `GET/DELETE /api/app/:slug/attachments/:id`.

## Datos

- Migración aditiva `011_cases.sql`: `tenant_client_cases` y `tenant_case_events`; FK compuesta por organización + cliente; actividad FK compuesta por organización + caso.
- `platform/media-store.mjs` reconoce C003 como entidad real, no como registro genérico.
- C008 Dashboard cuenta expedientes reales activos y excluye antiguas filas genéricas C003.
- Registros antiguos C003 en `tenant_tool_records` **no se borran ni convierten automáticamente**; si existieran datos reales, requieren migración revisada con mapeo al cliente correcto.

## Próximos niveles de funcionalidad (no completados)

- Tipos documentales, versiones, vencimientos, búsquedas de contenido y plantillas por giro.
- Permisos por expediente/documento, retención, restauración de archivados, más allá de las reglas generales actuales.
- Revisión legal y controles clínicos para Health antes de permitir expedientes médicos reales.
- Almacenamiento de objetos privado R2/S3 con análisis antimalware y URLs firmadas para documentos grandes.
- Conexiones posteriores con CRM C002 y Agenda C004 mediante `client_id`, sin recaptura de datos.
- QA de usuarios reales y Turso conectado. El modo demo no certifica la seguridad de producción.

## Pruebas

- `tests/cases-domain.test.mjs`, `tests/demo-cases.test.mjs` (incluye cruce entre tenants), `tests/test_cases.py` (FKs y aislamiento), `tests/test_dashboard_cases.py` y suite de regresión existente.
- CI: `npm test`, `python -m unittest discover -s tests -p 'test_*.py'`, syntax y smoke de rutas protegidas.

## Segunda etapa — Biblioteca de documentos versionados

**Migración aditiva** `012_case_documents.sql` incorpora:
- `tenant_case_documents`: grupo lógico, tipo, vencimiento `YYYY-MM-DD` y contador monotónico de revisiones, siempre vinculado a `(organization_id,case_id)`.
- `tenant_case_document_versions`: revisión inmutable vinculada a `pwa_media.id`. Cada nueva versión guarda sus propios bytes: **no sobrescribe** archivos anteriores.

**Tipos soportados:** otro, contrato, identificación, comprobante, consentimiento, constancia.

**Uso en la Suite:** seleccionar expediente → documento nuevo o nueva versión de uno existente → fecha de vencimiento opcional → subir. Biblioteca agrupa archivos por documento, con acceso desplegable a versiones anteriores y descargas. Permite editar tipo y vencimiento por grupo mediante `PATCH /api/app/:slug/case-documents/:documentId`.

**Alertas visuales:** vencido, vence en ≤30 días, vigente o sin fecha; las fechas no desencadenan aún mensajes o tareas automáticas.

**Compatibilidad:** los adjuntos C003 antiguos sin clasificación siguen visibles. Al agregarles una nueva versión, se crea su grupo lógico y se incorpora el archivo original como versión 1. Otros módulos de adjuntos conservan la interfaz y esquema anteriores.

**Seguridad y límites:** siguen aplicando autenticación por Tool, tenant, permisos owner/admin/member y lectura para viewer; límites de 12 versiones por expediente, 10 MB por archivo (migración 017; antes 2 MB por el CHECK de 010_media.sql), cuota básica de 60 MB/empresa; archivos archivados no se sirven públicamente. Se registra el cambio de metadatos en la línea de tiempo del caso. No existen todavía permisos individuales por documento ni avisos programados, cifrado propio por documento o escaneo antimalware; no cargar documentos sensibles en staging.

**Pruebas:** `tests/case-document-domain.test.mjs`, `tests/demo-case-document-versions.test.mjs` y `tests/test_case_documents.py`. Confirman metadatos válidos, aislamiento entre empresas, vigencia, revisiones recuperables sin sobrescritura, FK compuestas e idempotencia de migración.

**Pendiente antes de uso comercial:** conectar un Turso staging independiente y Google OAuth, validar flujos multiusuario reales, pruebas en navegador móvil, almacenamiento privado de objetos R2/S3 y políticas de retención. La demo `?demo=1` persiste únicamente en la pestaña del navegador.
