# Auditoría funcional Hubie — catálogo v5

**Fecha:** 5 de noviembre de 2026 (auditoría del código de la rama de desarrollo).  
**Fuente de catálogo:** `assets/catalog.json`, contrastado con la transcripción recuperada de `Hubie_Tabla_Datos_Simple_v5.xlsx`. Los bytes originales del Excel no estuvieron disponibles; no se revisaron sus fórmulas.

## Dictamen

- 10/10 Suites, 30/30 Tools y 6/6 Extras coinciden por IDs, nombres y precios con el registro v5 recuperado.
- **4/30** Tools tienen flujos de negocio operativos pero parciales: C001 Clientes, C002 CRM, C004 Agenda, C005 Inventario.
- **2/30** tienen funciones transversales parciales: C008 Dashboard y C009 Usuarios.
- **24/30** dependen de registros genéricos, algunos con adjuntos. No significa que cumplan el objetivo de su nombre.
- El catálogo aún declara `complete:false`. `data/suites.json` es legado incompatible con v5 y **no** debe mezclarse.
- `assets/catalog.json` contiene 6 Extras pero no modela los 10 Servicios Hubie (SV001–SV010) de la pestaña comercial del Excel.
- Los defaults de Tools son los mismos Core para las 10 Suites; elegir un giro no activa todavía flujos de negocio especializados.
- El demo Render no demuestra persistencia Turso ni permisos OAuth reales.

## Adenda 2026-11-24 — Build Odoo (32 → 41 Tools)

**Fecha:** 24 de noviembre de 2026. La auditoría v5 del 2026-11-05 quedó desactualizada: el programa P0 posterior dio profundidad real a los vecinos, verificada en código antes de construir (no se duplicó nada):
- C002 CRM: deals reales con asignación y cotizaciones. C005 Inventario: stock real por SKU y variantes. T004 Tareas: tabla `tenant_tasks` real con responsable, vencimiento, estado, prioridad y origen (`source_tool_id`/`source_record_id`). T005 Kanban: tableros/fases/tarjetas reales. T013 Cotizaciones: partidas reales + aceptación pública. T015 Facturación: facturas reales desde cotizaciones aceptadas.
- Por eso T025 reutiliza las tareas de T004 (`source_tool_id='T025'`) y enlaza un tablero T005 en vez de crear su propio motor de tareas; T026 reutiliza `tenant_training_employees` de T022 (los empleados de capacitación son los mismos); T030 descuenta inventario por SKU exacto contra C005; T029 degrada sin clave Resend como las invitaciones por correo (nunca finge el envío).

**Nuevas Tools (precio `null`, `pricing: "quote"` — el precio lo decide Julio):**

| ID | Tool | Grupo | Alcance implementado |
|---|---|---|---|
| T023 | Contabilidad | Finanzas | Plan de cuentas, pólizas/asientos, balanza de comprobación, estado de resultados y balance general. Sin conexión al SAT ni timbrado: cálculo y reportes sobre los movimientos del tenant. |
| T024 | Pedidos de venta | Finanzas | Pedidos desde cotización aceptada (T013), estados, entrega con guía, conversión a cobro, factura y CxC. |
| T025 | Proyectos | Operación | Proyectos con hitos, tareas con responsable y fechas (reutiliza T004), avance derivado, tablero Kanban (T005) enlazado. |
| T026 | Empleados | Recursos Humanos | Directorio, puesto, área, contrato, documentos (metadatos); reutiliza los empleados de T022. |
| T027 | Asistencia y vacaciones | Recursos Humanos | Registro de jornada, solicitudes de vacaciones/permisos con aprobación de dueño/admin. |
| T028 | Mesa de ayuda | Operación | Tickets con estados, prioridad, asignación y respuestas en hilo. |
| T029 | Marketing | Marketing | Campañas por correo con segmentos de clientes; sin clave Resend no se envía nada real (degrada mostrando el contenido y marcando `sin_envio`). |
| T030 | Punto de venta | Finanzas | Venta rápida con carrito desde catálogo/inventario, cobro registrado, ticket con IVA; descuenta existencias por SKU si el producto las lleva. |
| T031 | Nómina | Recursos Humanos | Periodos, percepciones/deducciones configurables, recibos por empleado, cálculo básico. Límite honesto en la UI: sin timbrado CFDI de nómina ni cálculo real de IMSS/ISR. |

**Verificación del build:** 440 tests en verde (335 antes + 105 nuevos: 36 Finanzas, 15 Operación, 20 RH, 34 Ventas/Marketing); migraciones 028–036 (21 tablas nuevas, 105 → 126; `/healthz` sigue en 84); renders Playwright reales a 390 y 1440 px de los 9 flujos principales, sin desbordamiento horizontal ni errores de consola.

