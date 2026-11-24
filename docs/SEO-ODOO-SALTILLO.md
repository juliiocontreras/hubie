# SEO — Posicionamiento de Hubie como alternativa a Odoo en Saltillo

Fecha: 2026-11-24. Estado: on-page implementado en main (ver abajo); el
posicionamiento real (rankings) depende del dominio de producción y de
Search Console, pendientes de Julio.

## Posicionamiento

**Hubie es la alternativa a Odoo para PyMEs de servicios y comercio en
Saltillo, Ramos Arizpe y Arteaga.** No es Odoo ni está afiliado a Odoo S.A.
— eso se dice explícito en la página y en el FAQ, con descargo de marca.

La cuña es real y está verificada con búsqueda web (2026-11-24): los que
rankean por "Odoo Saltillo" son partners industriales (Inceptio,
SYCA, QUADIT, Mit-Mut Gold Partner, Erbrix) enfocados en manufactura
automotriz, MRP, PPAP y trazabilidad. Ninguno atiende a la PyME de
servicios/comercio con precio fijo y arranque rápido. Ese hueco es de Hubie.

## Palabras clave

Primarias (página `odoo-saltillo.html` + home):
- Odoo Saltillo, alternativa a Odoo, Odoo en Saltillo
- ERP para PyMEs Saltillo, software para empresas Saltillo
- ERP Saltillo Coahuila, sistema administrativo Saltillo

Secundarias (para artículos del blog, pendientes):
- Odoo precio México, Odoo vs Hubie, ERP para restaurantes Saltillo,
  software para clínicas Saltillo, sistema para comercios Coahuila,
  alternativa a Odoo para PyMEs

## Lo implementado (2026-11-24)

- `odoo-saltillo.html` (nueva): landing dedicada — H1 "La alternativa a
  Odoo en Saltillo, hecha para PyMEs", comparativa honesta Hubie vs Odoo
  (Odoo gana en manufactura; Hubie en PyME), "para quién sí / para quién
  no", suites con precios base, FAQ con JSON-LD FAQPage, JSON-LD
  SoftwareApplication con areaServed Saltillo/Ramos Arizpe/Arteaga,
  canonical y meta description con la keyword primaria.
- `index.html`: título y meta con "ERP para PyMEs en Saltillo" +
  "alternativa a Odoo", JSON-LD SoftwareApplication con areaServed,
  sección "¿Buscas Odoo en Saltillo?" con enlace a la comparativa, enlace
  en el pie (Recursos). Corregido además el fineprint viejo "Sin
  mensualidades en el plan base. Pagas una sola vez." — contradecía el
  modelo vigente (setup + $949 MXN/mes + IVA); ahora dice la mensualidad.
- `robots.txt` + `sitemap.xml` (nuevos): páginas públicas del sitio.
- Las URLs canónicas, el sitemap y los JSON-LD usan el origen de staging
  (`hubie-pwa-staging.onrender.com`) hasta tener dominio propio.

## Pendiente (solo Julio)

1. **Dominio propio de producción para Hubie** (p. ej. hubie.mx / hubie.site):
   al tenerlo, cambiar el origen en sitemap.xml, canonicals y JSON-LD, y
   apuntar el dominio a Render.
2. **Google Search Console**: dar de alta el dominio, enviar el sitemap,
   pedir indexación de `/odoo-saltillo.html` e `/index.html`.
3. **Google Business Profile** (perfil de empresa en Saltillo, Coahuila)
   para el SEO local — la competencia industrial no lo explota para PyMEs.
4. **Contenido**: artículos del blog con las keywords secundarias (uno por
   sector: restaurantes, clínicas, comercios) enlazando a la comparativa.
5. **Backlinks locales**: tapmarketing.site, directorios de Saltillo,
   cámaras empresariales.

## Reglas

- Nunca decir que Hubie ES Odoo ni usar su marca como propia: siempre
  "alternativa a Odoo", con descargo de marca en la página.
- Los precios en la página son los del catálogo vigente (base sin IVA,
  mensualidad $949 + IVA); si cambian, cambiar aquí también.
- No prometer CFDI timbrado: la página dice que está en desarrollo.
