# Hubie — PWA Madre y operación multitenant

## Rama de desarrollo

- Repositorio: `juliiocontreras/hubie`
- Base: `feat/turso-core`
- Rama: `feat/pwa-madre-multitenant`
- PR borrador: https://github.com/juliiocontreras/hubie/pull/6
- **Sin despliegue ni migración aplicados a producción.**

## Separación de aplicaciones

| Superficie | Ruta | Finalidad |
|---|---|---|
| Web pública | `/` | Marketing y cotizador, sin cambios de esta rama |
| PWA Madre | `/madre/app.html` | Administrar empresas, suites, Tools y usuarios |
| PWA del cliente | `/app/` | Operación privada según membresía y herramientas habilitadas |
| Antiguos mockups | `/madre/`, `/panel/`, `/template/` | Referencia anterior; no equivalen a la PWA operativa |

## Fuente de verdad

El catálogo operativo y comercial es `assets/catalog.json` (Hubie Tabla Datos Simple v5): **10 suites, 30 tools**. Mantener importes, reglas y nombres sin inventar datos. `data/suites.json` responde a un catálogo histórico incompatible, por lo que no se usa para habilitar herramientas ni determinar precios. El campo `complete: false` del catálogo advierte que la fuente todavía puede requerir validación final.

## Relación multitenant

```text
Hubie (plataforma)
  ├── Administradores de la plataforma
  ├── Catálogo de suites / tools (v5)
  └── Organizaciones (tenant / empresa)
       ├── Configuración de marca, suite base y estado
       ├── Tools de esa empresa: habilitada / deshabilitada
       ├── Membresías: owner / admin / member / viewer
       └── Registros por organización + tool
```

La selección de suite no modifica la plantilla global. Cada tenant tiene su lista de Tools individual y las puede cambiar un Super Admin desde la PWA Madre, preservando el historial incluso si se deshabilita una Tool. La PWA cliente solo dibuja y consulta Tools activas. **La separación real la impone el servidor**: verifica sesión, membresía activa, tenant activo y Tool habilitada en cada ruta de registros.

## Funciones implementadas en la rama (etapa de desarrollo)

- Crear organización con slug único, nombre, Suite, colores, pertenencia inicial y permisos de Tools en una transacción Turso.
- Listar y administrar organizaciones, cambiar Suite, nombre, logo URL, colores y estado.
- Habilitar/deshabilitar cada Tool por empresa con evento de auditoría.
- Preautorizar colaboradores mediante correo Google y roles; el correo debe autenticarse con identidad Google válida.
- Acceso por empresa, selector de organizaciones a las que pertenece el usuario.
- Menú y tarjetas derivados dinámicamente de las Tools activadas.
- Registros genéricos por herramienta: crear, editar, listar, filtrar y archivar (salvo Tools de consulta).
- Interfaz móvil responsive, manifests PWA y trabajadores de servicio con caché de shell; las APIs nunca se almacenan sin protección en el service worker.
- En `turso/migrations/006_pwa_records.sql`, tabla nueva con llave compuesta por organización, registro y referencia a la Tool del tenant.
- Tests de catálogo, reglas y migraciones; smoke test para servidor y rutas protegidas en GitHub Actions.

## Diferenciar registros genéricos de funcionalidad completa

Las 30 Tools aparecen y tienen formularios de registro básico. **No significa que sus flujos especializados estén terminados**. Entre las funciones pendientes se encuentran:

- Clientes/CRM: pipeline comercial, relaciones entre entidades, tareas automáticas, flujos y alertas.
- Agenda: validación de horarios, reservas, recordatorios, Google Calendar/WhatsApp reales.
- Inventario: kardex, transacciones de stock, apartados, lotes, multi-almacén y manejo de concurrencia.
- Ventas/pedidos: line items, impuestos, cotizaciones convertibles, flujo de aprobación.
- Facturación: CFDI 4.0 y SAT/PAC, que no están conectados.
- Cobros: conciliación y proveedores de pagos, que no están conectados.
- Firmas: gestión de consentimiento y firma legal, que no están conectados.
- Escáner: permisos de cámara, lectura QR/Barcode e integración con hardware, pendientes.
- Reportes avanzados: consultas KPIs y exportaciones de producción.
- Roles granulares por Tool, invitaciones con expiración y revocación, dominios personalizados verificados y licenciamiento.
- Instalación PWA en dispositivos físicos, offline seguro, sincronización, push, respaldos y restauración probada.

Ninguno de esos flujos debe anunciarse como finalizado por tener un formulario genérico.

## Pruebas y preparación de despliegue

En la rama, `.github/workflows/pwa-core-tests.yml` ejecuta:

1. Instalar dependencias Node para ejecutar el servidor.
2. Smoke test `/app/`, `/madre/app.html`, bloqueo de código `.mjs`, errores de API sin sesión y health sin base.
3. Validación de sintaxis de scripts.
4. `npm test`.
5. `python -m unittest discover -s tests -p 'test_*.py'` (SQLite de prueba, sin tocar datos reales).

**Aún pendiente para staging real:** migración 006 en una base Turso de pruebas aislada, validación 2 tenants con sesiones Google auténticas, permisos de roles, pruebas E2E, CSRF reforzado, seguridad de migraciones, UX de dispositivos, restore drill. Antes de producción configurar secretos y conectar una rama de staging, realizar QA y revisar el PR. No mezclar aquí el backend alternativo de `feat/core-tenant-authorization` (Supabase): esta rama está basada en Turso.

## Flujo de Super Admin

1. Iniciar sesión Google autorizada.
2. Abrir `/madre/app.html`.
3. Crear empresa y escoger Suite y Tools; el precio visual es referencia, no una transacción.
4. Abrir detalle, personalizar nombre, logo y colores, dar acceso a usuarios con rol.
5. Habilitar/deshabilitar herramientas sin modificar otras empresas.
6. Abrir la PWA del cliente y trabajar con sus módulos y registros habilitados.

## Conexión y despliegue

El código de esta rama es de desarrollo, **no está montado aún en el entorno Render conectado anteriormente**, ni necesariamente dispone de las credenciales Turso. Las rutas `/app/` y `/madre/app.html` solo serán accesibles en una URL de staging que despliegue esta rama con su base y OAuth configurados. No exponer el token Turso al navegador.
