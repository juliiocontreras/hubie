# DEADCODE-REPORT — Hubie (frente ELIMINAR CÓDIGO MUERTO)

- **Fecha:** 2026-11-13
- **Copia:** `~/workspace/hubie-work-deadcode` (base main @ 28a59f0, migraciones 001–016)
- **Fuente:** `docs/MULTITENANT-AUDIT-2026-11-12.md` §1.1, §2.1, §6, §9.2, §14.23
- **Método:** cada sospecha se verificó con `grep -rn` (código, tests, HTML, docs, `server.mjs`, manifests, service workers) antes de tocar nada. Solo se eliminaron archivos/directorios autónomos con **cero referencias**. No se tocó `server.mjs`, `assets/app-console.js`, `assets/admin-console.js`, `assets/tool-forms.js`, `assets/demo-backend.js`, `platform/*.mjs`, `turso/migrations/015_billing.sql`, `turso/migrations/016_commerce.sql` ni `docs/STRIPE-BILLING.md`. No se hizo push, no se crearon ramas, no se usaron claves reales.
- **Tests:** `npm test` en verde antes (140/140) y después (142/142, +2 tests nuevos del contrato de limpieza).

---

## 1. Eliminados (con evidencia de grep por cada uno)

### 1.1 `data/` entero — catálogo histórico incompatible (8 archivos)

Eliminados: `data/suites.json`, `data/tools.json`, `data/tools_extras.json`, `data/extras.json`, `data/insumos.json`, `data/servicios.json`, `data/reglas-cobro.json`, `data/backup/2026-09-01_resumen.md`.

Evidencia:
- `platform/catalog.mjs:4`: «Do not derive prices from data/suites.json (an incompatible older catalogue)» — el catálogo vivo es `assets/catalog.json`.
- Único consumidor en código: `madre/index.html:323-329` hacía `fetch('data/suites.json' | 'data/tools.json' | 'data/tools_extras.json' | 'data/servicios.json' | 'data/extras.json' | 'data/insumos.json' | 'data/reglas-cobro.json')` y `template/index.html:294-295` hacía `fetch('data/servicios.json' | 'data/insumos.json')`. Ambos archivos se eliminan en §1.2, así que tras eso quedan **cero** referencias de código.
- `grep -rn "suites\.json|tools\.json|tools_extras|extras\.json|insumos\.json|servicios\.json|reglas-cobro"` (mjs/js/html/py/md, sin `node_modules`): solo quedan menciones en `docs/` (auditoría y `PWA-MADRE-MULTITENANT.md`, que documentan que NO se usa) y el comentario de `platform/catalog.mjs`.
- Ningún test lee `data/` (`grep "'data/|"data/` en `tests/` → 0 resultados).
- Ningún service worker cachea `data/` (`app/sw.js`, `madre/sw.js` no lo listan).
- `data/backup/2026-09-01_resumen.md` es solo un conteo estático de validez de esos JSON; además `server.mjs:decodedProtected` ya devuelve 404 para `/data/backup/`.

### 1.2 Mockups legacy — `madre/index.html`, `template/index.html`, `panel/index.html`

Eliminados los 3 archivos (72 KB + 46 KB + 28 KB) y los directorios vacíos `template/` y `panel/`.

Evidencia (para los 3): cero enlaces desde ningún HTML/JS/MJS (`grep -rn "madre/index|panel/index|template/index|panel/|template/"` en html/mjs/js/json/yml/md → solo menciones en docs de auditoría); cero lecturas en tests (`tests/*.test.mjs` no los referencian; los tests leen `madre/app.html`, nunca `madre/index.html`); cero menciones en los workflows de CI (que verifican `/app/`, `/madre/app.html`, `/auth/configuracion.html`, no estos).
- `madre/index.html`: mockup legacy con paneles de Configuración (branding, notificaciones, facturación CFDI, 2FA, «Solo 2 usuarios por suite») que solo escriben en `localStorage` (`guardarConfig()`). La PWA real es `/madre/app.html` + `assets/admin-console.js`. Auditoría §9.2 y §14.23.
- `template/index.html`: mismo patrón, mockup de cliente con `fetch('data/...')` y `localStorage`.
- `panel/index.html`: «Panel de Supervisión de Agentes», autocontenido (CSS y `<script>` inline, líneas 220–408), sin ningún `fetch`, `src` ni `href` externo y sin ninguna referencia entrante.

### 1.3 `assets/logo hubie.png` (210,733 B)

