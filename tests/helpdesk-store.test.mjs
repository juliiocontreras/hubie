import test from 'node:test';
import assert from 'node:assert/strict';
import {createHelpdeskFakeDb,helpdeskDeps} from './helpdesk-fake-db.mjs';
import {listTickets,createTicket,updateTicket,setTicketStatus,assignTicket,
 getTicket,listReplies,createReply,dashboard} from '../platform/helpdesk-store.mjs';
import {normalizeTicket,normalizeReply} from '../platform/helpdesk-domain.mjs';

const token='fake-token',slug='demo',otherSlug='demo-b';
const setup=()=>{const fake=createHelpdeskFakeDb();return {fake,deps:helpdeskDeps(fake)};};
const ticketInput=(over={})=>({subject:'No llega la cotización',description:'El cliente no recibió el PDF.',
 priority:'alta',...over});
const replyInput=(over={})=>({body:'Lo revisamos ahora mismo.',...over});

test('dominio: normalización estricta de tickets y respuestas',()=>{
 assert.equal(normalizeTicket({subject:'  Falla  '}).status,'abierto');
 assert.equal(normalizeTicket({subject:'Falla'}).priority,'media');
 assert.equal(normalizeTicket({subject:'Falla'}).clientId,null);
 assert.throws(()=>normalizeTicket({subject:'Ab'}),/Invalid/);
 assert.throws(()=>normalizeTicket({subject:'Falla',status:'nuevo'}),/Invalid ticket/);
 assert.throws(()=>normalizeTicket({subject:'Falla',priority:'crítica'}),/Invalid ticket/);
 assert.throws(()=>normalizeReply({ticketId:'x',body:'Hola'}),/Invalid reply/);
 assert.throws(()=>normalizeReply({ticketId:'11111111-1111-4111-8111-111111111111',body:'  '}),/Invalid/);
});

test('tickets: crear con defaults, listar con filtros, actualizar y cambiar estatus',async()=>{
 const {fake,deps}=setup();
 const created=await createTicket(token,slug,{subject:'Duda de envío'},deps);
 assert.equal(created.ticket.status,'abierto');
 assert.equal(created.ticket.priority,'media');
 assert.equal(created.ticket.replies,0);
 const full=await createTicket(token,slug,ticketInput({clientId:fake.clientId,assigneeUserId:fake.memberId}),deps);
 assert.equal(full.ticket.clientName,'Cliente Ejemplo SA');
 assert.equal(full.ticket.assigneeEmail,'member@demo.test');
 assert.equal((await listTickets(token,slug,{},deps)).tickets.length,2);
 assert.equal((await listTickets(token,slug,{status:'abierto'},deps)).tickets.length,2);
 assert.equal((await listTickets(token,slug,{priority:'alta'},deps)).tickets.length,1);
 assert.equal((await listTickets(token,slug,{assignee:fake.memberId},deps)).tickets.length,1);
 const updated=await updateTicket(token,slug,full.ticket.id,{subject:'Cotización sin llegar',priority:'urgente'},deps);
 assert.equal(updated.ticket.subject,'Cotización sin llegar');
 assert.equal(updated.ticket.priority,'urgente');
 assert.equal(updated.ticket.clientId,fake.clientId);
 const moved=await setTicketStatus(token,slug,full.ticket.id,{status:'resuelto'},deps);
 assert.equal(moved.status,'resuelto');
 assert.equal((await listTickets(token,slug,{status:'resuelto'},deps)).tickets.length,1);
 await assert.rejects(()=>createTicket(token,slug,{subject:'Ab'},deps),/Invalid/);
 await assert.rejects(()=>createTicket(token,slug,ticketInput({clientId:'00000000-0000-4000-8000-000000000000'}),deps),/Client not found/);
 await assert.rejects(()=>createTicket(token,slug,ticketInput({assigneeUserId:'00000000-0000-4000-8000-000000000000'}),deps),/Assignee not found/);
 await assert.rejects(()=>setTicketStatus(token,slug,full.ticket.id,{status:'nuevo'},deps),/Invalid ticket/);
 await assert.rejects(()=>updateTicket(token,slug,'00000000-0000-4000-8000-000000000000',{subject:'Nada'},deps),/Not found/);
 await assert.rejects(()=>listTickets('bad-token',slug,{},deps),/Unauthorized/);
 await assert.rejects(()=>listTickets(token,'sin-tenant',{},deps),/Not found/);
});

test('aislamiento entre tenants: un ticket de demo no se ve en demo-b',async()=>{
 const {deps}=setup();
 const created=await createTicket(token,slug,ticketInput(),deps);
 assert.equal((await listTickets(token,slug,{},deps)).tickets.length,1);
 assert.equal((await listTickets(token,otherSlug,{},deps)).tickets.length,0);
 await assert.rejects(()=>getTicket(token,otherSlug,created.ticket.id,deps),/Not found/);
 await assert.rejects(()=>createReply(token,otherSlug,created.ticket.id,replyInput(),deps),/Not found/);
 const other=await createTicket(token,otherSlug,ticketInput(),deps);
 assert.notEqual(other.ticket.id,created.ticket.id);
 assert.equal((await listTickets(token,otherSlug,{},deps)).tickets.length,1);
});

