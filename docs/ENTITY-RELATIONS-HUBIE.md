# Hubie — relaciones entre entidades v1

**Rama:** `feat/pwa-madre-multitenant`, demo aislada de Render.  
**Integración:** migración aditiva `013_entity_relationships.sql`; no modifica las tablas ni los datos anteriores.

## Modelo de entidades

| Origen | Destino | Tipo | Integración |
|---|---|---|---|
| C001 Clientes | C002 CRM | Estructurada | `tenant_deal_clients` por `organization_id + deal_id + client_id` |
| C001 Clientes | C003 Expedientes | Estructurada | FK compuesta existente en `tenant_client_cases` |
| C001 Clientes | C004 Agenda | Estructurada | `tenant_appointment_links` |
| C002 CRM | C004 Agenda | Estructurada | `tenant_appointment_links` por `organization_id + deal_id` |
| C001–C005 | C006/C007/C010 y T001–T020 | Relación opcional | `tenant_entity_links`, verificando existencia y autorización de ambos registros |
| T001–T020 | T001–T020 | Relación opcional | `tenant_entity_links`; conserva origen/destino para navegación bidireccional |
| C005 Inventario | Compras, Proveedores, Cotizaciones, etc. | Relación opcional | Enlace a su registro; cálculo automático de existencias sigue siendo módulo especializado, no deducido del enlace |
| C008 Dashboard | Entidades de la Suite | Lectura | Estadísticas reales por módulos activados |
| C009 Usuarios | Entidades de la Suite | Autorización | Membresía del tenant y roles por Tool; permisos por campo todavía no completados |

### Comportamiento

- **Cliente único:** un CRM y una cita seleccionan un cliente existente mediante su UUID; cambiar el nombre no rompe la relación.
- **CRM + Agenda:** una cita puede elegir una oportunidad. Cuando la oportunidad tiene cliente, la Agenda lo obtiene automáticamente. No se permite usar una oportunidad o un cliente de otra empresa.
- **Expedientes:** ya comparten `client_id` con C001 y muestran su biblioteca de documentos.
- **Clientes 360°:** ficha con estadísticas, oportunidades, expedientes, citas y acceso a cada registro; los totales no están limitados por la paginación de la vista.
- **Vínculos para todas las Tools de registros:** junto a archivos adjuntos se puede seleccionar un registro origen, Tool destino, registro destino y tipo de vínculo; también se puede consultar, abrir y desvincular. Ambos lados deben pertenecer al mismo tenant y estar habilitados.
- **Relaciones automáticas:** C001↔C002↔C003↔C004 aparecen en el panel sin crear vínculos duplicados; son inmutables desde el editor opcional. Se cambian al editar la entidad principal.
- **Legado:** los valores libres `customer` en CRM/Agenda siguen presentes; no se convierten por coincidencia de nombres para evitar asignaciones erróneas. El vínculo por UUID se elige manualmente.
- **Archivado:** los datos vinculados se conservan; los registros archivados se omiten de las búsquedas operativas y relaciones visibles.
- **Datos de demo:** iniciales de muestra se adaptan sin borrar datos personalizados guardados en `sessionStorage`.

### Seguridad / límites

- Todas las rutas de lectura y escritura requieren autenticación de tenant y autorización específica de Tool, salvo el modo explícito `?demo=1`.
- Los FKs compuestos protegen conexiones nativas CRM/Agenda/Clientes. El esquema de vínculos heterogéneos (T/C genéricos) no puede imponer una FK única a 30 tablas distintas: la aplicación verifica existencia del origen y destino con el mismo `organization_id`, permisos y estado antes de insertar o consultar.
- Desactivar C001 o C002 impide consultar sus directorios y establecer nuevos vínculos desde módulos ajenos.
- Los vínculos entre herramientas **no** ejecutan automáticamente procesos de caja, facturación, contratos, inventario o notificaciones. Esos flujos siguen en desarrollo; tener relación entre registros no equivale a tener esas Tools terminadas.
- No está configurada la autenticación Google ni una base Turso conectada al servicio staging, así que **no cargar datos empresariales confidenciales en la demo**.

## Pruebas

- `tests/entity-relations.test.mjs`: validadores, identificadores y dirección canónica.
- `tests/test_entity_relationships.py`: tablas de relación, FKs por organización, duplicados, no autorelación y migración idempotente.
- `tests/demo-entity-links.test.mjs`: cliente↔CRM↔Agenda↔Expedientes, 360°, restricción entre tenants, enlace bidireccional y prevención de reasignaciones conflictivas.
- `tests/demo-link-permissions.test.mjs`: herramientas desactivadas no exponen directorios.
- Suite completa: `npm test` y `python -m unittest discover -s tests -p 'test_*.py'` por GitHub Actions.

## Siguientes desarrollos

1. Catálogo C006, Cotizaciones T013, Cobros T014 y Compras T008 con partidas calculadas, cantidades e impuestos, no simples campos JSON.
2. T004 Tareas con asignación de usuarios, fechas y estados; C010 avisos sobre seguimientos reales.
3. Integración de calendarios reales y CRM con recordatorios.
4. Reglas sectoriales por las 10 Suites, permisos por expediente y documentos confidenciales.
5. Autorización, auditoría y QA con Google/OAuth y Turso staging antes de migrar a producción.

**No se han inventado precios ni agregado nuevas Tools comerciales al Excel v5.**
