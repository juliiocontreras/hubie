# Migración de Hubie PWA a Cloudflare — Auditoría y plan

Fecha: 2026-11-24. Base: main `b1b0280` (41 tools, migraciones 001–036,
tests 440/440). Decisión de Julio 2026-11-24: Hubie PWA pasa de Render a
Cloudflare; la base Turso **se queda** (sin migración de datos); Render
(`hubie-pwa-staging`) sigue vivo hasta el corte verificado.

## Decisión de arquitectura (probada en TapRent y Hubie Commerce)

- **Worker + Turso por fetch (Hrana v2). NO D1.** Hubie ya es Turso; migrar
  a D1 obligaría a reescribir esquema y migrar datos. TapRent ya probó
  Turso-desde-Worker en producción (`taprent-api`, adaptador Hrana 12/12
  contra sqld local y contra Turso cloud real).
- **Frontend: Workers Static Assets en el MISMO Worker, no Pages
  separada.** Hubie autentica con cookie `__Host-hubie_session` y exige
  `Origin == HUBIE_PUBLIC_ORIGIN` en toda mutación (`server.mjs:139`).
  TapRent documenta que una Pages en otro host recibe 403 "Origen no
  autorizado" con este modelo. Hubie Commerce usa Pages + Worker en hosts
  distintos solo porque autentica con token en header, no con cookie.
  Desviación consciente del encargo original ("Pages para el estático"):
  la evidencia manda; el corte podrá servir el mismo Worker bajo el
  dominio propio.
- **Migraciones: NO desde el Worker en arranque.** Ningún proyecto
  Cloudflare lo hace. Se aplican desde Node local con un script
  idempotente (como `provision-real.mjs` / `reinit-live.mjs` de TapRent),
  contra la Turso de pruebas primero y contra la viva solo en el corte.
- **Sin cron en Free: los 5 triggers están ocupados** (kamikaze-api,
  taprent-api, shinext-reminders, mailflare ×2). El barrido de gracia
  (`POST /api/admin/billing/sweep`) y la generación de notificaciones
  siguen como endpoints que se llaman desde fuera; el cron de Hubie solo
  se registra con Workers Paid ($5/mes) o liberando un hueco (decisión
  de Julio).
- **Sesiones ya están en base de datos** (`session_tokens`, `auth.mjs`),
  no en memoria: no hay que migrarlas. **No hay JWT.**

## Qué no corre en Workers (auditoría completa)

### Bloqueantes (3)

1. **`scryptSync` — `platform/operations-portal.mjs:8,18-30`.** Único uso
   en el repo. Hash de contraseñas del portal de clientes (T001):
   `scrypt$<salt-hex>$<hash-hex>`, parámetros por defecto (N=16384, r=8,
   p=1, 64 bytes). WebCrypto no tiene scrypt. **Los hashes existentes
   serían incompatibles con PBKDF2.** Opciones: (a) verificar con un
   worker de prueba si `node:crypto` con `nodejs_compat` expone
   `scrypt`/`scryptSync` en la fecha de compatibilidad elegida;
   (b) scrypt en JS puro/WASM dentro del Worker (mismo algoritmo,
   mismos parámetros: los hashes guardados siguen válidos);
   (c) verificación dual transitoria; (d) forzar reactivación/reset de
   todos los accesos de portal (el flujo de activación con token SHA-256
   de 24 h ya existe). Decisión pendiente: probar (a) primero.
2. **`readFileSync` — 2 casos, migrables a bundle.**
   - `platform/catalog.mjs:1-2`: `assets/catalog.json` (7.881 B), cargado
     en top-level y congelado → importar como módulo JSON embebido.
   - `platform/records.mjs:2,10`: `platform/dashboard-counts.sql`
     (1.145 B) → importar como texto embebido (`?raw` o equivalente).
