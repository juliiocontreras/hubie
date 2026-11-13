# Auditoría multitenant — Hubie PWA

- **Fecha:** 2026-11-12
- **Repo:** `~/workspace/hubie-check` (en el informe, `juliiocontreras/hubie`)
- **Rama / HEAD:** `main` @ `abc2afd` — «fix(pwa): brand name wrap, Madre suite distribution, logo fallback»
- **Árbol:** limpio al iniciar la auditoría (`git status` sin cambios)
- **Alcance:** solo auditoría (Parte A). No se implementó nada, no se hizo commit, no se editó ningún otro archivo.
- **Método:** lectura directa del código (servidor, `platform/`, migraciones Turso, consolas Madre/cliente, demo-backend, catálogo y docs del repo). Se ejecutó la suite de tests como verificación de contexto: `node --test tests/*.test.mjs` → **75 pass, 0 fail** (33 archivos `.test.mjs`). Ojo: la mayoría de los tests son de contrato/estáticos (leen archivos y comprueban patrones) más pruebas de comportamiento del `demo-backend`; pasar en verde no equivale a verificación en vivo con Turso + Google reales.
- **Lo que NO se verificó:** no hay acceso a Turso ni a Google OAuth desde esta auditoría, no se levantó el servidor contra una base real ni se probó ningún flujo con un usuario real. Todo lo marcado «no verificado en vivo» es afirmación sobre el código, no sobre el despliegue. El estado real del staging (Render) se cita solo desde `docs/RENDER-PWA-DEPLOY.md` y `docs/ACTIVACION-GOOGLE-TURSO-STAGING.md`.

> Resumen en una frase: **la plataforma tiene un núcleo multitenant real y bien aislado (tenants, membresías, herramientas por tenant, 6 módulos operativos con dominio propio, encuestas y adjuntos), pero no tiene forma de cobrar, no tiene alta autoservicio, no envía invitaciones ni notificaciones, no tiene búsqueda global, ni exportación/importación, y la auditoría solo se escribe, nunca se lee.** Hoy solo se puede vender con operación manual del superadmin y cobro fuera de la plataforma.

---

## 1. Catálogo de herramientas — qué hay, qué es real y qué es un formulario genérico

### 1.1 Fuente de verdad

- **Catálogo operativo y comercial:** `assets/catalog.json` (versión 3, fuente `Hubie_Tabla_Datos_Simple_v5.xlsx`, moneda `MXN`, `complete: false` — el propio catálogo advierte que la fuente aún puede requerir validación final). Lo consume `platform/catalog.mjs` (`catalog`, `getSuite`, `getTool`, `defaultToolIds`, `normalizeTenantInput`, `resolveEnabledTools`) y lo expone `GET /api/admin/catalog` (`server.mjs`, `admin.mjs:getAdminCatalog`).
- **No usar `data/`:** `data/suites.json` (14 suites S001–S014) y `data/tools.json` (30 herramientas C001–C030 con otro modelo de precios) son un catálogo histórico incompatible; `platform/catalog.mjs` lo dice explícito: «Do not derive prices from data/suites.json». `data/tools_extras.json` (46 entradas) tampoco se usa. Riesgo: cualquiera que lea `data/` llega a precios/suites distintos a los que cobra el cotizador.
- **Reglas comerciales** (`catalog.rules`): anticipo `depositRate: 0.5` (50 %), saldo hasta `maxBalanceInstallments: 6` pagos, `monthlyPlatformFee: 0`. No hay mensualidad de plataforma en el modelo vigente.

### 1.2 Suites (10, pago único, sin herramientas ligadas en el catálogo)

| Suite | Precio MXN | Usuarios incluidos (`users`) |
|---|---|---|
| S001 Beauty | 9,900 | 2 |
| S002 Health | 29,900 | 2 |
| S003 Realty | 18,900 | 2 |
| S004 Commerce | 11,900 | 2 |
| S005 Food | 12,900 | 2 |
| S006 Office | 14,900 | 2 |
| S007 Jobs | 24,900 | 2 |
| S008 Pet | 16,900 | 2 |
| S009 Academy | 16,900 | 2 |
| S010 Events | 14,900 | 2 |

Matiz importante: **en `assets/catalog.json` las suites NO traen lista de herramientas** (solo `id`, `name`, `price`, `users`). La «suite» es hoy una etiqueta comercial + precio base; lo que realmente define qué puede usar una empresa es la lista `toolIds` por tenant en `tenant_tools` (ver §2). El cotizador (`precios.html` + `assets/quote.js`) suma `suite.price + herramientas pagadas elegidas` y calcula el anticipo del 50 %; el total con las 20 herramientas pagadas va de **$79,300 (S001) a $99,300 (S002)**.

### 1.3 Herramientas (31)

**Core incluido — 10, precio $0, `included: true` (`assets/catalog.json`):**

| ID | Nombre | Estado real |
|---|---|---|
| C001 Clientes | Dominio normalizado completo (`platform/operations-clients.mjs`, `platform/clients-domain.mjs`, tabla `tenant_client_profiles`) | Real |
| C002 CRM | Dominio normalizado: pipeline lead→won/lost, `follow_up_at`, enlace a cliente (`platform/operations-crm.mjs`, `platform/workflows.mjs:normalizeDeal`, `tenant_crm_deals`) | Real |
| C003 Expedientes | Dominio normalizado: casos + documentos tipificados con vencimiento y versiones inmutables + historial (`platform/operations-cases.mjs`, `platform/cases-domain.mjs`, `platform/case-document-domain.mjs`, `platform/media-store.mjs`, `tenant_client_cases` / `tenant_case_documents` / `tenant_case_document_versions` / `tenant_case_events`) | Real |
| C004 Agenda | Dominio normalizado: citas con control de solape por `organization_id + resource` (`platform/operations-agenda.mjs`, `tenant_schedule_events`) | Real |
| C005 Inventario | Dominio normalizado: SKU única por empresa, movimientos con control de stock negativo (`platform/operations-inventory.mjs`, `tenant_inventory_items` / `tenant_inventory_movements`) | Real |
| C006 Catálogo | Registro genérico (`tenant_tool_records`) | Formulario |
| C007 Control de gastos | Registro genérico | Formulario |
| C008 Dashboard | Solo conteos por herramienta (`platform/dashboard-counts.sql`, `platform/records.mjs:toolRecords`) | Solo lectura |
| C009 Usuarios | Solo lectura, vía `tenantConfig` (`platform/records.mjs`); no tiene registros | Solo lectura |
| C010 Notificaciones | Registro genérico con plantilla destinatario/contenido/fecha (`assets/tool-forms.js`) — **no envía nada** (ver §7) | Formulario |

**De pago — 20 (T001–T020), $2,100–$6,100 c/u, suma $69,400; más T021:**

