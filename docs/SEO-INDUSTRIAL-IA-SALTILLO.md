# SEO — Gestión de recursos, multitenant e IA para empresas (Saltillo / México)

Fecha: 2026-11-24. Estado: on-page implementado en main (ver abajo); el
posicionamiento real (rankings) depende del dominio de producción y de
Search Console, pendientes de Julio.

Tres landings nuevas, mismo modelo de estilo que `odoo-saltillo.html`
(misma cabecera, mismas clases CSS, mismos símbolos SVG de línea, mismo
pie, JSON-LD SoftwareApplication + FAQPage, canonical al staging
`https://hubie-pwa-staging.onrender.com`).

## Investigación por término (2026-11-24)

### Odoo Multitenant / Multicompany

- **Qué es:** Odoo Multicompany = varias razones sociales en UNA base de
  datos, registros compartibles entre empresas, contabilidad por empresa.
  Exige subir al plan Personalizado y se paga por usuario + implementación
  con partner.
- **Quién rankea en México:** RealSystems (blog multicompañía),
  Grupo Veniu e Idehar. Nadie en Saltillo rankea
  "Odoo multitenant Saltillo".
- **Hueco honesto de Hubie:** multitenant de verdad para MUCHAS empresas
  independientes (no solo razones sociales de un grupo): cada empresa con
  sus datos aislados (verificado: 52/52 intentos de acceso cruzado entre
  empresas bloqueados), consola Madre para gestionarlas, $949 MXN/mes +
  IVA fijo, sin costo por usuario ni por empresa.
- **Página:** `odoo-multitenant.html` — comparativa honesta Odoo
  Multicompany vs Hubie multitenant, y "para quién es cada uno" (grupos
  con varias razones sociales → Odoo también vale; agencias, grupos de
  franquicias o varios negocios independientes → Hubie). Enlaza a
  `odoo-saltillo.html`.

### Gestión de recursos / ERP industrial Saltillo

- **Quién rankea:** QUADIT, Inceptio, KAAB (SAP Business One),
  CSI/Catedral (MES BitNet+), iTechDev, ISA Solutions (implementación
  Odoo desde $25,000 MXN) y CONTPAQi Producción.
- **Qué venden todos:** manufactura pesada — MRP, PPAP, trazabilidad,
  costeo por pieza, EDI/armadora.
- **Hueco honesto de Hubie:** la PyME industrial (taller, maquiladora
  pequeña, proveedor tier 2/3, comercializadora industrial) que necesita
  GESTIONAR RECURSOS — inventario multialmacén, lotes, compras y
  proveedores, personal, proyectos, caja — sin MRP ni PPAP ni una
  implementación de $25,000+.
- **Página:** `gestion-recursos-saltillo.html` — "para quién sí / para
  quién no" de frente. Hubie NO es un MRP: sin MRP, sin PPAP, sin costeo
  por pieza, sin EDI de armadora.

### IA para empresas

- **Quién rankea:** Magokoro (guías; AMITI: solo 12% de las PyMEs en
  México han implementado IA), ClickPyme (agentes de IA, $500–$1,500/mes),
  Uniamos (automatización con IA desde $8,000 MXN de setup), Villanett
  y SIRE ERP (dicen tener IA).
- **El mercado está lleno de promesas de IA.** El ángulo honesto de
  Hubie: NO afirmar IA que no existe. "Primero ordena tu negocio": la IA
  necesita datos ordenados; Hubie ordena clientes, inventario y finanzas
  en un solo lugar (eso sí existe hoy).
- **Página:** `ia-para-empresas.html` — la guía honesta: qué automatiza
  Hubie HOY de verdad (recordatorios y notificaciones, flujos de cobro y
  gracia, reportes y tableros, portal del cliente, importación CSV,
  encuestas y capacitaciones — sin llamar a nada de esto "IA") y qué viene
  en hoja de ruta, marcado "Próximamente" y sin fechas.

### Gestión de recursos (genérico)

- **Quién rankea:** MBntas ERP, Villanett, SIRE ERP, Alegra (desde
  $974.25/mes + IVA), Bind y Siigo. Ninguno es local de Saltillo con
  precio fijo y arranque en días.
- **Ángulo:** "gestión de recursos" = recursos reales: inventario,
  dinero, personal, clientes, proyectos. Cubierto por
  `gestion-recursos-saltillo.html`.

## Palabras clave objetivo por página

- `gestion-recursos-saltillo.html`: plataforma gestión de recursos
  Saltillo, gestión de recursos empresariales Saltillo, ERP industrial
  Saltillo, software gestión de recursos Coahuila.
