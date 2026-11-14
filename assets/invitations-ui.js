// Panel de invitaciones por correo (Madre y cliente). Sin dependencias de
// cada consola: recibe el host, el modelo y los handlers de API. El enlace
// solo existe justo después de crear o reenviar (el token no se guarda);
// por eso el panel lo muestra una sola vez, con botón Copiar.
// Sin correo configurado el texto dice "enlace listo para compartir
// (correo no configurado)": nunca se afirma un envío que no salió.
// Sin emojis como iconografía; sin barras de scroll visibles.
const ROLE_LABELS = {admin: 'Administrador', member: 'Colaborador', viewer: 'Solo lectura'};
const STATUS_LABELS = {pending: 'Pendiente', consumed: 'Aceptada', expired: 'Expirada'};
function node(tag, text, cls) {
 const x = document.createElement(tag);
 if (text !== undefined) x.textContent = text;
 if (cls) x.className = cls;
 return x;
}
function fmtDate(iso) {
 try { return new Date(iso).toLocaleDateString('es-MX', {day: 'numeric', month: 'short', year: 'numeric'}); }
 catch { return iso; }
}
export function renderInvitations(host, model, handlers) {
 if (!host) return;
 const current = {
  invitations: model.invitations || [],
  emailConfigured: model.emailConfigured !== false,
  canManage: model.canManage !== false,
  lastInvite: model.lastInvite || null
 };
 let statusEl;
 function setStatus(message, isError) {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.classList.toggle('error', Boolean(isError));
 }
 function draw() {
  host.replaceChildren();
  statusEl = node('p', '', 'help');
  host.append(statusEl);
  if (current.lastInvite) {
   const box = node('div', undefined, 'card-soft');
   box.append(node('strong', current.lastInvite.emailSent
    ? 'Invitación enviada a ' + current.lastInvite.invitation.email
    : 'Enlace listo para compartir (correo no configurado)'));
   box.append(node('p', current.lastInvite.emailSent
    ? 'El enlace llegó por correo y vence en 7 días.'
    : 'El correo no está configurado, así que la invitación se guardó sin enviar. Comparte este enlace; vence en 7 días y solo se puede usar una vez.', 'help'));
   const row = node('div', undefined, 'toolbar');
   const link = node('span', current.lastInvite.inviteUrl, 'help');
   link.style.wordBreak = 'break-all';
   const copy = node('button', 'Copiar enlace', 'btn btn-primary');
   copy.type = 'button';
   copy.addEventListener('click', async () => {
    try {
     await navigator.clipboard.writeText(current.lastInvite.inviteUrl);
     copy.textContent = 'Copiado';
     setTimeout(() => { copy.textContent = 'Copiar enlace'; }, 2000);
    } catch { setStatus('No se pudo copiar; selecciona el enlace y cópialo manualmente.', true); }
   });
   row.append(copy);
   box.append(link, row);
   host.append(box);
  }
  if (current.canManage) {
   const form = node('form', undefined, 'field-grid');
   const emailField = node('div', undefined, 'field');
   emailField.append(node('label', 'Correo'));
   const emailInput = document.createElement('input');
   emailInput.type = 'email'; emailInput.name = 'email'; emailInput.required = true;
   emailInput.placeholder = 'colaborador@empresa.com'; emailInput.maxLength = 254;
   emailField.append(emailInput);
   const roleField = node('div', undefined, 'field');
   roleField.append(node('label', 'Permiso'));
   const roleSelect = document.createElement('select');
   roleSelect.name = 'role';
   for (const [value, label] of Object.entries(ROLE_LABELS)) roleSelect.add(new Option(label, value));
   roleSelect.value = 'member';
   roleField.append(roleSelect);
   const submit = node('button', 'Invitar por correo', 'btn btn-primary');
   submit.type = 'submit'; submit.style.gridColumn = '1/-1';
   form.append(emailField, roleField, submit);
   form.addEventListener('submit', async ev => {
    ev.preventDefault();
    submit.disabled = true;
    try {
     const result = await handlers.onInvite({email: emailInput.value, role: roleSelect.value});
     current.invitations = result.invitations || current.invitations;
     current.lastInvite = result.lastInvite || null;
     form.reset();
     setStatus(result.message || '');
     draw();
    } catch (e) { setStatus('No se pudo crear la invitación: ' + e.message, true); }
    finally { submit.disabled = false; }
   });
   host.append(form);
   if (!current.emailConfigured) host.append(node('p', 'El correo no está configurado: las invitaciones se guardan y el enlace se muestra aquí para compartirlo manualmente.', 'help'));
  }
  const list = node('div', undefined, 'mini-list');
  for (const inv of current.invitations) {
   const line = node('div', undefined, 'line');
   const detail = node('div');
   detail.append(node('strong', inv.email), node('small',
    (ROLE_LABELS[inv.role] || inv.role) + ' · ' + (STATUS_LABELS[inv.status] || inv.status) + ' · vence ' + fmtDate(inv.expiresAt)));
   line.append(detail);
   if (current.canManage && inv.status === 'pending') {
    const resend = node('button', 'Reenviar', 'btn');
    resend.type = 'button';
    resend.addEventListener('click', async () => {
     resend.disabled = true;
     try {
      const result = await handlers.onResend(inv.id);
      current.invitations = result.invitations || current.invitations;
      current.lastInvite = result.lastInvite || null;
      setStatus(result.message || '');
      draw();
     } catch (e) { setStatus('No se pudo reenviar: ' + e.message, true); }
     finally { resend.disabled = false; }
    });
    const revoke = node('button', 'Revocar', 'btn btn-danger');
    revoke.type = 'button';
    revoke.addEventListener('click', async () => {
     if (!confirm('¿Revocar la invitación de ' + inv.email + '? El enlace dejará de funcionar.')) return;
     revoke.disabled = true;
     try {
      const result = await handlers.onRevoke(inv.id);
      current.invitations = result.invitations || current.invitations;
      current.lastInvite = null;
      setStatus(result.message || 'Invitación revocada.');
      draw();
     } catch (e) { setStatus('No se pudo revocar: ' + e.message, true); }
     finally { revoke.disabled = false; }
    });
    line.append(resend, revoke);
   }
   list.append(line);
  }
  if (!current.invitations.length) list.append(node('p', 'Aún no hay invitaciones.', 'help'));
  host.append(list);
 }
 draw();
}
