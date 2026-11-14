// Base de datos falsa en memoria para los tests de invitaciones y auditoría.
// Implementa solo las sentencias que usan platform/invitations.mjs y
// platform/audit.mjs, con la misma forma de resultado que database.mjs
// ({rows: [[{value}...]], affected_row_count}).
const cells = values => values.map(value => ({value: value ?? null}));
const ok = (rows = [], affected = 0) => ({rows: rows.map(cells), affected_row_count: affected, rowsAffected: affected});
export function createInvitationsFakeDb(seed = {}) {
 const tables = {
  organizations: seed.organizations ?? [],
  users: seed.users ?? [],
  memberships: seed.memberships ?? [],
  invitations: seed.invitations ?? [],
  audit: seed.audit ?? []
 };
 let seq = 0;
 const stamp = () => new Date(Date.now() + (seq++)).toISOString();
 const invRow = i => [i.id, i.organization_id, i.email, i.role, i.expires_at, i.consumed_at ?? null, i.created_at];
 async function executeSql(sql, args = []) {
  if (sql.startsWith('SELECT o.name FROM organizations')) {
   const org = tables.organizations.find(o => o.id === args[0]);
   return ok(org ? [[org.name]] : []);
  }
  if (sql.startsWith('SELECT id FROM organization_invitations WHERE organization_id=? AND email=?')) {
   const found = tables.invitations.find(i => i.organization_id === args[0] && i.email === args[1] && !i.consumed_at && i.expires_at > args[2]);
   return ok(found ? [[found.id]] : []);
  }
  if (sql.startsWith('SELECT id,organization_id,email,role,expires_at,consumed_at,created_at FROM organization_invitations WHERE organization_id=?')) {
   return ok(tables.invitations.filter(i => i.organization_id === args[0]).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200).map(invRow));
  }
  if (sql.includes('FROM organization_invitations i JOIN organizations o')) {
   const inv = tables.invitations.find(i => i.token_hash === args[0]);
   if (!inv) return ok([]);
   const org = tables.organizations.find(o => o.id === inv.organization_id);
   return ok([[inv.id, inv.organization_id, inv.email, inv.role, inv.expires_at, inv.consumed_at ?? null, inv.created_at, org?.name ?? null, org?.slug ?? null]]);
  }
  if (sql.startsWith('SELECT id,organization_id,email,role,expires_at,consumed_at,created_at FROM organization_invitations WHERE id=?')) {
   const inv = tables.invitations.find(i => i.id === args[0] && i.organization_id === args[1]);
   return ok(inv ? [invRow(inv)] : []);
  }
  if (sql.includes('FROM audit_events a LEFT JOIN users u')) {
   // Las condiciones se añaden en orden fijo: organization_id, action,
   // actor, from, to; el límite es el último argumento.
   let list = [...tables.audit];
   let n = 0;
   if (sql.includes('a.organization_id=?')) { const org = args[n++]; list = list.filter(e => e.organization_id === org); }
   if (sql.includes('a.action=?')) { const action = args[n++]; list = list.filter(e => e.action === action); }
   if (sql.includes('(a.actor_user_id=? OR u.email=?)')) {
    const actor = args[n++];
    n++;
    list = list.filter(e => e.actor_user_id === actor || (tables.users.find(u => u.id === e.actor_user_id)?.email ?? null) === actor);
   }
   if (sql.includes('a.occurred_at>=?')) { const from = args[n++]; list = list.filter(e => e.occurred_at >= from); }
   if (sql.includes('a.occurred_at<=?')) { const to = args[n++]; list = list.filter(e => e.occurred_at <= to); }
   const limit = args[args.length - 1];
   list.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id.localeCompare(a.id));
   return ok(list.slice(0, limit).map(e => [e.id, e.organization_id, e.actor_user_id,
    tables.users.find(u => u.id === e.actor_user_id)?.email ?? null,
    e.action, e.target_type, e.target_id, e.occurred_at]));
  }
  throw Error('Fake DB: sentencia no implementada: ' + sql.slice(0, 80));
 }
 function runOne({sql, args = []}) {
  if (sql.startsWith('INSERT INTO organization_invitations')) {
   tables.invitations.push({id: args[0], organization_id: args[1], email: args[2], role: args[3], token_hash: args[4], created_by: args[5], expires_at: args[6], consumed_at: null, created_at: stamp()});
   return ok([], 1);
  }
  if (sql.startsWith('INSERT INTO audit_events')) {
   tables.audit.push({id: args[0], organization_id: args[1], actor_user_id: args[2], action: args[3], target_type: args[4], target_id: args[5], occurred_at: stamp()});
   return ok([], 1);
  }
  if (sql.startsWith('UPDATE organization_invitations SET consumed_at=?')) {
   const inv = tables.invitations.find(i => i.id === args[1] && !i.consumed_at && i.expires_at > args[2]);
   if (inv) { inv.consumed_at = args[0]; return ok([], 1); }
   return ok([], 0);
  }
  if (sql.startsWith('INSERT OR IGNORE INTO users')) {
   if (!tables.users.some(u => u.id === args[0] || u.email === args[1])) tables.users.push({id: args[0], email: args[1]});
   return ok([], 1);
  }
  if (sql.startsWith('INSERT INTO memberships')) {
   const existing = tables.memberships.find(m => m.organization_id === args[0] && m.user_id === args[1]);
   if (existing) {
    if (existing.role !== 'owner') existing.role = args[2];
    existing.status = 'active';
   } else {
    tables.memberships.push({organization_id: args[0], user_id: args[1], role: args[2], status: 'active'});
   }
   return ok([], 1);
  }
  if (sql.startsWith('DELETE FROM organization_invitations')) {
   const idx = tables.invitations.findIndex(i => i.id === args[0] && i.organization_id === args[1]);
   if (idx >= 0) { tables.invitations.splice(idx, 1); return ok([], 1); }
   return ok([], 0);
  }
  if (sql.startsWith('UPDATE organization_invitations SET token_hash=?')) {
   const inv = tables.invitations.find(i => i.id === args[2] && !i.consumed_at);
   if (inv) { inv.token_hash = args[0]; inv.expires_at = args[1]; return ok([], 1); }
   return ok([], 0);
  }
  throw Error('Fake DB: sentencia no implementada: ' + sql.slice(0, 80));
 }
 async function executeBatch(statements) { return statements.map(runOne); }
 return {tables, executeSql, executeBatch};
}