3. **`server.mjs` entero (1.441 líneas).** `node:http` `createServer`,
   `node:fs/promises` (`readFile`/`stat`), `node:path`,
   `process.cwd()` como raíz, `process.env.PORT`, `Buffer.concat` para
   el cuerpo crudo del webhook. Se reescribe como handler `fetch` +
   Assets; ningún módulo de `platform/` depende de `http`/`path`.

### Adaptaciones necesarias (no bloqueantes)

- **`node:crypto` en 60 archivos** (57 `platform/` + `admin.mjs`,
  `auth.mjs`, `google-oidc.mjs`). Con `compatibility_flags =
  ["nodejs_compat"]` funciona tal cual, salvo:
  - `createHash('sha256')` sync (auth, google-oidc, invitations,
    onboarding, satisfaction-domain, staging-qa-fixture,
    tools-p2-domain): sin equivalente sync en Workers → migrar a
    `crypto.subtle.digest` (**async**; `hashInvitationToken`, `hash()`,
    `digest` pasan a async). **Los hashes SHA-256 ya guardados siguen
    válidos** (mismo algoritmo, misma salida).
  - `randomBytes(...).toString('hex'/'base64url')` → `getRandomValues` +
    conversión manual si no se usa `nodejs_compat`.
  - `timingSafeEqual` → comparación manual en tiempo constante sobre
    `Uint8Array`.
  - `randomUUID` (44 archivos solo lo usan a él): nativo en Workers
    (`crypto.randomUUID()`), sin cambio o con `nodejs_compat`.
- **`Buffer` global** (auth, catalog, media-policy, media-store,
  onboarding, operations-portal, staging-qa-fixture, tools-p2-domain,
  server.mjs): OK con `nodejs_compat`; sin él, sustituir por
  `Uint8Array` + `atob`/`btoa`.
- **Stripe SDK `^23.1.0`** (`platform/billing-webhook.mjs:11`, import
  dinámico; `constructEvent(rawBody Buffer, …)`). No está instalado en
  `node_modules` (solo en `package-lock`), sin verificar en `workerd`.
  Plan: sustituir por fetch directo a `https://api.stripe.com/v1`
  (patrón Hubie Commerce `worker/src/index.js:1111-1114` y TapRent
  `billing.ts:12,126-140`) y reimplementar la verificación de firma con
  WebCrypto HMAC-SHA256 sobre `"<timestamp>.<payload>"`, tolerancia
  300 s, comparación en tiempo constante (Hubie Commerce
  `index.js:1152-1157`). Llamadas: `checkout.sessions.create`,
  `subscriptions.retrieve`, `invoiceItems.create`,
  `invoices.create/finalizeInvoice`. Idempotencia por
  `stripe_webhook_events` (ya existe).
- **`database.mjs` (76 líneas): portable con condiciones.**
  - Ruta `turso://` → `@tursodatabase/serverless/compat`: su `dist/`
    no tiene `node:` ni `require`, habla por fetch a `/v3/pipeline`,
    pero usa el global `Buffer` → necesita `nodejs_compat`. `.batch()` /
    `.close()` en `workerd` **sin verificar en runtime**.
  - Ruta `libsql:`/`https:` → fetch directo a `/v2/pipeline`
    (`AbortSignal.timeout(8000)`): ya es código Worker.
  - `executeBatch` en ruta B usa `@libsql/client`: su `package.json`
    declara condición de exportación `"workerd": "./lib-esm/web.js"`
    (solo fetch, sin nativo); si el bundler resuelve `node`, carga el
    binding `.node` y falla. Verificar en `workerd` real.
  - `process.env` (13 vars en total, ver abajo): con `nodejs_compat`
    se puebla desde los bindings/secretos del Worker.
- **Migraciones por `readFile`** (`server.mjs:105-137`, lista de 35
  archivos 001–036 sin 019): en Workers no hay `fs`. El runner pasa a
  script Node local idempotente (misma tolerancia `duplicate column`,
  mismo `executableStatements` de `platform/migration-parser.mjs`,
  puro y portable). `marketing_leads` se crea inline en
  `server.mjs:137`, fuera de migraciones: llevarlo al script.
