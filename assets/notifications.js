// Centro de notificaciones (P0) + C010 real. Campana con contador de no
// leídas, lista, marcar leída / todas leídas. En-app: sin push PWA (no hay
// VAPID) y sin correo salvo que Resend esté configurado en el servidor.
// Sin emojis como iconografía, sin texto azul, sin barras visibles.
const elt = (tag, text, cls) => { const x = document.createElement(tag); if (text !== undefined) x.textContent = text; if (cls) x.className = cls; return x; };
const bellSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
export function bellIcon() { const s = document.createElement('span'); s.innerHTML = bellSvg; return s; }

function notificationRow(item, {onRead, onNavigate}) {
 const row = elt('article', undefined, 'notification-item' + (item.readAt ? '' : ' unread'));
 const head = elt('div', undefined, 'notification-head');
 head.append(elt('strong', item.title), elt('span', item.typeLabel || item.type, 'pill'));
 const body = elt('p', item.body || '', 'help');
 const meta = elt('div', undefined, 'notification-meta');
 meta.append(elt('small', new Date(item.createdAt).toLocaleString('es-MX', {dateStyle: 'medium', timeStyle: 'short'})));
 if (item.tenantName) meta.append(elt('small', item.tenantName));
 if (item.link && onNavigate) {
  const open = elt('button', 'Abrir', 'btn');
  open.type = 'button';
  open.addEventListener('click', () => onNavigate(item));
  meta.append(open);
 }
 if (!item.readAt && onRead) {
  const read = elt('button', 'Marcar leída', 'btn');
  read.type = 'button';
  read.addEventListener('click', async () => { read.disabled = true; await onRead(item); });
  meta.append(read);
 }
 row.append(head, body, meta);
 return row;
}

// Renderiza la lista dentro de host. onRead/onReadAll son del centro que la
// monta; onNavigate(item) abre item.link. Devuelve el conteo de no leídas.
export function renderNotificationList(host, data, {onRead, onReadAll, onNavigate} = {}) {
 host.replaceChildren();
 const items = data?.notifications || [];
 if (!items.length) { host.append(elt('p', 'Sin notificaciones. Los avisos de cotizaciones por vencer, citas y cobros aparecerán aquí.', 'help')); return data?.unread || 0; }
 const toolbar = elt('div', undefined, 'toolbar');
 toolbar.append(elt('span', (data.unread || 0) + ' sin leer', 'pill'));
 if (onReadAll && data.unread) {
  const all = elt('button', 'Marcar todas como leídas', 'btn');
  all.type = 'button';
  all.addEventListener('click', async () => { all.disabled = true; await onReadAll(); });
  toolbar.append(all);
 }
 host.append(toolbar);
 for (const item of items) host.append(notificationRow(item, {onRead, onNavigate}));
 return data.unread || 0;
}

// Centro del tenant (PWA cliente): contador de no leídas + vista C010.
// El GET ya genera los recordatorios en el servidor, así que basta con
// pedir la lista al montar y al abrir la vista. getSlug() se evalúa en cada
// llamada porque el usuario puede cambiar de empresa sin recargar.
export function createTenantNotificationCenter({api, getSlug, badge, viewHost, onNavigate}) {
 let loaded = false;
 async function refresh() {
  const slug = getSlug();
  try {
   const data = await api('/api/app/' + encodeURIComponent(slug) + '/notifications');
   badge.hidden = !data.unread;
   badge.textContent = String(data.unread > 99 ? '99+' : data.unread);
   if (viewHost) renderNotificationList(viewHost, data, {
    onNavigate,
    onRead: async item => { await api('/api/app/' + encodeURIComponent(slug) + '/notifications/' + item.id + '/read', {method: 'POST'}); await refresh(); },
    onReadAll: async () => { await api('/api/app/' + encodeURIComponent(slug) + '/notifications/read-all', {method: 'POST'}); await refresh(); }
   });
   loaded = true;
   return data;
  } catch { return null; }
 }
 return {refresh, get loaded() { return loaded; }};
}

// Centro de Madre: lista global + botón de generar recordatorios.
export function createAdminNotificationCenter({api, host, generateButton, onNavigate}) {
 async function refresh() {
  try {
   const data = await api('/api/admin/notifications');
   renderNotificationList(host, data, {onNavigate});
   return data;
  } catch (e) {
   host.replaceChildren();
   host.append(elt('p', 'No se pudieron cargar las notificaciones: ' + e.message, 'help'));
   return null;
  }
 }
 if (generateButton) generateButton.addEventListener('click', async () => {
  generateButton.disabled = true;
  try { await api('/api/admin/notifications/generate', {method: 'POST'}); await refresh(); }
  catch (e) { generateButton.disabled = false; throw e; }
  finally { generateButton.disabled = false; }
 });
 return {refresh};
}