| ID | Nombre | Precio | Estado real |
|---|---|---|---|
| T001 Portal de clientes | 4,900 | Genérico |
| T002 Programa de lealtad | 2,800 | Genérico |
| T003 Checklists | 2,100 | Genérico |
| T004 Tareas | 2,100 | Genérico (tiene registros de ejemplo en el fixture QA) |
| T005 Kanban | 2,800 | Genérico |
| T006 Firmas digitales | 3,100 | Genérico — `assets/tool-forms.js` advierte: «No aplica una firma electrónica real» |
| T007 Formularios personalizados | 2,800 | Genérico |
| T008 Compras | 3,900 | Genérico |
| T009 Proveedores | 2,800 | Genérico |
| T010 Almacenes | 3,900 | Genérico |
| T011 Lotes y caducidades | 4,300 | Genérico |
| T012 Escáner QR/Barras | 3,100 | Genérico — «El uso de la cámara y la impresión están pendientes» |
| T013 Cotizaciones | 4,300 | Genérico (registros de ejemplo en fixture QA) |
| T014 Cobros | 4,300 | Genérico — «No se cobra dinero a través de Hubie» |
| T015 Facturación | 6,100 | Genérico — «No emite CFDI ni conecta con SAT/PAC» |
| T016 Caja | 2,800 | Genérico |
| T017 Cuentas por cobrar | 3,500 | Genérico |
| T018 Cuentas por pagar | 3,500 | Genérico |
| T019 Comisiones | 2,800 | Genérico |
| T020 Reportes avanzados | 3,500 | Genérico — «La analítica avanzada está pendiente» |
| T021 Encuesta de Satisfacción | `price: null`, `pricing: "quote"` (a cotizar) | **Real**: encuestas, invitaciones por enlace con token de 30 días y un solo uso, respuestas y reporte NPS/CSAT (`platform/satisfaction-store.mjs`, `platform/satisfaction-domain.mjs`, `assets/operational-surveys.js`, `encuesta/index.html`, `/api/public/surveys/:token`) |

**Extras (`catalog.extras`, 6):** E001 Usuario adicional $990 · E002 Nueva sucursal $4,900 · E003 Almacenamiento adicional $1,490 «desde» · E004 Migración de datos $4,900 «desde» · E005 Capacitación adicional $2,900 · E006 Integración personalizada a cotizar. **Ninguno tiene implementación**: `assets/quote.js` no los muestra ni los suma, `admin.mjs:createTenant` no los recibe, y no hay código que cuente usuarios por tenant ni que migre datos (ver §5 y §11).

### 1.4 Cómo funciona el «registro genérico»

`platform/records.mjs` (`toolRecords` / `saveToolRecord` / `archiveToolRecord`, validación en `platform/catalog.mjs:validateRecord`): título ≤180 caracteres, `status` de una lista cerrada, hasta 40 campos `fields_json` (string/number/boolean, string ≤4,000, JSON ≤12 KB), archivado lógico. Los formularios los define `assets/tool-forms.js` (`fieldsFor`, `hintFor`). C008 y C009 son de solo lectura (`throw Error('Read only tool')`). Las relaciones entre entidades existen solo para C001–C005 (+ genéricos vía `tenant_entity_links`): `platform/entity-links-store.mjs`, `platform/entity-relations.mjs`, `platform/implicit-relations.mjs`, `platform/client-summary.mjs` (resumen 360° del cliente, límite 30 por módulo).

**Conclusión §1:** de 31 herramientas, **6 tienen dominio real** (C001–C005 + T021), 2 son de consulta (C008, C009) y **23 son un formulario genérico con adjuntos**. Esto coincide con `docs/AUDITORIA-TOOLS-V5-2026-11.md` («24/30 dependen de registros genéricos»). El riesgo comercial es vender T006/T012/T014/T015/T020 por su nombre cuando el propio `tool-forms.js` documenta que no hacen lo que el nombre promete.

---

## 2. Modelo de tenant, aislamiento y riesgos de fuga entre empresas

### 2.1 Modelo de datos (Turso, migraciones `turso/migrations/001–014`)

- `organizations` (001): `id`, `slug` único (3–63, `CHECK`), `name`, `status` (`active`/`suspended`), `created_at`.
- `tenant_settings` (002): `suite_id`, `display_name`, `logo_url`, `primary_color`, `secondary_color`, `timezone` (default `America/Mexico_City`).
- `tenant_tools` (002): PK `(organization_id, tool_id)`, `enabled` 0/1. **La habilitación es por tenant y por herramienta, independiente de la suite.**
- `memberships` (001): PK `(organization_id, user_id)`, `role` (`owner`/`admin`/`member`/`viewer`), `status` (`active`/`suspended`).
- `tenant_domains` (003): `hostname` PK → `organization_id`, `verified_at`. **Tabla creada pero sin ningún uso en código** (cero referencias fuera de la migración): no hay dominios personalizados ni subdominios por tenant.
- Datos operativos, todos con PK compuesta `(organization_id, id)` y `ON DELETE CASCADE`: `tenant_tool_records` (006, con FK a `tenant_tools`), `tenant_crm_deals`, `tenant_schedule_events`, `tenant_inventory_items`/`tenant_inventory_movements` (007), `tenant_client_profiles` (008), `tenant_client_cases`/`tenant_case_events` (011), `tenant_case_documents`/`tenant_case_document_versions` (012), `tenant_entity_links` + `tenant_deal_clients` + `tenant_appointment_links` (013), `tenant_surveys`/`tenant_survey_invitations`/`tenant_survey_responses` (014), `pwa_media` (010), `platform_appearance`/`tenant_appearance` (009). Además `server.mjs:applyCoreSchema` crea `marketing_leads` (leads del sitio público).
- **Tablas muertas de 002:** `tenant_clients`, `tenant_catalog_items`, `tenant_appointments`, `tenant_orders`, `tenant_service_requests` se crean en la migración y **ningún `.mjs` las lee o escribe**. Los clientes reales viven en `tenant_client_profiles` (008). Hay dos «clientes» en el esquema y solo uno en uso; `docs/PWA-MADRE-MULTITENANT.md` reconoce que la migración de contactos históricos «sigue pendiente».

### 2.2 Cómo se impone el aislamiento (bien hecho)

- Punto único de autorización: `platform/records.mjs:authorizeTool(token, slug, toolId, write)` → `tenant.mjs:resolveTenant` (slug válido y `status='active'`) → `auth.mjs:requireTenantSession` → `verifySession` + `tenant.mjs:requireMembership` (membresía `active`, rol permitido) → `getTenantTools` (herramienta habilitada). Lectura: owner/admin/member/viewer; escritura: owner/admin/member (viewer excluido).
- Todos los módulos operativos pasan por `authorizeTool`: `platform/operations-{clients,crm,agenda,inventory,cases}.mjs`, `platform/satisfaction-store.mjs`, `platform/media-store.mjs`, `platform/entity-links-store.mjs`, `platform/client-summary.mjs`.
- Todas las consultas atan `organization_id=?` (verificadas por grep; los `JOIN` entre tablas de tenant atan también `organization_id` en ambos lados, p. ej. `tenant_deal_clients`, `tenant_appointment_links`).
- El conteo del dashboard (`platform/dashboard-counts.sql`) filtra por `organization_id` y hace `JOIN tenant_tools … enabled=1`.
- Sesiones: `auth.mjs` — token aleatorio 32 bytes, solo se guarda su hash SHA-256 en `session_tokens`, expiración 24 h, revocación en logout, comparación con `timingSafeEqual`; cookie `__Host-hubie_session`, `Secure; HttpOnly; SameSite=Lax; Max-Age=86400` (`server.mjs`).
- Escrituras mutantes exigen mismo origen: `server.mjs:sameOrigin` contra `HUBIE_PUBLIC_ORIGIN` exacto (`platform/public-origin.mjs` rechaza subdominios, paths, credenciales en URL y esquemas distintos); `processApi` devuelve 503 si `configurationStatus().readyForLive` es falso (falta Turso, Google, `HUBIE_INITIAL_ADMIN_EMAIL` o `HUBIE_AUTH_ENABLED=true`).
- Rutas protegidas en el servidor estático: `server.mjs:decodedProtected` devuelve 404 para `/.git`, `/platform/`, `/turso/`, `/scripts/`, `/tests/`, `/docs/`, `/data/backup/`, `package*.json` y `*.mjs|*.sql|*.map`.
- Tests de aislamiento: `tests/demo-access.test.mjs` (dos empresas demo sin fuga de clientes/citas/stock), `tests/multitenant-contract.test.mjs`, `tests/member-access.test.mjs` (este último es solo un `assert.equal(typeof …)` — cobertura simbólica, no conductual).

