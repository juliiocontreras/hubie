# T021 — Encuesta de Satisfacción (Hubie Suites)

**Estado:** primera versión operativa en staging, independiente por empresa.

## Qué hace

- Editor de encuestas propias de cada empresa (1–8 preguntas) con título y tipo: satisfacción CSAT 1–5, recomendación NPS 0–10, sí/no o comentario.
- Invitación individual para contestar sin cuenta Google, mediante una URL pública `/encuesta/?token=...`. La URL usa un token aleatorio de 192 bits; **solo su SHA-256 está guardado en Turso**.
- Un enlace acepta **una sola respuesta**, caduca en 30 días y deja de responder al cerrar la encuesta o desactivar T021.
- La invitación puede vincularse a C001 Cliente y/o C002 Oportunidad comercial; ambas referencias se verifican por la misma empresa usando FKs compuestas, sin cruzar datos.
- Resultados internos de la empresa: número de invitaciones, respuestas, promedio CSAT, porcentaje satisfecho (4–5), NPS (-100…100) y comentarios.
- Solo miembros autorizados de la empresa pueden crear encuestas, generar enlaces, abrir informes y cambiar estado; los usuarios `viewer` solo leen resultados.
- Interfaz pública minimalista, móvil y accesible, sin marca vegetal ni terceros; `noindex`, `no-referrer`, campos de texto como `textContent`, no solicita PII ni Google al encuestado.
- Registro de respuestas en una transacción SQL de una sola vez. No se guardan nombre, correo, IP ni identificador del navegador del respondente (el invitado puede estar vinculado internamente a un cliente).
- Contrato comercial: Tool **T021** es adicional a las 30 del catálogo v5. El precio es **`null` / por definir**, no se inventa ni se asume que está incluido en todas las Suites.
- Empresa piloto `hubie-qa-piloto` (Office Suite): se activa T021 mediante bandera de despliegue de un solo uso, y se crea `[DEMO] Encuesta de satisfacción posventa`, sin envío real ni datos personales. Los tenants existentes no se alteran.

## Rutas

- `GET/POST /api/app/:slug/surveys` — listado y creación
- `PATCH /api/app/:slug/surveys/:id` — cerrar/reabrir encuesta
- `POST /api/app/:slug/surveys/:id/invitations` — emitir enlace privado individual
- `GET /api/app/:slug/surveys/:id/report` — métricas y respuestas
- `GET/POST /api/public/surveys/:token` — presentar y recibir una respuesta
- `GET /encuesta/?token=...` — interfaz pública para responder

## Persistencia

`014_satisfaction.sql` crea tablas:
`tenant_surveys`, `tenant_survey_invitations`, `tenant_survey_responses`.
Usa índices por organización, claves compuestas y unicidad de respuesta por invitación. El servidor verifica las 24 tablas requeridas tras la migración.

## Límites y trabajo futuro

- Hasta 100 encuestas por tenant, 1,000 invitaciones por encuesta y 8 preguntas por encuesta.
- Las preguntas no se modifican después de crear una encuesta (preserva compatibilidad y métricas); cierra y crea otra para cambiar el cuestionario.
- Cada enlace caduca tras 30 días. No hay envío automático por correo/WhatsApp, recordatorios, QR integrado, ni automatizaciones comerciales.
- Enlaces perdidos no pueden recuperarse, al guardar solo su hash; emite otro desde la Tool.
- La encuesta puede contestarse sin login, pero debe respetar los protocolos de privacidad de la empresa. Para respuestas sensibles, requiere revisión legal y controles adicionales.
- No presenta resultados ficticios como respuestas reales. CSAT/NPS solo se calculan con respuestas guardadas.
- QA real en navegador, sesión Google, y entrega de prueba requeridos antes de venta comercial.

## Pruebas

`tests/satisfaction-domain.test.mjs` valida entrada, respuestas, scoring NPS/CSAT y tokens;
`tests/test_satisfaction_schema.py` valida migración, FK entre tenants y respuesta única;
`tests/test_staging_qa_seed.py` valida datos ficticios y reejecución sin duplicados.
CI incluye scripts, ruta pública y APIs protegidas.
