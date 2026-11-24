# Hubie — Arquitectura objetivo de PWA Madre

Estado: propuesta técnica inicial. No implica que las funcionalidades descritas ya estén implementadas.

## Diagnóstico inicial (2026-10-26)
- El repositorio contiene páginas HTML estáticas, `madre/index.html`, `panel/index.html` y catálogos JSON de suites, tools, insumos y servicios.
- `app-factory.yml` declara el objetivo PWA en estado bootstrap; `docs/INFRASTRUCTURE.md` contempla manifest, service worker, pruebas y CI/CD como siguientes etapas.
- No se observaron `package.json`, manifest web o service worker en el árbol del repositorio. Esto debe verificarse de nuevo después de incorporar el código de aplicación.

## Principio fundamental
Una sola base de código desplegable; una organización (tenant) por cliente. Las suites son plantillas de capacidades y las Tools son módulos activables por organización. No duplicar código ni bases de datos indiscriminadamente. Separar estrictamente datos por tenant.

## Dominios funcionales
1. Hubie Core: organizaciones, usuarios, membresías, roles y permisos, auditoría.
2. Suite Engine: plantillas sectoriales; Hubie Salud y otras suites se definen declarativamente.
3. Tools: registro y control de módulos habilitados por organización, con dependencias y reglas de acceso del servidor.
4. White Label: logos, paleta, tipografía, configuración de nombre e iconos por tenant; verificar contraste y permisos al subir recursos.
5. Hubie Shop: catálogo y pedidos globales, independientemente del catálogo privado de cada negocio.
6. Hubie Services: brief, cotización, órdenes de trabajo, entregables y aprobaciones.
7. Hubie Admin: gestión restringida de tenants, facturación, productos, servicios y operaciones.

## Entidades mínimas previstas
- organizations(id, slug, status, suite_template_id, theme_config)
- users(id), memberships(user_id, organization_id, role)
- suite_templates(id), tool_definitions(id, dependencies)
- organization_tools(organization_id, tool_id, enabled)
- customers(id, organization_id), appointments(id, organization_id), catalog_items(id, organization_id)
- shop_products(id), shop_orders(id, organization_id), shop_order_items(order_id, product_id)
- service_requests(id, organization_id, status)
- audit_events(id, organization_id, actor_id, action, created_at)

Nunca tomar `organization_id` enviado por el navegador como autorización. Autenticación, membresías y permisos deben validarse en servidor y base de datos (por ejemplo RLS con pruebas de aislamiento).

## PWA
- Manifest instalable con `name`, `short_name`, `start_url`, `scope`, `display: standalone`, iconos 192/512, y variaciones de identidad por dominio cuando sea viable.
- Service worker con versionado; precache únicamente de shell y recursos públicos. Estrategia network-first para navegación y control de actualización.
- No cachear expedientes clínicos, información de pacientes, credenciales, respuestas privadas o financieras en almacenamiento compartido ni en Cache Storage.
- Offline explícito: pantalla informativa y borradores limitados a datos no sensibles; no prometer funcionalidad offline clínica sin modelo de cifrado y sincronización.
- Validar instalación Android/iOS, navegadores y actualización del service worker.

## Fases de migración sin romper producción
1. Inventariar flujos del HTML y catálogos JSON; crear pruebas de regresión.
2. Extraer tokens visuales, layouts, navegación y componentes; UX mobile-first Hubie Salud.
3. Crear proyecto de aplicación con lockfile, scripts de test/lint/build y pipeline CI.
4. Añadir autenticación real, persistencia y aislamiento multitenant antes de aceptar datos de clientes.
5. Incorporar manifest, iconos, fallback y service worker seguro; pruebas automáticas de PWA.
6. Integrar Shop/Services y las herramientas por etapas; pagos webhooks idempotentes.
7. Desplegar primero a preview; validar accesibilidad, seguridad, métricas, respaldos y rollback antes de producción.

## Reglas operativas
- Crear cambios en ramas y PR; no alterar `main` ni desplegar sin validación.
- Nunca subir secretos reales ni reutilizar bases productivas en previews.
- Para Salud: restricciones de acceso por rol, registro de acceso a expedientes, cifrado y revisión de obligaciones legales aplicables antes de almacenar información clínica real.