### 2.3 Riesgos y huecos de aislamiento (reales, por severidad)

1. **FK sin `PRAGMA` por conexión.** `PRAGMA foreign_keys=ON` solo aparece en `turso/migrations/001_core.sql:1`, no se ejecuta por sesión/conexión en `database.mjs` ni en `server.mjs:applyCoreSchema`. Turso se usa por pipeline HTTP (`database.mjs:executeSql` / `executeBatch`); que las FK (`ON DELETE CASCADE`, FK compuestas de `tenant_tool_records` → `tenant_tools`, etc.) se cumplan depende del default del servidor, no del código. No verificado en vivo. Esfuerzo de confirmación: bajo; de arreglo: bajo (si aplica).
2. **Inconsistencia de límite de adjuntos 2 MB vs 10 MB (posible bug funcional).** La migración `010_media.sql` impone `CHECK(size_bytes > 0 AND size_bytes <= 2000000)`, pero `platform/media-policy.mjs` define `MAX_ATTACHMENT_BYTES = 10_000_000`, `server.mjs` acepta hasta 13,6 MB en el endpoint, y el commit `bcb5481` dice «raise attachment limit to 10 MB per file (2 MB in demo)». Si Turso aplica el `CHECK`, cualquier adjunto de 2–10 MB falla en el `INSERT` con un 503 genérico. Ninguna migración 011–014 corrige el `CHECK`. **No verificado en vivo; hay que probarlo contra Turso real antes de vender «10 MB».**
3. **El creador queda como `owner` de cada tenant (ver §3).** No es fuga entre tenants, pero es un error de propiedad: el superadmin es miembro `owner` de todas las empresas que crea.
4. **Demo sin autenticación por diseño** (`assets/demo-backend.js`, `?demo=1`): cualquiera puede crear tenants y ver datos ficticios, pero solo en su pestaña (`sessionStorage`). No hay fuga al servidor porque nunca llama a `/api`. Riesgo bajo, pero el banner lo debe dejar claro (lo hace, ver §10).
5. **Sin paginación ni rate limiting.** Listados con `LIMIT 200–250` fijos (`operations-*.mjs`, `records.mjs` capa registros en 100), `listTenants` con `LIMIT 200` sin paginación, cuerpo API general limitado a 16 KB (`server.mjs:readApiBody`). Un tenant con más de 200–250 registros por módulo no puede ver el resto desde la UI; no hay forma de pedir la página siguiente.
6. **Sin borrado de tenant ni de miembro** (ver §3 y §6): suspender es lo único que existe; los datos quedan en Turso indefinidamente. Sin endpoint de exportación antes de suspender (ver §11), suspender equivale a secuestrar los datos del cliente.
7. **`tenant_tools` como FK de `tenant_tool_records`:** deshabilitar una herramienta conserva los registros (el renglón de `tenant_tools` queda con `enabled=0`), pero no hay UI que lo explique ni forma de reactivar con historial visible para el tenant (solo el superadmin ve el toggle).

---

## 3. Roles y permisos

### 3.1 Los cuatro roles + superadmin

| Capacidad | Superadmin (`platform_admins`) | Owner (tenant) | Admin (tenant) | Member | Viewer |
|---|---|---|---|---|---|
| Crear/listar/editar tenants, cambiar suite, colores, logo, estado (`active`/`suspended`) — `admin.mjs:updateTenant`, `POST/GET/PATCH /api/admin/tenants` | Sí | No | No | No | No |
| Habilitar/deshabilitar tools por tenant — `admin.mjs:setTenantTool`, `PUT /api/admin/tenants/:id/tools/:tool` | Sí | No | No | No | No |
| Ver/editar apariencia de plataforma y de cualquier tenant — `platform/appearance-store.mjs` | Sí | Solo la propia (ver abajo) | Solo la propia | No | No |
| Añadir miembros (`POST …/members`, roles `admin`/`member`/`viewer`) y suspender/activar (`PATCH …/members/:userId`) — `admin.mjs` | Sí | No | No | No | No |
| Leer/escribir registros de tools habilitadas — `records.mjs` (`writeRoles`) | — (no opera como miembro) | Sí | Sí | Sí | Solo lectura |
| Cambiar apariencia propia — `PUT /api/app/:slug/appearance`, `setOwnTenantAppearance` (owner/admin) | — | Sí | Sí | No | No |
| Ver lista de miembros en `tenantConfig` (solo si C009 habilitada y rol owner/admin) | — | Sí | Sí | No | No |
| Ver la herramienta C009 en el menú | — | Sí | Sí | No (filtrada en `tenantConfig`) | No |
| Cambiar de empresa (selector, `GET /api/app/organizations`) | — | Sí, solo donde tiene membresía activa | Igual | Igual | Igual |

- **Superadmin:** `admin.mjs:requireSuperAdmin` (sesión válida + fila en `platform_admins`). Se crea solo por bootstrap: en `google-oidc.mjs:completeGoogleLogin`, si el correo es `HUBIE_INITIAL_ADMIN_EMAIL`, se inserta en `platform_admins`. No hay UI para añadir/quitar superadmins ni para listar quiénes son.
- **Owner vs admin (tenant): no hay diferencia práctica en el código**, salvo dos: (a) `setTenantMemberStatus` rechaza suspender al `owner` (`role != 'owner'` en el `UPDATE`); (b) `addTenantMember` conserva `owner` si ya lo era (`ON CONFLICT … role = CASE WHEN … 'owner' THEN 'owner' …`). Todo lo demás trata owner y admin igual.
- **Viewer:** solo lectura en servidor (`writeRoles = ['owner','admin','member']`); en cliente se ocultan las acciones rápidas (`assets/app-console.js:loadHomeInsights`).

### 3.2 Gaps de roles (lo que falta)

1. **El owner real no existe.** `admin.mjs:createTenant` inserta `memberships(organization_id, actorId, 'owner', 'active')` donde `actorId` es el superadmin creador. `addTenantMember` solo admite roles `admin`/`member`/`viewer` y nunca puede crear un `owner`. **Consecuencia: toda empresa tiene como único owner al superadmin; el cliente nunca es owner de su propia empresa y no hay traspaso de propiedad.** P0.
2. **Sin cambio de rol.** No hay endpoint para cambiar `member` → `admin` (o viceversa); el único `PATCH` de miembro cambia `status` (`active`/`suspended`). Para «ascender» a alguien hay que re-añadirlo, y el `ON CONFLICT` sí actualiza el rol en ese path, pero no es una operación explícita ni auditada como cambio de rol.
3. **Sin eliminación de miembro.** Solo suspensión. Un ex-empleado suspendido sigue listado en `listTenantMembers` y su `users.email` permanece.
4. **Sin roles por herramienta.** Un `member` puede escribir en todas las herramientas habilitadas, incluidas Finanzas/Expedientes. `docs/PWA-MADRE-MULTITENANT.md` ya lo lista como pendiente («Roles granulares por Tool»).
5. **Sin gestión de miembros por el tenant.** El owner/admin del tenant no puede añadir ni suspender a nadie: todo pasa por el superadmin en Madre (`assets/admin-console.js:renderMembers` / `addMember`). El cliente depende de Hubie para cada alta/baja de su equipo.
6. **Sin lista de superadmins ni auditoría de quién es superadmin** (ver §12).
7. **Límite de 2 usuarios por suite no se cumple.** `catalog.json` dice `users: 2` por suite y el mockup legacy `madre/index.html` muestra «Solo 2 usuarios por suite», pero ningún código cuenta miembros ni bloquea el tercero (ni en `createTenant` ni en `addTenantMember`). El extra E001 «Usuario adicional $990» tampoco tiene implementación.