test('asignación: avisa al asignado en la app (sin correo) y no duplica',async()=>{
 const {fake,deps}=setup();
 const ticket=(await createTicket(token,slug,ticketInput(),deps)).ticket;
 assert.equal(fake.tables.notifications.length,0,'sin asignado no hay aviso');
 const assigned=await assignTicket(token,slug,ticket.id,{assigneeUserId:fake.memberId},deps);
 assert.equal(assigned.ticket.assigneeUserId,fake.memberId);
 assert.equal(assigned.notified,true);
 assert.equal(fake.tables.notifications.length,1);
 const note=fake.tables.notifications[0];
 assert.equal(note.user_id,fake.memberId);
 assert.equal(note.type,'info');
 assert.ok(note.title.includes('No llega la cotización'));
 assert.ok(note.link.includes('/app/?tenant=demo&tool=T028&record='+ticket.id));
 // Reasignar al mismo: el dedupe no duplica el aviso sin leer.
 const again=await assignTicket(token,slug,ticket.id,{assigneeUserId:fake.memberId},deps);
 assert.equal(again.notified,false);
 assert.equal(fake.tables.notifications.length,1);
 // Crear ya asignado también avisa una vez.
 const created=await createTicket(token,slug,ticketInput({subject:'Otro ticket',assigneeUserId:fake.memberId}),deps);
 assert.equal(fake.tables.notifications.length,2);
 assert.ok(fake.tables.notifications.some(n=>n.link.includes(created.ticket.id)));
 // Quitar el asignado no avisa.
 const unassigned=await assignTicket(token,slug,ticket.id,{assigneeUserId:null},deps);
 assert.equal(unassigned.ticket.assigneeUserId,null);
 assert.equal(fake.tables.notifications.length,2);
 await assert.rejects(()=>assignTicket(token,slug,ticket.id,{assigneeUserId:'00000000-0000-4000-8000-000000000000'},deps),/Assignee not found/);
});

test('respuestas en hilo: crear, listar en orden y ver autor',async()=>{
 const {fake,deps}=setup();
 const ticket=(await createTicket(token,slug,ticketInput(),deps)).ticket;
 const first=(await createReply(token,slug,ticket.id,replyInput({body:'Primera respuesta'}),deps)).reply;
 assert.equal(first.authorUserId,fake.ownerId);
 assert.equal(first.authorEmail,'owner@demo.test');
 const second=(await createReply(token,slug,ticket.id,replyInput({body:'Segunda respuesta'}),deps)).reply;
 assert.notEqual(second.id,first.id);
 const listed=await listReplies(token,slug,ticket.id,deps);
 assert.equal(listed.replies.length,2);
 assert.equal(listed.replies[0].body,'Primera respuesta');
 assert.equal(listed.replies[1].body,'Segunda respuesta');
 const detail=await getTicket(token,slug,ticket.id,deps);
 assert.equal(detail.ticket.replies,undefined,'el detalle trae el hilo aparte');
 assert.equal(detail.replies.length,2);
 assert.equal((await listTickets(token,slug,{},deps)).tickets[0].replies,2);
 await assert.rejects(()=>createReply(token,slug,ticket.id,{body:'  '},deps),/Invalid/);
 await assert.rejects(()=>createReply(token,slug,'00000000-0000-4000-8000-000000000000',replyInput(),deps),/Not found/);
});

test('tablero: KPIs por estado, urgentes abiertos y sin asignar',async()=>{
 const {fake,deps}=setup();
 await createTicket(token,slug,ticketInput({subject:'Urgente sin asignar',priority:'urgente'}),deps);
 await createTicket(token,slug,ticketInput({subject:'Normal asignado',priority:'media',assigneeUserId:fake.memberId}),deps);
 const third=(await createTicket(token,slug,ticketInput({subject:'Por resolver',priority:'baja'}),deps)).ticket;
 await setTicketStatus(token,slug,third.id,{status:'resuelto'},deps);
 const dash=await dashboard(token,slug,deps);
 assert.equal(dash.kpis.open,2);
 assert.equal(dash.kpis.resolved,1);
 assert.equal(dash.kpis.closed,0);
 assert.equal(dash.kpis.urgentOpen,1);
 assert.equal(dash.kpis.unassignedOpen,1,'el urgente sin asignar; el resuelto no cuenta');
 assert.equal(dash.kpis.total,3);
 assert.equal(dash.recentOpen.length,2);
 assert.equal(dash.recentOpen[0].subject,'Normal asignado','el más reciente primero');
});
