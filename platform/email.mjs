// Cliente mínimo de correo (Resend). Sin RESEND_API_KEY no se envía nada:
// el flujo de invitaciones degrada con gracia y muestra el enlace al admin.
// Nunca se finge un envío: sendInvitationEmail devuelve {sent:false} cuando
// no hay clave, y {sent:true} solo tras un 2xx real de la API de Resend.
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
export function emailConfigured() { return Boolean(process.env.RESEND_API_KEY); }
export function resendFrom() { return process.env.RESEND_FROM || 'Hubie <invitaciones@hubie.mx>'; }
// Envío de campaña de marketing (T029) por Resend. Sin RESEND_API_KEY no se
// envía nada: devuelve {sent:false, reason:'email-not-configured'} y el
// llamador registra el envío como 'sin_envio'. Nunca se finge un envío:
// {sent:true} solo tras un 2xx real de la API de Resend.
export async function sendMarketingEmail({to, subject, content, fetchFn = fetch}) {
 if (!emailConfigured()) return {sent: false, reason: 'email-not-configured'};
 const response = await fetchFn(RESEND_ENDPOINT, {
  method: 'POST',
  headers: {'authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json'},
  body: JSON.stringify({
   from: resendFrom(), to: [to],
   subject,
   text: content,
   html: '<p>' + escapeHtml(content).replace(/\n/g, '<br>') + '</p>'
  })
 });
 if (!response.ok) return {sent: false, reason: 'email-send-failed', status: response.status};
 return {sent: true};
}
// fetchFn inyectable para tests; en producción es el fetch global.
export async function sendInvitationEmail({to, inviteUrl, tenantName, role, fetchFn = fetch}) {
 if (!emailConfigured()) return {sent: false, reason: 'email-not-configured'};
 const roleLabel = {admin: 'Administrador', member: 'Colaborador', viewer: 'Solo lectura'}[role] || role;
 const response = await fetchFn(RESEND_ENDPOINT, {
  method: 'POST',
  headers: {'authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json'},
  body: JSON.stringify({
   from: resendFrom(), to: [to],
   subject: 'Te invitaron a ' + tenantName + ' en Hubie',
   text: 'Te invitaron a ' + tenantName + ' en Hubie como ' + roleLabel + '.\n\nAcepta tu invitación aquí (válida 7 días, un solo uso):\n' + inviteUrl + '\n\nSi no esperabas este correo, ignóralo.',
   html: '<p>Te invitaron a <strong>' + escapeHtml(tenantName) + '</strong> en Hubie como ' + escapeHtml(roleLabel) + '.</p><p><a href="' + escapeHtml(inviteUrl) + '">Aceptar invitación</a> (válida 7 días, un solo uso).</p><p>Si no esperabas este correo, ignóralo.</p>'
  })
 });
 if (!response.ok) return {sent: false, reason: 'email-send-failed', status: response.status};
 return {sent: true};
}
function escapeHtml(value) {
 return String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}