---

## 4. Onboarding / primer uso de una empresa nueva

### 4.1 El flujo real (no hay autoservicio)

1. **Lead:** el prospecto llena `/contacto.html` → `POST /api/leads` (`server.mjs`) → `INSERT INTO marketing_leads` (nombre, negocio, giro, email, tel, mensaje). **No se envía correo de confirmación ni aviso interno** (no hay código de email; ver §7). El lead solo queda guardado en Turso.
2. **Creación manual:** un superadmin con Google autorizado abre `/madre/app.html` (o `/admin.html`, consola anterior) → «Crear nueva empresa» → nombre, slug, suite, colores, tools (`assets/admin-console.js:createCompany` → `POST /api/admin/tenants`). El superadmin queda como `owner` (§3.2.1).
3. **Alta de usuarios:** el superadmin añade correos en el detalle del tenant (`POST /api/admin/tenants/:id/members`). El usuario **no recibe nada**; debe saber por fuera que ya puede entrar.
4. **Primer login:** el usuario abre `/app/` → «Iniciar sesión con Google» → `/api/auth/google/start` → callback (`server.mjs`) → si es superadmin va a `/madre/app.html`, si no a `/app/`. Si el correo no está pre-autorizado o no tiene membresía activa, `google-oidc.mjs` lanza `Account not authorized` y el callback redirige a `/admin.html?login=failed` con un mensaje genérico.
5. **Primera herramienta:** `/app/` lista sus organizaciones (`GET /api/app/organizations`); al elegir una, `GET /api/app/:slug/config` devuelve suite, colores, logo, apariencia, tools habilitadas y miembros (si aplica). El home muestra KPIs de C001/C002/C004/C005 (`assets/app-console.js:loadHomeInsights`) y estados vacíos («Todavía no hay clientes», «No hay próximas citas»).

### 4.2 Dónde se cae

- **No hay guía de primer uso, tour, checklist ni datos de ejemplo para un tenant nuevo.** Grep de `guia|onboarding|primer uso|tour`: 0 resultados en código. Un tenant recién creado está vacío; lo único que existe es el fixture QA de staging (`platform/staging-qa-seed.mjs`, `platform/staging-qa-fixture.mjs`): empresa `hubie-qa-piloto`, suite S006, tools core + T004/T013/T021, 1 cliente, 1 oportunidad, 1 expediente, 1 cita, 1 artículo y 1 encuesta, todo marcado `[DEMO]`/ficticio — pero **solo se siembra si `HUBIE_SEED_QA_COMPANY=create-qa-pilot-2026-11` y `HUBIE_PUBLIC_ORIGIN=https://hubie-pwa-staging.onrender.com` y `HUBIE_AUTH_ENABLED=true`**. No es un seed para clientes reales.
- **El login falla en silencio útil:** sin `HUBIE_AUTH_ENABLED=true` o sin Turso/Google, `processApi` responde 503 «Autenticación o base de datos no configurada», `/api/auth/google/start` redirige a `/auth/configuracion.html` («Estamos configurando el acceso»), y la PWA muestra «La conexión real con Google y Turso está pendiente».
- **Sin trial, sin periodo de prueba, sin «crear mi empresa»**: el prospecto no puede probarlo solo; todo depende de que un humano de Hubie cree el tenant y pre-autorice correos.
- **Sin confirmación de nada por correo:** ni al lead, ni al invitado, ni al crear la empresa.
- **Zona horaria sin UX:** `tenant_settings.timezone` existe y se devuelve en `tenantConfig`, pero `createTenant`/`updateTenant` no la aceptan ni la cambian; `docs/PWA-MADRE-MULTITENANT.md` reconoce que «zonas horarias configurables del tenant aún requieren UX».

---

## 5. Facturación / suscripciones / planes y qué pasa si no se paga

**No existe facturación en el código.** Verificado:

- Grep de `stripe|suscrip` en `*.mjs|*.js|*.html` (sin `node_modules` ni `tests/`): **0 resultados en código**. `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` aparecen solo en `.env.example` (plantilla con otros nombres heredados: Supabase, Netlify — el archivo no refleja el stack real Turso/Render) y nunca se leen.
- No hay tablas de suscripciones, planes, facturas, pagos, cupones ni intentos de cobro en ninguna migración (001–014). No hay endpoint de checkout, webhook ni portal de cliente.
- El modelo comercial vigente es **pago único por configuración**: suite (una vez) + herramientas pagadas (una vez) + anticipo 50 % + saldo hasta 6 pagos (`catalog.rules`, `assets/quote.js`). El cotizador termina en «Solicitar esta configuración ↗» → `/contacto.html?interes=Suite&mensaje=…` y «Copiar resumen». **No hay cobro, ni siquiera un enlace de pago.**
- **Qué pasa si no se paga: nada en el sistema.** No hay estado de mora, ni suspensión automática, ni aviso, ni periodo de gracia. El único `status='suspended'` de `organizations` es un interruptor manual del superadmin (`admin.mjs:updateTenant`, valores permitidos `active`/`suspended`); al suspender, `resolveTenant` deja de resolver el slug y `userOrganizations` excluye la empresa, es decir, **el cliente pierde el acceso a sus datos sin exportación previa** (ver §11). No hay definición de qué se conserva, por cuánto tiempo, ni cómo se reactiva.
- **Qué pasa si cambia el plan: cambio manual.** El superadmin enciende/apaga tools (`setTenantTool`); no hay prorrateo, ni registro de cambio de plan, ni cobro por la diferencia, ni historial de facturación. El cambio de suite (`updateTenant.suiteId`) tampoco recalcula nada: como la suite no liga herramientas (§1.2), cambiar de suite solo cambia la etiqueta y el precio de referencia.
- **Precios sin IVA ni impuestos definidos** en el catálogo; `T015 Facturación` no emite CFDI (ver §1.3).
- **Límites del plan no se aplican:** ni los 2 usuarios por suite (§3.2.7), ni almacenamiento por plan (la única cuota real es técnica y global: 60 MB por tenant en `pwa_media`, ver §9), ni número de registros, ni sucursales (E002 sin implementación).

---

## 6. Invitaciones y gestión de miembros

- **La tabla de invitaciones existe pero está muerta.** `turso/migrations/001_core.sql` crea `organization_invitations` (`id`, `organization_id`, `email`, `role` admin/member/viewer, `token_hash` único, `created_by`, `expires_at`, `consumed_at`). **Cero lecturas/escrituras en todo el código** (solo la mencionan `scripts/migrate.mjs` y el conteo de tablas de `server.mjs:applyCoreSchema`). No hay endpoint, ni expiración, ni revocación, ni consumo de token.
- **Lo que hay en su lugar es pre-autorización silenciosa:** `admin.mjs:addTenantMember` (superadmin, `POST /api/admin/tenants/:id/members`) → `INSERT OR IGNORE INTO users` + `INSERT INTO memberships … status='active'` + evento `tenant.member_added`. El usuario entra después con su Google si su correo ya existe y tiene membresía activa (`google-oidc.mjs`). **No se envía correo, enlace ni aviso**; el texto de la consola lo admite: «Usuario autorizado para esta empresa. Ya puede ingresar con Google.» (`assets/admin-console.js:232`).
- **Gestión existente (Madre, superadmin):** listar miembros (`GET …/members`, orden por rol/email), añadir (roles admin/member/viewer), suspender/activar (`PATCH …/members/:userId`, `admin.mjs:setTenantMemberStatus`, protege al owner). Sin cambio de rol, sin eliminar, sin reenviar invitación, sin ver pendientes (no hay pendientes: todo es inmediato y activo).
- **Gestión por el tenant:** ninguna (ver §3.2.5). El `tenantConfig` solo **muestra** miembros a owner/admin si C009 está habilitada.
- **Excepción que sí funciona:** las invitaciones de **encuestas T021** sí son invitaciones reales: token aleatorio de 24 bytes hasheado, expira a 30 días, un solo uso (`used_at`), enlace `/encuesta/?token=…` que se copia a mano (`platform/satisfaction-store.mjs:createSurveyInvitation`, `assets/operational-surveys.js:70`). Es el único flujo de invitación por token del sistema — y es de encuestas, no de miembros.

