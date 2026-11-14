# Auditoría UI/UX de Hubie Madre y Hubie Suites — noviembre de 2026

## Alcance
- PWA Madre (`/madre/app.html`) y PWA por empresa (`/app/`).
- Diseño, navegación desktop/móvil, accesibilidad, carga de imágenes de fondo y adjuntos.
- La landing pública y `main` no se modificaron.
- Fuente de evidencia: estructura y estilos del repositorio, capturas proporcionadas como referencia, pruebas de Node/SQLite y revisión de las rutas publicadas.

## Hallazgos y medidas

| Severidad | Hallazgo | Corrección integrada |
|---|---|---|
| Alta | Panel lateral muestra hasta 30 Tools en una lista continua, obligando a usar barras internas y confundiendo prioridades | Accesos directos a Clientes, CRM, Agenda e Inventario; restantes Tools en categorías `details` con apertura selectiva; la página es la única superficie que se desplaza |
| Alta | En móvil, el menú de Tools exige desplazamiento horizontal | Botón de menú accesible que despliega navegación vertical; se eliminó carrusel horizontal de navegación |
| Alta | Fondos limitados a colores, sin imagen de cliente | Upload de PNG/JPG/WEBP independiente para dashboard y lateral con previsualización, opción de quitar imagen y control de roles |
| Alta | Formularios permiten crear registros pero no guardar sus comprobantes asociados | Bloque de adjuntos por registro en módulos operativos y Tools genéricas: PDF, imágenes, TXT, CSV, DOCX y XLSX |
| Media | Iconos consisten en símbolos Unicode heterogéneos | SVGs locales de línea uniforme para navegación y Tools, sin biblioteca externa |
| Media | Menús de configuración/catálogo muy extensos | Categorías plegables de Tools y disposición compacta con respuesta móvil |
| Media | La PWA puede mostrar un diseño antiguo por caché instalada | Service workers versionados con estrategia de red primero para navegación y recursos del shell |
| Media | Contraste del texto al poner fotos de fondo | Capas degradadas sobre imágenes en dashboard y sidebar; colores de texto predefinidos |
| Media | Opciones solo decorativas sin persistencia | Persistencia real planeada en Turso mediante `pwa_media` (migración 010) y endpoints autorizados; demo aislada en sesión del navegador |
| Media | Inconsistencia de estructura responsive y contenido ancho | Grids `minmax(0,1fr)`, botones compactos y módulos en una columna móvil |
| Baja | Efectos de movimiento excesivos para ciertas personas | Compatibilidad con `prefers-reduced-motion` |

## Reglas de interfaz
- Nunca alterar el logo oficial `/assets/hubie-logo-official.png`.
- No incorporar plantas ni vegetación decorativa.
- No ocultar el desplazamiento natural de formularios grandes: se evita el scroll **anidado**, no se bloquea el scroll de toda la página.
- PWA Madre gestiona su propia imagen; cada tenant gestiona la suya independientemente. Solo owner/admin configura imágenes desde la Suite.
- Fondo personalizado no autoriza acceso a recursos de otro tenant.
- Archivos adjuntos se vinculan por organización, Tool y registro. `viewer` puede consultar, no subir ni eliminar.
- El mismo formulario de archivos sirve para C001 Clientes, C002 CRM, C004 Agenda, C005 Inventario y módulos de registros genéricos; C008 y C009 son lectura/administración sin adjuntos.

## Protección de archivos y almacenamiento
- Archivos no se guardan en disco efímero de Render ni se envían a terceros.
- Turso staging: `pwa_media`, contenido codificado, autorización en GET/POST/DELETE, tipos MIME en allowlist, firmas PNG/JPEG/WEBP/PDF/ZIP verificadas, descarga forzada para adjuntos.
- Máximo **900 KB** por imagen de fondo, **10 MB** por documento (migración 017; antes 2 MB por el CHECK de 010_media.sql), hasta **12 adjuntos** por registro y cuota básica de **60 MB** por organización. Diseño conservador para pruebas; grandes ficheros requerirán un servicio de objetos dedicado (R2/S3) y análisis antimalware antes de producción.
- Demo `?demo=1`: imágenes y archivos ficticios se almacenan localmente en `sessionStorage` y nunca se envían a Turso; límite conservador de **650 KB** por adjunto en demo. No subir documentos confidenciales a la demostración.
- Respuestas privadas usan `Cache-Control: no-store` y se verifican sesión, pertenencia a empresa y Tool habilitada.

## Pruebas y asuntos pendientes
- Pruebas automatizadas de validación MIME, estructura SQL, aislamiento entre tenants y demo.
- CI comprueba las rutas privadas sin sesión, shell, sintaxis y migraciones SQLite.
- **Sin despliegue productivo con cuentas reales**: Google OAuth y Turso staging aún pendientes de credenciales; la demo es una simulación funcional y no representa persistencia de producción.
- **Pendiente de QA manual**: navegadores iOS/Android en varios tamaños y accesibilidad visual (contrastes con fotos reales). Comprobación de upload binario en una Turso real, cuota y concurrencia antes de habilitar cuentas reales.
- Para archivos de mayor volumen o persistencia comercial duradera, migrar `pwa_media` a almacenamiento compatible S3 y escaneo antivirus; no escalar blobs base64 en SQL como solución definitiva.
