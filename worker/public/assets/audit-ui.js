// Historial de auditoría (Madre y cliente). Renderiza los filtros y la lista
// de eventos que devuelve el API; la lista de acciones posibles viene del
// servidor (platform/audit.mjs), no se duplica aquí. Sin emojis como
// iconografía; la lista es apilada, sin barras de scroll visibles.
function node(tag, text, cls) {
 const x = document.createElement(tag);
 if (text !== undefined) x.textContent = text;
 if (cls) x.className = cls;
 return x;
}
function fmtDateTime(iso) {
 try { return new Date(iso).toLocaleString('es-MX', {dateStyle: 'medium', timeStyle: 'short'}); }
 catch { return iso; }
}
export function renderAudit(host, model, handlers) {
 if (!host) return;
 const filters = {...(model.filters || {})};
 const events = model.events || [];
 const actions = model.actions || [];
 const tenants = model.tenants || null;
 host.replaceChildren();
 const form = node('form', undefined, 'field-grid');
 const field = (label, control) => {
  const wrap = node('div', undefined, 'field');
  wrap.append(node('label', label), control);
  return wrap;
 };
 let tenantSelect = null;
 if (tenants) {
  tenantSelect = document.createElement('select');
  tenantSelect.name = 'tenant';
  tenantSelect.add(new Option('Todas las empresas', ''));
  for (const t of tenants) tenantSelect.add(new Option(t.name, t.id));
  tenantSelect.value = filters.tenant || '';
  form.append(field('Empresa', tenantSelect));
 }
 const actionSelect = document.createElement('select');
 actionSelect.name = 'action';
 actionSelect.add(new Option('Todas las acciones', ''));
 for (const a of actions) actionSelect.add(new Option(a, a));
 actionSelect.value = filters.action || '';
 form.append(field('Acción', actionSelect));
 const actorInput = document.createElement('input');
 actorInput.name = 'actor'; actorInput.type = 'search';
 actorInput.placeholder = 'Correo o id del actor';
 actorInput.value = filters.actor || '';
 form.append(field('Actor', actorInput));
 const fromInput = document.createElement('input');
 fromInput.name = 'from'; fromInput.type = 'date';
 fromInput.value = (filters.from || '').slice(0, 10);
 form.append(field('Desde', fromInput));
 const toInput = document.createElement('input');
 toInput.name = 'to'; toInput.type = 'date';
 toInput.value = (filters.to || '').slice(0, 10);
 form.append(field('Hasta', toInput));
 const limitSelect = document.createElement('select');
 limitSelect.name = 'limit';
 for (const n of [25, 50, 100, 200]) limitSelect.add(new Option(String(n), String(n)));
 limitSelect.value = String(filters.limit || 50);
 form.append(field('Mostrar', limitSelect));
 const apply = node('button', 'Filtrar', 'btn btn-primary');
 apply.type = 'submit'; apply.style.gridColumn = '1/-1';
 form.append(apply);
 const statusEl = node('p', '', 'help');
 form.addEventListener('submit', ev => {
  ev.preventDefault();
  const next = {
   tenant: tenantSelect ? tenantSelect.value : undefined,
   action: actionSelect.value || undefined,
   actor: actorInput.value.trim() || undefined,
   from: fromInput.value ? fromInput.value + 'T00:00:00.000Z' : undefined,
   to: toInput.value ? toInput.value + 'T23:59:59.999Z' : undefined,
   limit: Number(limitSelect.value)
  };
  handlers.onFilter(next);
 });
 host.append(form, statusEl);
 if (!events.length) {
  host.append(node('p', 'No hay eventos para estos filtros.', 'help'));
  return;
 }
 statusEl.textContent = events.length + ' evento' + (events.length === 1 ? '' : 's') + ' · los más recientes primero.';
 const list = node('div', undefined, 'aurora-list');
 for (const e of events) {
  const row = node('div', undefined, 'aurora-row');
  const meta = node('span', undefined, 'insight-meta');
  meta.append(
   node('strong', e.action),
   node('small', (e.actorEmail || e.actorUserId || 'Sistema')
    + (tenants && e.organizationId ? ' · ' + (tenants.find(t => t.id === e.organizationId)?.name || e.organizationId) : '')
    + ' · ' + fmtDateTime(e.occurredAt)
    + (e.targetType ? ' · ' + e.targetType : ''))
  );
  row.append(meta);
  list.append(row);
 }
 host.append(list);
}