- **Cuerpo crudo del webhook** (tope 1.000.000 B): en Workers se lee
  con `request.arrayBuffer()` (o `request.text()`), nunca `Buffer.concat`.
- **Adjuntos 10 MB en base64 dentro de Turso** (`pwa_media.content_b64`,
  tope HTTP 13.600.000 B en el endpoint de adjuntos). Sin cambio de
  código obligatorio, pero **sin verificar**: límites de fila/payload de
  Turso para celdas base64 de ~13,4 M caracteres y coste CPU/tiempo de
  un Worker al decodificar. El endpoint de adjuntos (13,6 MB JSON)
  supera el límite de request de Workers en el plan gratuito: verificar
  en staging y, si hace falta, subir por chunks o documentarlo como
  límite del Worker. Cuotas: 60.000.000 B por tenant, máx. 12 adjuntos
  por registro.
- **Tests con `node:sqlite`** (7 archivos) y
  `tests/billing-server.test.mjs` (`node:child_process` + spawn de
  `server.mjs`): no corren en Workers; se mantienen en entorno Node.
  Los tests de contrato de `database.mjs` son puros y portables.
- **Sin `setInterval`/`setTimeout` en todo el repo.** Solo
  `AbortSignal.timeout` (Turso 8 s, Google 10 s).

## Inventario de rutas (resumen; detalle con líneas en la auditoría)

- Salud: `GET /healthz` (tabla de 84 nombres, `tableCount===84`).
- Auth/OIDC: `/api/auth/google/start|callback`, `/api/auth/session`,
  `/api/auth/logout`, `/api/onboarding/activate`.
- Públicas: `/api/public/surveys/:token`, `/api/portal/:slug/...`,
  `/api/public/invitations`, `/api/public/quotes/:token`, `/api/leads`,
  `/api/checkout`, `/api/stripe/webhook`, `/invitacion`.
- Admin: `/api/admin/tenants[/:id[/tools|members|invitations|import|
  activation-link|media|appearance]]`, `/api/admin/{appearance,catalog,
  audit,billing,billing/sweep,notifications,notifications/generate,
  media}`, búsqueda de tenants.
- App: `/api/app/:slug/{config,tools,attachments,media,appearance,
  audit,invitations,case-documents,workflows/*,surveys,training,
  accounting,sales-orders,projects,helpdesk,employees,attendance,
  payroll,marketing,pos,onboarding,demo-data,search,notifications}`,
  `/api/billing/status`. Los 10 módulos nuevos (T023–T031 + training)
  hacen sub-dispatch por `parts` con `maxBytes:64_000`; CSV exports
  (training, accounting, forms, reports) fuera de `processApi`.
- Estático: `/` → `index.html`; `/app/` → `app/index.html`;
  `/encuesta/` → `encuesta/index.html`; `admin.html`, `madre/app.html`,
  `auth/configuracion.html`, `app/` y `encuesta/` son *app shell* (sin
  `enhanceHtml`); el resto de HTML pasa por `enhanceHtml` (header/footer
  compartidos, Poppins, `navigation.css`, `catalog-ui.js`,
  `ambient-motion.js`); `decodedProtected` bloquea `/.git`, `/platform/`,
  `/turso/`, `/scripts/`, `/tests/`, `/docs/`, `/data/backup/`,
  `/package*.json`, `*.mjs|*.sql|*.map`. Cache: `no-store` en app shell
  y assets PWA, `public, max-age=300` en el resto. Sin SPA fallback.

## Arranque actual (qué se pierde y qué se conserva)

- `applyCoreSchema()` (best-effort, tolera `duplicate column`) +
  verificación de 5 tablas core + `CREATE TABLE marketing_leads`.
  El servidor escucha **antes** de migrar; `processApi` da 503 hasta
  `migrationsReady`. Matiz: si `databaseHealth()` falla al arrancar,
  `applyCoreSchema` retorna sin lanzar y `migrationsReady` puede quedar
  en `true` sin migraciones (el `/healthz` lo delataría).
