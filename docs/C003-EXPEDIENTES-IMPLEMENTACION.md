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
