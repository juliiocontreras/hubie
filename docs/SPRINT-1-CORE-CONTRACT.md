# Hubie 2.0 — Contrato ejecutable de Sprint 1

Estado: especificación para implementación, **no funcionalidad desplegada**.
Alcance: núcleo multitenant, autenticación, autorización y pruebas de aislamiento. No modificar `main` hasta aprobar pruebas.

## Decisiones
- Monolito modular con una única aplicación y base de datos compartida, aislamiento por organización.
- `organization_id` obligatorio en cada registro privado; claves externas compuestas o restricciones equivalentes para impedir referencias cruzadas.
- La identidad autenticada se deriva de la sesión verificada en servidor. Nunca confiar en el `organization_id` del cliente como autorización.
- Roles base: owner, admin, member, viewer. Permisos por acción y por Tool; denegación por defecto.
- Un usuario puede pertenecer a varias organizaciones; debe seleccionar contexto activo explícitamente.
- Hubie Admin utiliza autorización de plataforma separada de los roles de cada organización, con auditoría reforzada.
- No activar expedientes clínicos ni almacenar datos sensibles reales hasta completar controles específicos y revisión legal.

## Modelo mínimo propuesto
- `organizations(id uuid pk, slug unique, name, status, created_at)`
- `profiles(user_id pk references auth.users, display_name, created_at)`
- `memberships(organization_id fk, user_id fk, role, status, created_at, unique(organization_id,user_id))`
- `suite_templates(id pk, code unique, version, status)`
- `tool_definitions(id pk, code unique, version, dependencies jsonb, status)`
- `organization_suites(organization_id fk, suite_template_id fk, version, activated_at)`
- `organization_tools(organization_id fk, tool_definition_id fk, state, activated_at, unique(organization_id,tool_definition_id))`
- `brand_themes(organization_id pk fk, logo_path, primary_color, secondary_color, updated_at)`
- `audit_events(id pk, organization_id nullable, actor_user_id, action, target_type, target_id, occurred_at, metadata_redacted)`

## Contratos de API
- `GET /api/me/organizations`: devuelve exclusivamente membresías activas del usuario autenticado.
- `POST /api/organizations`: crea organización y membresía owner en una transacción; exige identidad autenticada.
- `GET /api/organizations/:id`: requiere membresía activa o permiso de plataforma auditado.
- `PATCH /api/organizations/:id/theme`: requiere permiso `branding.write`; valida tipos, colores, tamaño y MIME del logo.
- `GET /api/organizations/:id/tools`: filtra por tenant y permisos.
- `POST /api/organizations/:id/tools/:toolId/activation-request`: valida compatibilidad, dependencias y autorización; no habilita automáticamente servicios de pago.

Formato de error: `{ code, message, request_id }`; evitar filtrar existencia de recursos de otros tenants.

## Reglas de seguridad obligatorias
1. RLS en tablas privadas, con políticas basadas en membresías activas y contexto autenticado.
2. Revocar acceso al suspender membresía; comprobar también en endpoints y jobs.
3. No usar service role desde el navegador; secretos únicamente en servidor.
4. Archivos privados con autorización por organización y URLs temporales.
5. Eventos de auditoría append-only, sin secretos ni datos clínicos en metadata.
6. Límites de tasa para invitaciones, login y endpoints sensibles.
7. Operaciones con múltiples escrituras en transacciones; claves de idempotencia para creaciones reintentables.
8. Backups y prueba de restauración antes de producción.

## Pruebas de aceptación (bloqueantes)
- Usuario A de organización A no puede leer, modificar, descargar archivos ni enumerar registros de B.
- Usuario miembro de A y B solo ve datos del contexto autorizado; cambiar de tenant no amplía permisos.
- Viewer recibe 403 al escribir; usuario suspendido pierde acceso.
- Request sin sesión recibe 401; ID de organización ajena no concede acceso.
- Intentos de modificar `organization_id` o crear referencias cruzadas fallan.
- La desactivación de una Tool impide acciones sin borrar datos.
- Un error o reintento no crea organizaciones o eventos duplicados.
- No hay secretos en bundle cliente ni datos privados en caché del service worker.

## Evidencia exigida para cerrar Sprint 1
- Migraciones versionadas y reversibles cuando sea posible.
- Pruebas automáticas de RLS, permisos y aislamiento (incluidos casos negativos).
- CI verde: lint, typecheck, tests, build y escaneo básico de dependencias.
- Demo preview: crear empresa, seleccionar empresa, invitar miembro y revocar acceso.
- Checklist de seguridad, respaldos y rollback documentado.

## Límites de alcance
Fuera de Sprint 1: pagos, facturación CFDI, WhatsApp/SMS, Shop, Services, expedientes médicos, logística y automatización avanzada. Sus contratos se documentarán y construirán por separado después del núcleo seguro.

## Siguientes hitos
Sprint 2: registro de Suites/Tools y branding.
Sprint 3: Services con briefs, cotizaciones inmutables, aprobaciones y producción.
Sprint 4: Shop con carrito, órdenes, autorización de gasto y pagos conciliados.
Sprint 5: PWA instalable, monitoreo, pruebas E2E y despliegue controlado.
