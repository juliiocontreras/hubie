# Cobro Stripe — Hubie (modelo híbrido)

Decidido por Julio el 2026-11-13. Cuenta Stripe: **tapmkt, MODO PRUEBA**.
Sin claves configuradas, los endpoints de cobro responden `503 "Stripe no
configurado"` y la app sigue funcionando normal.

## Modelo

- **Pago único de configuración**: suite + tools pagadas + extras del catálogo,
  tal cual están en `assets/catalog.json`.
- **Anticipo 50%** (`catalog.rules.depositRate`) al contratar.
- **Saldo 50% en hasta 6 pagos** (`catalog.rules.maxBalanceInstallments`).
- **Mensualidad de plataforma $949 MXN/mes parejo** para las 10 suites
  (`catalog.rules.monthlyPlatformFee = 949`), por mantenimiento + updates.
- **Supuesto (a confirmar/corregir por Julio): los precios del catálogo son
  finales con IVA incluido**, como en Jobia. Está como constante
  `PRICES_INCLUDE_TAX` en `platform/billing-domain.mjs`; si cambia, solo
  cambia ahí y aquí. Los montos se guardan en centavos (`*_cents`).

## Flujo

1. El cliente cotiza en `precios.html` (`assets/quote.js`). El botón
   **Pagar anticipo con Stripe** pide su correo y llama a `POST /api/checkout`.
2. `POST /api/checkout` **revalida los precios contra el catálogo** (nunca
   confía en montos del cliente: `platform/billing-domain.mjs` →
   `quoteCheckout`), crea la sesión de Stripe y guarda la orden en
   `billing_checkout_orders` (estado `pending`).
3. La sesión es **modo `subscription` con line items mixtos**: Stripe acepta
   un price one-time (el anticipo) junto al recurring de $949/mes en la misma
   sesión; el anticipo se cobra en la primera factura. **Variante de respaldo**
   si en modo prueba Stripe lo rechazara: sesión `subscription` solo con la
   mensualidad + sesión `payment` (o Payment Link) separada para el anticipo.
   Pendiente de verificar contra Stripe real.
4. `POST /api/stripe/webhook` verifica la firma con `STRIPE_WEBHOOK_SECRET`
   (`stripe.webhooks.constructEvent`) y registra cada evento en
   `stripe_webhook_events` (`stripe_event_id` UNIQUE: el reintento de Stripe
   se detecta y no se reprocesa).
5. `checkout.session.completed`:
   - **Con tenant** (`metadata.organization_id`): crea la suscripción
     (`tenant_subscriptions`, estado `active`), marca el anticipo como pagado
     (`tenant_payments` tipo `deposit`) y deja el saldo en parcialidades
     pendientes (`type='balance'`, `installment_number` 1..6).
   - **Sin tenant** (checkout público desde el cotizador): el webhook crea
     la empresa con la suite de la cotización y deja como owner al cliente
     que pagó (alta autoservicio, migración 018, `platform/onboarding-store.mjs`):
     si el correo es nuevo se crea el usuario y se emite un enlace de
     activación de un solo uso (24 h, solo se guarda su hash); si ya existe,
     se vincula como owner. La orden queda `converted` con su
     `organization_id` y la suscripción, el anticipo y el saldo se activan
     igual que con tenant. Madre muestra el tenant nuevo con su owner y
     puede reemitir el enlace de activación desde su ficha. Un segundo pago
     del mismo cliente reutiliza su tenant, no crea otro.
6. **Saldo**: se resuelve con **facturas de Stripe, una por parcialidad**,
   con vencimiento mensual (`scheduleBalanceInvoices` en
   `platform/billing-webhook.mjs`). Se crean como borrador y se finalizan para
   que Stripe intente el cobro con el método guardado en el checkout. Sin
   método guardado la factura queda abierta y Madre la cobra manualmente.
   Los pagos de cada factura llegan por webhook y actualizan
   `tenant_payments`.

## Estados de suscripción

`none → trialing → active → past_due → suspended → cancelled`
(`BILLING_STATUSES` en `platform/billing-domain.mjs`).

- `invoice.payment_failed` → `past_due` (se guarda `past_due_since`; si ya
  estaba vencida, se conserva la fecha original).
- **Regla de gracia: `past_due` 3 días → `suspended`** (`GRACE_DAYS_PAST_DUE
  = 3`, `statusAfterGrace` / `suspendIfGraceExpired`). La suspensión se
  evalúa al recibir un fallo de pago y al leer el estado (el estado efectivo
  que devuelve `GET /api/billing/status` ya refleja la gracia vencida).
- `invoice.payment_succeeded` → vuelve a `active` y limpia `past_due_since`.
- `customer.subscription.deleted` → `cancelled`.