- `seedQaCompanyIfRequested()`: no-op salvo
  `HUBIE_SEED_QA_COMPANY='create-qa-pilot-2026-11'` + origen staging
  Render + `HUBIE_AUTH_ENABLED='true'`. **En Cloudflare el seed debe
  quedar apagado** (exige el origen Render); el fixture QA no se
  siembra en la Turso de pruebas salvo decisión explícita.
- `sweepPastDueSuspensions` (gracia 3 días) y generación de
  notificaciones son **bajo demanda** (al cargar el panel / endpoint
  admin), no programadas: no hay nada que convertir a cron hoy.

## Correo

- `platform/email.mjs`: Resend por fetch inyectado; sin
  `RESEND_API_KEY` devuelve `{sent:false}` sin fingir el envío
  (invitaciones y marketing `sin_envio`). `platform/notifications.mjs`
  `sendNotificationEmail` no tiene llamadores en producción (solo
  tests): código muerto en vivo.
- Google OIDC: PKCE S256, `state`/`nonce`/`code_verifier` en
  `oauth_login_attempts` (10 min, un solo uso), `id_token` validado
  contra `tokeninfo` (`aud`, `iss`, `nonce`, `email_verified`, `exp`).
  El `redirect_uri` es `HUBIE_PUBLIC_ORIGIN +
  /api/auth/google/callback`: **en el Worker de staging el login real
  con Google exige dar de alta esa URL en Google Cloud Console**
  (pendiente de Julio). Sesiones: token `randomBytes(32)` base64url,
  solo el hash SHA-256 en `session_tokens`, TTL 24 h, cookie
  `__Host-hubie_session` (`Secure; HttpOnly; SameSite=Lax`).

## Variables de entorno (13, todas leídas perezosamente salvo PORT)

| Variable | Uso |
|---|---|
| `TURSO_DATABASE_URL` | URL de la base (`turso://`, `libsql://`, `https://`) |
| `TURSO_AUTH_TOKEN` | Token Turso (Bearer en pipeline / authToken del cliente) |
| `HUBIE_PUBLIC_ORIGIN` | Origen canónico; chequeo de mismo origen, enlaces, `redirect_uri` Google |
| `HUBIE_AUTH_ENABLED` | Interruptor maestro (`'true'`); sin él, admin/sesión/media dan 503 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Google (también `aud` del `id_token`) |
| `HUBIE_INITIAL_ADMIN_EMAIL` | Primer superadmin por Google |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe tapmkt, MODO PRUEBA |
| `RESEND_API_KEY` / `RESEND_FROM` | Resend (sin clave: sin envío real; default remitente `Hubie <invitaciones@hubie.mx>`) |
| `HUBIE_SEED_QA_COMPANY` | Solo `'create-qa-pilot-2026-11'`; apagado en Cloudflare |
| `PORT` | Solo Node (10000 por defecto) |

`readyForLive` = TURSO_* + GOOGLE_* + origen válido +
`HUBIE_INITIAL_ADMIN_EMAIL` válido + `HUBIE_AUTH_ENABLED='true'`.
`.env.example` está desactualizado (habla de Supabase/`VITE_*`).

## Verificación en workerd real (2026-11-24) — sondeo 7/7 OK

Worker desechable `hubie-probe` (borrado tras el sondeo) con
`compatibility_date = "2026-11-17"`, `nodejs_compat`, wrangler 4.161.0.
Respuestas en `/tmp/hubie-probe/results/*.json`. **Todo lo probado
funciona; los bloqueantes de la auditoría quedan resueltos así:**

- **`scryptSync` SÍ existe en workerd con `nodejs_compat` y produce el
  mismo hash bit a bit que Node local** (mismos parámetros N=16384,
  r=8, p=1). Los hashes `scrypt$…` existentes de
  `operations-portal.mjs` siguen verificando. **Bloqueante cancelado:
  no se toca el hash de contraseñas del portal.**