---

## 7. Notificaciones y recordatorios (in-app, correo, WhatsApp)

**No hay sistema de notificaciones.** Verificado:

- **In-app:** no hay tabla de notificaciones, ni bandeja, ni endpoint, ni badge con datos. C010 «Notificaciones» es un registro genérico manual (destinatario/contenido/fecha). El botón 🔔 de `madre/index.html:276` es del mockup legacy sin backend. No hay Web Push: `app/sw.js` y `madre/sw.js` solo hacen `install`/`activate`/`fetch` con caché del shell; no hay `push`, `notificationclick` ni `PushManager` en ningún archivo.
- **Correo:** cero. `RESEND_API_KEY` solo aparece en `.env.example`; ningún `.mjs`/`.js` importa o llama a Resend, SMTP o similar. Tampoco se envía correo al crear un lead, al añadir un miembro, al crear una encuesta ni al recibir una respuesta.
- **WhatsApp / SMS:** cero integración. Las menciones son solo copy de marketing (`index.html`: «Recordatorios automáticos por WhatsApp») y toggles del mockup legacy `madre/index.html:311` («WhatsApp Business activo», «SMS activo», «Correo electrónico activo») que se guardan en `localStorage` (`guardarConfig()`) sin tocar el servidor. `docs/PWA-MADRE-MULTITENANT.md` lo dice: «No se envían correos o WhatsApp automáticos aún» (CRM) y «No son invitaciones de Calendar ni notificaciones externas» (Agenda).
- **Recordatorios pasivos (lo único que hay):** `follow_up_at` en oportunidades (se guarda y se muestra, nunca dispara nada); citas próximas en el home (`app-console.js`); vencimiento de documentos con estado calculado al leer (`expired` / `soon` ≤30 días / `valid`, `platform/case-document-domain.mjs`, `assets/attachments-ui.js`); invitaciones de encuesta que caducan a 30 días. Nada de esto avisa a nadie: no hay cron, worker, cola ni job programado en el repo.
- **Lo más cercano a «avisar»:** el enlace de encuesta se genera para copiarlo y enviarlo a mano por WhatsApp/correo/mensaje (`assets/operational-surveys.js:70`).

---

## 8. Búsqueda global

**No existe.** Verificado:

- No hay endpoint de búsqueda en `server.mjs` (la lista completa de rutas está en §13). No hay `LIKE`/FTS ni índice de búsqueda en ninguna migración.
- Lo que hay es **filtro local por módulo, sobre los datos ya cargados**: `assets/app-records.js` (`record-search`: título + campos del registro genérico), `assets/operational-clients.js` (nombre/empresa/email/teléfono), `assets/operational-crm.js`, `assets/operational-agenda.js`, `assets/operational-cases.js` (cliente + estado). Cada módulo busca solo dentro de sí mismo y solo entre los ≤200–250 registros que el servidor devolvió.
- La «búsqueda global» de Madre (`assets/admin-console.js:251`, `#global-search`) solo filtra la lista de empresas por nombre en pantalla.
- Consecuencias: no se puede buscar un cliente desde el CRM, ni un documento por nombre, ni nada a través de herramientas; tampoco hay búsqueda en adjuntos, notas ni historial. Con los límites de listado (§2.3.5), un registro fuera de los primeros 200–250 es invisible también para el filtro local.

---

## 9. Configuración y apariencia por tenant

### 9.1 Lo que sí existe (y está bien delimitado)

- **Apariencia por superficie** (`platform/appearance.mjs`, `platform/appearance-store.mjs`, migración 009): dos ámbitos independientes, `platform_appearance` (id fijo `'madre'`) y `tenant_appearance` (por `organization_id`). Solo 4 campos cada uno, con whitelist estricta (sin CSS/URL/HTML almacenado): `dashboardPreset` (`hubie|pearl|silver|sand|custom`), `sidebarPreset` (`midnight|steel|platinum|graphite|custom`), `dashboardColor` y `sidebarColor` (hex `#rrggbb`). Defaults distintos en código (`appearance.mjs`: `#f6f7fb`/`#16123a`) y en SQL (009: `#eaf1ff`/`#10294b`) — discrepancia cosmética sin impacto porque el código normaliza al leer.
- **Endpoints:** `GET/PUT /api/admin/appearance` (superadmin, Madre), `PUT /api/admin/tenants/:id/appearance` (superadmin, cualquier tenant), `PUT /api/app/:slug/appearance` (owner/admin del propio tenant, `setOwnTenantAppearance`). Cambios auditados (`appearance.platform_updated`, `appearance.tenant_updated`). UI: `assets/appearance-ui.js` (`createAppearanceEditor`), con vista previa y restablecimiento.
- **Fondos:** imagen de dashboard/sidebar por ámbito (Madre o tenant), PNG/JPEG/WEBP ≤900 KB, guardada en base64 en `pwa_media` (`platform/media-store.mjs:uploadBackground`, `MAX_BACKGROUND_BYTES = 900_000`); un solo fondo vigente por tipo (se toma el último por `rowid`). Descarga binaria con `Content-Security-Policy: default-src 'none'; sandbox` y `cross-origin-resource-policy: same-origin` (`server.mjs`).
- **Marca del tenant** (`tenant_settings`): `display_name`, `logo_url` (validado: `https://…` o `/assets/….(png|jpg|webp|svg)`), `primary_color`/`secondary_color` (hex). El cliente aplica `--blue`, nombre y logo con fallback al logo oficial si la URL falla (`assets/app-console.js`).
- **Aislamiento verificado:** los fondos y temas son independientes por tenant y de Madre (`tests/demo-access.test.mjs` lo comprueba en demo).

### 9.2 Lo que no se puede configurar por tenant

- **Nada de lo operativo:** suite, herramientas, miembros, nombre/slug y estado solo los toca el superadmin en Madre. El tenant no tiene página de «Configuración» propia salvo la apariencia.
- **`timezone` no editable** (§4.2): existe en `tenant_settings` y se devuelve, pero ningún endpoint la escribe.
- **Sin ajustes de negocio:** sin RFC/razón social/dirección fiscal, sin moneda (el catálogo es MXN fijo; el mockup legacy ofrece MXN/USD sin backend), sin idioma, sin preferencias de notificación (no hay notificaciones), sin horario comercial, sin plantillas.
- **Confusión con los mockups legacy:** `/madre/index.html` y `/template/index.html` contienen paneles de «Configuración» con branding, notificaciones, facturación CFDI, 2FA y «Solo 2 usuarios por suite» que **solo escriben en `localStorage`** (`guardarConfig()`). No son la PWA real (`/madre/app.html` + `assets/admin-console.js`). Si alguien abre esos archivos, cree configurar cosas que no se configuran.

### 9.3 Medios y adjuntos (política)