**Pendiente (no bloqueante):** precios de T022 y T023–T031; clave Resend para envío real; CFDI/PAC (T015, T024, T031); verificación de migraciones 028–036 contra Turso real; revisión de Julio a 390 px en su teléfono.

## Matriz de brechas por Tool

| ID | Tool | Estado del código | Prioridad | Mínimo faltante |
|---|---|---|---|---|
| C001 | Clientes | Operativa básica | P0 | Relación mediante client_id, historial de interacciones, importación y deduplicación |
| C002 | CRM | Operativa básica | P0 | Relacionar client_id, asignación, tareas y cotizaciones |
| C003 | Expedientes | Genérica + adjuntos | P0 | Expediente-cliente, tipos de documento, vencimientos, búsqueda y versionado |
| C004 | Agenda | Operativa básica | P1 | Relaciones con clientes, responsables y calendarios externos |
| C005 | Inventario | Operativa básica | P1 | Stock por variante, almacén, lote, compras y proveedor |
| C006 | Catálogo | Registro genérico | P0 | Fichas reales de productos/servicios, precios, fotos, categorías y variantes |
| C007 | Control de gastos | Registro genérico | P1 | Gastos ligados a proveedor, comprobantes, presupuestos y reportes |
| C008 | Dashboard | Parcial transversal | P1 | Filtros, métricas de operación, metas y series temporales |
| C009 | Usuarios | Parcial transversal | P0 | Permisos por módulo/expediente, invitaciones y suspensión verificable |
| C010 | Notificaciones | Registro genérico | P1 | Motor de alertas y bandeja; no solo mensajes ingresados manualmente |
| T001 | Portal de clientes | Registro genérico | P2 | Portal externo con login seguro, consulta de expedientes y solicitudes |
| T002 | Programa de lealtad | Registro genérico | P2 | Puntos y canjes transaccionales, no campos manuales |
| T003 | Checklists | Registro genérico | P1 | Plantillas, ítems verificables, responsable y evidencia |
| T004 | Tareas | Registro genérico | P1 | Responsable real, fechas, estados y notificaciones |
| T005 | Kanban | Registro genérico | P2 | Tablero real arrastrable con fases y permisos |
| T006 | Firmas digitales | Registro genérico | P2 | Firma real con evidencia, consentimiento y evaluación jurídica |
| T007 | Formularios personalizados | Registro genérico | P1 | Constructor de formularios, validación y creación de registros |
| T008 | Compras | Registro genérico | P1 | Orden de compra por partidas y recepción ligada al stock |
| T009 | Proveedores | Registro genérico | P1 | Directorio maestro, condiciones y documentos del proveedor |
| T010 | Almacenes | Registro genérico | P1 | Stock por almacén y transferencias |
| T011 | Lotes y caducidades | Registro genérico | P2 | Trazabilidad por lote y alertas de caducidad |
| T012 | Escáner QR/Barras | Registro genérico | P2 | Escaneo real por cámara/lector y vínculo al SKU |
| T013 | Cotizaciones | Registro genérico | P0 | Partidas de catálogo, precios, versiones, PDF y aceptación |
| T014 | Cobros | Registro genérico | P1 | Pagos aplicados a deuda, conciliación y comprobantes |
| T015 | Facturación | Registro genérico | P2 | Integración PAC/SAT para CFDI y XML/PDF; no simular emisión |
| T016 | Caja | Registro genérico | P1 | Aperturas, turnos, arqueos y cierres |
| T017 | Cuentas por cobrar | Registro genérico | P1 | Saldos ligados a venta y abonos, antigüedad |
| T018 | Cuentas por pagar | Registro genérico | P1 | Proveedores/compra, vencimientos, abonos y aprobaciones |
| T019 | Comisiones | Registro genérico | P2 | Reglas de comisión ligadas a cierres validados |
| T020 | Reportes avanzados | Registro genérico | P1 | Consultas, filtros, reportes y exportación sobre datos reales |
| T022 | Capacitaciones | Operativa (2026-11-16, fuera del alcance v5) | P2 | Cursos con módulos y quizzes, sesiones, empleados, inscripciones, asistencia, avance derivado, evaluaciones, constancias con folio CAP-AAAA-XXXXXX, tablero RH y exportación CSV; avisos solo en la app, sin correo; constancia sin PDF |

## Rediseño requerido de C003 Expedientes

**Lo existente:** formulario genérico + archivos privados adjuntos al ID del registro C003.

**Lo no implementado:** relación por `client_id` al registro maestro C001, expedientes múltiples por cliente, clasificación documental, versionado, vencimientos, control de acceso por documento, búsqueda, historial y enlaces al CRM, Agenda y Cotizaciones.

### Modelo sugerido