- `randomUUID` / `randomBytes` / `createHash('sha256')` /
  `timingSafeEqual` de `node:crypto`: OK, salidas idénticas a Node.
  **La migración de `createHash` a `crypto.subtle` async queda
  cancelada: no hace falta.**
- Global `Buffer`: OK (`from`, `byteLength`).
- `process.env`: se puebla con `[vars]` y con secretos (`wrangler
  secret put`). Las 13 variables del servidor llegan por bindings.
- `@libsql/client` 0.15.15: carga (condición `workerd` →
  `lib-esm/web.js`); `execute` contra host inventado falla por red
  (404 del edge), no por el binding `.node`.
- `@tursodatabase/serverless/compat` 1.4.1: carga; `execute` falla por
  red (404), no por carga.
- **SDK `stripe` 23.1.0: carga y llega a `api.stripe.com`** (401 por
  la clave falsa de prueba). **La reescritura a REST queda cancelada:
  se conserva el SDK.**
- `crypto.subtle.digest` y `crypto.randomUUID` globales: OK, SHA-256
  idéntico a Node.

**Pendiente de verificar en el Worker real de Hubie (no en el sondeo):**
`.batch()` / `.close()` del SDK serverless contra Turso real, el
endpoint de adjuntos de 13,6 MB, y los límites de fila/payload de
Turso para celdas base64 grandes.

## Base Turso del staging (identificar, NO tocar)

- La Turso que usa el staging de Render se identifica por
  `TURSO_DATABASE_URL` del servicio Render (no disponible en el
  sandbox). **Prohibido escribir en ella desde este trabajo.** Toda
  verificación usa una base de pruebas nueva (vía API de Turso,
  conector `custom.turso`, org `juliiocontreras`) o SQLite local.
- Trampas Hrana v2 (TapRent, `PROTOTYPE-REPORT.md`): el baton cambia
  en cada respuesta (usar siempre el último); nunca mezclar `BEGIN`
  con `close` en el mismo request; si una sentencia falla, `ROLLBACK`
  explícito; blob como `{"type":"blob","base64":"…"}`; enteros como
  `{"type":"integer"}` (la rama vieja codificaba todo como `float` y
  perdía precisión > 2^53); transacciones de escritura cortas (el
  servidor mata a la que bloquea a otra a los ~5 s); cada sentencia es
  un round-trip HTTPS.

## Despliegue (probado en este VM)

- Solo con `python3 ~/workspace/cf-tools/run-wrangler.py --cwd <dir>
  -- <args wrangler>` (credencial `custom.cloudflare`, nunca
  `cloudflare`; wrangler fijado a 4.161.0; `compatibility_date`
  máxima `2026-11-17` con esa versión). No subir por API directa de
  manifest (400: wrangler usa hashes BLAKE3).
- `wrangler.toml` de referencia: `name = "hubie-api"`,
  `compatibility_flags = ["nodejs_compat"]`, `[vars]` solo no
  secretos; secretos con `wrangler secret put` (valor por stdin,
  nunca en el comando). Cron comentado (sin hueco Free).
- Nombres: Worker `hubie-api` (no chocar con `hubie-commerce-api` ni
  `taprent-api`); Assets en el mismo Worker.

## Fase 2 — Implementación y verificación (2026-11-24)

Commits locales en main (sin push): `e66b976` (catálogo JSON y SQL
embebidos), `492debf` (script de migraciones + base hubie-test),
`1252d7a` (Worker hubie-api con Assets + marketing_leads + tests),
`997c11e` (HUBIE_PUBLIC_ORIGIN del Worker). Tests **478/478** en verde
(440 base + 38 nuevos), verificados por el coordinador.

- **Worker staging: https://hubie-api.juliiocontreras.workers.dev**
  (`hubie-api`, `compatibility_date 2026-11-17`, `nodejs_compat`,
  Assets en el mismo Worker con `run_worker_first=true`, sin cron ni
  D1). Porte mecánico del routing de `server.mjs`: mismos patrones de
  ruta, 78 llamadas `processApi` en ambos, mismos `maxBytes`. Ninguna
  ruta quedó sin portar. `worker/src/enhance.mjs` reproduce
  `enhanceHtml` (copia literal). `scripts/build-worker-assets.mjs`
  copia solo la lista permitida a `worker/public/` (105 archivos, 0
  prohibidos).