- **Adjuntos por registro** (`platform/media-policy.mjs`, `platform/media-store.mjs`, `assets/attachments-ui.js`, `assets/media-ui.js`): tipos permitidos PNG/JPEG/WEBP/PDF/TXT/CSV/DOCX/XLSX; verificación de firma de archivo (magic bytes: PNG/JPG/WEBP/PDF/ZIP), no SVG/HTML ejecutable; nombre saneado (sin separadores ni `<>:\"|?*`, ≤120 caracteres); **10 MB por archivo** (`MAX_ATTACHMENT_BYTES`), **60 MB por tenant** y **12 adjuntos por registro** (`Storage quota exceeded`, 409). Descarga por `/api/app/:slug/attachments/:id` con verificación de tenant + herramienta + registro (`getAttachment`).
- **Discrepancia P0 por verificar** (§2.3.2): la migración 010 limita `size_bytes <= 2_000_000`. Si Turso aplica el `CHECK`, el límite real es 2 MB, no 10 MB.
- **Documentos C003** añaden tipificación (`contract|identification|invoice|consent|certificate|other`), vencimiento y versiones inmutables (`tenant_case_document_versions`, `latest_version`).
- **Almacenamiento:** todo en base64 dentro de Turso (`pwa_media.content_b64`), sin object storage ni CDN. Con 60 MB por tenant y base64 (+33 %), el costo de almacenamiento crece rápido; no hay purga ni archivado de medios.

---

## 10. Demo vs datos reales

### 10.1 Demo (`?demo=1`)

- **Mecanismo:** `assets/app-console.js:5` y `assets/admin-console.js:2` — si la URL trae `demo=1`, `api()` se sustituye por `demoRequest` de `assets/demo-backend.js` (`createDemoStore`); **nunca se llama a `/api` ni a Turso**. Estado en `sessionStorage`, clave `hubie-demo-browser-v1` (solo vive en esa pestaña; al cerrarla se pierde).
- **Contenido inicial:** 2 empresas ficticias — `comercio-demo` (S004 Commerce, core + T004/T013) con 1 cliente, 1 expediente, 1 oportunidad ($2,500 MXN, etapa `proposal`), 1 artículo (`DEMO-001`, 8 uds.) y 1 cita; y `consultoria-demo` (S006 Office, solo core). Datos marcados como ficticios; correos `.invalid`.
- **Qué imita bien:** crear tenants, activar/desactivar herramientas, CRUD de clientes/CRM/agenda/inventario/casos, enlaces entre entidades, fondos y apariencia por tenant, miembros ficticios, control de solape de citas y de stock negativo. Los tests de demo (`tests/demo-*.test.mjs`) cubren aislamiento, permisos de enlace y medios.
- **Qué NO puede hacer el usuario demo:** iniciar sesión con Google (no hay sesión; el rol reportado es siempre `owner`), persistir nada fuera de su pestaña, compartir, enviar correos o invitaciones (el aviso lo dice: «Usuario ficticio añadido a la demo; no se envían invitaciones»), usar datos reales, ni salir de la demo salvo con el enlace/botón «Salir de la demostración». La demo permite crear empresas y miembros sin ninguna autenticación — por diseño, pero solo local.
- **Señalización:** banner «VISTA DE DEMOSTRACIÓN · Sin Google ni Turso…», título de página modificado y pie «MODO DEMO: datos ficticios y temporales, sin conexión a Turso». Correcto.
- **No verificado:** si la demo cubre encuestas T021 y su enlace público (el `demo-backend.js` revisado implementa rutas de app/admin/workflows/media/links/summary; la ruta de encuestas no se encontró en la revisión por muestreo — no afirmar que funciona en demo).

### 10.2 Real

Requiere todo a la vez (`platform/setup-health.mjs:configurationStatus`): Turso (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`), Google (`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `HUBIE_PUBLIC_ORIGIN`), `HUBIE_INITIAL_ADMIN_EMAIL` y `HUBIE_AUTH_ENABLED=true`. Sin eso, `server.mjs:processApi` responde 503 y el login redirige a `/auth/configuracion.html`. Según `docs/RENDER-PWA-DEPLOY.md`, el staging documentado es `hubie-pwa-staging.onrender.com` con `HUBIE_AUTH_ENABLED=false` y sin Turso/Google configurados — es decir, **el staging documentado es demo o 503, no una PWA real funcional**. El despliegue real con OAuth + Turso es un paso manual pendiente documentado, no verificado por esta auditoría.

### 10.3 PWA (común a ambas)

- Manifests: `/app/` («Hubie · Mi empresa») y `/madre/app.html` («Hubie Madre · Control Center»), `display: standalone`. Service workers (`app/sw.js`, `madre/sw.js`) cachean el shell y hacen fallback al shell sin red; **las respuestas de API nunca se cachean** (`cache: 'no-store'`). No hay escritura offline, sincronización en segundo plano ni push (ver §7).

---

## 11. Exportación / importación y respaldos

- **Exportación de datos: no existe.** No hay endpoint de exportar (CSV/Excel/PDF/JSON) para clientes, CRM, agenda, inventario, casos ni registros genéricos. Lo único descargable son los adjuntos individuales (`assets/attachments-ui.js:downloadBlob`) y el resumen del cotizador copiado al portapapeles (`assets/quote.js`). `T020 Reportes avanzados` es un formulario genérico; `docs/PWA-MADRE-MULTITENANT.md` lista «Reportes avanzados: consultas KPIs y exportaciones de producción» como pendiente.
- **Importación: no existe.** No hay endpoint de importar CSV/Excel ni de migrar datos. La migración de los contactos legacy (`tenant_clients` → `tenant_client_profiles`) está explícitamente pendiente en la documentación; tampoco hay importación de catálogo, inventario ni clientes desde archivos.
- **El extra E004 «Migración de datos $4,900 desde» se vende en el catálogo sin ninguna implementación.**
- **Respaldos: no hay código.** Nada en el repo hace backup ni restore de Turso o de `pwa_media`; no hay script, cron ni endpoint. `data/backup/2026-09-01_resumen.md` es un conteo estático de validez de los JSON viejos de `data/`, no un respaldo de la base. `SECURITY.md` y `docs/INFRASTRUCTURE.md` exigen «database/media backups» y «a tested restore path before public launch» — exigencia hoy incumplida. Depender del backup automático de Turso (si lo hay) no está documentado ni verificado.
- **Borrado:** no hay borrado de tenant ni exportación al salir; suspender un tenant lo deja inaccesible con sus datos dentro (§5).

---

## 12. Auditoría / historial de actividad

### 12.1 Lo que se escribe (bien cubierto)

Tabla `audit_events` (001): `id`, `organization_id` (nullable), `actor_user_id` (nullable), `action`, `target_type`, `target_id`, `occurred_at` (default `CURRENT_TIMESTAMP`). Eventos que se escriben:

| Origen | Acciones |
|---|---|
| `admin.mjs` | `tenant.created`, `tenant.tool_enabled` / `tenant.tool_disabled`, `tenant.updated`, `tenant.member_added`, `tenant.member_activated` / `tenant.member_suspended` |
| `platform/appearance-store.mjs` | `appearance.platform_updated`, `appearance.tenant_updated` |
| `platform/records.mjs` | `tenant.record_created` / `tenant.record_updated` / `tenant.record_archived` |
| `platform/operations-{clients,crm,agenda,inventory,cases}.mjs` | `client.*`, `crm_deal.*`, `appointment.*`, `inventory_*`, `case.*` (vía helpers `audit`/`recordAudit`) |
| `platform/entity-links-store.mjs` | `entities.linked` / `entities.unlinked` |
| `platform/media-store.mjs` | `media.attachment_uploaded` / `media.attachment_removed`, `cases.document_updated` |
| `platform/satisfaction-store.mjs` | `survey.response_received` (sin `actor_user_id`: es una respuesta pública) |

