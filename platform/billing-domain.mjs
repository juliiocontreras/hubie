import {catalog, getSuite, getTool} from './catalog.mjs';
// Cobro Stripe — modelo híbrido decidido por Julio 2026-11-13:
// pago único de configuración (suite + tools + extras, anticipo 50% + saldo en
// hasta 6 pagos) + mensualidad de plataforma $949 MXN/mes parejo, 10 suites.
// SUPUESTO (a confirmar/corregir por Julio): los precios del catálogo son
// finales con IVA incluido, como en Jobia. Si cambia, solo cambia esta
// constante y la documentación; los montos en centavos no dependen de ella.
// Regla de gracia: past_due 3 días -> suspendido (docs/STRIPE-BILLING.md).
// Este módulo es lógica pura: nunca confía en montos del cliente, siempre
// revalida contra assets/catalog.json. Sin acceso a red ni a base de datos.
export const MONTHLY_PLATFORM_FEE_MXN = catalog.rules.monthlyPlatformFee;
export const MONTHLY_PLATFORM_FEE_CENTS = MONTHLY_PLATFORM_FEE_MXN * 100;
export const DEPOSIT_RATE = catalog.rules.depositRate;
export const MAX_BALANCE_INSTALLMENTS = catalog.rules.maxBalanceInstallments;
export const GRACE_DAYS_PAST_DUE = 3;
export const PRICES_INCLUDE_TAX = true;
export const BILLING_STATUSES = ['none', 'trialing', 'active', 'past_due', 'suspended', 'cancelled'];
export const BILLING_STATUS_LABELS = {
 none: 'Sin suscripción', trialing: 'En prueba', active: 'Al corriente',
 past_due: 'Pago vencido', suspended: 'Suspendido', cancelled: 'Cancelado'
};
const getExtra = id => catalog.extras?.find(e => e.id === id) || null;
const toCents = mxn => Math.round(Number(mxn) * 100);
export function splitBalance(balanceCents, installments) {
 if (!Number.isInteger(installments) || installments < 1 || installments > MAX_BALANCE_INSTALLMENTS) throw Error('Invalid checkout');
 if (!Number.isInteger(balanceCents) || balanceCents < 0) throw Error('Invalid checkout');
 if (balanceCents === 0) return Array(installments).fill(0);
 const base = Math.floor(balanceCents / installments);
 const parts = Array(installments).fill(base);
 parts[installments - 1] = balanceCents - base * (installments - 1);
 return parts;
}
export function quoteCheckout(input = {}) {
 const suite = getSuite(input?.suiteId);
 if (!suite) throw Error('Invalid checkout');
 const toolIds = input?.toolIds ?? [];
 const extrasInput = input?.extras ?? [];
 const installments = input?.balanceInstallments ?? MAX_BALANCE_INSTALLMENTS;
 if (!Array.isArray(toolIds) || !Array.isArray(extrasInput) || new Set(toolIds).size !== toolIds.length) throw Error('Invalid checkout');
 if (!Number.isInteger(installments) || installments < 1 || installments > MAX_BALANCE_INSTALLMENTS) throw Error('Invalid checkout');
 let setupTotalCents = toCents(suite.price);
 const tools = [];
 for (const id of toolIds) {
  const tool = getTool(id);
  if (!tool || tool.price === null || tool.price === undefined) throw Error('Invalid checkout');
  tools.push({id: tool.id, name: tool.name, priceCents: toCents(tool.price)});
  setupTotalCents += toCents(tool.price);
 }
 const extras = [];
 for (const item of extrasInput) {
  const extra = getExtra(item?.id);
  const quantity = item?.quantity;
  if (!extra || extra.price === null || extra.price === undefined) throw Error('Invalid checkout');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw Error('Invalid checkout');
  extras.push({id: extra.id, name: extra.name, quantity, unitPriceCents: toCents(extra.price), totalCents: toCents(extra.price) * quantity});
  setupTotalCents += toCents(extra.price) * quantity;
 }
 const depositCents = Math.round(setupTotalCents * DEPOSIT_RATE);
 const balanceCents = setupTotalCents - depositCents;
 return {
  suiteId: suite.id, suiteName: suite.name, toolIds: [...toolIds], tools, extras,
  setupTotalCents, depositCents, balanceCents,
  monthlyFeeCents: MONTHLY_PLATFORM_FEE_CENTS,
  balanceInstallments: installments, installmentsCents: splitBalance(balanceCents, installments),
  currency: 'MXN', pricesIncludeTax: PRICES_INCLUDE_TAX
 };
}
export function daysPastDue(pastDueSince, now = new Date()) {
 if (!pastDueSince) return 0;
 const since = Date.parse(pastDueSince);
 if (Number.isNaN(since)) return 0;
 return Math.max(0, Math.floor((now.getTime() - since) / 86400000));
}
export function statusAfterGrace(status, pastDueSince, now = new Date()) {
 if (!BILLING_STATUSES.includes(status)) throw Error('Invalid billing status');
 if (status !== 'past_due') return status;
 return daysPastDue(pastDueSince, now) >= GRACE_DAYS_PAST_DUE ? 'suspended' : 'past_due';
}
export function formatMoneyCents(cents) {
 return new Intl.NumberFormat('es-MX', {style: 'currency', currency: 'MXN', maximumFractionDigits: 0}).format((cents ?? 0) / 100);
}
export function validateCheckoutEmail(email) {
 const clean = typeof email === 'string' ? email.trim().toLowerCase() : '';
 if (clean.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw Error('Invalid checkout');
 return clean;
}
export function validateOrganizationId(value) {
 if (value === null || value === undefined || value === '') return null;
 if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw Error('Invalid checkout');
 return value;
}