Eliminado. Evidencia: `grep -rln "logo hubie.png"` en html/mjs/js/css/json/yml/md → **cero** referencias. El logo vivo es `assets/hubie-logo-official.png` (207,689 B, hash SHA distinto: `6520d762…` vs `2b3925d8…`), referenciado en `server.mjs` (header inyectado), `app/index.html`, `assets/app-console.js` y `auth/configuracion.html`.

### 1.4 Tabla `tenant_domains` — migración nueva `turso/migrations/017_drop_tenant_domains.sql`

Creada (no se eliminó ningún archivo compartido para esto):
```sql
DROP TABLE IF EXISTS tenant_domains;
```

Evidencia:
- `grep -rn "tenant_domains"` en todo el repo: solo `turso/migrations/003_identity.sql:3-4` (el `CREATE TABLE` + su índice) y la auditoría §2.1 («Tabla creada pero sin ningún uso en código») y §14.14. Cero lecturas/escrituras en código, tests o docs vivos. No hay feature de dominios personalizados.
- Decisión: **no se editó `003_identity.sql`** (migración ya aplicada en Turso viva; reescribir historia aplicada es lo riesgoso). El borrado vive como migración aditiva 017, idempotente (`IF EXISTS`; el índice `idx_tenant_domains_org` muere con la tabla).
- **Pendiente para integración (NO hecho aquí porque `server.mjs` es archivo protegido):** `server.mjs:applyCoreSchema()` tiene la lista de migraciones hardcodeada (`001_core.sql` … `016_commerce.sql`); hay que añadir `'017_drop_tenant_domains.sql'` a esa lista para que el servidor la aplique. El conteo de `/healthz` (`tableCount===34`) **no** se ve afectado: `tenant_domains` no está en la lista de tablas contadas (`server.mjs:477`).
- Contrato nuevo: `tests/deadcode-cleanup.test.mjs` (2 tests) — afirma que los 12 archivos eliminados siguen sin existir y que 017 contiene exactamente un statement `DROP TABLE IF EXISTS tenant_domains`.

---

## 2. Sospechosos NO eliminados (con evidencia y ubicación)

### 2.1 Tablas muertas de `turso/migrations/002_multitenant.sql` — `tenant_clients`, `tenant_appointments`, `tenant_orders`, `tenant_service_requests`

- Evidencia de muerte: `grep -rn` de cada nombre en mjs/js/sql/html/py/md → **cero** lecturas/escrituras en código. Solo aparecen en su propio `CREATE TABLE` en `002_multitenant.sql:3,6,8,9`, en `tests/multitenant-contract.test.mjs:4` (que afirma que 002 las crea) y en docs (`docs/PWA-MADRE-MULTITENANT.md:139`, auditoría §2.1).
- Por qué NO se eliminan: la auditoría §14 P0 #5 documenta como pendiente la **migración de contactos históricos `tenant_clients` → `tenant_client_profiles`**, y `docs/PWA-MADRE-MULTITENANT.md:139` dice que la migración 008 «no sobrescribe los contactos antiguos». Sin acceso a Turso viva no se puede verificar si esas tablas tienen filas legacy; borrarlas por migración destruiría datos no migrados. Es una decisión de datos, no de código: que el integrador verifique el contenido en vivo antes de decidir. Si se borran, hay que actualizar también `tests/multitenant-contract.test.mjs:4`.
- Excepción verificada: `tenant_catalog_items` (también listada como muerta en la auditoría §2.1) **está VIVA** — ver §3.3.

### 2.2 `organization_invitations` — NO tocada (intencionadamente)

- Existe en `turso/migrations/001_core.sql:5-6`, referenciada además en `scripts/migrate.mjs:13`, `server.mjs:80` (conteo de tablas core) y `tests/test_turso_core.py:23-24`. La auditoría §6 la marcaba muerta, pero el frente paralelo Fase A la está implementando ahora mismo. **No se tocó nada relacionado.**

### 2.3 `IDEA.md` y `ORIGEN.md` (raíz)

- Cero referencias en código/tests/docs. Son notas de autoría de Julio (IDEA: 1 línea describiendo el proyecto; ORIGEN: procedencia de la carpeta `C:\Users\julii\hubie`), no código ni catálogo. Se conservan; borrar notas del autor no es decisión de este frente.

### 2.4 `.env.example` — nombres de proveedor obsoletos (Supabase/Netlify/Vite)

- Contiene `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NETLIFY_AUTH_TOKEN`, `SUPABASE_DB_URL` (la auditoría §5 ya lo señala: «el archivo no refleja el stack real Turso/Render»). No se tocó: `tests/setup-health.test.mjs` lo lee (`readFile('.env.example')`) y la plantilla de Stripe/Resend que sí está viva vive en el mismo archivo. Limpieza de plantilla, no de código muerto; otro frente o el integrador decide.

