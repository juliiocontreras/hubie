// Página pública /invitacion?token=…: vista previa de la invitación y
// aceptación con la sesión de Google. Sin sesión, pide iniciar sesión y
// volver con el mismo enlace (el callback de Google no admite ?next=).
'use strict';
(function () {
 const $ = id => document.getElementById(id);
 const token = new URLSearchParams(location.search).get('token') || '';
 const title = $('invite-title'), detail = $('invite-detail'), message = $('invite-message');
 const actions = $('invite-actions'), login = $('invite-login');
 const acceptBtn = $('invite-accept'), openApp = $('invite-open-app');
 function showError(heading, text) {
  title.textContent = heading; detail.textContent = text;
  actions.hidden = true; login.hidden = true;
 }
 async function init() {
  if (!token) return showError('Enlace incompleto', 'A este enlace le falta el token de invitación. Pide uno nuevo a tu administrador.');
  let preview;
  try {
   const r = await fetch('/api/public/invitations?token=' + encodeURIComponent(token), {cache: 'no-store'});
   preview = await r.json().catch(() => ({}));
   if (!r.ok) throw new Error(preview.error || 'No se pudo consultar la invitación');
  } catch (e) { return showError('No se pudo consultar la invitación', e.message); }
  if (preview.status === 'expired') return showError('Invitación vencida', 'Este enlace venció. Pide una nueva invitación a tu administrador.');
  if (preview.status === 'consumed') return showError('Invitación ya usada', 'Este enlace ya se aceptó una vez. Si necesitas acceso, pide una nueva invitación.');
  if (preview.status !== 'valid' || !preview.invitation) return showError('Invitación no válida', 'Este enlace no corresponde a ninguna invitación vigente.');
  const inv = preview.invitation;
  const roleLabel = {admin: 'Administrador', member: 'Colaborador', viewer: 'Solo lectura'}[inv.role] || inv.role;
  title.textContent = 'Te invitaron a ' + inv.organizationName;
  detail.textContent = 'Te invitaron como ' + roleLabel + ' a ' + inv.organizationName + ' en Hubie. El enlace vence el ' +
   new Date(inv.expiresAt).toLocaleDateString('es-MX', {day: 'numeric', month: 'long', year: 'numeric'}) + '.';
  let session = null;
  try {
   const r = await fetch('/api/auth/session', {credentials: 'same-origin', cache: 'no-store'});
   session = r.ok ? await r.json().catch(() => null) : null;
  } catch { session = null; }
  if (!session || !session.authenticated) {
   detail.textContent += ' Primero inicia sesión con Google y vuelve con este mismo enlace para aceptarla.';
   login.hidden = false;
   return;
  }
  actions.hidden = false;
  acceptBtn.addEventListener('click', async () => {
   acceptBtn.disabled = true;
   message.textContent = 'Aceptando invitación…';
   try {
    const r = await fetch('/api/public/invitations', {
     method: 'POST', credentials: 'same-origin',
     headers: {'content-type': 'application/json'},
     body: JSON.stringify({token})
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'No se pudo aceptar la invitación');
    title.textContent = 'Ya eres parte de ' + data.organizationName;
    detail.textContent = 'Tu acceso como ' + roleLabel + ' está activo.';
    message.textContent = '';
    acceptBtn.hidden = true;
    openApp.hidden = false;
    openApp.href = '/app/?tenant=' + encodeURIComponent(data.organizationSlug || '');
   } catch (e) {
    message.textContent = e.message;
    acceptBtn.disabled = false;
   }
  });
 }
 init();
})();