- **Base de pruebas: `hubie-test`** (`libsql://hubie-test-
  juliiocontreras.aws-us-east-2.turso.io`, grupo `hubie`,
  aws-us-east-2). Migraciones 001–036 + `marketing_leads` aplicadas con
  `scripts/migrate-test-db.mjs`: **127 tablas, 5/5 core, 0 fallos**,
  2ª pasada idempotente (12 ya aplicadas, solo `duplicate column`).
  Tras la verificación: **0 orgs, 0 usuarios, 0 leads** (solo esquema).
  Token solo en `~/workspace/hubie-test-token.txt` (600, fuera del
  repo). Base viva `hubie-staging` identificada y NO tocada.
- **Verificado en vivo por el coordinador (curl):** `/healthz` 200
  `ok, connected, ready, 84 tablas, readyForLive:true`; `/` 200 con
  `enhanceHtml`; `/odoo-saltillo.html` 200; `/app/?demo=1` 200;
  `/madre/app.html` 200; `/platform/records.mjs` 404; `POST
  /api/checkout` 503 (sin Stripe, degradado por diseño).
- **Flujo API real contra hubie-test (agente del Worker):** tenant
  `qa-worker` + usuario + membresía owner + sesión creados
  directamente; `GET /api/app/qa-worker/config` 200; `POST
  .../workflows/clients` 201 (cliente creado y releído en hubie-test:
  valida `.batch()` en workerd); `POST /api/leads` 201; `GET
  /api/auth/google/start` 302 a `accounts.google.com` con
  `redirect_uri=https://hubie-api.juliiocontreras.workers.dev/api/auth/google/callback`
  y PKCE S256. Datos de prueba eliminados después.
- **Demo `?demo=1` (Playwright/Firefox, 1440 y 390 px): 5/6 flujos
  PASS** — C002 oportunidad, C005 producto, T013 cotización, T022
  curso, T030 venta POS-0001 cobrada $98.60 ($85 + IVA 16%). Sin
  overflow horizontal ni errores de consola.
- **T016 Caja BLOQUEADO por bug preexistente del frontend (fuera del
  alcance de la migración):** `assets/operational-p1b.js` líneas 303,
  400, 427, 500, 571, 666 hacen
  `form.append(container('toolbar')).lastChild.append(...)` —
  `Node.append()` devuelve `undefined`, así que `.lastChild` lanza
  `TypeError` y el formulario «Abrir caja» no renderiza (0 botones,
  sin `#cashbox-opening`). Verificado por el coordinador en el repo.
  El Worker sirve el archivo byte-idéntico al de Render, así que el
  bug existe igual en vivo hoy. Arreglo: capturar el toolbar antes de
  `append` (una línea por sitio). Queda pendiente (toca `assets/`).

**No verificado en vivo:** endpoint de adjuntos de 13,6 MB (solo porte
de código; quedan los pendientes de límites de Turso/Worker).

## Qué falta para el corte (decisiones de Julio)

1. Decisión scrypt (probar `nodejs_compat` primero; si no, scrypt JS
   puro o reactivación de accesos de portal).
2. Dominio propio de producción (entonces: actualizar `HUBIE_PUBLIC_ORIGIN`,
   canonicals/sitemap/JSON-LD del SEO, y dar de alta el `redirect_uri`
   de Google en Google Cloud Console).
3. Workers Paid $5/mes (1.000 crons) o liberar un hueco para el cron
   de barrido/recordatorios.
4. Clave Resend propia de Hubie (hoy sin envío real) y secretos
   Stripe/ Google para el Worker de producción (la lista exacta va en
   la entrega de la Fase 2).
5. Verificación final en el Worker de staging contra la base de
   pruebas, y solo entonces el corte con la Turso viva.