### 2.5 Código muerto DENTRO de archivos protegidos — no verificado a fondo, no tocado

- No se hizo auditoría de funciones/endpoints sin uso dentro de `server.mjs`, `assets/app-console.js`, `assets/admin-console.js`, `assets/tool-forms.js`, `assets/demo-backend.js` ni `platform/*.mjs` (fuera del alcance seguro de este frente: son archivos compartidos por otros 8 frentes). No se reporta ningún sospechoso concreto dentro de ellos por falta de evidencia verificada; no se inventa ninguno.

### 2.6 Índices sobre `tenant_catalog_items` — verificados, NADA que eliminar

- Actualización Turso viva 2026-11-13 (main 2b857e5): el motor en vivo rechaza CUALQUIER índice sobre `tenant_catalog_items` (probado parcial, 4, 3 y 2 columnas; `SQL_INPUT_ERROR`), aunque pasen en libsql embebido.
- Verificación en esta copia (base 28a59f0): `grep -rn -i "CREATE (UNIQUE )?INDEX[^;]*ON tenant_catalog_items"` en sql/mjs/js/py/md → **cero coincidencias**. `turso/migrations/016_commerce.sql:7-12` ya trae la NOTA Turso con esa evidencia y `:68` dice explícito «Sin índices en tenant_catalog_items»; el SKU activo se valida en código (`platform/operations-catalog.mjs`). La copia ya está alineada con el fix de 2b857e5 en este punto: no hay índices que eliminar ni que reportar como eliminables.

---

## 3. Verificado como VIVO que parecía muerto

| Sospecha | Veredicto | Evidencia |
|---|---|---|
| `tenant_catalog_items` (auditoría §2.1 la daba por muerta) | **VIVA** | `platform/operations-catalog.mjs:11,19,28,32,42,45,49,58` (CRUD completo C006 Catálogo), `platform/media-store.mjs:11` (mapa `C006 → tenant_catalog_items`), `turso/migrations/016_commerce.sql:53` (redefinición completa), `server.mjs:477` (conteo healthz), `tests/commerce-schema.test.mjs` |
| `admin.html` | **VIVA** | `server.mjs:129` redirige login fallido a `/admin.html?login=failed`; `server.mjs:498` la trata como appShell (sin enhanceHtml) |
| `productos.html` | **VIVA** | Enlazada desde `index.html:91-103,116`, `contacto.html:96`, `assets/navigation.js:6`; leída por `tests/visual-modern-upgrade.test.mjs:79` |
| `marca.html` | **VIVA** | Enlace «Brand Book» en `index.html:164` y `productos.html:121` |
| `assets/ambient-motion.js` | **VIVA** | `server.mjs:58` lo inyecta con `defer` en TODAS las páginas públicas vía `enhanceHtml()` (igual que `assets/catalog-ui.js`) |
| `assets/catalog-ui.js` | **VIVA** | Inyectado por `server.mjs:58`; leído por tests |
| Todos los `assets/*.js` operativos y `assets/*.css` | **VIVOS** | Cada uno referenciado desde `app/index.html`, `madre/app.html`, `app/sw.js`, `madre/sw.js`, consolas o `server.mjs` (verificado archivo por archivo) |
| `app-factory.yml` | **VIVO** | Referenciado por `.github/workflows/readiness.yml` y `docs/INFRASTRUCTURE.md` |
| `platform/suite-distribution.mjs`, `staging-qa-*`, `workflows.mjs`, etc. | **VIVOS** | Referenciados desde consolas, `server.mjs` o tests |
| `GET /api/admin/catalog` | **VIVO** | `assets/admin-console.js:321` lo consume |

---

## 4. Resumen para integración

- **Eliminados:** 12 archivos (8 en `data/`, 3 mockups, 1 logo) + 2 directorios vacíos (`template/`, `panel/`) + 1 tabla vía migración nueva 017. Total aproximado: ~360 KB de archivos (147 KB mockups + ~210 KB logo + JSONs de `data/`).
- **Creados:** `turso/migrations/017_drop_tenant_domains.sql`, `tests/deadcode-cleanup.test.mjs`, este informe.
- **Tests:** 142/142 en verde (base 140/140 + 2 nuevos).
- **Acción pendiente del integrador:** añadir `'017_drop_tenant_domains.sql'` a la lista hardcodeada de `server.mjs:applyCoreSchema()` (archivo protegido, no tocado aquí).
- **Decisión pendiente de Julio/integrador:** verificar en Turso viva si `tenant_clients` / `tenant_appointments` / `tenant_orders` / `tenant_service_requests` tienen filas legacy antes de borrarlas (§2.1).