- `odoo-multitenant.html`: Odoo multitenant, Odoo multicompañía, Odoo
  multi empresa, plataforma multitenant México, software multiempresa.
- `ia-para-empresas.html`: IA para empresas, inteligencia artificial
  para PyMEs, automatización con IA México, IA para empresas Saltillo.

## Lo que NO se afirma

- **Sin IA hoy.** Hubie no tiene funciones de inteligencia artificial.
  La página de IA lo dice explícito ("Hoy no: Hubie no tiene funciones
  de inteligencia artificial") y no vende la automatización actual como
  IA. La hoja de ruta (asistente con los datos del negocio, alertas
  inteligentes, respuestas automáticas) está marcada "Próximamente",
  como ideas en evaluación, **sin fechas inventadas**.
- **Sin MRP / PPAP.** Hubie no es un MRP: no hace planeación de
  requerimientos de materiales, ni PPAP, ni costeo por pieza, ni EDI de
  armadora. La página de gestión de recursos lo dice de frente.
- **Sin CFDI timbrado.** La nómina es básica (sin timbrado CFDI ni
  cálculo IMSS/ISR) y la facturación CFDI timbrada está en desarrollo;
  las páginas dicen que hoy se generan cotizaciones y facturas internas.
- **Sin fechas de hoja de ruta.** Ninguna función futura lleva fecha.
- **Sin afiliación con Odoo.** "Odoo es una marca registrada de Odoo
  S.A. Hubie no está afiliado" en las páginas que lo mencionan.

## Lo implementado (2026-11-24)

- `gestion-recursos-saltillo.html`, `odoo-multitenant.html`,
  `ia-para-empresas.html` (nuevas): H1 con la keyword primaria, meta
  description, canonical al staging, JSON-LD SoftwareApplication
  (areaServed Saltillo/Ramos Arizpe/Arteaga) + FAQPage con 6 preguntas
  cada una, secciones propias, CTA a `precios.html` y `contacto.html`.
- `odoo-saltillo.html`: corregido el "30+ herramientas" (mock) a
  "41 herramientas". Verificado: `index.html` y las demás landings no
  tenían el conteo viejo; las menciones de "30 herramientas" en
  `docs/MULTITENANT-AUDIT-2026-11-12.md` son notas históricas del
  catálogo legacy (C001–C030), no conteo del producto, y se dejan.
- `index.html`: enlaces a las 3 landings en el pie (Recursos) y sección
  nueva "¿Gestión de recursos, multitenant o IA?" con el mismo patrón
  que la sección "¿Buscas Odoo en Saltillo?".
- `sitemap.xml`: las 3 URLs (gestion-recursos 0.9, multitenant 0.8, IA
  0.8, changefreq monthly). `robots.txt` sin cambios (ya permite todo y
  apunta al sitemap).
- `scripts/build-worker-assets.mjs`: las 3 páginas añadidas a
  `ROOT_FILES`; `worker/public/` regenerado con el script (espejo del
  sitio para el Worker) — incluye la corrección 30+ → 41 en la copia.
- `tests/seo-industrial-ia.test.mjs` (nuevo): las 3 páginas existen y
  tienen canonical al staging + JSON-LD SoftwareApplication y FAQPage
  que parsean como JSON válido; `index.html` las enlaza; `sitemap.xml`
  las lista; las páginas no contienen emojis; la página de IA contiene
  la frase honesta de que hoy no tiene funciones de IA y la marca
  "Próximamente", y no afirma IA como función actual.

## Pendiente (solo Julio)

1. **Dominio propio de producción para Hubie** (p. ej. hubie.mx /
   hubie.site): al tenerlo, cambiar el origen en sitemap.xml, canonicals
   y JSON-LD, y apuntar el dominio a Render.
2. **Google Search Console**: dar de alta el dominio, enviar el sitemap,
   pedir indexación de las 3 landings nuevas e `index.html`.
3. **Google Business Profile** (perfil de empresa en Saltillo, Coahuila)
   para el SEO local.
4. **Contenido**: artículos del blog con las keywords secundarias
   (uno por sector y por término: multitenant, IA honesta, PyME
   industrial) enlazando a las landings.
5. **Backlinks locales**: tapmarketing.site, directorios de Saltillo,
   cámaras empresariales.

## Reglas

- Nunca decir que Hubie ES Odoo ni usar su marca como propia: siempre
  "alternativa a Odoo" o comparativa honesta, con descargo de marca.
- Nunca vender IA que no existe ni MRP/PPAP que no existe.
- Los precios en las páginas son los del catálogo vigente (Suites desde
  $9,900 base sin IVA, mensualidad $949 + IVA); si cambian, cambiar aquí
  también.
- No prometer CFDI timbrado ni fechas de hoja de ruta.
