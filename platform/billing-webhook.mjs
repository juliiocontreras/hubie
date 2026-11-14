import {recordWebhookEvent, markWebhookEventProcessed, findCheckoutOrderBySession, activateTenantFromCheckout, applySubscriptionUpdate, applyPastDue, applyInvoicePaid, suspendIfGraceExpired} from './billing-store.mjs';
import {provisionTenantFromPaidOrder} from './onboarding-store.mjs';
// Webhook y Checkout de Stripe (modo prueba, cuenta tapmkt).
// El cliente de Stripe se inyecta (o se crea con la clave de entorno) para que
// los tests usen un mock sin llamadas reales. NUNCA se llama a Stripe sin clave.
export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY?.trim());
export const webhookSecretConfigured = () => Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
export async function createStripeClient(stripeFactory = null) {
 if (!stripeConfigured()) throw Error('Stripe no configurado');
 const factory = stripeFactory ?? (await import('stripe')).default;
 return new factory(process.env.STRIPE_SECRET_KEY);
}
// Checkout en modo subscription con line items mixtos: Stripe acepta un
// one-time price (el anticipo) junto al recurring de $949/mes en la misma
// sesión; el anticipo se cobra en la primera factura. Si en modo prueba Stripe
// lo rechazara, la variante documentada es: sesión subscription solo con la
// mensualidad + Payment Link / sesión payment separada para el anticipo
// (docs/STRIPE-BILLING.md). Pendiente de verificar contra Stripe real.
export function buildCheckoutSessionParams({quote, email, organizationId = null, orderId, origin}) {
 if (!quote || !email || !orderId || !origin) throw Error('Invalid checkout');
 return {
  mode: 'subscription',
  customer_email: email,
  line_items: [
   {price_data: {currency: 'mxn', product_data: {name: `Anticipo 50% — ${quote.suiteName}`}, unit_amount: quote.depositCents}, quantity: 1},
   {price_data: {currency: 'mxn', recurring: {interval: 'month'}, product_data: {name: 'Mensualidad de plataforma Hubie'}, unit_amount: quote.monthlyFeeCents}, quantity: 1}
  ],
  success_url: `${origin}/precios.html?checkout=ok&session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${origin}/precios.html?checkout=cancelado`,
  metadata: {
   order_id: orderId, organization_id: organizationId ?? '',
   suite_id: quote.suiteId, total_cents: String(quote.setupTotalCents),
   deposit_cents: String(quote.depositCents), balance_cents: String(quote.balanceCents),
   balance_installments: String(quote.balanceInstallments), monthly_fee_cents: String(quote.monthlyFeeCents)
  }
 };
}
export async function createCheckoutSession(stripe, params) {
 const session = await stripe.checkout.sessions.create(params);
 if (!session?.url || !session?.id) throw Error('Stripe checkout failed');
 return session;
}
export function verifyWebhookEvent({rawBody, signature, stripe, secret}) {
 if (!rawBody || !signature || !secret) throw Error('Invalid webhook signature');
 try {
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
 } catch {
  throw Error('Invalid webhook signature');
 }
}
// Saldo del 50%: facturas de Stripe, una por parcialidad, con vencimiento
// mensual desde la activación. Se crean como borrador y se finalizan para que
// Stripe intente el cobro con el método guardado en el checkout. Sin método
// guardado la factura queda abierta y Madre la cobra manualmente.
export async function scheduleBalanceInvoices(stripe, {customerId, installmentsCents, organizationId, orderId}) {
 if (!customerId || !installmentsCents?.length) return [];
 const created = [];
 const now = Date.now();
 for (let i = 0; i < installmentsCents.length; i++) {
  const amount = installmentsCents[i];
  if (!amount) continue;
  await stripe.invoiceItems.create({
   customer: customerId, amount, currency: 'mxn',
   description: `Saldo configuración Hubie — parcialidad ${i + 1} de ${installmentsCents.length} (orden ${orderId})`
  });
  const invoice = await stripe.invoices.create({
   customer: customerId, collection_method: 'charge_automatically',
   due_date: Math.floor((now + (i + 1) * 30 * 86400000) / 1000),
   metadata: {organization_id: organizationId ?? '', order_id: orderId, installment: String(i + 1), type: 'balance'}
  });
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  created.push({installment: i + 1, invoiceId: finalized?.id ?? invoice.id, amountCents: amount});
 }
 return created;
}
async function handleCheckoutCompleted(session, {stripe, deps}) {
 const order = await findCheckoutOrderBySession(session.id, deps);
 if (!order) return {ignored: true, reason: 'order not found'};
 let organizationId = session.metadata?.organization_id || order.organizationId || null;
 const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
 // Alta autoservicio (018): pago público sin tenant → se crea el tenant con
 // la suite de la cotización y el cliente que pagó queda como owner. Si el
 // correo es nuevo se emite un enlace de activación de un solo uso (24 h);
 // el token en claro nunca se guarda ni se devuelve en la respuesta del
 // webhook: Madre lo reemite desde la ficha del tenant.
 let provisioned = null;
 if (!organizationId) {
  provisioned = await provisionTenantFromPaidOrder({order, deps});
  organizationId = provisioned.organizationId;
 }
 let subscription = null;
 if (session.subscription && stripe?.subscriptions?.retrieve) {
  subscription = await stripe.subscriptions.retrieve(typeof session.subscription === 'string' ? session.subscription : session.subscription.id);
 }
 const activated = await activateTenantFromCheckout({organizationId, order, session, subscription}, deps);
 if (order.balanceCents > 0 && customerId) {
  activated.balanceInvoices = await scheduleBalanceInvoices(stripe, {
   customerId, installmentsCents: order.quote.installmentsCents, organizationId, orderId: order.id
  });
 }
 return {...activated, ...(provisioned ? {provisioned: true, ownerUserId: provisioned.userId, isNewUser: provisioned.isNewUser, setupTokenIssued: Boolean(provisioned.setupToken), activationPath: provisioned.activationPath ?? null} : {})};
}
function subscriptionOrgId(subscription) {
 return subscription?.metadata?.organization_id || null;
}
async function handleSubscriptionUpdated(subscription, {deps}) {
 const organizationId = subscriptionOrgId(subscription);
 if (!organizationId) return {ignored: true, reason: 'no organization in metadata'};
 return applySubscriptionUpdate({
  organizationId, stripeSubscriptionId: subscription.id, status: subscription.status,
  currentPeriodEnd: subscription.current_period_end
 }, deps);
}
async function handleSubscriptionDeleted(subscription, {deps}) {
 const organizationId = subscriptionOrgId(subscription);
 if (!organizationId) return {ignored: true, reason: 'no organization in metadata'};
 return applySubscriptionUpdate({
  organizationId, stripeSubscriptionId: subscription.id, status: 'cancelled',
  currentPeriodEnd: subscription.current_period_end
 }, deps);
}
async function handleInvoiceEvent(invoice, kind, {deps}) {
 const organizationId = invoice?.metadata?.organization_id || invoice?.subscription_details?.metadata?.organization_id || null;
 if (!organizationId) return {ignored: true, reason: 'no organization in metadata'};
 const amountCents = Number(invoice.amount_paid ?? invoice.amount_due ?? 0);
 if (kind === 'succeeded') return applyInvoicePaid({organizationId, invoiceId: invoice.id, amountCents}, deps);
 const failed = await applyPastDue({organizationId, invoiceId: invoice.id, amountCents}, deps);
 return {...failed, ...(await suspendIfGraceExpired(organizationId, new Date(), deps))};
}
export async function handleStripeEvent(event, {stripe = null, deps = {}} = {}) {
 if (!event?.id || !event?.type) throw Error('Invalid webhook event');
 const isNew = await recordWebhookEvent(event, deps);
 if (!isNew) return {duplicate: true, type: event.type, id: event.id};
 try {
  let result = {type: event.type};
  switch (event.type) {
   case 'checkout.session.completed':
    result = {...result, ...(await handleCheckoutCompleted(event.data.object, {stripe, deps}))};
    break;
   case 'customer.subscription.updated':
    result = {...result, ...(await handleSubscriptionUpdated(event.data.object, {deps}))};
    break;
   case 'customer.subscription.deleted':
    result = {...result, ...(await handleSubscriptionDeleted(event.data.object, {deps}))};
    break;
   case 'invoice.payment_succeeded':
    result = {...result, ...(await handleInvoiceEvent(event.data.object, 'succeeded', {deps}))};
    break;
   case 'invoice.payment_failed':
    result = {...result, ...(await handleInvoiceEvent(event.data.object, 'failed', {deps}))};
    break;
   default:
    result = {...result, ignored: true, reason: 'unhandled type'};
  }
  await markWebhookEventProcessed(event.id, deps);
  return {handled: true, id: event.id, ...result};
 } catch (error) {
  // processed_at queda NULL: el evento se puede reintentar o revisar en Madre.
  throw error;
 }
}