Además hay historial propio y legible de expedientes: `tenant_case_events` con `GET /api/app/:slug/workflows/cases/:id/history` (`platform/operations-cases.mjs:caseHistory`, límite 150).

### 12.2 Lo que falta (la auditoría no se puede consultar)

- **No hay endpoint de lectura.** Grep de `audit` en `server.mjs` solo encuentra el conteo de tablas del health check. Ninguna ruta `GET` devuelve `audit_events`, y no hay UI en Madre ni en la PWA cliente. **La auditoría hoy es solo escritura: existe para un futuro lector.**
- **Sin filtros, retención ni exportación:** no hay por fecha/actor/acción/tenant, ni purga, ni descarga. Sin `actor` denormalizado (solo `actor_user_id`; para mostrar un correo hay que hacer join con `users`).
- **Sin eventos de autenticación:** ni login (Google) exitoso/fallido, ni logout, ni sesión revocada, ni intento de acceso denegado (`Forbidden`/`Tool disabled`). Los fallos de autorización no dejan rastro.
- **Sin lectura de accesos:** no se registra quién consultó qué (solo escrituras y cambios de estado).
- **Retención indefinida sin política:** la tabla crece sin purga y sin partición por tenant en la lectura (cuando exista).

---

## 13. Mapa de endpoints (referencia rápida)

Servidor: `server.mjs` (Node `http` sin framework, puerto `PORT` o 10000). Prefijo de proceso: `processApi` exige `readyForLive` + migraciones + mismo origen en mutaciones.

| Grupo | Rutas |
|---|---|
| Auth | `GET /api/auth/google/start` · `GET /api/auth/google/callback` · `GET /api/auth/session` · `POST /api/auth/logout` |
| Madre (superadmin) | `GET/POST /api/admin/tenants` · `GET/PATCH /api/admin/tenants/:id` · `PUT /api/admin/tenants/:id/tools/:tool` · `GET/POST /api/admin/tenants/:id/members` · `PATCH /api/admin/tenants/:id/members/:userId` · `GET /api/admin/catalog` · `GET/PUT /api/admin/appearance` · `PUT /api/admin/tenants/:id/appearance` · `GET/POST/DELETE /api/admin/media/:kind` · `…/tenants/:id/media/:kind` |
| App (tenant) | `GET /api/app/organizations` · `GET /api/app/:slug/config` · `GET/POST/PATCH/DELETE /api/app/:slug/tools/:tool/records[/:id]` · `GET/PATCH/DELETE /api/app/:slug/workflows/{clients,crm,agenda,inventory}[/:id][/movements]` · `GET/POST/PATCH/DELETE /api/app/:slug/workflows/cases[/:id][/history]` · `GET/POST /api/app/:slug/tools/:tool/records/:id/links` · `GET /api/app/:slug/relations/options/:tool` · `DELETE /api/app/:slug/relations/:id` · `GET /api/app/:slug/workflows/clients/:id/summary` · `GET/POST/PATCH /api/app/:slug/surveys[/:id][/invitations|/report]` · `GET/POST/DELETE /api/app/:slug/media/:kind` · `PUT /api/app/:slug/appearance` · `GET/POST /api/app/:slug/tools/:tool/records/:id/attachments` · `GET/DELETE /api/app/:slug/attachments/:id` · `PATCH /api/app/:slug/case-documents/:id` |
| Público | `GET/POST /api/public/surveys/:token` (encuesta por enlace) · `POST /api/leads` · `GET /healthz` |

Configuración requerida (`platform/setup-health.mjs`, `docs/ACTIVACION-GOOGLE-TURSO-STAGING.md`): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `HUBIE_PUBLIC_ORIGIN`, `HUBIE_INITIAL_ADMIN_EMAIL`, `HUBIE_AUTH_ENABLED=true`.

---

## 14. Lista de gaps priorizada

Esfuerzo: **S** = horas a 1 día · **M** = 2–4 días · **L** = 5–10 días (estimaciones gruesas, sin contar QA en vivo ni decisiones comerciales pendientes). «Vender» = poder cobrar a una empresa y que opere sola.

### P0 — Imprescindible para vender a empresas

1. **Cobro real (Stripe o equivalente): checkout + suscripción + webhook + suspensión por impago.** Hoy el cotizador termina en un formulario de contacto; no hay forma de cobrar en código. Incluye: qué se cobra (suite única vs mensualidad — el catálogo hoy dice `monthlyPlatformFee: 0` y precios únicos; hay que decidir el modelo antes de implementarlo), qué pasa al fallar un pago (gracia → suspensión → reactivación) y portal de facturación. **L (5–10 días).**
2. **Alta autoservicio + propiedad correcta del tenant.** Registro del cliente, creación de su empresa con él como `owner` (hoy el owner es el superadmin creador y no hay traspaso), y flujo «crear → pagar → entrar». Sin esto cada venta exige operación manual y el cliente nunca es dueño de su empresa. **M/L (3–5 días).**
3. **Invitaciones de miembros por correo con token y expiración.** La tabla `organization_invitations` existe; falta el endpoint de crear/consumir/revocar, el envío (Resend) y la UI de pendientes. Hoy el invitado no se entera. **M (2–3 días).**
4. **Guía de primer uso + datos iniciales.** Checklist («crea tu primer cliente, tu primera cita, tu primer producto»), tour mínimo y seed opcional por suite (hoy el tenant nace vacío; solo existe el fixture QA de staging, no reutilizable). **S/M (1–3 días).**
5. **Exportación (CSV) de registros + importación/migración de contactos.** Sin exportar, suspender o cancelar equivale a perder los datos; el extra E004 se vende sin existir. Incluye migrar `tenant_clients` legacy → `tenant_client_profiles`. **M (2–4 días).**
6. **Notificaciones y recordatorios reales.** Bandeja in-app + correo (y WhatsApp si se decide) para: `follow_up_at` de CRM, citas próximas, documentos por vencer, stock bajo y respuestas de encuesta. Hoy todo son campos de fecha que nadie vigila. Requiere decidir proveedor (Resend/WhatsApp Business) y un scheduler (cron/worker). **M/L (3–5 días).**
7. **Búsqueda global por tenant.** Un buscador en la PWA cliente que busque en clientes, CRM, casos, agenda, inventario y registros genéricos (servidor, con `organization_id` y herramientas habilitadas), no el filtro local por módulo. **S/M (1–2 días).**
8. **Auditoría consultable.** Endpoint `GET` con filtros (tenant, actor, acción, fecha) + vista en Madre y en el tenant + exportación. Hoy se escribe y nunca se lee. **S (1 día).**
9. **Verificar y alinear el límite real de adjuntos (2 MB vs 10 MB).** Probar una subida de 2–10 MB contra Turso real; si el `CHECK` de `010_media.sql` manda, crear la migración 015 que lo suba a 10 MB (o bajar la política a 2 MB y corregir el mensaje). No vender «10 MB» sin esta prueba. **S (horas).**

### P1 — Necesario para operar bien (después de poder vender)