## Barrido de gracia (sin cron dentro de la app)

No hay ningún cron, worker ni temporizador dentro de Hubie/Render que
suspenda solo: la suspensión materializada (`status='suspended'` en
`tenant_subscriptions`) solo ocurre cuando algo la dispara. El barrido es
`POST /api/admin/billing/sweep` (solo superadmin, misma sesión de Madre
que `GET /api/admin/billing`), implementado en
`sweepPastDueSuspensions()` (`platform/billing-store.mjs`): lista las
suscripciones `past_due`, suspende las que llevan más de 3 días vencidas
(`suspendIfGraceExpired`) y registra cada suspensión en `audit_events`
(`action='billing.suspended_grace'`, `target_type='subscription'`,
actor NULL porque lo ejecuta el barrido, no un usuario). Devuelve
`{checked, suspended: [organizationIds], suspendedCount}`. Es idempotente:
una segunda llamada ya no encuentra esas suscripciones en `past_due`.

Llamarlo desde un cron externo (por ejemplo, el programador del
proveedor de hosting o una tarea programada del equipo) una vez al día:

```bash
curl -X POST https://<dominio>/api/admin/billing/sweep \
  -H "Origin: https://<dominio>" \
  -H "Cookie: __Host-hubie_session=<sesión de superadmin vigente>"
```

La sesión es la cookie de Madre (`__Host-hubie_session`); caduca a las
24 h, así que el cron externo debe renovarla iniciando sesión como
superadmin antes de llamar al barrido (no hay token de servicio). Si la
sesión caducó, el endpoint responde 401 y no suspende nada.

La suspensión por impago vive en `tenant_subscriptions.status` y **NO toca
`organizations.status`**: el resto de la app (login, membresías, tools) sigue
leyendo su propio estado y el login del superadmin nunca se bloquea. El resto
de la app puede leer el flag con `isBillingSuspended(organizationId)` en
`platform/billing-store.mjs`.

## Endpoints

| Método | Ruta | Acceso |
|---|---|---|
| POST | `/api/checkout` | Público (mismo origen). Body: `{suiteId, toolIds, extras, email, balanceInstallments?, organizationId?}`. Devuelve `{url}` de Stripe Checkout. |
| POST | `/api/stripe/webhook` | Stripe (firma HMAC). Sin claves → 503. Firma inválida → 400. Error interno → 500 (Stripe reintenta). |
| GET | `/api/billing/status?slug=` | Sesión de tenant. Estado, próxima mensualidad, saldo pendiente. |
| GET | `/api/admin/billing` | Superadmin. Empresas con estado de cobro + órdenes pagadas sin tenant. |
| POST | `/api/admin/billing/sweep` | Superadmin. Barrido de gracia: suspende `past_due` con >3 días y audita. Sin cron interno; ver § "Barrido de gracia". |

## Tablas (migración 015)

- `tenant_subscriptions`: tenant, `stripe_customer_id`,
  `stripe_subscription_id`, estado, `monthly_fee_cents` (94900),
  `current_period_end`, `past_due_since`.
- `tenant_payments`: tenant, tipo (`deposit`/`balance`/`monthly`), monto en
  centavos, ids de Stripe, estado, parcialidad `n` de `installments_total`.
- `stripe_webhook_events`: `stripe_event_id` PRIMARY KEY (idempotencia),
  payload, `processed_at`.
- `billing_checkout_orders`: checkout público, cotización completa en JSON,
  estado (`pending`/`paid`/`cancelled`/`converted`), `organization_id` cuando
  se vincula.

## Configuración (variables de entorno, nunca en el repo)

```text
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Ver `.env.example`. El webhook se registra en el Dashboard de Stripe (modo
prueba) apuntando a `https://<dominio>/api/stripe/webhook` con los eventos:
`checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`, `invoice.payment_succeeded`,
`invoice.payment_failed`.

## Pendiente (no probado sin clave de prueba)

- Flujo completo contra Stripe real en modo prueba (sesión mixta anticipo +
  suscripción, finalización de facturas de saldo, webhooks en vivo).
- Confirmar con Julio el supuesto de IVA incluido.
- El enlace de activación solo se muestra una vez (en el log del webhook y
  al reemitirlo desde Madre): Hubie aún no tiene envío de correo, así que el
  superadmin lo copia y se lo envía al cliente por fuera.
- Convertir una orden pagada sin tenant en tenant desde Madre: ya no hace
  falta en el flujo normal (el webhook lo hace solo); la lista de pagos sin
  empresa solo queda para órdenes antiguas o fallidas.
- Barrido periódico de gracia (hoy la suspensión se evalúa al leer el estado
  y al recibir fallos de pago; no hay cron que suspenda sin eventos).
