# Hubie — activación de Google OAuth + Turso en Render staging

**Fecha:** 6 de noviembre de 2026 · **Servicio:** `hubie-pwa-staging` · **Tipo:** staging (separado de `hubie-dev` y de la landing).
**Ruta:** https://hubie-pwa-staging.onrender.com · **Admin:** https://hubie-pwa-staging.onrender.com/madre/app.html
**Estado actual:** la identidad del administrador, origen y bandera de seguridad están preparados; faltan credenciales reales de terceros. **No declarar autenticación ni Turso operativos sin pruebas.**

## Preparación realizada (sin secretos)

En las variables de Render están configuradas:

- `HUBIE_PUBLIC_ORIGIN=https://hubie-pwa-staging.onrender.com`
- `HUBIE_INITIAL_ADMIN_EMAIL=juliiocontreras@gmail.com`
- `HUBIE_AUTH_ENABLED=false` (desactivado de forma deliberada hasta disponer de Turso y OAuth)

El servidor tiene diagnósticos sin secretos en `GET /healthz`. Verifica:
`setup.databaseConfigured`, `setup.googleConfigured`, `setup.adminConfigured`, `setup.authEnabled`, `setup.readyForLive`, `schema` y conectividad real con Turso.

## Requisitos externos (las dos únicas cuentas por autorizar)

### 1) Turso Cloud: base independiente

1. La base **`hubie-staging` ya se creó** en Turso Cloud, con URL de tipo `turso://`, según la captura del 6 de noviembre de 2026. El controlador moderno `@tursodatabase/serverless/compat` permite esta URL sin recrear la base; el anterior `@libsql/client` sigue disponible para proyectos libSQL legados.
2. La URL no secreta de `hubie-staging` ya se añadió a `TURSO_DATABASE_URL` en el servicio Render de **Hubie staging**.
3. **El primer token apareció en una captura compartida: trátalo como comprometido.** Invalida los tokens de la base desde las herramientas de Turso si están disponibles, o solicita asistencia de Turso para invalidarlos; emite uno nuevo de acceso a la base. **No envíes ese token por chat, documentos o repositorios.**
4. En https://dashboard.render.com/web/srv-dbmgp361egvs73fanbtg → **Environment**, añadir exclusivamente **`TURSO_AUTH_TOKEN`** con el token recién generado; no es necesario volver a crear `TURSO_DATABASE_URL`.

No reutilizar ninguna DB de TapRent, Hubie-dev ni otros proyectos.

### 2) Google Cloud: OAuth web de staging

1. Abrir https://console.cloud.google.com/auth/clients?project=hubie-513419: el proyecto Google Cloud **hubie** (`hubie-513419`) ya existe y está seleccionado según la captura.
2. Configurar **Branding** (nombre Hubie), audiencia externa de prueba y la cuenta `juliiocontreras@gmail.com` como usuario de prueba si aplica.
3. Crear un cliente OAuth 2.0 de tipo **Aplicación web**.
4. En **Authorized JavaScript origins**: `https://hubie-pwa-staging.onrender.com`
5. En **Authorized redirect URIs**: `https://hubie-pwa-staging.onrender.com/api/auth/google/callback` (debe coincidir exactamente).
6. En el mismo servicio Render → Environment, añadir los valores reales:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

La aplicación solicita solamente scopes `openid email profile`; el secreto OAuth se usa **solo del lado servidor**, nunca como parte de los archivos públicos.

### 3) Activación controlada

- Una vez guardadas **las cuatro credenciales reales**, colocar `HUBIE_AUTH_ENABLED=true` en Render. La modificación de variables de entorno inicia un nuevo deploy de Render.
- La inicialización del esquema (migraciones 001–013) se ejecuta para esa base Turso y el backend no admite operaciones privadas hasta que termine sin errores.
- Verificar `GET /healthz`: `status=ok`, `database=connected`, `schema=ready`, y todos los campos `setup` booleanos verdaderos.
- Probar Google desde https://hubie-pwa-staging.onrender.com/api/auth/google/start y confirmar que el administrador entra a `/madre/app.html` tras iniciar sesión.
- Crear una empresa **ficticia** en Madre y verificar que la PWA del tenant puede acceder a sus registros, y que viewer no puede escribir.
- Crear **dos empresas ficticias** y comprobar que la empresa A no pueda consultar registros de B, incluida la carga y descarga de anexos. Verificar que desactivar una Tool revoca acceso.
- Probar recuperación del servidor y que Turso mantenga los registros.

## Cambios técnicos introducidos en esta fase

- Se corrige la codificación de parámetros Hrana: `NULL` deja de convertirse en `''` y los enteros/floats preservan su tipo. Pruebas en `tests/turso-sql-args.test.mjs`.
- El inicio de sesión Google y las APIs privadas quedan bloqueadas hasta que terminen las migraciones y la configuración esté completa.
- `/healthz` permite inspeccionar el estado con indicadores booleanos, sin exponer tokens.
- **Importante:** el esquema no ha sido probado contra una cuenta Turso real porque todavía no existe acceso a una base o token en este servicio. Las pruebas en GitHub incluyen SQLite en memoria, rutas simuladas y sintaxis, no sustituyen esta verificación de integración.

## Si falla la activación

- `database not-configured`: falta una o ambas variables Turso.
- `database unavailable`: URL/token incorrecto, IP/firewall, región, interrupción o latencia.
- `schema not-ready`: revisar logs de migración 001–013 y SQL faltante antes de habilitar cuentas.
- `redirect_uri_mismatch`: comparar URI exacta del proyecto Google y la definida arriba.
- `Account not authorized`: verificar correo del administrador y usuarios de prueba; nunca desactivar las restricciones ni auto-crear usuarios de terceros.
- `/api/auth/google/start` redirige a la pantalla de configuración cuando no está disponible.

**Nunca incluir tokens de Turso o secretos de Google en GitHub, variables públicas JavaScript, capturas, mensajes de chat o respuestas del servidor.**

### Diagnóstico de la implementación del 6 de noviembre de 2026

- El proyecto Google Cloud y la base Turso ya existen. **No** se ha confirmado aún que exista un cliente OAuth web ni que estén cargados los secretos en Render.
- La conexión Turso actual admite `turso://` usando `@tursodatabase/serverless/compat`; mantiene el conector libSQL legado para otros entornos.
- Pruebas de protocolo y transformación de resultados: `tests/turso-cloud-driver.test.mjs`.
- El servidor debe permanecer con `HUBIE_AUTH_ENABLED=false` hasta que las otras tres variables secretas estén guardadas y el esquema de la base haya terminado la migración.
- El token visible en la captura no se utilizó, copió ni almacenó en los archivos del proyecto.