10. **Gestión de miembros por el propio tenant** (owner/admin añaden, cambian rol y suspenden; hoy todo es superadmin) + **cambio de rol** y **eliminación de miembro**. **M (2–3 días).**
11. **Roles por herramienta** (p. ej. que un miembro vea clientes pero no finanzas/expedientes). **M/L (3–5 días).**
12. **Hacer reales las herramientas pagadas que hoy son formularios, en orden de venta:** T013 Cotizaciones (partidas, PDF, aceptación), C006 Catálogo (fichas, precios, fotos), C007 Gastos, T015 Facturación (PAC/CFDI — o quitarla del catálogo hasta tenerla), T014 Cobros (conciliación), T020 Reportes/Exportación. Cada una **M/L (3–7 días c/u)**; no venderlas por su nombre hasta entonces. Ver `docs/AUDITORIA-TOOLS-V5-2026-11.md` (tabla P0/P1/P2 por herramienta).
13. **Aplicar los límites del plan:** 2 usuarios por suite (o lo que se decida), cuota de almacenamiento/registros por plan, sucursales (E002). Hoy el catálogo promete límites que el código no aplica. **S/M (1–2 días).**
14. **Dominios personalizados por tenant** (la tabla `tenant_domains` existe sin uso) o eliminarla del esquema para no prometerlo. Incluye verificación DNS y `HUBIE_PUBLIC_ORIGIN` por tenant. **M/L (3–5 días).**
15. **Respaldo y restauración probados** (Turso + `pwa_media`) con drill documentado; `SECURITY.md` lo exige antes del lanzamiento público. **M (2–3 días).**
16. **Paginación real en listados** (hoy topes fijos 200–250 sin página siguiente) + orden/filtros en servidor. **S/M (1–2 días).**
17. **Configuración del tenant editable por el tenant:** zona horaria, datos fiscales, moneda/idioma si aplica. **S (1 día).**
18. **Confirmación de FK en Turso** (`PRAGMA foreign_keys` por sesión o verificación equivalente) y prueba de borrado en cascada por tenant. **S (horas).**

### P2 — Más adelante

19. **Portal de clientes (T001), lealtad (T002), Kanban (T005), firmas digitales reales (T006), formularios personalizados (T007), escáner QR (T012), comisiones (T019).** Cada uno **M/L**.
20. **Notificaciones push PWA** (service worker + suscripciones + VAPID) y trabajo offline con sincronización. **L (5–10 días).**
21. **Multi-sucursal / multi-almacén / lotes y caducidades reales** (T010/T011), hoy monoubicación por artículo. **M/L.**
22. **Transferencia de propiedad** entre usuarios y **borrado/exportación al cerrar un tenant** (derecho de salida del cliente). **S/M.**
23. **Limpiar el catálogo legacy:** retirar o archivar `data/suites.json`, `data/tools.json`, `data/tools_extras.json` (14 suites / 30+34 herramientas de otro modelo) y los mockups `madre/index.html`, `template/index.html`, `panel/` si ya no son referencia, para que nadie configure ni venda con ellos. **S (horas–1 día).**
24. **Gestión de superadmins** (listar/añadir/quitar, con auditoría) y eventos de autenticación en `audit_events` (login/logout/denegado). **S (1 día).**

---

## 15. Lo que no se pudo verificar desde el código

- **Comportamiento real contra Turso:** aislamiento, FK, el `CHECK` de 2 MB de adjuntos (§2.3.2), migraciones aplicadas y `/healthz` en staging/producción. Requiere levantar el servidor con credenciales reales y probar con dos tenants y dos usuarios de Google.
- **Google OAuth en vivo:** callback, `HUBIE_INITIAL_ADMIN_EMAIL` bootstrap, expiración de sesión y revocación. El flujo está bien construido en código (PKCE, `state`/`nonce`, `tokeninfo`, `email_verified`), pero no probado aquí.
- **Despliegue (Render):** la documentación describe staging con auth desactivada; no se verificó qué está desplegado hoy ni con qué variables.
- **Precios y modelo comercial vigente:** el catálogo dice `complete: false` y `data/` contradice a `assets/catalog.json` (14 suites vs 10, otros precios). Falta confirmación comercial de: precios únicos vs mensualidad, IVA, qué incluye cada suite, y si T021 y los extras E001–E006 se venden como están.
- **Demo: cobertura de encuestas T021** (no se confirmó si el `demo-backend` implementa las rutas de encuestas).
- **Rendimiento y costos:** Turso (lecturas/escrituras por `executeSql` sin batch en la mayoría de rutas), base64 de medios en base de datos, y límites de Render — sin datos de uso real no se puede estimar.

---

## Anexo — Archivos inspeccionados

**Servidor y núcleo:** `server.mjs`, `admin.mjs`, `auth.mjs`, `tenant.mjs`, `database.mjs`, `google-oidc.mjs`, `package.json`, `.env.example`.

**Plataforma (`platform/`):** `catalog.mjs`, `suite-distribution.mjs`, `records.mjs`, `appearance.mjs`, `appearance-store.mjs`, `media-policy.mjs`, `media-store.mjs`, `setup-health.mjs`, `public-origin.mjs`, `dashboard-counts.sql`, `workflows.mjs`, `operations-clients.mjs`, `operations-crm.mjs`, `operations-agenda.mjs`, `operations-inventory.mjs`, `operations-cases.mjs`, `clients-domain.mjs`, `cases-domain.mjs`, `case-document-domain.mjs`, `client-summary.mjs`, `entity-links-store.mjs`, `entity-relations.mjs`, `implicit-relations.mjs`, `satisfaction-domain.mjs`, `satisfaction-store.mjs`, `staging-qa-seed.mjs`, `staging-qa-fixture.mjs`, `migration-parser.mjs`.

**Migraciones (`turso/migrations/`):** `001_core.sql` – `014_satisfaction.sql` (las 14).

**Catálogo y datos:** `assets/catalog.json`, `data/suites.json`, `data/tools.json`, `data/tools_extras.json`, `data/extras.json`, `data/backup/2026-09-01_resumen.md` (encabezado).

**Cliente y Madre (`assets/`, `app/`, `madre/`):** `demo-backend.js`, `app-console.js`, `admin-console.js`, `appearance-ui.js`, `attachments-ui.js`, `media-ui.js`, `catalog-ui.js`, `quote.js`, `tool-forms.js`, `operational-clients.js`, `operational-crm.js`, `operational-agenda.js`, `operational-cases.js`, `operational-stock.js`, `operational-surveys.js`, `satisfaction-public.js`, `relationships-ui.js`, `app/index.html`, `app/manifest.webmanifest`, `app/sw.js`, `madre/app.html`, `madre/manifest.webmanifest`, `madre/sw.js`, `admin.html`, `auth/configuracion.html`, `precios.html`, `contacto.html`, `index.html` (menciones puntuales), `madre/index.html` y `template/index.html` (solo paneles de configuración legacy).

**Docs del repo:** `docs/PWA-MADRE-MULTITENANT.md`, `docs/AUDITORIA-TOOLS-V5-2026-11.md`, `docs/RENDER-PWA-DEPLOY.md`, `docs/ACTIVACION-GOOGLE-TURSO-STAGING.md`, `docs/INFRASTRUCTURE.md`, `SECURITY.md`, `README.md` (menciones puntuales), `.github/workflows/pwa-core-tests.yml`.

**Tests (lectura + ejecución):** `tests/*.test.mjs` (33 archivos; ejecución `node --test`: 75 pass, 0 fail) — en detalle `tests/member-access.test.mjs`, `tests/multitenant-contract.test.mjs`, `tests/superadmin-contract.test.mjs`, `tests/demo-access.test.mjs`, `tests/demo-cases.test.mjs`, `tests/demo-media.test.mjs`, `tests/auth-contract.test.mjs`, `tests/google-oidc-contract.test.mjs`.

**No inspeccionado a fondo:** `assets/*.css`, SVGs de escenas, `scripts/migrate.mjs` (solo menciones), tests Python `tests/test_*.py` (no ejecutados), `docs/C003-EXPEDIENTES-IMPLEMENTACION.md`, `docs/ENTITY-RELATIONS-HUBIE.md`, `docs/T021-ENCUESTAS-SATISFACCION.md`, `docs/PWA-UX-AUDIT.md`, `docs/TURSO-RENDER-SETUP.md` (no necesarios para las conclusiones; no se citan como evidencia).