- `tenant_cases`: `organization_id`, `case_id`, `client_id`, `type`, `status`, `assigned_user_id`, fechas e indicadores de completitud.
- `tenant_case_documents`: `organization_id`, `case_id`, `media_id`, `document_type`, `version`, `expires_at`, `visibility`, `uploaded_by` y checksum.
- `tenant_case_events`: `organization_id`, `case_id`, `actor_user_id`, `event_type`, `source_tool_id`, `source_record_id`, timestamp y metadatos.
- Llaves foráneas compuestas por empresa + identificador de cliente/expediente para impedir cruces entre tenants.
- En la interfaz: `Clientes → ficha → Expedientes → tipo → Documentos / Historial / Seguimiento / Vinculados`.
- Acceso por rol, categoría documental y contexto de Suite; para Health aplicar permisos reforzados y validar requisitos legales antes de manejar información clínica real.
- Para producción, migrar binarios grandes desde base64 en SQL a almacenamiento privado tipo R2/S3 con URLs firmadas y análisis antimalware. Mantener metadatos en Turso.
- **Aceptación P0:** seleccionar un cliente real, crear expediente, subir/consultar/buscar 3 documentos, controlar permisos, registrar eventos y verificar aislamiento de dos empresas con usuarios distintos.

## Especialización real por Suite

| Suite | Funcionalidad sectorial prioritaria |
|---|---|
| S001 Beauty | Agenda por profesional, ficha del servicio, fotos/consentimientos, paquetes y lealtad |
| S002 Health | Expediente clínico, consentimientos, estudios, indicaciones, acceso restringido |
| S003 Realty | Propiedades/unidades, propietarios, contratos, visitas, arrendamientos y comisiones |
| S004 Commerce | Catálogo con variantes, pedidos/POS, devoluciones y sucursales |
| S005 Food | Menú, comandas, mesas, recetas/insumos, merma y caja |
| S006 Office | Proyectos, entregables, expedientes contractuales, aprobaciones y tiempos |
| S007 Jobs | Vacantes, ATS, currículums/consentimientos, entrevistas y colocaciones |
| S008 Pet | Tutor + mascota, cartillas, vacunas, estética/hospedaje y recordatorios |
| S009 Academy | Estudiantes/tutores, cursos/grupos, asistencias, calificaciones y cobros |
| S010 Events | Proyecto/evento, proveedores, hitos, checklist, contratos y pagos |

## Nuevas Tools propuestas — **sin asignar precio ni ID comercial**

1. Órdenes y pedidos (Commerce, Food, Office).
2. Motor de automatizaciones (transversal, integrado con C010).
3. Sucursales y equipos (transversal, relacionado con Extra E002).
4. Proyectos, hitos y entregables (Office, Realty, Events).
5. Tickets y servicio al cliente (transversal, integrado con T001).
6. Consentimientos y autorizaciones (Health, Beauty, Pet y Jobs).
7. Contratos y renovaciones (Realty, Office, Events).
8. Reservas públicas (Beauty, Health, Pet, Events; extensión de C004).
9. Propiedades y unidades (Realty).
10. Recetas, ingredientes y mermas (Food).
11. Mascotas y cartillas (Pet).
12. Cursos, grupos y asistencia (Academy).

De esta lista, el build Odoo del 2026-11-24 implementó: #1 Órdenes y pedidos (T024 Pedidos de venta + T030 Punto de venta), #4 Proyectos, hitos y entregables (T025 Proyectos) y #5 Tickets y servicio al cliente (T028 Mesa de ayuda). El resto sigue como backlog sin asignar.

## Desarrollo recomendado por etapas

1. **P0 base relacional:** cliente maestro y relaciones con CRM/Expedientes/Agenda; seguridad y permisos detallados.
2. **P0 documentos:** C003 Expedientes completo y almacenamiento escalable.
3. **P0 venta:** C006 Catálogo estructurado + T013 Cotizaciones con partidas, PDF y aceptación.
4. **P1 operativa:** tareas, checklists, avisos, gastos, compras y proveedores conectados.
5. **P1 verticalización:** activar plantillas, campos, flujos y permisos por Suite sin duplicar aplicaciones.
6. **P2 integraciones:** facturación CFDI, firma legal, cámara/barcode, pagos reales y portal externo, sujetos a revisión de seguridad y proveedores.

La propuesta es un backlog/auditoría, **no una afirmación de funcionalidades ya implementadas**. Validar con pruebas de extremo a extremo y Turso staging real antes de liberar a clientes.

## Inconsistencia adicional del Excel v5

La hoja **Reglas de cobro** menciona cinco usuarios incluidos para Suites Automotive e Industrial, pero esas dos Suites **no aparecen** entre las diez S001–S010 de la hoja **Suites**. Esta regla podría proceder de una versión anterior; no crear Suites, usuarios incluidos o tarifas nuevas hasta confirmar cuál versión comercial es la vigente.
