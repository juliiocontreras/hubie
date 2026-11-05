# Despliegue seguro de Hubie PWA en Render

## Hospedaje ya conectado

- Cuenta Render: Julio's workspace.
- Servicio existente de desarrollo: `hubie-dev` (`srv-dbj2f1k9v7es738ur25g`) y URL `https://hubie-dev.onrender.com`.
- Estado confirmado al 5 de noviembre de 2026: último despliegue de la rama `feat/turso-core`, `autoDeploy: no`, plan `free`, región Ohio. **No está desplegada esta rama**.
- Rama nueva de la PWA: `feat/pwa-madre-multitenant` (PR #6 en borrador).

## Rutas de la PWA

- PWA Madre: `https://hubie-dev.onrender.com/madre/app.html`
- PWA del cliente: `https://hubie-dev.onrender.com/app/`
- Health check del servidor: `https://hubie-dev.onrender.com/healthz`
- Autenticación: `https://hubie-dev.onrender.com/api/auth/google/start`
- La landing corresponde a otra superficie. No cambiar la web pública ni desplegar la rama antes de las verificaciones de abajo.

Estas son **rutas planeadas** para la nueva rama. La URL ya existe, pero la nueva versión **no está activa** en ese servicio.

## Runtime Node en Render (cuando staging sea seguro)

- Runtime: Node.js versión 22 (archivo `.node-version`).
- Región: Ohio (la del servicio existente).
- Build: `npm install --omit=dev --ignore-scripts --no-audit --no-fund`.
- Start: `node server.mjs`.
- Puerto: usar `PORT` que proporciona Render; el servidor escucha en `0.0.0.0`.
- La rama `feat/pwa-madre-multitenant` no debe cambiarse en el servicio conectado a una base real hasta probar las migraciones 001–008 en Turso staging.
- El build actual del servicio, `echo 'No build required'`, no garantiza que `@libsql/client` esté instalado. Es necesario corregirlo al desplegar.
- Como `package-lock.json` no está versionado, usar `npm install`, no `npm ci`; en una etapa posterior conviene añadir lockfile reproducible.

## Variables de entorno obligatorias (valores NO incluidos aquí)

| Variable | Propósito |
|---|---|
| `TURSO_DATABASE_URL` | URL HTTPS/libsql de **base independiente de staging** |
| `TURSO_AUTH_TOKEN` | Token secreto de esa base (solo backend) |
| `HUBIE_AUTH_ENABLED` | `true` para habilitar login/API privada |
| `GOOGLE_CLIENT_ID` | Identificador de cliente OAuth 2.0 de Google |
| `GOOGLE_CLIENT_SECRET` | Secreto de cliente OAuth 2.0 |
| `HUBIE_INITIAL_ADMIN_EMAIL` | Correo autorizado para bootstrap de la PWA Madre |
| `HUBIE_PUBLIC_ORIGIN` | `https://hubie-dev.onrender.com` para el servicio existente |

Registrar `https://hubie-dev.onrender.com/api/auth/google/callback` como URI de redirección autorizada en Google Cloud. La URL de retorno y la comprobación de origen de peticiones mutantes se limitan estrictamente a `HUBIE_PUBLIC_ORIGIN`. No publicar credenciales en GitHub ni en JavaScript.

## Secuencia de pruebas antes del cambio de rama

1. Hacer copia lógica de la base utilizada actualmente. **No conectar staging a la base actual** sin revisión.
2. Preparar base Turso de staging diferente y credenciales temporales. Aplicar migraciones 001–008 en ese entorno.
3. Verificar `/healthz`, login Google, propietario PWA Madre y dos usuarios pertenecientes a empresas distintas.
4. Confirmar que desactivar una Tool revoca acceso a API; reactivarla recupera datos sin pérdida.
5. Probar Clientes C001, CRM C002, Agenda C004, Inventario C005 y Dashboard C008 con dos empresas. Verificar permisos viewer y estado suspendido.
6. Probar instalación móvil, pantalla inicial, caché PWA sin almacenamiento de respuestas API y control de errores.
7. Corregir el Build y la rama del servicio Render desde el panel de configuración y hacer deploy manual, porque `autoDeploy` está desactivado. Validar logs y estado antes de publicar la URL a clientes.

## Límites de plan gratis

El plan Free de Render es adecuado para demos, no para una PWA comercial con disponibilidad garantizada. El servicio duerme tras 15 min sin tráfico; su disco es efímero y las horas gratis se comparten con otros servicios de la cuenta. Turso conserva los datos persistentes por separado. No guardar archivos ni bases locales como persistencia.

## Dominio futuro

Usar el subdominio gratuito mientras se desarrolla. Cuando exista un dominio oficial para Hubie, proponer un dominio exclusivo de PWA (por ejemplo `app.<dominio-real-de-Hubie>`) y configurar `HUBIE_PUBLIC_ORIGIN`/OAuth con el nombre exacto; **no se ha comprado ni asignado un dominio aquí**.
