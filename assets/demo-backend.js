// Browser-only demo adapter. NEVER sends user/tenant data to /api or Turso.
// Explicit ?demo=1 only; stored locally in this browser tab's sessionStorage.
const now=()=>new Date().toISOString();
const uuid=()=>globalThis.crypto?.randomUUID?.()||'demo-'+Math.random().toString(36).slice(2);
const copy=x=>structuredClone(x);
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const statuses=['prospect','active','inactive'];
const validExpiry=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;const x=new Date(d+'T00:00:00Z');return !isNaN(x.getTime())&&x.toISOString().slice(0,10)===d;};
const stages=['lead','qualified','proposal','negotiation','won','lost'];
const caseKinds=['general','commercial','contract','service','administrative'];
const caseStatuses=['open','in_progress','on_hold','completed'];
const appearanceDefaults={dashboardPreset:'hubie',sidebarPreset:'midnight',dashboardColor:'#f6f7fb',sidebarColor:'#16123a'};
const appearanceFields=Object.keys(appearanceDefaults);
const normalizeTheme=input=>{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!appearanceFields.includes(k)))throw error('Invalid appearance');
 const theme={...appearanceDefaults,...input};
 if(!['hubie','pearl','silver','sand','custom'].includes(theme.dashboardPreset)||!['midnight','steel','platinum','graphite','custom'].includes(theme.sidebarPreset))throw error('Invalid appearance');
 if(!/^#[0-9a-fA-F]{6}$/.test(theme.dashboardColor)||!/^#[0-9a-fA-F]{6}$/.test(theme.sidebarColor))throw error('Invalid appearance');
 return theme;
};
const makeBackgrounds=t=>({dashboard:t?.dashboard||null,sidebar:t?.sidebar||null});
const dataUrl=media=>'data:'+media.mime+';base64,'+media.data;
const allowedMime=['image/png','image/jpeg','image/webp','application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const demoMedia=input=>{
 if(!allowedMime.includes(input?.mime)||typeof input?.data!=='string'||input.data.length>2700000||!/^[A-Za-z0-9+/=]+$/.test(input.data)||typeof input.filename!=='string')throw error('Invalid media');
 return {id:uuid(),filename:input.filename.slice(0,120),mime:input.mime,data:input.data,size:Math.floor(input.data.length*.75)};
};
const onboardingSteps=[
 {key:'profile',title:'Completa tu perfil',description:'Agrega el nombre, el logo y los colores de tu empresa para que tus clientes te reconozcan.',toolId:null},
 {key:'first-client',title:'Agrega tu primer cliente',description:'Registra a tu primer cliente con su nombre, su correo y su teléfono.',toolId:'C001'},
 {key:'catalog',title:'Crea tu catálogo',description:'Agrega tu primer producto o servicio con su precio.',toolId:'C006'},
 {key:'quote',title:'Crea tu primera cotización',description:'Arma una cotización con partidas y compártela con tu cliente.',toolId:'T013'},
 {key:'team',title:'Invita a tu equipo',description:'Agrega a las personas que trabajarán contigo en Hubie. Las invitaciones las gestiona Hubie Madre.',toolId:null},
 {key:'billing',title:'Configura tu cobro',description:'Revisa tu suscripción y tu anticipo para mantener tu Suite al corriente.',toolId:null}
];
const initialId=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
function createTenant(catalog,input,id=uuid()){
 const suite=catalog.suites.find(s=>s.id===input.suiteId);
 if(!suite||typeof input.name!=='string'||input.name.trim().length<2||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(input.slug||''))throw error('Invalid tenant data');
 const selected=new Set(input.toolIds||catalog.tools.filter(t=>t.included).map(t=>t.id));
 if([...selected].some(code=>!catalog.tools.some(t=>t.id===code)))throw error('Invalid tenant data');
 return {id,appearance:{...appearanceDefaults},backgrounds:{dashboard:null,sidebar:null},uploads:[],slug:input.slug,name:input.name.trim(),displayName:input.name.trim(),suiteId:input.suiteId,status:'active',primaryColor:input.primaryColor||'#7c5cfc',secondaryColor:input.secondaryColor||'#ec4899',timezone:'America/Mexico_City',logoUrl:null,
  tools:catalog.tools.map(t=>({...t,enabled:selected.has(t.id)})),
  members:[{id:'33333333-3333-4333-8333-333333333333',email:'superadmin@ejemplo.invalid',role:'owner',status:'active'}],
  notifications:[],
  memberTools:{},clients:[],clientMerges:[],cases:[],caseEvents:[],caseDocumentMeta:{},caseAccess:{},
  docSettings:{},docAccess:{},entityLinks:[],deals:[],dealTasks:[],events:[],items:[],movements:[],
  checklists:[],checklistTemplates:[],tasks:[],forms:[],formSubmissions:[],goals:[],variants:[],
  quotes:[],catalogItems:[],expenses:[],payments:[],invoices:[],generic:{},
  marketing:{segments:[],campaigns:[],sends:[]},
  pos:{sales:[],saleLines:[]},cashboxes:[],cashboxMovements:[],
  training:{courses:[],sessions:[],employees:[],enrollments:[],attendance:[],progress:[],modules:[],attempts:[],evaluations:[],certificates:[],completions:[]},
  accounting:{accounts:[],entries:[],lines:[]},
  salesOrders:{orders:[],lines:[]},
  receivables:[],
  projects:{projects:[],milestones:[]},helpdesk:{tickets:[],replies:[]},kanbanBoards:[],
  hr:{documents:[],workdays:[],requests:[],periods:[],concepts:[],receipts:[],receiptItems:[]},
  onboarding:{steps:{},demoSeeded:[]},
  invitations:[],audit:[]};
}
function initial(catalog){
 const first=createTenant(catalog,{name:'Comercio de demostración',slug:'comercio-demo',suiteId:'S004',toolIds:[...catalog.tools.filter(t=>t.included).map(t=>t.id),'T004','T013']},initialId[0]);
 const second=createTenant(catalog,{name:'Consultoría de demostración',slug:'consultoria-demo',suiteId:'S006'},initialId[1]);
 first.clients.push({id:uuid(),name:'Contacto de ejemplo',company:'Negocio ficticio',email:'ejemplo@correo.invalid',phone:'',status:'prospect',notes:'Datos ficticios para conocer la interfaz.'});
 first.cases.push({id:uuid(),clientId:first.clients[0].id,clientName:first.clients[0].name,title:'Expediente comercial de ejemplo',kind:'commercial',status:'open',notes:'Carpeta de demostración, sin datos de clientes reales.',createdAt:now(),updatedAt:now()});
 first.caseEvents.push({id:uuid(),caseId:first.cases[0].id,action:'created',description:'Expediente de demostración creado',createdAt:now()});
 first.deals.push({id:uuid(),title:'Oportunidad de demostración',customer:'Negocio ficticio',clientId:first.clients[0].id,amountCents:250000,stage:'proposal',notes:'Operación simulada; no se realiza ningún cobro.',followUpAt:null,assignedUserId:null,createdAt:now(),updatedAt:now()});
 first.items.push({id:uuid(),sku:'DEMO-001',title:'Producto de muestra',location:'Almacén ficticio',quantity:8,lowStock:3});
 first.variants.push({id:uuid(),itemId:first.items[0].id,label:'Talla M · Rojo',sku:'DEMO-001-M-R',quantity:5,lowStock:2,warehouse:'Almacén ficticio',lot:'LOTE-1',expiresOn:null,supplier:'Proveedor ficticio'});
 first.checklistTemplates.push({id:uuid(),title:'Apertura de tienda',description:'Plantilla de demostración',items:[{title:'Abrir caja',position:0},{title:'Revisar exhibición',position:1}]});
 first.checklists.push({id:uuid(),templateId:first.checklistTemplates[0].id,templateTitle:'Apertura de tienda',title:'Apertura lunes',status:'open',createdAt:now(),updatedAt:now(),
  items:[{id:uuid(),title:'Abrir caja',assigneeUserId:null,assigneeEmail:null,dueOn:null,checkedAt:null,checkedBy:null,evidenceMediaId:null,evidenceName:null,position:0},
   {id:uuid(),title:'Revisar exhibición',assigneeUserId:null,assigneeEmail:null,dueOn:null,checkedAt:null,checkedBy:null,evidenceMediaId:null,evidenceName:null,position:1}]});
 first.tasks.push({id:uuid(),title:'Llamar al proveedor ficticio',notes:'',assigneeUserId:null,assigneeEmail:null,dueOn:new Date(Date.now()+86400000).toISOString().slice(0,10),status:'pending',priority:'normal',sourceToolId:null,sourceRecordId:null,notifiedAt:null,createdAt:now(),updatedAt:now()});
 first.forms.push({id:uuid(),title:'Encuesta de demostración',description:'Formulario de ejemplo',fields:[{key:'nombre',label:'Nombre',type:'text',required:true,options:[],position:0},{key:'calificacion',label:'Calificación',type:'select',required:false,options:['Buena','Regular','Mala'],position:1}],createdAt:now(),updatedAt:now()});
 first.goals.push({month:new Date().toISOString().slice(0,7),targetCents:100000});
 first.events.push({id:uuid(),title:'Reunión de ejemplo',customer:'Contacto ficticio',clientId:first.clients[0].id,dealId:first.deals[0].id,resource:'sala-1',startsAt:'2026-11-12T16:00:00.000Z',endsAt:'2026-11-12T17:00:00.000Z',status:'scheduled',notes:''});
 // Historial de demostración: eventos de ejemplo por empresa, aislados.
 first.audit.push(
  {id:uuid(),organizationId:first.id,actorUserId:'33333333-3333-4333-8333-333333333333',actorEmail:'superadmin@ejemplo.invalid',action:'tenant.created',targetType:'organization',targetId:first.id,occurredAt:'2026-11-10T10:00:00.000Z'},
  {id:uuid(),organizationId:first.id,actorUserId:'33333333-3333-4333-8333-333333333333',actorEmail:'superadmin@ejemplo.invalid',action:'tenant.member_added',targetType:'membership',targetId:'ejemplo@correo.invalid',occurredAt:'2026-11-11T10:00:00.000Z'});
 second.audit.push(
  {id:uuid(),organizationId:second.id,actorUserId:'33333333-3333-4333-8333-333333333333',actorEmail:'superadmin@ejemplo.invalid',action:'tenant.created',targetType:'organization',targetId:second.id,occurredAt:'2026-11-10T11:00:00.000Z'});
 first.notifications.push({id:uuid(),userId:null,type:'info',title:'Bienvenido a la demostración',body:'Este es el centro de notificaciones: aquí aparecerían las cotizaciones por vencer, las citas próximas y los cobros vencidos de tu empresa.',link:null,readAt:null,createdAt:now()});
 // Capacitaciones (T022) de demostración: datos ficticios, solo en esta pestaña.
 // El catálogo ya trae T022 (no incluida): se habilita en este tenant demo.
 const demoT022=first.tools.find(t=>t.id==='T022');
 if(demoT022)demoT022.enabled=true;
 else first.tools.push({id:'T022',name:'Capacitaciones',group:'Recursos Humanos',price:null,pricing:'quote',included:false,enabled:true});
 const dPlus=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
 const tr=first.training;
 const empA={id:uuid(),name:'Ana Ruiz',email:'ana.ruiz@ejemplo.invalid',position:'Cajera',area:'Ventas',fechaIngreso:'2026-01-15',tipoContrato:'indefinido',salarioMensualCents:1200000,estado:'activo',createdAt:now()};
 const empB={id:uuid(),name:'Bruno Méndez',email:'bruno.mendez@ejemplo.invalid',position:'Almacenista',area:'Logística',fechaIngreso:'2026-03-01',tipoContrato:'temporal',salarioMensualCents:950000,estado:'activo',createdAt:now()};
 const empC={id:uuid(),name:'Carla Soto',email:'carla.soto@ejemplo.invalid',position:'Supervisora',area:'Operaciones',fechaIngreso:'2026-08-10',tipoContrato:'indefinido',salarioMensualCents:1800000,estado:'activo',createdAt:now()};
 tr.employees.push(empA,empB,empC);
 const courseA={id:uuid(),name:'Atención al cliente',description:'Curso de demostración: trato al cliente y resolución de quejas.',category:'Atención al cliente',modality:'presencial',durationHours:8,instructor:'María López',materials:'Manual de demostración (ficticio).',validUntil:dPlus(20),minScore:70,status:'activo',createdAt:now(),updatedAt:now()};
 const courseB={id:uuid(),name:'Seguridad en el almacén',description:'Curso de demostración: uso de equipo de protección.',category:'Seguridad',modality:'mixta',durationHours:4,instructor:'Jorge Pérez',materials:'',validUntil:dPlus(45),minScore:80,status:'activo',createdAt:now(),updatedAt:now()};
 const courseC={id:uuid(),name:'Inducción general',description:'Curso de demostración en borrador.',category:'Inducción',modality:'en línea',durationHours:2,instructor:'',materials:'',validUntil:null,minScore:70,status:'borrador',createdAt:now(),updatedAt:now()};
 tr.courses.push(courseA,courseB,courseC);
 const modA1={id:uuid(),courseId:courseA.id,type:'learning',title:'Bienvenida y servicio',description:'Lección de demostración.',content:'Contenido de demostración: saluda, escucha y resuelve.',position:1,status:'activo',quizConfig:null,createdAt:now(),updatedAt:now()};
 const modA2={id:uuid(),courseId:courseA.id,type:'certification',title:'Evaluación de atención',description:'Módulo de certificación de demostración.',content:'',position:2,status:'activo',
  quizConfig:{passingScore:70,maxAttempts:2,questions:[
   {id:'q1',text:'¿Qué se hace primero al recibir a un cliente?',points:1,options:['Saludar y escuchar su necesidad','Pedirle que espere sin explicarle','Derivarlo de inmediato sin preguntar'],correctIndex:0},
   {id:'q2',text:'Ante una queja, ¿qué corresponde?',points:1,options:['Ignorarla','Escuchar, disculparse y ofrecer una solución','Culpar a otra área'],correctIndex:1}]},
  createdAt:now(),updatedAt:now()};
 tr.modules.push(modA1,modA2);
 const sesA={id:uuid(),courseId:courseA.id,startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+86400000+2*3600000).toISOString(),placeOrLink:'Sala de capacitación',capacity:20,instructor:'María López',createdAt:now(),updatedAt:now()};
 const sesB={id:uuid(),courseId:courseB.id,startsAt:new Date(Date.now()+7*86400000).toISOString(),endsAt:new Date(Date.now()+7*86400000+4*3600000).toISOString(),placeOrLink:'Almacén principal',capacity:12,instructor:'Jorge Pérez',createdAt:now(),updatedAt:now()};
 tr.sessions.push(sesA,sesB);
 const enrA={id:uuid(),employeeId:empA.id,courseId:courseA.id,sessionId:sesA.id,status:'en curso',createdAt:now(),updatedAt:now()};
 const enrB={id:uuid(),employeeId:empB.id,courseId:courseA.id,sessionId:sesA.id,status:'inscrito',createdAt:now(),updatedAt:now()};
 const enrC={id:uuid(),employeeId:empC.id,courseId:courseB.id,sessionId:sesB.id,status:'en curso',createdAt:now(),updatedAt:now()};
 tr.enrollments.push(enrA,enrB,enrC);
 tr.attendance.push({id:uuid(),sessionId:sesA.id,employeeId:empA.id,status:'presente',createdAt:now()},
  {id:uuid(),sessionId:sesA.id,employeeId:empB.id,status:'ausente',createdAt:now()});
 tr.completions.push({enrollmentId:enrA.id,moduleId:modA1.id,createdAt:now()},{enrollmentId:enrA.id,moduleId:modA2.id,createdAt:now()});
 tr.attempts.push({id:uuid(),moduleId:modA2.id,enrollmentId:enrA.id,employeeId:empA.id,answers:{q1:0,q2:1},score:100,passed:true,attemptNumber:1,correctCount:2,totalQuestions:2,moduleTitle:modA2.title,employeeName:empA.name,createdAt:now()});
 tr.evaluations.push({id:uuid(),enrollmentId:enrA.id,employeeId:empA.id,courseId:courseA.id,score:100,passed:true,evaluatedAt:now()});
 tr.certificates.push({id:uuid(),employeeId:empA.id,courseId:courseA.id,enrollmentId:enrA.id,folio:'CAP-2026-K7M2Q9',issuedAt:now()});
 // Contabilidad (T023) y Pedidos de venta (T024) de demostración: datos
 // ficticios, solo en esta pestaña. El catálogo ya trae T023/T024 (no
 // incluidas): se habilitan en este tenant demo.
 for(const toolId of ['T023','T024']){
  const t=first.tools.find(x=>x.id===toolId);
  if(t)t.enabled=true;
  else first.tools.push({id:toolId,name:toolId==='T023'?'Contabilidad':'Pedidos de venta',group:'Finanzas',price:null,pricing:'quote',included:false,enabled:true});
 }
 const ac=first.accounting;
 const chartSeed=[['1000','Caja','activo'],['1010','Bancos','activo'],['1100','Clientes','activo'],['1200','Inventario','activo'],
  ['2000','Proveedores','pasivo'],['2100','IVA por pagar','pasivo'],['3000','Capital social','capital'],
  ['3200','Resultados de ejercicios anteriores','capital'],['4000','Ventas','ingreso'],['5000','Costo de ventas','gasto'],['5100','Gastos de operación','gasto']];
 for(const [code,name,type] of chartSeed)ac.accounts.push({id:uuid(),code,name,type,
  nature:type==='activo'||type==='gasto'?'deudora':'acreedora',parentId:null,active:true,createdAt:now(),updatedAt:now()});
 const accByCode=code=>ac.accounts.find(a=>a.code===code);
 const entrySeed={id:uuid(),folio:1,entryDate:new Date().toISOString().slice(0,10),concept:'Venta del día (demostración)',
  sourceType:'manual',sourceId:null,status:'registrada',createdAt:now(),updatedAt:now()};
 ac.entries.push(entrySeed);
 ac.lines.push({id:uuid(),entryId:entrySeed.id,accountId:accByCode('1000').id,debitCents:11600,creditCents:0,memo:'',createdAt:now()},
  {id:uuid(),entryId:entrySeed.id,accountId:accByCode('4000').id,debitCents:0,creditCents:10000,memo:'',createdAt:now()},
  {id:uuid(),entryId:entrySeed.id,accountId:accByCode('2100').id,debitCents:0,creditCents:1600,memo:'IVA 16%',createdAt:now()});
 // Proyectos (T025) y Mesa de ayuda (T028) de demostración: datos
 // ficticios, solo en esta pestaña. El catálogo ya trae T025/T028 (no
 // incluidas): se habilitan en este tenant demo, como T022. Kanban (T005)
 // también se habilita: el proyecto de ejemplo tiene tablero ligado.
 for(const [id,name] of [['T025','Proyectos'],['T028','Mesa de ayuda'],['T005','Kanban']]){
  const tool=first.tools.find(t=>t.id===id);
  if(tool)tool.enabled=true;
  else first.tools.push({id,name,group:'Operación',price:null,pricing:'quote',included:false,enabled:true});
 }
 const pj=first.projects;
 const ownerId='33333333-3333-4333-8333-333333333333';
 const projA={id:uuid(),name:'Rediseño de tienda en línea',description:'Proyecto de demostración: nueva tienda con catálogo y checkout.',clientId:first.clients[0].id,startsOn:dPlus(-10),endsOn:dPlus(40),status:'en curso',ownerUserId:ownerId,kanbanBoardId:null,createdAt:now(),updatedAt:now()};
 const projB={id:uuid(),name:'Apertura sucursal norte',description:'Proyecto de demostración en planificación.',clientId:null,startsOn:dPlus(15),endsOn:dPlus(90),status:'planificado',ownerUserId:null,kanbanBoardId:null,createdAt:now(),updatedAt:now()};
 pj.projects.push(projA,projB);
 pj.milestones.push(
  {id:uuid(),projectId:projA.id,title:'Mockups aprobados',dueOn:dPlus(-2),status:'completado',createdAt:now(),updatedAt:now()},
  {id:uuid(),projectId:projA.id,title:'Catálogo migrado',dueOn:dPlus(12),status:'pendiente',createdAt:now(),updatedAt:now()},
  {id:uuid(),projectId:projA.id,title:'Checkout en vivo',dueOn:dPlus(35),status:'pendiente',createdAt:now(),updatedAt:now()});
 first.tasks.push(
  {id:uuid(),title:'Revisar catálogo migrado',notes:'',assigneeUserId:ownerId,assigneeEmail:'superadmin@ejemplo.invalid',dueOn:dPlus(5),status:'pending',priority:'normal',sourceToolId:'T025',sourceRecordId:projA.id,notifiedAt:null,createdAt:now(),updatedAt:now()},
  {id:uuid(),title:'Probar checkout con tarjeta de prueba',notes:'',assigneeUserId:ownerId,assigneeEmail:'superadmin@ejemplo.invalid',dueOn:dPlus(20),status:'in_progress',priority:'high',sourceToolId:'T025',sourceRecordId:projA.id,notifiedAt:null,createdAt:now(),updatedAt:now()},
  {id:uuid(),title:'Aprobar diseño de inicio',notes:'',assigneeUserId:null,assigneeEmail:null,dueOn:dPlus(-3),status:'done',priority:'normal',sourceToolId:'T025',sourceRecordId:projA.id,notifiedAt:null,createdAt:now(),updatedAt:now()});
 const boardA={id:uuid(),name:'Tablero: Rediseño de tienda en línea',sourceToolId:'generic',
  phases:[{id:uuid(),title:'Por hacer',position:0},{id:uuid(),title:'En curso',position:1},{id:uuid(),title:'Hecho',position:2}],createdAt:now()};
 first.kanbanBoards.push(boardA);
 projA.kanbanBoardId=boardA.id;
 const hd=first.helpdesk;
 const tickA={id:uuid(),subject:'No llega la cotización',description:'El cliente no recibió el PDF de la cotización por correo.',clientId:first.clients[0].id,status:'abierto',priority:'alta',assigneeUserId:ownerId,createdAt:now(),updatedAt:now()};
 const tickB={id:uuid(),subject:'Error al entrar al portal',description:'El portal marca sesión expirada al entrar.',clientId:null,status:'en curso',priority:'urgente',assigneeUserId:null,createdAt:now(),updatedAt:now()};
 const tickC={id:uuid(),subject:'Duda sobre envío',description:'¿Cuánto tarda el envío a Monterrey?',clientId:first.clients[0].id,status:'resuelto',priority:'baja',assigneeUserId:ownerId,createdAt:now(),updatedAt:now()};
 hd.tickets.push(tickA,tickB,tickC);
 hd.replies.push({id:uuid(),ticketId:tickA.id,authorUserId:ownerId,authorEmail:'superadmin@ejemplo.invalid',body:'Lo revisamos ahora mismo y te confirmamos por aquí.',createdAt:now()},
  {id:uuid(),ticketId:tickC.id,authorUserId:ownerId,authorEmail:'superadmin@ejemplo.invalid',body:'El envío a Monterrey tarda 24 a 48 horas hábiles.',createdAt:now()});
 // Recursos Humanos (T026/T027/T031) de demostración: los empleados SON
 // los de T022 (mismo arreglo); documentos, jornada, solicitudes y nómina
 // viven en tenant.hr. Datos ficticios, solo en esta pestaña.
 for(const [id,name] of [['T026','Empleados'],['T027','Asistencia y vacaciones'],['T031','Nómina']]){
  const t=first.tools.find(x=>x.id===id);
  if(t)t.enabled=true;
  else first.tools.push({id,name,group:'Recursos Humanos',price:null,pricing:'quote',included:false,enabled:true});
 }
 const hr=first.hr;
 const todayStr=new Date().toISOString().slice(0,10);
 const y=new Date().getFullYear(),m=new Date().getMonth();
 const monthStart=new Date(y,m,1).toISOString().slice(0,10);
 const monthEnd=new Date(y,m+1,0).toISOString().slice(0,10);
 hr.documents.push(
  {id:uuid(),employeeId:empA.id,tipo:'contrato',nombre:'Contrato indefinido 2026.pdf',fecha:'2026-01-15',notas:'Firmado en original.',employeeName:empA.name,createdAt:now()},
  {id:uuid(),employeeId:empB.id,tipo:'identificación',nombre:'INE frente.jpg',fecha:'2026-03-01',notas:'',employeeName:empB.name,createdAt:now()});
 hr.workdays.push(
  {id:uuid(),employeeId:empA.id,fecha:todayStr,entrada:'09:00',salida:'18:00',notas:'',employeeName:empA.name,createdAt:now()},
  {id:uuid(),employeeId:empB.id,fecha:todayStr,entrada:'08:00',salida:'17:00',notas:'',employeeName:empB.name,createdAt:now()},
  {id:uuid(),employeeId:empA.id,fecha:dPlus(-1),entrada:'09:00',salida:'18:00',notas:'',employeeName:empA.name,createdAt:now()});
 hr.requests.push(
  {id:uuid(),employeeId:empB.id,tipo:'vacaciones',fechaInicio:dPlus(30),fechaFin:dPlus(32),motivo:'Descanso con familia.',estado:'pendiente',resueltaPor:null,resueltaAt:null,employeeName:empB.name,createdAt:now()},
  {id:uuid(),employeeId:empA.id,tipo:'vacaciones',fechaInicio:dPlus(5),fechaFin:dPlus(7),motivo:'Vacaciones de fin de año.',estado:'aprobada',resueltaPor:'33333333-3333-4333-8333-333333333333',resueltaAt:now(),employeeName:empA.name,createdAt:now()});
 hr.concepts.push(
  {id:uuid(),nombre:'Bono de puntualidad',tipo:'percepcion',modo:'fijo',montoCents:50000,porcentaje:null,activo:true,createdAt:now()},
  {id:uuid(),nombre:'Vales de despensa',tipo:'percepcion',modo:'porcentaje',montoCents:null,porcentaje:5,activo:true,createdAt:now()},
  {id:uuid(),nombre:'Préstamo',tipo:'deduccion',modo:'fijo',montoCents:20000,porcentaje:null,activo:true,createdAt:now()});
 hr.periods.push({id:uuid(),tipo:'mensual',fechaInicio:monthStart,fechaFin:monthEnd,estado:'borrador',createdAt:now(),updatedAt:now()});
 // Marketing (T029) y Punto de venta (T030) de demostración: datos
 // ficticios, solo en esta pestaña. El catálogo ya trae T029/T030 (no
 // incluidas): se habilitan en este tenant demo.
 for(const toolId of ['T029','T030']){
  const tool=first.tools.find(t=>t.id===toolId);
  if(tool)tool.enabled=true;
  else first.tools.push({id:toolId,name:toolId==='T029'?'Marketing':'Punto de venta',group:toolId==='T029'?'Marketing':'Finanzas',price:null,pricing:'quote',included:false,enabled:true});
 }
 const mk=first.marketing;
 const segAll={id:uuid(),name:'Todos los clientes',description:'Segmento de demostración: todos los clientes.',status:'',companyContains:'',createdAt:now(),updatedAt:now()};
 const segActive={id:uuid(),name:'Clientes activos',description:'Segmento de demostración: solo clientes activos.',status:'active',companyContains:'',createdAt:now(),updatedAt:now()};
 mk.segments.push(segAll,segActive);
 mk.campaigns.push({id:uuid(),name:'Oferta de apertura',subject:'10% en tu primera compra',content:'Hola, tenemos una oferta de apertura para ti. Visítanos y aprovecha el 10% en tu primera compra.',segmentId:segAll.id,status:'borrador',scheduledAt:null,sentAt:null,createdAt:now(),updatedAt:now()});
 first.catalogItems.push(
  {id:uuid(),sku:'DEMO-001',name:'Producto de muestra',description:'Producto de demostración con existencias.',priceCents:25000,category:'General',active:true,createdAt:now(),updatedAt:now()},
  {id:uuid(),sku:'CAFE-500',name:'Café molido 500 g',description:'Café de olla, bolsa de 500 g.',priceCents:8500,category:'Café',active:true,createdAt:now(),updatedAt:now()},
  {id:uuid(),sku:'PAN-DULCE',name:'Pan dulce',description:'Pieza de pan dulce.',priceCents:1500,category:'Pan',active:true,createdAt:now(),updatedAt:now()});
 first.cashboxes.push({id:uuid(),responsible:'Ana Ruiz',shift:'Matutino',openingCents:50000,status:'open',notes:'Caja de demostración',openedAt:now(),closedAt:null,countedCents:null,differenceCents:null});
 second.clients.push({id:uuid(),name:'Otro contacto de ejemplo',company:'Otra empresa',email:'otro@correo.invalid',phone:'',status:'active',notes:''});
 return {platformAppearance:{...appearanceDefaults},platformBackgrounds:{dashboard:null,sidebar:null},tenants:[first,second]};
}
export function createDemoStore(catalog,{load=()=>null,save=()=>{}}={}){
 let state=load();
 if(!state||!Array.isArray(state.tenants))state=initial(catalog);
 state.platformAppearance=normalizeTheme(state.platformAppearance||{});
 for(const tenant of state.tenants)tenant.appearance=normalizeTheme(tenant.appearance||{});
 state.platformBackgrounds=makeBackgrounds(state.platformBackgrounds);
 for(const tenant of state.tenants){
  tenant.backgrounds=makeBackgrounds(tenant.backgrounds);tenant.uploads=Array.isArray(tenant.uploads)?tenant.uploads:[];
  tenant.notifications=Array.isArray(tenant.notifications)?tenant.notifications:[];tenant.quotes=Array.isArray(tenant.quotes)?tenant.quotes:[];tenant.catalogItems=Array.isArray(tenant.catalogItems)?tenant.catalogItems:[];tenant.onboarding=tenant.onboarding&&typeof tenant.onboarding==='object'?tenant.onboarding:{steps:{},demoSeeded:[]};
  tenant.onboarding.steps=tenant.onboarding.steps&&typeof tenant.onboarding.steps==='object'?tenant.onboarding.steps:{};
  tenant.onboarding.demoSeeded=Array.isArray(tenant.onboarding.demoSeeded)?tenant.onboarding.demoSeeded:[];
  tenant.expenses=Array.isArray(tenant.expenses)?tenant.expenses:[];tenant.payments=Array.isArray(tenant.payments)?tenant.payments:[];
  tenant.invoices=Array.isArray(tenant.invoices)?tenant.invoices:[];tenant.invitations=Array.isArray(tenant.invitations)?tenant.invitations:[];tenant.audit=Array.isArray(tenant.audit)?tenant.audit:[];
  tenant.memberTools=tenant.memberTools&&typeof tenant.memberTools==='object'?tenant.memberTools:{};
  tenant.clientMerges=Array.isArray(tenant.clientMerges)?tenant.clientMerges:[];
  tenant.dealTasks=Array.isArray(tenant.dealTasks)?tenant.dealTasks:[];
  tenant.caseAccess=tenant.caseAccess&&typeof tenant.caseAccess==='object'?tenant.caseAccess:{};
  tenant.docSettings=tenant.docSettings&&typeof tenant.docSettings==='object'?tenant.docSettings:{};
  tenant.docAccess=tenant.docAccess&&typeof tenant.docAccess==='object'?tenant.docAccess:{};
  tenant.checklists=Array.isArray(tenant.checklists)?tenant.checklists:[];tenant.checklistTemplates=Array.isArray(tenant.checklistTemplates)?tenant.checklistTemplates:[];
  tenant.tasks=Array.isArray(tenant.tasks)?tenant.tasks:[];tenant.forms=Array.isArray(tenant.forms)?tenant.forms:[];
  tenant.formSubmissions=Array.isArray(tenant.formSubmissions)?tenant.formSubmissions:[];tenant.goals=Array.isArray(tenant.goals)?tenant.goals:[];
  tenant.variants=Array.isArray(tenant.variants)?tenant.variants:[];tenant.training=tenant.training&&typeof tenant.training==='object'?tenant.training:{courses:[],sessions:[],employees:[],enrollments:[],attendance:[],progress:[],modules:[],attempts:[],evaluations:[],certificates:[],completions:[]};
  tenant.accounting=tenant.accounting&&typeof tenant.accounting==='object'?tenant.accounting:{accounts:[],entries:[],lines:[]};
  tenant.accounting.accounts=Array.isArray(tenant.accounting.accounts)?tenant.accounting.accounts:[];
  tenant.accounting.entries=Array.isArray(tenant.accounting.entries)?tenant.accounting.entries:[];
  tenant.accounting.lines=Array.isArray(tenant.accounting.lines)?tenant.accounting.lines:[];
  tenant.salesOrders=tenant.salesOrders&&typeof tenant.salesOrders==='object'?tenant.salesOrders:{orders:[],lines:[]};
  tenant.salesOrders.orders=Array.isArray(tenant.salesOrders.orders)?tenant.salesOrders.orders:[];
  tenant.salesOrders.lines=Array.isArray(tenant.salesOrders.lines)?tenant.salesOrders.lines:[];
  tenant.receivables=Array.isArray(tenant.receivables)?tenant.receivables:[];
  for(const k of ['courses','sessions','employees','enrollments','attendance','progress','modules','attempts','evaluations','certificates','completions'])tenant.training[k]=Array.isArray(tenant.training[k])?tenant.training[k]:[];
  tenant.projects=tenant.projects&&typeof tenant.projects==='object'?tenant.projects:{projects:[],milestones:[]};
  tenant.projects.projects=Array.isArray(tenant.projects.projects)?tenant.projects.projects:[];
  tenant.projects.milestones=Array.isArray(tenant.projects.milestones)?tenant.projects.milestones:[];
  tenant.helpdesk=tenant.helpdesk&&typeof tenant.helpdesk==='object'?tenant.helpdesk:{tickets:[],replies:[]};
  tenant.helpdesk.tickets=Array.isArray(tenant.helpdesk.tickets)?tenant.helpdesk.tickets:[];
  tenant.helpdesk.replies=Array.isArray(tenant.helpdesk.replies)?tenant.helpdesk.replies:[];
  tenant.kanbanBoards=Array.isArray(tenant.kanbanBoards)?tenant.kanbanBoards:[];
  tenant.hr=tenant.hr&&typeof tenant.hr==='object'?tenant.hr:{documents:[],workdays:[],requests:[],periods:[],concepts:[],receipts:[],receiptItems:[]};
  for(const k of ['documents','workdays','requests','periods','concepts','receipts','receiptItems'])tenant.hr[k]=Array.isArray(tenant.hr[k])?tenant.hr[k]:[];
  tenant.cases=Array.isArray(tenant.cases)?tenant.cases:[];tenant.caseEvents=Array.isArray(tenant.caseEvents)?tenant.caseEvents:[];tenant.caseDocumentMeta=tenant.caseDocumentMeta&&typeof tenant.caseDocumentMeta==='object'?tenant.caseDocumentMeta:{};tenant.entityLinks=Array.isArray(tenant.entityLinks)?tenant.entityLinks:[];
  if(tenant.slug==='comercio-demo'){
   const sampleClient=tenant.clients.find(c=>c.name==='Contacto de ejemplo');
   const sampleDeal=tenant.deals.find(d=>d.title==='Oportunidad de demostración');
   const sampleAppointment=tenant.events.find(e=>e.title==='Reunión de ejemplo');
   if(sampleClient&&sampleDeal&&!sampleDeal.clientId)sampleDeal.clientId=sampleClient.id;
   if(sampleClient&&sampleAppointment&&!sampleAppointment.clientId)sampleAppointment.clientId=sampleClient.id;
   if(sampleDeal&&sampleAppointment&&!sampleAppointment.dealId)sampleAppointment.dealId=sampleDeal.id;
  }
 }
 const sync=()=>save(copy(state));
 const tenantById=id=>{const t=state.tenants.find(t=>t.id===id);if(!t)throw error('Not found',404);return t;};
 const tenantBySlug=slug=>{const t=state.tenants.find(t=>t.slug===slug&&t.status==='active');if(!t)throw error('Not found',404);return t;};
 const allowed=(t,id)=>{if(!t.tools.some(x=>x.id===id&&x.enabled))throw error('Tool disabled',403);};
 const bodyOf=o=>{try{return typeof o.body==='string'?JSON.parse(o.body):o.body||{};}catch{throw error('Invalid JSON');}};
 const getRecord=(items,id)=>{const found=items.find(r=>r.id===id);if(!found)throw error('Not found',404);return found;};
 const emit=v=>copy(v);
 // Invitaciones y auditoría (demo): mismo contrato que el API real. La
 // lista de acciones es la de platform/audit.mjs (fuente de verdad); el
 // token vive en claro solo en sessionStorage de esta pestaña (demo), en
 // producción solo se guarda su hash (platform/invitations.mjs).
 const demoAuditActions=['agenda.appointment_created','agenda.appointment_status','agenda.appointment_updated','appearance.platform_updated','appearance.tenant_updated','archived','cases.created','cases.document_updated','cases.updated','catalog.archived','catalog.created','catalog.updated','clients.archived','clients.created','clients.updated','crm.deal_archived','crm.deal_created','crm.deal_updated','entities.linked','entities.unlinked','expenses.archived','expenses.created','expenses.updated','inventory.item_created','inventory.item_updated','inventory.stock_moved','invoices.archived','invoices.created','media.attachment_removed','media.attachment_uploaded','payments.archived','payments.created','payments.updated','quotes.archived','quotes.created','quotes.updated','survey.response_received','training.attempt_recorded','training.certificate_issued','training.course_created','training.enrollment_created','accounting.account_created','accounting.entry_created','accounting.entry_registered','sales_orders.order_created','sales_orders.payment_created','sales_orders.invoice_created','sales_orders.receivable_created','projects.project_created','projects.milestone_completed','projects.board_created','helpdesk.ticket_created','helpdesk.ticket_assigned','helpdesk.reply_added','kanban.board_created','marketing.campaign_created','marketing.campaign_sent','pos.sale_created','tenant.created','tenant.invitation_accepted','tenant.invitation_created','tenant.invitation_resent','tenant.invitation_revoked','tenant.member_activated','tenant.member_added','tenant.member_suspended','tenant.record_archived','tenant.record_created','tenant.record_updated','tenant.tool_disabled','tenant.tool_enabled','tenant.updated'];
 const demoAudit=(t,action,targetId)=>{t.audit.unshift({id:uuid(),organizationId:t.id,actorUserId:'33333333-3333-4333-8333-333333333333',actorEmail:'superadmin@ejemplo.invalid',action,targetType:'organization_invitation',targetId,occurredAt:now()});};
 const demoInviteStatus=i=>i.consumedAt?'consumed':Date.parse(i.expiresAt)<=Date.now()?'expired':'pending';
 const demoPublicInvite=i=>({id:i.id,organizationId:i.organizationId,email:i.email,role:i.role,expiresAt:i.expiresAt,consumedAt:i.consumedAt,createdAt:i.createdAt,status:demoInviteStatus(i)});
 const demoAuditFilter=(list,url)=>{
  let out=[...list];
  const tenant=url.searchParams.get('tenant'),actor=url.searchParams.get('actor'),action=url.searchParams.get('action'),from=url.searchParams.get('from'),to=url.searchParams.get('to');
  const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit'))||50));
  if(tenant)out=out.filter(e=>e.organizationId===tenant);
  if(action)out=out.filter(e=>e.action===action);
  if(actor)out=out.filter(e=>e.actorUserId===actor||e.actorEmail===actor);
  if(from)out=out.filter(e=>e.occurredAt>=from);
  if(to)out=out.filter(e=>e.occurredAt<=to);
  return out.sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,limit);
 };
 const demoInviteLink=token=>'https://hubie-demo.invalid/invitacion?token='+token;
 const invitationsHandler=(t,invId,action,method,input,send)=>{
  if(action==='resend'&&method==='POST'){
   const inv=getRecord(t.invitations,invId);
   const status=demoInviteStatus(inv);
   if(status!=='pending')throw error(status==='consumed'?'Invitation already used':'Invitation expired',410);
   inv.token=uuid().replace(/-/g,'')+uuid().replace(/-/g,'');inv.expiresAt=new Date(Date.now()+7*86400000).toISOString();
   demoAudit(t,'tenant.invitation_resent',inv.id);
   return send({invitation:demoPublicInvite(inv),token:inv.token,inviteUrl:demoInviteLink(inv.token),emailSent:false,emailReason:'email-not-configured'});
  }
  if(invId&&method==='DELETE'){
   const inv=getRecord(t.invitations,invId);
   t.invitations.splice(t.invitations.indexOf(inv),1);
   demoAudit(t,'tenant.invitation_revoked',inv.id);
   return send({revoked:true});
  }
  if(method==='GET')return emit({invitations:t.invitations.map(demoPublicInvite),emailConfigured:false});
  if(method==='POST'){
   const email=String(input.email||'').trim().toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['admin','member','viewer'].includes(input.role))throw error('Invalid invitation');
   if(t.invitations.some(i=>i.email===email&&demoInviteStatus(i)==='pending'))throw error('Duplicate invitation',409);
   const inv={id:uuid(),organizationId:t.id,email,role:input.role,token:uuid().replace(/-/g,'')+uuid().replace(/-/g,''),expiresAt:new Date(Date.now()+7*86400000).toISOString(),consumedAt:null,createdAt:now()};
   t.invitations.unshift(inv);
   demoAudit(t,'tenant.invitation_created',inv.id);
   return send({invitation:demoPublicInvite(inv),token:inv.token,inviteUrl:demoInviteLink(inv.token),emailSent:false,emailReason:'email-not-configured'});
  }
  throw error('Not found',404);
 };
 async function request(path,options={}){
  const url=new URL(path,'https://hubie-demo.invalid');
  const p=url.pathname,method=(options.method||'GET').toUpperCase(),input=bodyOf(options);
  const send=data=>{sync();return emit(data);};
  const registry=tool=>({C001:'clients',C002:'deals',C003:'cases',C004:'events',C005:'items'})[tool];
  const entityList=(tenant,tool)=>{
   if(!catalog.tools.some(item=>item.id===tool)||['C008','C009'].includes(tool))throw error('Not found',404);
   const key=registry(tool);
   const list=key?tenant[key]:(tenant.generic[tool]||[]);
   return list.filter(x=>!x.archivedAt);
  };
  const entity=(tenant,tool,id)=>getRecord(entityList(tenant,tool),id);
  const canonical=(aTool,aId,bTool,bId)=>{
   if(aTool===bTool&&aId===bId)throw error('Invalid relation');
   const left=aTool+':'+aId,right=bTool+':'+bId;
   return left<right?[aTool,aId,bTool,bId]:[bTool,bId,aTool,aId];
  };
  const clientSummaryRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/clients\/([a-z0-9-]+)\/summary$/);
  if(clientSummaryRoute&&method==='GET'){
   const tenant=tenantBySlug(clientSummaryRoute[1]);allowed(tenant,'C001');
   const client=entity(tenant,'C001',clientSummaryRoute[2]);
   const enable=tool=>tenant.tools.some(x=>x.id===tool&&x.enabled);
   const deals=enable('C002')?entityList(tenant,'C002').filter(x=>x.clientId===client.id).map(x=>({id:x.id,title:x.title,stage:x.stage,amountCents:x.amountCents,followUpAt:x.followUpAt})):[];
   const cases=enable('C003')?entityList(tenant,'C003').filter(x=>x.clientId===client.id).map(x=>({id:x.id,title:x.title,kind:x.kind,status:x.status,updatedAt:x.updatedAt})):[];
   const appointments=enable('C004')?entityList(tenant,'C004').filter(x=>x.clientId===client.id).map(x=>({id:x.id,title:x.title,startsAt:x.startsAt,status:x.status})):[];
   const quotes=enable('T013')?tenant.quotes.filter(x=>x.clientId===client.id&&!x.archivedAt).map(x=>({id:x.id,title:x.title,status:x.status,totalCents:x.totalCents,updatedAt:x.updatedAt})):[];
   return emit({client,deals,cases,appointments,quotes,counts:{deals:deals.length,cases:cases.length,appointments:appointments.length,quotes:quotes.length}});
  }
  // TOOLS P0 (021): línea de tiempo, duplicados/fusión, tareas y cotizaciones
  // del trato, búsqueda/vencimientos/acceso de expedientes y permisos por módulo.
  const p0expiry=expiresOn=>{
   if(!expiresOn)return 'none';
   const today=new Date().toISOString().slice(0,10);
   const days=(Date.parse(expiresOn+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000;
   return days<0?'expired':days<=30?'soon':'valid';
  };
  const p0defaultAccess=(role,tool)=>tool==='C009'?['owner','admin'].includes(role)?'read':'none':role==='viewer'?'read':'write';
  const p0memberToolsList=t=>({members:t.members.map(m=>({...m,tools:Object.fromEntries(
   ['C001','C002','C003','C004','C005','C006','C007','T013','T014','T015','T020'].map(tool=>
    [tool,(t.memberTools[m.id]||{})[tool]||p0defaultAccess(m.role,tool)]))}))});
  const p0searchDocs=(tenant,{term='',type='',expiry='',caseId=''}={})=>{
   const docs=[];
   for(const [documentId,meta] of Object.entries(tenant.caseDocumentMeta)){
    const dossier=tenant.cases.find(c=>c.id===meta.caseId&&!c.archivedAt);if(!dossier)continue;
    if(caseId&&meta.caseId!==caseId)continue;
    if(type&&meta.documentType!==type)continue;
    const status=p0expiry(meta.expiresOn);if(expiry&&status!==expiry)continue;
    const files=tenant.uploads.filter(x=>x.toolId==='C003'&&x.documentId===documentId);
    const latest=files.sort((a,b)=>(b.version||1)-(a.version||1))[0];
    const filename=latest?.filename||'';
    const client=tenant.clients.find(c=>c.id===dossier.clientId);
    if(term&&!(filename.toLowerCase().includes(term)||dossier.title.toLowerCase().includes(term)||(client?.name||'').toLowerCase().includes(term)))continue;
    docs.push({documentId,caseId:meta.caseId,caseTitle:dossier.title,clientId:dossier.clientId,
     clientName:client?.name||'',filename,documentType:meta.documentType,expiresOn:meta.expiresOn||null,
     expiryStatus:status,latestVersion:meta.nextVersion||1,visibility:tenant.docSettings[documentId]||'team'});
   }
   return docs;
  };
  const timelineRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/clients\/([a-z0-9-]+)\/timeline$/);
  if(timelineRoute&&method==='GET'){
   const tenant=tenantBySlug(timelineRoute[1]);allowed(tenant,'C001');
   const client=entity(tenant,'C001',timelineRoute[2]);
   const enable=tool=>tenant.tools.some(x=>x.id===tool&&x.enabled);
   const timeline=[];
   const push=(kind,toolId,recordId,title,detail,at)=>{if(at)timeline.push({kind,toolId,recordId,title,detail:detail||'',at});};
   if(enable('C002'))for(const d of entityList(tenant,'C002').filter(x=>x.clientId===client.id))push('deal','C002',d.id,d.title,'Etapa: '+d.stage+' · '+(d.amountCents/100).toFixed(2)+' MXN',d.updatedAt||d.createdAt);
   if(enable('C003')){
    for(const c of entityList(tenant,'C003').filter(x=>x.clientId===client.id))push('case','C003',c.id,c.title,c.kind+' · '+c.status,c.updatedAt||c.createdAt);
    for(const e of tenant.caseEvents.filter(x=>tenant.cases.some(c=>c.id===x.caseId&&c.clientId===client.id))){
     const dossier=tenant.cases.find(c=>c.id===e.caseId);
     push('case_event','C003',e.caseId,dossier?.title||'Expediente',e.action+': '+e.description,e.createdAt);
    }
   }
   if(enable('C004'))for(const e of entityList(tenant,'C004').filter(x=>x.clientId===client.id))push('appointment','C004',e.id,e.title,e.status,e.startsAt);
   if(enable('T013'))for(const q of tenant.quotes.filter(x=>x.clientId===client.id&&!x.archivedAt))push('quote','T013',q.id,q.title,q.status+' · '+(q.totalCents/100).toFixed(2)+' MXN',q.updatedAt||q.createdAt);
   timeline.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
   const counts={};for(const e of timeline)counts[e.kind]=(counts[e.kind]||0)+1;
   return emit({client,timeline:timeline.slice(0,100),counts});
  }
  const dupRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/clients\/duplicates$/);
  if(dupRoute&&method==='GET'){
   const tenant=tenantBySlug(dupRoute[1]);allowed(tenant,'C001');
   const groups=new Map();
   for(const c of entityList(tenant,'C001')){
    if(!c.email)continue;
    const key=c.email.trim().toLowerCase();
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({...c,relations:{
     deals:entityList(tenant,'C002').filter(d=>d.clientId===c.id).length,
     cases:entityList(tenant,'C003').filter(x=>x.clientId===c.id).length,
     quotes:tenant.quotes.filter(q=>q.clientId===c.id&&!q.archivedAt).length}});
   }
   return emit({duplicates:[...groups].filter(([,m])=>m.length>1).map(([email,clients])=>({email,clients}))});
  }
  const mergeRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/clients\/([a-z0-9-]+)\/merge$/);
  if(mergeRoute&&method==='POST'){
   const tenant=tenantBySlug(mergeRoute[1]);allowed(tenant,'C001');
   const kept=entity(tenant,'C001',mergeRoute[2]);
   const merged=entity(tenant,'C001',input.mergedClientId);
   if(kept.id===merged.id||kept.email.trim().toLowerCase()!==merged.email.trim().toLowerCase())throw error('Invalid merge');
   const reason=typeof input.reason==='string'?input.reason.slice(0,500):'';
   for(const d of tenant.deals)if(d.clientId===merged.id)d.clientId=kept.id;
   for(const e of tenant.events)if(e.clientId===merged.id)e.clientId=kept.id;
   for(const c of tenant.cases)if(c.clientId===merged.id)c.clientId=kept.id;
   for(const q of tenant.quotes)if(q.clientId===merged.id)q.clientId=kept.id;
   for(const pay of tenant.payments)if(pay.clientId===merged.id)pay.clientId=kept.id;
   merged.archivedAt=now();
   const merge={id:uuid(),keptClientId:kept.id,mergedClientId:merged.id,reason,createdAt:now()};
   tenant.clientMerges.push(merge);
   return send({merged:true,mergeId:merge.id,keptClientId:kept.id,mergedClientId:merged.id});
  }
  const dealTasksRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/crm\/([a-z0-9-]+)\/tasks(?:\/([a-z0-9-]+))?$/);
  if(dealTasksRoute){
   const tenant=tenantBySlug(dealTasksRoute[1]);allowed(tenant,'C002');
   const deal=getRecord(entityList(tenant,'C002'),dealTasksRoute[2]);
   const taskId=dealTasksRoute[3];
   const normTask=()=>{
    const title=String(input.title||'').trim(),dueAt=input.dueAt||null,status=input.status||'todo',assignedUserId=input.assignedUserId||null;
    if(title.length<2||title.length>180||!['todo','doing','done'].includes(status)||dueAt&&!Number.isFinite(Date.parse(dueAt))||assignedUserId&&!tenant.members.some(m=>m.id===assignedUserId&&m.status==='active'))throw error('Invalid deal task');
    return {title,dueAt,status,assignedUserId};
   };
   if(method==='GET')return emit({tasks:tenant.dealTasks.filter(t=>t.dealId===deal.id),statuses:['todo','doing','done']});
   if(method==='POST'){
    const task={id:uuid(),dealId:deal.id,...normTask(),createdAt:now(),updatedAt:now(),completedAt:null};
    if(task.status==='done')task.completedAt=now();
    tenant.dealTasks.unshift(task);return send({task});
   }
   const task=getRecord(tenant.dealTasks.filter(t=>t.dealId===deal.id),taskId);
   if(method==='DELETE'){tenant.dealTasks.splice(tenant.dealTasks.indexOf(task),1);return send({archived:true});}
   const data=normTask();
   Object.assign(task,data,{updatedAt:now(),completedAt:data.status==='done'?(task.completedAt||now()):null});
   return send({ok:true});
  }
  const dealQuotesRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/crm\/([a-z0-9-]+)\/quotes(?:\/([a-z0-9-]+))?$/);
  if(dealQuotesRoute){
   const tenant=tenantBySlug(dealQuotesRoute[1]);allowed(tenant,'C002');
   const deal=getRecord(entityList(tenant,'C002'),dealQuotesRoute[2]);
   const quoteId=dealQuotesRoute[3];
   if(method==='GET')return emit({quotes:tenant.quotes.filter(q=>q.dealId===deal.id&&!q.archivedAt).map(q=>({id:q.id,clientId:q.clientId,clientName:q.clientName,title:q.title,status:q.status,totalCents:q.totalCents,createdAt:q.createdAt,updatedAt:q.updatedAt}))});
   if(method==='POST'){
    allowed(tenant,'T013');
    const quote=tenant.quotes.find(q=>q.id===quoteId&&!q.archivedAt);if(!quote)throw error('Not found',404);
    if(deal.clientId&&quote.clientId&&deal.clientId!==quote.clientId)throw error('Relation mismatch',409);
    if(quote.dealId===deal.id)throw error('Duplicate relation',409);
    quote.dealId=deal.id;quote.updatedAt=now();return send({linked:true,dealId:deal.id,quoteId});
   }
   if(method==='DELETE'){
    const quote=tenant.quotes.find(q=>q.id===quoteId&&!q.archivedAt);if(!quote||quote.dealId!==deal.id)throw error('Not found',404);
    quote.dealId=null;quote.updatedAt=now();return send({removed:true});
   }
   throw error('Not found',404);
  }
  const quoteDealRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/quotes\/([a-z0-9-]+)\/deal$/);
  if(quoteDealRoute&&method==='GET'){
   const tenant=tenantBySlug(quoteDealRoute[1]);allowed(tenant,'T013');
   const quote=tenant.quotes.find(q=>q.id===quoteDealRoute[2]&&!q.archivedAt);if(!quote)throw error('Not found',404);
   const deal=quote.dealId?tenant.deals.find(d=>d.id===quote.dealId&&!d.archivedAt):null;
   return emit({deal:deal?{id:deal.id,title:deal.title}:null});
  }
  const docSearchRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/cases\/documents\/search$/);
  if(docSearchRoute&&method==='GET'){
   const tenant=tenantBySlug(docSearchRoute[1]);allowed(tenant,'C003');
   const term=(url.searchParams.get('q')||'').trim().toLowerCase();
   const type=url.searchParams.get('type')||'',expiry=url.searchParams.get('expiry')||'',caseId=url.searchParams.get('caseId')||'';
   if(term.length>120||type&&!['other','contract','identification','invoice','consent','certificate'].includes(type)||expiry&&!['expired','soon','valid','none'].includes(expiry))throw error('Invalid document');
   return emit({documents:p0searchDocs(tenant,{term,type,expiry,caseId}).slice(0,100)});
  }
  const docExpiringRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/cases\/documents\/expiring$/);
  if(docExpiringRoute&&method==='GET'){
   const tenant=tenantBySlug(docExpiringRoute[1]);allowed(tenant,'C003');
   return emit({expired:p0searchDocs(tenant,{expiry:'expired'}),expiringSoon:p0searchDocs(tenant,{expiry:'soon'}),
    counts:{expired:p0searchDocs(tenant,{expiry:'expired'}).length,expiringSoon:p0searchDocs(tenant,{expiry:'soon'}).length}});
  }
  const caseLinksRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/cases\/([a-z0-9-]+)\/links$/);
  if(caseLinksRoute&&method==='GET'){
   const tenant=tenantBySlug(caseLinksRoute[1]);allowed(tenant,'C003');
   const dossier=getRecord(entityList(tenant,'C003'),caseLinksRoute[2]);
   const client=tenant.clients.find(c=>c.id===dossier.clientId);
   const enable=tool=>tenant.tools.some(x=>x.id===tool&&x.enabled);
   return emit({client:client?{id:client.id,name:client.name}:null,
    deals:enable('C002')?entityList(tenant,'C002').filter(d=>d.clientId===dossier.clientId).map(d=>({id:d.id,title:d.title,stage:d.stage})):[],
    appointments:enable('C004')?entityList(tenant,'C004').filter(e=>e.clientId===dossier.clientId).map(e=>({id:e.id,title:e.title,startsAt:e.startsAt,status:e.status})):[],
    quotes:enable('T013')?tenant.quotes.filter(q=>q.clientId===dossier.clientId&&!q.archivedAt).map(q=>({id:q.id,title:q.title,status:q.status,totalCents:q.totalCents})):[],
    explicit:tenant.entityLinks.filter(x=>(x.leftToolId==='C003'&&x.leftRecordId===dossier.id)||(x.rightToolId==='C003'&&x.rightRecordId===dossier.id)).map(x=>({id:x.id,targetToolId:x.leftToolId==='C003'?x.rightToolId:x.leftToolId,targetRecordId:x.leftToolId==='C003'?x.rightRecordId:x.leftRecordId,relationType:x.relationType}))});
  }
  const caseAccessRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/cases\/([a-z0-9-]+)\/access$/);
  if(caseAccessRoute){
   const tenant=tenantBySlug(caseAccessRoute[1]);allowed(tenant,'C003');
   const dossier=getRecord(entityList(tenant,'C003'),caseAccessRoute[2]);
   if(method==='GET')return emit({grants:tenant.caseAccess[dossier.id]||[]});
   if(method==='PUT'){
    const {userId,access}=input;
    if(access!==null&&access!==undefined&&!['read','write'].includes(access))throw error('Invalid document');
    const member=tenant.members.find(m=>m.id===userId&&m.status==='active');if(!member)throw error('Not found',404);
    const grants=tenant.caseAccess[dossier.id]??(tenant.caseAccess[dossier.id]=[]);
    if(access===null||access===undefined)tenant.caseAccess[dossier.id]=grants.filter(g=>g.userId!==userId);
    else{const g=grants.find(g=>g.userId===userId);if(g)g.access=access;else grants.push({userId,email:member.email,access});}
    tenant.caseEvents.unshift({id:uuid(),caseId:dossier.id,action:'updated',description:'Acceso del expediente actualizado',createdAt:now()});
    return send({ok:true});
   }
   throw error('Not found',404);
  }
  const docVisRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/case-documents\/([a-z0-9-]+)\/visibility$/);
  if(docVisRoute&&method==='PATCH'){
   const tenant=tenantBySlug(docVisRoute[1]);allowed(tenant,'C003');
   const meta=tenant.caseDocumentMeta[docVisRoute[2]];if(!meta)throw error('Not found',404);
   if(!['team','restricted'].includes(input.visibility))throw error('Invalid document');
   tenant.docSettings[docVisRoute[2]]=input.visibility;
   tenant.caseEvents.unshift({id:uuid(),caseId:meta.caseId,action:'updated',description:'Visibilidad del documento: '+input.visibility,createdAt:now()});
   return send({ok:true,visibility:input.visibility});
  }
  const docAccessRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/case-documents\/([a-z0-9-]+)\/access$/);
  if(docAccessRoute){
   const tenant=tenantBySlug(docAccessRoute[1]);allowed(tenant,'C003');
   const meta=tenant.caseDocumentMeta[docAccessRoute[2]];if(!meta)throw error('Not found',404);
   if(method==='GET')return emit({visibility:tenant.docSettings[docAccessRoute[2]]||'team',caseId:meta.caseId,grants:tenant.docAccess[docAccessRoute[2]]||[]});
   if(method==='PUT'){
    const {userId,access}=input;
    if(access!==null&&access!==undefined&&!['read','write'].includes(access))throw error('Invalid document');
    const member=tenant.members.find(m=>m.id===userId&&m.status==='active');if(!member)throw error('Not found',404);
    const grants=tenant.docAccess[docAccessRoute[2]]??(tenant.docAccess[docAccessRoute[2]]=[]);
    if(access===null||access===undefined)tenant.docAccess[docAccessRoute[2]]=grants.filter(g=>g.userId!==userId);
    else{const g=grants.find(g=>g.userId===userId);if(g)g.access=access;else grants.push({userId,email:member.email,access});}
    tenant.caseEvents.unshift({id:uuid(),caseId:meta.caseId,action:'updated',description:'Acceso del documento actualizado',createdAt:now()});
    return send({ok:true});
   }
   throw error('Not found',404);
  }
  const memberToolsRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/member-tools(?:\/([a-z0-9-]+))?$/);
  if(memberToolsRoute){
   const tenant=tenantBySlug(memberToolsRoute[1]);
   const userId=memberToolsRoute[2];
   if(method==='GET'){
    if(!userId){
     const access={};
     for(const t of tenant.tools.filter(t=>t.enabled))access[t.id]=p0defaultAccess('owner',t.id);
     return emit({role:'owner',access});
    }
    return emit(p0memberToolsList(tenant));
   }
   if(method==='PUT'){
    const member=getRecord(tenant.members,userId);
    const tools=input.tools||{};
    if(typeof tools!=='object'||Array.isArray(tools)||Object.entries(tools).some(([tool,a])=>!catalog.tools.some(t=>t.id===tool)||!['none','read','write'].includes(a)))throw error('Invalid tenant data');
    const kept={};
    for(const [tool,a] of Object.entries(tools))if(a!==p0defaultAccess(member.role,tool))kept[tool]=a;
    tenant.memberTools[member.id]=kept;
    return send(p0memberToolsList(tenant));
   }
   throw error('Not found',404);
  }
  const adminMemberToolsRoute=p.match(/^\/api\/admin\/tenants\/([a-z0-9-]+)\/members\/([a-z0-9-]+)\/tools$/);
  if(adminMemberToolsRoute){
   const tenant=tenantById(adminMemberToolsRoute[1]);
   const member=getRecord(tenant.members,adminMemberToolsRoute[2]);
   if(method==='GET')return emit(p0memberToolsList(tenant));
   if(method==='PUT'){
    const tools=input.tools||{};
    if(typeof tools!=='object'||Array.isArray(tools)||Object.entries(tools).some(([tool,a])=>!catalog.tools.some(t=>t.id===tool)||!['none','read','write'].includes(a)))throw error('Invalid tenant data');
    const kept={};
    for(const [tool,a] of Object.entries(tools))if(a!==p0defaultAccess(member.role,tool))kept[tool]=a;
    tenant.memberTools[member.id]=kept;
    return send(p0memberToolsList(tenant));
   }
   throw error('Not found',404);
  }
  const relationOptions=p.match(/^\/api\/app\/([a-z0-9-]+)\/relations\/options\/([A-Z][0-9]{3})$/);
  if(relationOptions&&method==='GET'){
   const tenant=tenantBySlug(relationOptions[1]),tool=relationOptions[2];allowed(tenant,tool);
   return emit({records:entityList(tenant,tool).slice(0,120).map(x=>({id:x.id,title:x.title||x.name}))});
  }
  const relationTarget=p.match(/^\/api\/app\/([a-z0-9-]+)\/tools\/([A-Z][0-9]{3})\/records\/([a-z0-9-]+)\/links$/);
  if(relationTarget){
   const tenant=tenantBySlug(relationTarget[1]),tool=relationTarget[2],recordId=relationTarget[3];
   allowed(tenant,tool);entity(tenant,tool,recordId);
   if(method==='GET'){
    const links=tenant.entityLinks.filter(x=>x.leftToolId===tool&&x.leftRecordId===recordId||x.rightToolId===tool&&x.rightRecordId===recordId)
     .map(x=>{
      const targetToolId=x.leftToolId===tool&&x.leftRecordId===recordId?x.rightToolId:x.leftToolId;
      const targetRecordId=x.leftToolId===tool&&x.leftRecordId===recordId?x.rightRecordId:x.leftRecordId;
      if(!tenant.tools.some(x=>x.id===targetToolId&&x.enabled))return null;
      const target=entityList(tenant,targetToolId).find(x=>x.id===targetRecordId);
      if(!target)return null;
      return {id:x.id,targetToolId,targetRecordId,title:target.title||target.name,toolName:catalog.tools.find(t=>t.id===targetToolId)?.name,relationType:x.relationType};
     }).filter(Boolean);
    const implied=[];
    if(tool==='C001'){
     implied.push(...entityList(tenant,'C002').filter(d=>d.clientId===recordId).map(x=>['C002',x.id]));
     implied.push(...entityList(tenant,'C003').filter(c=>c.clientId===recordId).map(x=>['C003',x.id]));
     implied.push(...entityList(tenant,'C004').filter(e=>e.clientId===recordId).map(x=>['C004',x.id]));
    }else if(tool==='C002'){
     const deal=entity(tenant,tool,recordId);
     if(deal.clientId)implied.push(['C001',deal.clientId]);
     implied.push(...entityList(tenant,'C004').filter(e=>e.dealId===recordId).map(x=>['C004',x.id]));
    }else if(tool==='C003'){
     const dossier=entity(tenant,tool,recordId);
     if(dossier.clientId)implied.push(['C001',dossier.clientId]);
    }else if(tool==='C004'){
     const appointment=entity(tenant,tool,recordId);
     if(appointment.clientId)implied.push(['C001',appointment.clientId]);
     if(appointment.dealId)implied.push(['C002',appointment.dealId]);
    }
    for(const [targetToolId,targetRecordId]of implied){
     if(!tenant.tools.some(t=>t.id===targetToolId&&t.enabled)||
       links.some(link=>link.targetToolId===targetToolId&&link.targetRecordId===targetRecordId))continue;
     const target=entityList(tenant,targetToolId).find(x=>x.id===targetRecordId);
     if(target)links.push({id:null,targetToolId,targetRecordId,title:target.title||target.name,
      toolName:catalog.tools.find(t=>t.id===targetToolId)?.name,relationType:'related',builtIn:true});
    }
    return emit({links});
   }
   if(method==='POST'){
    if(Object.keys(input).some(k=>!['targetToolId','targetRecordId','relationType'].includes(k)))throw error('Invalid relation');
    const targetTool=input.targetToolId,targetId=input.targetRecordId,type=input.relationType||'related';
    if(!['related','depends_on','supports'].includes(type))throw error('Invalid relation');
    allowed(tenant,targetTool);entity(tenant,targetTool,targetId);
    const [leftToolId,leftRecordId,rightToolId,rightRecordId]=canonical(tool,recordId,targetTool,targetId);
    if(tenant.entityLinks.some(x=>x.leftToolId===leftToolId&&x.leftRecordId===leftRecordId&&x.rightToolId===rightToolId&&x.rightRecordId===rightRecordId))throw error('Duplicate relation',409);
    const link={id:uuid(),leftToolId,leftRecordId,rightToolId,rightRecordId,relationType:type,createdAt:now()};
    tenant.entityLinks.push(link);return send({link});
   }
  }
  const deleteRelation=p.match(/^\/api\/app\/([a-z0-9-]+)\/relations\/([a-z0-9-]+)$/);
  if(deleteRelation&&method==='DELETE'){
   const tenant=tenantBySlug(deleteRelation[1]),link=getRecord(tenant.entityLinks,deleteRelation[2]);
   allowed(tenant,link.leftToolId);allowed(tenant,link.rightToolId);
   tenant.entityLinks.splice(tenant.entityLinks.indexOf(link),1);return send({removed:true});
  }
  // Media endpoints deliberately never call the network: demo storage belongs to this tab only.
  const platformMedia=p.match(/^\/api\/admin\/media\/(dashboard|sidebar)$/);
  const adminMedia=p.match(/^\/api\/admin\/tenants\/([0-9a-f-]+)\/media\/(dashboard|sidebar)$/);
  const suiteMedia=p.match(/^\/api\/app\/([a-z0-9-]+)\/media\/(dashboard|sidebar)$/);
  if(platformMedia||adminMedia||suiteMedia){
   const target=platformMedia?state.platformBackgrounds:adminMedia?tenantById(adminMedia[1]).backgrounds:tenantBySlug(suiteMedia[1]).backgrounds;
   const kind=(platformMedia||adminMedia||suiteMedia)[platformMedia?1:2];
   if(method==='POST'){
    const file=demoMedia(input);
    if(!file.mime.startsWith('image/')||file.size>900000)throw error('Invalid media');
    target[kind]=dataUrl(file);return send({backgrounds:makeBackgrounds(target)});
   }
   if(method==='DELETE'){target[kind]=null;return send({backgrounds:makeBackgrounds(target),removed:true});}
   throw error('Not found',404);
  }
  const docsMetadata=p.match(/^\/api\/app\/([a-z0-9-]+)\/case-documents\/([a-z0-9-]+)$/);
  if(docsMetadata&&method==='PATCH'){
   const tenant=tenantBySlug(docsMetadata[1]);allowed(tenant,'C003');
   const doc=tenant.caseDocumentMeta[docsMetadata[2]];
   if(!doc||!tenant.cases.some(c=>c.id===doc.caseId&&!c.archivedAt))throw error('Not found',404);
   const types=['other','contract','identification','invoice','consent','certificate'];
   if(Object.keys(input).some(k=>!['documentType','expiresOn'].includes(k)))throw error('Invalid document');
   const newType=input.documentType??'other',expiry=input.expiresOn||null;
   if(!types.includes(newType)||expiry&&!validExpiry(expiry))throw error('Invalid document');
   doc.documentType=newType;doc.expiresOn=expiry;
   tenant.caseEvents.unshift({id:uuid(),caseId:doc.caseId,action:'updated',description:'Documento actualizado · '+newType,createdAt:now()});
   return send({document:{documentId:docsMetadata[2],documentType:newType,expiresOn:expiry}});
  }
  const filesPath=p.match(/^\/api\/app\/([a-z0-9-]+)\/tools\/([A-Z][0-9]{3})\/records\/([a-z0-9-]+)\/attachments$/);
  if(filesPath){
   const tenant=tenantBySlug(filesPath[1]),tool=filesPath[2],recordId=filesPath[3];allowed(tenant,tool);
   const items=tenant.uploads.filter(x=>x.toolId===tool&&x.recordId===recordId);
   if(method==='GET')return emit({attachments:items.map(file=>{
    const group=tenant.caseDocumentMeta[file.documentId],same=items.filter(x=>x.documentId===file.documentId);
    const latest=same.length?Math.max(...same.map(x=>x.version||1)):1;
    return {id:file.id,filename:file.filename,mime:file.mime,bytes:file.size,
     documentId:group?file.documentId:file.id,managed:!!group,version:file.version||1,isLatest:!group||file.version===latest,
     documentType:group?.documentType||'other',expiresOn:group?.expiresOn||null,
     downloadUrl:'/api/app/'+tenant.slug+'/attachments/'+file.id};
   })});
   if(method==='POST'){
    const media=demoMedia(input);if(media.size>2000000||items.length>=12)throw error('Storage quota exceeded');
    const list={C001:tenant.clients,C002:tenant.deals,C003:tenant.cases.filter(c=>!c.archivedAt),C004:tenant.events,C005:tenant.items}[tool]||tenant.generic[tool]||[];
    if(!list.some(x=>x.id===recordId))throw error('Not found',404);
    let docId=null,version=1;
    if(tool==='C003'){
     const types=['other','contract','identification','invoice','consent','certificate'];
     if(Object.keys(input).some(k=>!['filename','mime','data','documentType','expiresOn','replaceDocumentId'].includes(k)))throw error('Invalid document');
     const expiry=input.expiresOn||null,kind=input.documentType||'other';
     if(!types.includes(kind)||expiry&&!validExpiry(expiry))throw error('Invalid document');
     if(input.replaceDocumentId){
      docId=input.replaceDocumentId;
      let group=tenant.caseDocumentMeta[docId];
      if(!group){
       const legacy=items.find(x=>x.id===docId);
       if(!legacy)throw error('Not found',404);
       legacy.documentId=docId;legacy.version=1;
       group=tenant.caseDocumentMeta[docId]={caseId:recordId,documentType:kind,expiresOn:expiry,nextVersion:1};
      }
      if(group.caseId!==recordId)throw error('Not found',404);
      version=++group.nextVersion;
     }else{
      docId=uuid();
      tenant.caseDocumentMeta[docId]={caseId:recordId,documentType:kind,expiresOn:expiry,nextVersion:1};
     }
    }
    tenant.uploads.push({...media,toolId:tool,recordId,...(docId?{documentId:docId,version}:{})});
    if(tool==='C003')tenant.caseEvents.unshift({id:uuid(),caseId:recordId,action:'document_added',description:(version>1?'Nueva versión: ':'Documento añadido: ')+media.filename,createdAt:now()});
    return send({attachment:{id:media.id,filename:media.filename,bytes:media.size,documentId:docId}});
   }
  }
  const filePath=p.match(/^\/api\/app\/([a-z0-9-]+)\/attachments\/([a-z0-9-]+)$/);
  if(filePath){
   const tenant=tenantBySlug(filePath[1]),file=tenant.uploads.find(x=>x.id===filePath[2]);
   if(!file)throw error('Not found',404);
   allowed(tenant,file.toolId);
   if(method==='GET')return emit({file:{filename:file.filename,mime:file.mime,data:file.data}});
   if(method==='DELETE'){
    tenant.uploads=tenant.uploads.filter(x=>x.id!==file.id);
    if(file.toolId==='C003')tenant.caseEvents.unshift({id:uuid(),caseId:file.recordId,action:'document_removed',description:file.filename,createdAt:now()});
    return send({removed:true});
   }
  }
  if(p==='/api/admin/appearance'){
   if(method==='GET')return emit({appearance:state.platformAppearance,backgrounds:state.platformBackgrounds});
   if(method==='PUT'){state.platformAppearance=normalizeTheme(input);return send({appearance:state.platformAppearance,backgrounds:state.platformBackgrounds});}
  }
  const themePath=p.match(/^\/api\/admin\/tenants\/([a-z0-9-]+)\/appearance$/);
  if(themePath&&method==='PUT'){
    const tenant=tenantById(themePath[1]);tenant.appearance=normalizeTheme(input);
    return send({appearance:tenant.appearance,backgrounds:tenant.backgrounds});
  }
  const ownAppearancePath=p.match(/^\/api\/app\/([a-z0-9-]+)\/appearance$/);
  if(ownAppearancePath&&method==='PUT'){
    const tenant=tenantBySlug(ownAppearancePath[1]);tenant.appearance=normalizeTheme(input);
    return send({appearance:tenant.appearance});
  }
  if(p==='/api/admin/catalog'&&method==='GET')return emit({catalog});
  if(p==='/api/admin/billing'&&method==='GET')return emit({tenants:state.tenants.map(t=>({id:t.id,slug:t.slug,name:t.name,suiteId:t.suiteId,billingStatus:'active',billingStatusLabel:'Al corriente',monthlyFeeCents:110084,currentPeriodEnd:null,pastDueSince:null,daysPastDue:0,balancePendingCents:0})),pendingOrders:[]});
  if(p.startsWith('/api/billing/status')&&method==='GET')return emit({organizationId:'demo',status:'active',effectiveStatus:'active',statusLabel:'Al corriente',monthlyFeeCents:110084,currentPeriodEnd:null,pastDueSince:null,daysPastDue:0,balancePendingCents:0,balanceInstallmentsPending:0,nextBalanceDueAt:null,nextMonthlyChargeCents:110084});
  if(p==='/api/admin/tenants'){
   if(method==='GET')return emit({tenants:state.tenants.map(({id,slug,name,status,suiteId})=>({id,slug,name,status,suiteId}))});
   if(method==='POST'){
    if(state.tenants.some(t=>t.slug===input.slug))throw error('Identificador ocupado',409);
    const t=createTenant(catalog,input);state.tenants.unshift(t);
    demoAudit(t,'tenant.created',t.id);
    return send({tenant:{id:t.id,slug:t.slug,name:t.name,suiteId:t.suiteId}});
   }
  }
  let m=p.match(/^\/api\/admin\/tenants\/([a-z0-9-]+)(?:\/(tools\/([A-Z][0-9]{3})|members(?:\/([a-z0-9-]+))?))?$/);
  // 'search' es ruta propia (/api/admin/tenants/search), no un id de tenant.
  if(m&&m[1]!=='search'){
   const t=tenantById(m[1]);
   if(m[3]&&method==='PUT'){
    const tool=t.tools.find(x=>x.id===m[3]);if(!tool||typeof input.enabled!=='boolean')throw error('Invalid tenant data');
    tool.enabled=input.enabled;return send({tool:{toolId:tool.id,enabled:tool.enabled}});
   }
   if(m[2]?.startsWith('members')){
    if(m[4]&&method==='PATCH'){
     const member=getRecord(t.members,m[4]);if(member.role==='owner')throw error('Forbidden',403);
     if(!['active','suspended'].includes(input.status))throw error('Invalid tenant data');
     member.status=input.status;return send({members:t.members});
    }
    if(method==='GET')return emit({members:t.members});
    if(method==='POST'){
     const email=String(input.email||'').trim().toLowerCase();
     if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['admin','member','viewer'].includes(input.role))throw error('Invalid tenant data');
     const member=t.members.find(x=>x.email===email);
     if(member){member.status='active';if(member.role!=='owner')member.role=input.role;}
     else t.members.push({id:uuid(),email,role:input.role,status:'active'});
     demoAudit(t,'tenant.member_added',email);
     return send({members:t.members});
    }
   }
   if(!m[2]&&method==='GET')return emit({tenant:t});
   if(!m[2]&&method==='PATCH'){
    if(input.suiteId&&!catalog.suites.some(s=>s.id===input.suiteId))throw error('Invalid tenant data');
    Object.assign(t,Object.fromEntries(Object.entries(input).filter(([key])=>['name','displayName','suiteId','primaryColor','secondaryColor','status','logoUrl'].includes(key))));
    return send({tenant:t});
   }
  }
  if(p==='/api/admin/audit'&&method==='GET'){
   return emit({events:demoAuditFilter(state.tenants.flatMap(t=>t.audit),url),actions:demoAuditActions});
  }
  const adminInvites=p.match(/^\/api\/admin\/tenants\/([a-z0-9-]+)\/invitations(?:\/([a-z0-9-]+))?(?:\/(resend))?$/);
  if(adminInvites)return invitationsHandler(tenantById(adminInvites[1]),adminInvites[2],adminInvites[3],method,input,send);
  const appInvites=p.match(/^\/api\/app\/([a-z0-9-]+)\/invitations(?:\/([a-z0-9-]+))?(?:\/(resend))?$/);
  if(appInvites)return invitationsHandler(tenantBySlug(appInvites[1]),appInvites[2],appInvites[3],method,input,send);
  const appAudit=p.match(/^\/api\/app\/([a-z0-9-]+)\/audit$/);
  if(appAudit&&method==='GET')return emit({events:demoAuditFilter(tenantBySlug(appAudit[1]).audit,url),actions:demoAuditActions});
  if(p==='/api/public/invitations'){
   if(method==='GET'){
    const token=url.searchParams.get('token')||'';
    const found=state.tenants.flatMap(t=>t.invitations.map(i=>({t,i}))).find(x=>x.i.token===token);
    if(!found)throw error('Invitation not found',404);
    const demoStatus=demoInviteStatus(found.i);
    return emit({status:demoStatus==='pending'?'valid':demoStatus,invitation:{...demoPublicInvite(found.i),organizationName:found.t.name,organizationSlug:found.t.slug}});
   }
   if(method==='POST'){
    const token=String(input.token||'');
    const found=state.tenants.flatMap(t=>t.invitations.map(i=>({t,i}))).find(x=>x.i.token===token);
    if(!found)throw error('Not found',404);
    const {t,i:inv}=found;
    const status=demoInviteStatus(inv);
    if(status==='expired')throw error('Invitation expired',410);
    if(status==='consumed')throw error('Invitation already used',410);
    inv.consumedAt=now();
    const member=t.members.find(x=>x.email===inv.email);
    if(member){member.status='active';if(member.role!=='owner')member.role=inv.role;}
    else t.members.push({id:uuid(),email:inv.email,role:inv.role,status:'active'});
    demoAudit(t,'tenant.invitation_accepted',inv.id);
    return send({organizationId:t.id,organizationSlug:t.slug,organizationName:t.name,email:inv.email,role:inv.role});
   }
  }
  if(p==='/api/app/organizations'&&method==='GET')return emit({organizations:state.tenants.filter(t=>t.status==='active').map(t=>({slug:t.slug,name:t.name,role:'owner',suiteId:t.suiteId}))});
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/config$/);
  if(m&&method==='GET'){
   const t=tenantBySlug(m[1]);const suite=catalog.suites.find(s=>s.id===t.suiteId);
   return emit({tenant:{id:t.id,slug:t.slug,name:t.name,role:'owner',displayName:t.displayName,logoUrl:t.logoUrl,primaryColor:t.primaryColor,secondaryColor:t.secondaryColor,timezone:t.timezone,suiteId:t.suiteId,suiteName:suite?.name||t.suiteId},
    appearance:t.appearance,backgrounds:t.backgrounds,tools:t.tools.filter(x=>x.enabled),members:t.members.filter(x=>x.status==='active').map(x=>({email:x.email,role:x.role}))});
  }
  // Guía de primer uso + datos de ejemplo (018), espejo en demo del flujo real.
  const onboardingProgress=t=>{
   const stored=t.onboarding?.steps||{};
   const live=list=>list.filter(x=>!x.archivedAt);
   const derived={'first-client':live(t.clients).length>0,catalog:live(t.catalogItems).length>0,quote:live(t.quotes).length>0,team:t.members.filter(x=>x.status==='active').length>1,billing:false};
   const steps=onboardingSteps.map(s=>({key:s.key,title:s.title,description:s.description,toolId:s.toolId,done:!!stored[s.key]||!!derived[s.key],auto:!!derived[s.key]&&!stored[s.key]}));
   const doneCount=steps.filter(s=>s.done).length;
   return {organizationId:t.id,userId:'demo-user',steps,doneCount,total:steps.length,complete:doneCount===steps.length,demoSeeded:(t.onboarding?.demoSeeded||[]).length>0,demoCount:(t.onboarding?.demoSeeded||[]).length};
  };
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/onboarding$/);
  if(m){
   const t=tenantBySlug(m[1]);
   if(method==='GET')return emit(onboardingProgress(t));
   if(method==='POST'){
    if(input.action==='reset'){t.onboarding.steps={};return send(onboardingProgress(t));}
    const step=onboardingSteps.find(s=>s.key===input.step);
    if(!step)throw error('Invalid onboarding step');
    t.onboarding.steps[step.key]=now();return send(onboardingProgress(t));
   }
   throw error('Not found',404);
  }
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/demo-data$/);
  if(m){
   const t=tenantBySlug(m[1]);
   if(method==='GET')return emit({demo:t.onboarding.demoSeeded});
   if(method==='POST'){
    if(t.onboarding.demoSeeded.length)return send({seeded:false,alreadySeeded:true,demo:t.onboarding.demoSeeded});
    const suite=catalog.suites.find(s=>s.id===t.suiteId);
    const clientId=uuid(),itemId=uuid(),quoteId=uuid();
    const priceCents=99000,vatCents=Math.round(priceCents*.16);
    const productName=suite?`Servicio de ejemplo — ${suite.name}`:'Servicio de ejemplo';
    const client={id:clientId,name:'DEMO — Cliente de ejemplo',company:'Empresa Demo',email:'demo@ejemplo.invalid',phone:'',status:'prospect',notes:'Cliente de ejemplo (DEMO). Se puede eliminar desde la guía de primer uso.',createdAt:now(),updatedAt:now()};
    t.clients.unshift(client);
    const item={id:itemId,sku:'DEMO-001',name:`DEMO — ${productName}`,description:'Producto o servicio de ejemplo (DEMO). Precio de muestra, no es una venta real.',priceCents,category:'General',active:true,createdAt:now(),updatedAt:now()};
    t.catalogItems.unshift(item);
    const quote={id:quoteId,clientId,clientName:client.name,title:'DEMO — Cotización de ejemplo',notes:'Cotización de ejemplo (DEMO). No es una venta real.',vatRate:16,status:'draft',validUntil:null,subtotalCents:priceCents,vatCents,totalCents:priceCents+vatCents,publicToken:'demo',acceptedAt:null,createdAt:now(),updatedAt:now(),lines:[{id:uuid(),description:`DEMO — ${productName}`,quantity:1,unitPriceCents:priceCents,lineTotalCents:priceCents,position:0}]};
    t.quotes.unshift(quote);
    t.onboarding.demoSeeded=[{entityType:'client',entityId:clientId},{entityType:'catalog_item',entityId:itemId},{entityType:'quote',entityId:quoteId}];
    return send({seeded:true,alreadySeeded:false,demo:t.onboarding.demoSeeded});
   }
   if(method==='DELETE'){
    const seeded=t.onboarding.demoSeeded;
    for(const s of seeded){
     if(s.entityType==='client')t.clients=t.clients.filter(c=>c.id!==s.entityId);
     if(s.entityType==='catalog_item')t.catalogItems=t.catalogItems.filter(c=>c.id!==s.entityId);
     if(s.entityType==='quote')t.quotes=t.quotes.filter(c=>c.id!==s.entityId);
    }
    t.onboarding.demoSeeded=[];
    return send({removed:seeded.length,demo:seeded});
   }
   throw error('Not found',404);
  }
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/cases(?:\/([a-z0-9-]+))?(?:\/(history))?$/);
  if(m){
   const tenant=tenantBySlug(m[1]),id=m[2],action=m[3];allowed(tenant,'C003');
   const active=tenant.cases.filter(c=>!c.archivedAt);
   if(method==='GET'&&!id)return emit({
    cases:active.map(c=>({...c,clientName:tenant.clients.find(x=>x.id===c.clientId)?.name||c.clientName||'Cliente archivado',
      documentsCount:new Set(tenant.uploads.filter(x=>x.toolId==='C003'&&x.recordId===c.id).map(x=>x.documentId||x.id)).size})),
    clients:tenant.clients.map(c=>({id:c.id,name:c.name,company:c.company,email:c.email})),
    kinds:caseKinds,statuses:caseStatuses
   });
   if(method==='GET'&&action==='history'){
    getRecord(active,id);
    return emit({events:tenant.caseEvents.filter(x=>x.caseId===id)});
   }
   const normalize=(value,updating=false)=>{
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!(updating?['title','kind','status','notes']:['clientId','title','kind','status','notes']).includes(k)))throw error('Invalid case');
    const title=String(value.title??'').trim(),kind=value.kind||'general',status=value.status||'open',notes=String(value.notes??'').trim();
    if(title.length<1||title.length>180||!caseKinds.includes(kind)||!caseStatuses.includes(status)||notes.length>2000)throw error('Invalid case');
    return {title,kind,status,notes};
   };
   if(method==='POST'&&!id){
    const client=tenant.clients.find(c=>c.id===input.clientId);
    if(!client)throw error('Client not found',404);
    const obj={id:uuid(),clientId:client.id,clientName:client.name,...normalize(input),createdAt:now(),updatedAt:now()};
    tenant.cases.unshift(obj);
    tenant.caseEvents.unshift({id:uuid(),caseId:obj.id,action:'created',description:'Expediente registrado',createdAt:now()});
    return send({case:obj});
   }
   if(id&&!action&&method==='PATCH'){
    const c=getRecord(active,id);Object.assign(c,normalize(input,true),{updatedAt:now()});
    tenant.caseEvents.unshift({id:uuid(),caseId:c.id,action:'updated',description:'Expediente actualizado',createdAt:now()});
    return send({case:c});
   }
   if(id&&!action&&method==='DELETE'){
    const c=getRecord(active,id);c.archivedAt=now();
    tenant.caseEvents.unshift({id:uuid(),caseId:c.id,action:'archived',description:'Expediente archivado',createdAt:now()});
    return send({archived:true});
   }
   throw error('Not found',404);
  }
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/tools\/([A-Z][0-9]{3})\/records(?:\/([a-z0-9-]+))?$/);
  if(m){
   const t=tenantBySlug(m[1]),tool=m[2],id=m[3];allowed(t,tool);
   if(tool==='C008'&&method==='GET'){
    const counts={C001:t.clients.length,C002:t.deals.length,C003:t.cases.filter(c=>!c.archivedAt).length,C004:t.events.length,C005:t.items.length};
    for(const [key,list]of Object.entries(t.generic))counts[key]=list.length;
    return emit({dashboard:true,counts:Object.fromEntries(Object.entries(counts).filter(([key])=>t.tools.some(x=>x.id===key&&x.enabled)))});
   }
   if(tool==='C009')throw error('Read members in tenant config');
   const list=t.generic[tool]??(t.generic[tool]=[]);
   if(method==='GET')return emit({records:list});
   if(method==='POST'){
    const r={id:uuid(),title:String(input.title||'').trim(),status:input.status||'active',fields:input.fields||{},createdAt:now(),updatedAt:now()};
    if(!r.title)throw error('Invalid record');
    list.unshift(r);return send({record:r});
   }
   const record=getRecord(list,id);
   if(method==='DELETE'){list.splice(list.indexOf(record),1);return send({archived:true});}
   if(method==='PATCH'){Object.assign(record,{title:input.title??record.title,status:input.status??record.status,fields:input.fields??record.fields,updatedAt:now()});return send({record});}
  }
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/(clients|crm|agenda|inventory)(?:\/([a-z0-9-]+))?(?:\/(movements))?$/);
  if(m){
   const t=tenantBySlug(m[1]),module=m[2],id=m[3],movement=m[4];
   const tool={clients:'C001',crm:'C002',agenda:'C004',inventory:'C005'}[module];allowed(t,tool);
   const list={clients:t.clients,crm:t.deals,agenda:t.events,inventory:t.items}[module];
   const clients=entityList(t,'C001'),deals=entityList(t,'C002');
   const clientChoices=clients.map(x=>({id:x.id,name:x.name,company:x.company}));
   const linkedDeal=d=>({...d,clientName:t.clients.find(c=>c.id===d.clientId)?.name||null,
    assignedUserEmail:t.members.find(m=>m.id===d.assignedUserId)?.email||null});
   if(method==='GET'){
    if(module==='clients')return emit({clients:entityList(t,'C001'),statuses});
    const canClients=t.tools.some(x=>x.id==='C001'&&x.enabled),canCRM=t.tools.some(x=>x.id==='C002'&&x.enabled);
    if(module==='crm')return emit({deals:deals.map(d=>canClients?linkedDeal(d):{...d,clientId:null,clientName:null}),clients:canClients?clientChoices:[],members:t.members.filter(m=>m.status==='active').map(m=>({id:m.id,email:m.email,role:m.role})),stages});
    if(module==='agenda'){
     let agendaList=list;
     const view=url.searchParams.get('view'),viewDate=url.searchParams.get('date')||new Date().toISOString().slice(0,10);
     if(view==='day')agendaList=list.filter(e=>(e.startsAt||'').slice(0,10)===viewDate);
     else if(view==='week'){
      const d=new Date(viewDate+'T00:00:00Z'),dow=(d.getUTCDay()+6)%7;
      const from=new Date(d.getTime()-dow*86400000).toISOString().slice(0,10);
      const to=new Date(d.getTime()+(6-dow)*86400000).toISOString().slice(0,10);
      agendaList=list.filter(e=>{const day=(e.startsAt||'').slice(0,10);return day>=from&&day<=to;});
     }
     return emit({events:agendaList.map(e=>({...e,
      assigneeEmail:e.assigneeUserId?t.members.find(m=>m.id===e.assigneeUserId)?.email||null:null,

      clientId:canClients?e.clientId:null,clientName:canClients?t.clients.find(c=>c.id===e.clientId)?.name||null:null,
      dealId:canCRM?e.dealId:null,dealTitle:canCRM?t.deals.find(d=>d.id===e.dealId)?.title||null:null})),
      clients:canClients?clientChoices:[],deals:canCRM?deals.map(d=>({id:d.id,title:d.title,clientId:canClients?d.clientId||null:null})):[],
      members:t.members.filter(m=>m.status==='active').map(m=>({userId:m.id,email:m.email,role:m.role})),
      view:view||'list',from:view==='list'?null:viewDate,to:view==='list'?null:viewDate,
      statuses:['scheduled','confirmed','completed','cancelled'],
      reminders:{attempted:0,created:0,pending:0},
      externalCalendars:{status:'pending',note:'Sincronización con Google/Outlook pendiente de integración.'}});
    }
    return emit({items:list.map(i=>({...i,isLow:i.quantity<=i.lowStock,
      variants:t.variants.filter(v=>v.itemId===i.id&&!v.archivedAt).map(v=>({...v,
       isLow:v.quantity<=v.lowStock,expired:!!v.expiresOn&&v.expiresOn<new Date().toISOString().slice(0,10),
       expiringSoon:!!v.expiresOn&&v.expiresOn>=new Date().toISOString().slice(0,10)})),
      lowVariants:t.variants.filter(v=>v.itemId===i.id&&!v.archivedAt&&v.quantity<=v.lowStock).length,
      expiringVariants:t.variants.filter(v=>v.itemId===i.id&&!v.archivedAt&&v.expiresOn&&v.expiresOn<=new Date(Date.now()+30*86400000).toISOString().slice(0,10)).length})),
     movements:t.movements,
     purchaseNote:'La orden de compra real es T008 (Compras, frente p1b): aquí se registra el proveedor por variante.'});
   }
   if(module==='inventory'&&movement==='movements'&&method==='POST'){
    const item=getRecord(list,id),delta=input.delta;
    if(!Number.isSafeInteger(delta)||!delta)throw error('Invalid stock movement');
    if(item.quantity+delta<0)throw error('Insufficient stock',409);
    if(input.variantId){
     const variant=t.variants.find(v=>v.id===input.variantId&&v.itemId===item.id&&!v.archivedAt);
     if(!variant)throw error('Not found',404);
     if(variant.quantity+delta<0)throw error('Insufficient stock',409);
     variant.quantity+=delta;
    }
    item.quantity+=delta;
    const m={id:uuid(),itemId:item.id,variantId:input.variantId||null,delta,note:String(input.note||'').slice(0,400),createdAt:now()};
    t.movements.unshift(m);return send({movement:m});
   }
   if(module==='clients'){
    const client={name:String(input.name||'').trim(),company:String(input.company||''),email:String(input.email||'').trim().toLowerCase(),phone:String(input.phone||''),status:input.status||'prospect',notes:String(input.notes||'')};
    if(client.name.length<2||!statuses.includes(client.status))throw error('Invalid client');
    if(client.email&&entityList(t,'C001').some(x=>x.email===client.email&&x.id!==id))throw error('Duplicate client email',409);
    if(method==='POST'){const c={id:uuid(),...client};list.unshift(c);return send({client:c});}
    if(method==='PATCH'){Object.assign(getRecord(list,id),client);return send({ok:true});}
    if(method==='DELETE'){const rec=getRecord(list,id);rec.archivedAt=now();return send({archived:true});}
   }
   if(module==='crm'){
    if(method==='DELETE'){const rec=getRecord(deals,id);rec.archivedAt=now();return send({archived:true});}
    if(method==='PATCH'&&Object.keys(input).length===1&&input.stage){
     if(!stages.includes(input.stage))throw error('Invalid deal');getRecord(deals,id).stage=input.stage;return send({ok:true});
    }
    const clientId=input.clientId||null;
    if(clientId)allowed(t,'C001');
    if(clientId&&!clients.some(x=>x.id===clientId))throw error('Client not found',404);
    const assignedUserId=input.assignedUserId||null;
    if(assignedUserId&&!t.members.some(m=>m.id===assignedUserId&&m.status==='active'))throw error('Invalid deal');
    const deal={title:String(input.title||'').trim(),customer:String(input.customer||''),clientId,assignedUserId,
      amountCents:input.amountCents??0,stage:input.stage||'lead',followUpAt:input.followUpAt||null,notes:String(input.notes||'')};
    if(deal.title.length<2||!stages.includes(deal.stage)||!Number.isSafeInteger(deal.amountCents)||deal.amountCents<0)throw error('Invalid deal');
    if(method==='POST'){const d={id:uuid(),...deal,createdAt:now(),updatedAt:now()};list.unshift(d);return send({deal:d});}
    if(method==='PATCH'){
     const current=getRecord(deals,id);
     if(deal.clientId&&t.events.some(e=>e.dealId===id&&e.clientId&&e.clientId!==deal.clientId))throw error('Relation mismatch',409);
     Object.assign(current,deal,{updatedAt:now()});
     if(deal.clientId)for(const event of t.events)if(event.dealId===id&&!event.clientId)event.clientId=deal.clientId;
     return send({ok:true});
    }
   }
   if(module==='agenda'){
    if(method==='PATCH'&&Object.keys(input).length===1&&['completed','cancelled','confirmed'].includes(input.status)){getRecord(list,id).status=input.status;return send({ok:true});}
    let clientId=input.clientId||null;const dealId=input.dealId||null;
    if(dealId){
     allowed(t,'C002');
     const deal=getRecord(deals,dealId);
     if(deal.clientId){if(clientId&&clientId!==deal.clientId)throw error('Relation mismatch');clientId=deal.clientId;}
    }
    if(clientId)allowed(t,'C001');
    if(clientId&&!clients.some(x=>x.id===clientId))throw error('Client not found',404);
    if(input.assigneeUserId&&!t.members.some(m=>m.id===input.assigneeUserId&&m.status==='active'))throw error('Assignee not found',404);
    const event={title:String(input.title||'').trim(),customer:String(input.customer||''),clientId,dealId,
     assigneeUserId:input.assigneeUserId||null,
     remindMinutesBefore:input.remindMinutesBefore??null,
     resource:String(input.resource||'general').trim().toLowerCase(),startsAt:input.startsAt,endsAt:input.endsAt,
     status:input.status||'scheduled',notes:String(input.notes||'')};
    if(event.title.length<2||!Number.isFinite(Date.parse(event.startsAt))||!Number.isFinite(Date.parse(event.endsAt))||event.endsAt<=event.startsAt)throw error('Invalid appointment');
    if(!['scheduled','confirmed','completed','cancelled'].includes(event.status))throw error('Invalid appointment');
    if(['scheduled','confirmed'].includes(event.status)&&list.some(x=>x.id!==id&&['scheduled','confirmed'].includes(x.status)&&x.resource===event.resource&&x.startsAt<event.endsAt&&x.endsAt>event.startsAt))throw error('Schedule conflict',409);
    if(method==='POST'){const e={id:uuid(),...event};list.unshift(e);return send({event:e});}
    if(method==='PATCH'){Object.assign(getRecord(list,id),event);return send({ok:true});}
   }
   if(module==='inventory'){
    if(method==='POST'){
     const sku=String(input.sku||'').trim().toUpperCase(),title=String(input.title||'').trim();
     if(!sku||title.length<2||list.some(x=>x.sku===sku))throw error('Duplicate SKU',409);
     const item={id:uuid(),sku,title,quantity:0,lowStock:Number(input.lowStock)||0,location:String(input.location||'')};list.push(item);
     for(const raw of Array.isArray(input.variants)?input.variants:[]){
      const label=String(raw.label||'').trim();
      const vsku=raw.sku?String(raw.sku).trim().toUpperCase():null;
      if(label.length<2||vsku&&t.variants.some(v=>v.sku===vsku))throw error('Invalid inventory variant');
      t.variants.push({id:uuid(),itemId:item.id,label,sku:vsku,quantity:0,lowStock:Number(raw.lowStock)||0,
       warehouse:String(raw.warehouse||'').trim(),lot:String(raw.lot||'').trim(),
       expiresOn:raw.expiresOn||null,supplier:String(raw.supplier||'').trim()});
     }
     return send({item});
    }
    if(method==='PATCH'){
     const item=getRecord(list,id);
     Object.assign(item,{title:input.title??item.title,location:input.location??item.location,lowStock:input.lowStock??item.lowStock});
     return send({ok:true});
    }
   }
  }
  // Importación CSV + migración JSON en la demo (P0, E004): misma validación
  // y mismo resumen que el servidor real, pero en sessionStorage. El panel
  // de la UI llama a estas rutas con ?demo=1; sin ellas la demo diría
  // "Not found" al importar.
  const demoParseCsv=text=>{
   if(typeof text!=='string'||!text.trim())throw error('Invalid import');
   const clean=text.replace(/^\uFEFF/,'');
   const out=[];let field='',row=[],line=1,rowLine=1,inQ=false;
   const pf=()=>{row.push(field);field='';};
   const pr=()=>{pf();out.push({values:row,line:rowLine});row=[];rowLine=line;};
   for(let i=0;i<clean.length;i++){const ch=clean[i];
    if(inQ){if(ch==='"'){if(clean[i+1]==='"'){field+='"';i++;}else inQ=false;}else{if(ch==='\n')line++;field+=ch;}}
    else if(ch==='"'&&field==='')inQ=true;
    else if(ch===',')pf();
    else if(ch==='\r'){if(clean[i+1]==='\n')i++;line++;pr();}
    else if(ch==='\n'){line++;pr();}
    else field+=ch;}
   if(inQ)throw error('Invalid import');
   if(field!==''||row.length)pr();
   return out.filter(r=>r.values.some(v=>String(v??'').trim()!==''));
  };
  const demoNormKey=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const demoPriceCents=v=>{
   if(typeof v==='number')return Number.isFinite(v)&&v>=0?Math.round(v*100):null;
   if(typeof v!=='string')return null;
   let s=v.trim().replace(/[$\s]|mxn/gi,'');
   if(!s||!/^[0-9.,]+$/.test(s))return null;
   const d=s.lastIndexOf('.'),c=s.lastIndexOf(',');
   if(d!==-1&&c!==-1){if(c>d)s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');}
   else if(c!==-1){s=s.slice(c+1).length===2?s.replace(',','.'):s.replace(/,/g,'');}
   if(!/^\d+(\.\d{1,2})?$/.test(s))return null;
   return Math.round(Number(s)*100);
  };
  const demoHeaderMap=(headers,aliases)=>{
   const cols=new Map();
   headers.forEach((h,i)=>{const f=aliases[demoNormKey(h)];if(f&&!cols.has(f))cols.set(f,i);});
   return cols;
  };
  const demoImportClients=(t,csv)=>{
   allowed(t,'C001');
   const parsed=demoParseCsv(csv);
   const cols=demoHeaderMap(parsed[0].values,{nombre:'name',name:'name',empresa:'company',company:'company',negocio:'company',correo:'email',email:'email','correo electronico':'email',telefono:'phone',tel:'phone',phone:'phone',whatsapp:'phone',estado:'status',estatus:'status',status:'status',notas:'notes',notes:'notes'});
   if(!cols.has('name'))throw error('Invalid import');
   const seen=new Set(t.clients.filter(c=>!c.archivedAt).map(c=>c.email.toLowerCase()).filter(Boolean));
   const records=[],errors=[];
   for(const r of parsed.slice(1)){
    const get=f=>String(r.values[cols.get(f)]??'').trim();
    const name=get('name'),email=get('email').toLowerCase(),phone=get('phone'),status=(get('status')||'prospect').toLowerCase();
    const rowErrs=[];
    if(name.length<2)rowErrs.push({field:'name',reason:'El nombre es obligatorio (mínimo 2 caracteres).'});
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))rowErrs.push({field:'email',reason:'El correo no tiene un formato válido.'});
    if(email&&seen.has(email))rowErrs.push({field:'email',reason:'Duplicado: ese correo ya existe en esta empresa.'});
    if(!statuses.includes(status))rowErrs.push({field:'status',reason:'El estado debe ser prospect, active o inactive.'});
    if(rowErrs.length){for(const e of rowErrs)errors.push({row:r.line,...e});continue;}
    if(email)seen.add(email);
    records.push({id:uuid(),name,company:get('company'),email,phone,status,notes:get('notes'),createdAt:now(),updatedAt:now()});
   }
   for(const c of records)t.clients.unshift(c);
   return {summary:{total:parsed.length-1,imported:records.length,skipped:parsed.length-1-records.length,errors:errors.length,duplicates:errors.filter(e=>e.reason.startsWith('Duplicado')).length},errors};
  };
  const demoImportCatalog=(t,csv)=>{
   allowed(t,'C006');
   const parsed=demoParseCsv(csv);
   const cols=demoHeaderMap(parsed[0].values,{sku:'sku',codigo:'sku',code:'sku',nombre:'name',name:'name',producto:'name',descripcion:'description',description:'description',precio:'price','precio mxn':'price',price:'price',categoria:'category',category:'category'});
   if(!cols.has('name'))throw error('Invalid import');
   const seen=new Set(t.catalogItems.filter(i=>!i.archivedAt).map(i=>i.sku.toUpperCase()).filter(Boolean));
   const records=[],errors=[];
   for(const r of parsed.slice(1)){
    const get=f=>String(r.values[cols.get(f)]??'').trim();
    const name=get('name'),sku=get('sku').toUpperCase(),priceCents=demoPriceCents(get('price'));
    const rowErrs=[];
    if(name.length<2)rowErrs.push({field:'name',reason:'El nombre es obligatorio (mínimo 2 caracteres).'});
    if(sku&&!/^[A-Z0-9][A-Z0-9._-]{0,47}$/.test(sku))rowErrs.push({field:'sku',reason:'El SKU solo admite letras, dígitos, punto, guion y guion bajo.'});
    if(priceCents===null)rowErrs.push({field:'price',reason:'El precio no es un importe válido (ejemplo: 129.50).'});
    if(sku&&seen.has(sku))rowErrs.push({field:'sku',reason:'Duplicado: ese SKU ya existe en este catálogo.'});
    if(rowErrs.length){for(const e of rowErrs)errors.push({row:r.line,...e});continue;}
    if(sku)seen.add(sku);
    records.push({id:uuid(),sku,name,description:get('description'),priceCents,category:get('category')||'General',active:true,createdAt:now(),updatedAt:now()});
   }
   for(const item of records)t.catalogItems.unshift(item);
   return {summary:{total:parsed.length-1,imported:records.length,skipped:parsed.length-1-records.length,errors:errors.length,duplicates:errors.filter(e=>e.reason.startsWith('Duplicado')).length},errors};
  };
  const demoImportMigration=(t,payload)=>{
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw error('Invalid import');
   const errors=[];let imported=0;const bySection={};
   if(Array.isArray(payload.clients)&&payload.clients.length){
    const csv=['Nombre,Empresa,Correo,Teléfono,Estado,Notas',...payload.clients.map(c=>[c.name??c.nombre??'',c.company??c.empresa??'',c.email??c.correo??'',c.phone??c.telefono??'',c.status??c.estado??'prospect',c.notes??c.notas??''].map(v=>String(v).includes(',')?'"'+String(v).replace(/"/g,'""')+'"':v).join(','))].join('\r\n');
    const r=demoImportClients(t,csv);
    imported+=r.summary.imported;errors.push(...r.errors.map(e=>({...e,section:'clients'})));
    bySection.clients=r.summary;
   }
   if(Array.isArray(payload.catalogItems)&&payload.catalogItems.length){
    const csv=['SKU,Nombre,Descripción,Precio,Categoría',...payload.catalogItems.map(c=>[c.sku??'',c.name??c.nombre??'',c.description??c.descripcion??'',c.price??(c.priceCents!==undefined?c.priceCents/100:''),c.category??c.categoria??'General'].map(v=>String(v).includes(',')?'"'+String(v).replace(/"/g,'""')+'"':v).join(','))].join('\r\n');
    const r=demoImportCatalog(t,csv);
    imported+=r.summary.imported;errors.push(...r.errors.map(e=>({...e,section:'catalogItems'})));
    bySection.catalogItems=r.summary;
   }
   const quoteSection={total:payload.quotes?.length||0,imported:0,errors:0};
   if(Array.isArray(payload.quotes)){
    allowed(t,'T013');
    payload.quotes.forEach((q,i)=>{
     try{
      const lines=(q.lines||[]).map((l,pos)=>{
       const unitPriceCents=l.unitPriceCents!==undefined?l.unitPriceCents:demoPriceCents(l.unitPrice??l.price);
       if(!String(l.description||'').trim()||!Number.isSafeInteger(l.quantity)||l.quantity<=0||unitPriceCents===null)throw error('Invalid quote');
       return {description:String(l.description).trim(),quantity:l.quantity,unitPriceCents,lineTotalCents:l.quantity*unitPriceCents,position:pos};
      });
      if(!String(q.title||'').trim()||q.title.trim().length<2||!lines.length||![0,8,16].includes(q.vatRate??16))throw error('Invalid quote');
      const sub=lines.reduce((s,l)=>s+l.lineTotalCents,0),vat=Math.round(sub*(q.vatRate??16)/100);
      t.quotes.unshift({id:uuid(),clientId:null,clientName:String(q.clientName||q.client||'').trim(),title:String(q.title).trim(),notes:String(q.notes||'').trim(),vatRate:q.vatRate??16,status:'draft',validUntil:q.validUntil||null,subtotalCents:sub,vatCents:vat,totalCents:sub+vat,publicToken:Array.from({length:32},()=>'0123456789abcdef'[Math.floor(Math.random()*16)]).join(''),acceptedAt:null,createdAt:now(),updatedAt:now(),lines});
      quoteSection.imported++;
     }catch{quoteSection.errors++;errors.push({row:i+1,section:'quotes',field:'title',reason:'La cotización no pasa la validación (título y al menos una partida válida).'});}
    });
    imported+=quoteSection.imported;bySection.quotes=quoteSection;
   }
   const expenseSection={total:payload.expenses?.length||0,imported:0,errors:0};
   if(Array.isArray(payload.expenses)){
    allowed(t,'C007');
    payload.expenses.forEach((e,i)=>{
     const amountCents=e.amountCents!==undefined?e.amountCents:demoPriceCents(e.amount??e.price);
     const occurredOn=e.occurredOn||e.date||e.fecha;
     if(String(e.description||'').trim().length<2||!Number.isSafeInteger(amountCents)||amountCents<=0||!validExpiry(occurredOn)||!['insumos','renta','servicios','transporte','marketing','personal','impuestos','otros'].includes(e.category||'otros')){
      expenseSection.errors++;errors.push({row:i+1,section:'expenses',field:'description',reason:'El gasto no pasa la validación (concepto, monto y fecha válidos).'});return;
     }
     t.expenses.unshift({id:uuid(),description:String(e.description).trim(),amountCents,occurredOn,category:e.category||'otros',vendor:String(e.vendor||'').trim(),createdAt:now(),updatedAt:now()});
     expenseSection.imported++;
    });
    imported+=expenseSection.imported;bySection.expenses=expenseSection;
   }
   const total=(payload.clients?.length||0)+(payload.catalogItems?.length||0)+(payload.quotes?.length||0)+(payload.expenses?.length||0);
   if(!total)throw error('Invalid import');
   return send({summary:{total,imported,skipped:total-imported,errors:errors.length,duplicates:errors.filter(e=>e.reason.startsWith('Duplicado')).length,bySection},errors});
  };
  const importRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/(clients|catalog)\/import$/);
  if(importRoute&&method==='POST'){
   const t=tenantBySlug(importRoute[1]);
   return send(importRoute[2]==='clients'?demoImportClients(t,input.csv):demoImportCatalog(t,input.csv));
  }
  const migrationRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/migration$/);
  if(migrationRoute&&method==='POST')return demoImportMigration(tenantBySlug(migrationRoute[1]),input);
  const adminImportRoute=p.match(/^\/api\/admin\/tenants\/([a-z0-9-]+)\/import$/);
  if(adminImportRoute&&method==='POST'){
   const t=tenantById(adminImportRoute[1]);
   if(input.kind==='clients')return send(demoImportClients(t,input.csv));
   if(input.kind==='catalog')return send(demoImportCatalog(t,input.csv));
   if(input.kind==='migration')return demoImportMigration(t,input.payload);
   throw error('Invalid import');
  }
  // TOOLS P1-A en memoria para la demo (mismo contrato que el servidor real).
  // Checklists, tareas, formularios y dashboard; variantes de inventario y
  // responsable/recordatorio de agenda van en sus handlers de abajo.
  // (csvCell/toCsv del bloque de commerce van después: este bloque usa su propio helper.)
  const p1aCell=v=>{const t=v==null?'':String(v);return /[",\n\r]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;};
  const p1aCsv=(cols,rows)=>cols.map(c=>p1aCell(c[1])).join(',')+(rows.length?'\r\n'+rows.map(r=>cols.map(c=>p1aCell(r[c[0]])).join(',')).join('\r\n'):'')+'\r\n';
  const p1a=m=>p.match(new RegExp('^/api/app/([a-z0-9-]+)/workflows/'+m+'(?:/([a-z0-9-]+))?(?:/(templates|items|submissions|export|goals))?(?:/([a-z0-9-]+))?$'));
  const variantRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/inventory\/([a-z0-9-]+)\/variants(?:\/([a-z0-9-]+))?$/);
  if(variantRoute){
   const t=tenantBySlug(variantRoute[1]);allowed(t,'C005');
   const item=getRecord(t.items,variantRoute[2]),variantId=variantRoute[3];
   if(method==='POST'){
    const label=String(input.label||'').trim();
    const sku=input.sku?String(input.sku).trim().toUpperCase():null;
    if(label.length<2||sku&&!/^[A-Z0-9][A-Z0-9._-]{1,47}$/.test(sku))throw error('Invalid inventory variant');
    if(sku&&t.variants.some(v=>v.sku===sku))throw error('Duplicate variant SKU',409);
    const v={id:uuid(),itemId:item.id,label,sku,quantity:0,lowStock:Number(input.lowStock)||0,
     warehouse:String(input.warehouse||'').trim(),lot:String(input.lot||'').trim(),
     expiresOn:input.expiresOn||null,supplier:String(input.supplier||'').trim()};
    t.variants.push(v);return send({variant:v});
   }
   const v=getRecord(t.variants.filter(x=>x.itemId===item.id),variantId);
   if(method==='DELETE'){v.archivedAt=now();return send({archived:true});}
   Object.assign(v,{label:String(input.label||v.label).trim(),warehouse:String(input.warehouse??v.warehouse),
    lot:String(input.lot??v.lot),expiresOn:input.expiresOn??v.expiresOn,supplier:String(input.supplier??v.supplier),
    lowStock:input.lowStock??v.lowStock});
   return send({ok:true});
  }
  let dm=p1a('checklists');
  if(dm){
   const t=tenantBySlug(dm[1]),id=dm[2],section=dm[3],itemId=dm[4];allowed(t,'T003');
   const live=c=>!c.archivedAt;
   if(id==='templates'){
    if(method==='GET')return emit({templates:t.checklistTemplates});
    const title=String(input.title||'').trim();
    const items=(Array.isArray(input.items)?input.items:[]).map((x,i)=>({title:String((x?.title ?? x) || '').trim(),position:i})).filter(x=>x.title.length>=2);
    if(title.length<2||!items.length)throw error('Invalid checklist template');
    const tpl={id:uuid(),title,description:String(input.description||'').trim(),items};
    t.checklistTemplates.unshift(tpl);return send({template:tpl});
   }
   if(section==='items'&&itemId&&method==='PATCH'){
    const c=getRecord(t.checklists.filter(live),id);
    const item=getRecord(c.items,itemId);
    item.checkedAt=input.checked?now():null;item.checkedBy=input.checked?'demo':null;
    if(input.evidenceMediaId!==undefined)item.evidenceMediaId=input.evidenceMediaId||null;
    const progress={total:c.items.length,checked:c.items.filter(x=>x.checkedAt).length};
    progress.percent=progress.total?Math.round(progress.checked*100/progress.total):0;
    c.status=progress.total&&progress.checked===progress.total?'completed':'open';
    return send({ok:true,checked:!!input.checked,progress});
   }
   if(section==='items'&&method==='POST'){
    const c=getRecord(t.checklists.filter(live),id);
    const title=String(input.title||'').trim();
    if(title.length<2)throw error('Invalid checklist item');
    const item={id:uuid(),title,assigneeUserId:input.assigneeUserId||null,
     assigneeEmail:t.members.find(m=>m.id===(input.assigneeUserId||null))?.email||null,
     dueOn:input.dueOn||null,checkedAt:null,checkedBy:null,evidenceMediaId:input.evidenceMediaId||null,
     evidenceName:null,position:c.items.length};
    c.items.push(item);return send({item});
   }
   if(id&&method==='DELETE'){getRecord(t.checklists.filter(live),id).archivedAt=now();return send({archived:true});}
   if(method==='GET'){
    const withProgress=t.checklists.filter(live).map(c=>{
     const total=c.items.length,checked=c.items.filter(x=>x.checkedAt).length;
     return {...c,progress:{total,checked,percent:total?Math.round(checked*100/total):0,done:total>0&&checked===total}};
    });
    return emit({checklists:withProgress,members:t.members.filter(m=>m.status==='active').map(m=>({userId:m.id,email:m.email,role:m.role}))});
   }
   const title=String(input.title||'').trim();
   if(title.length<2)throw error('Invalid checklist');
   let items=[];
   if(input.templateId){
    const tpl=t.checklistTemplates.find(x=>x.id===input.templateId);
    if(!tpl)throw error('Template not found',404);
    items=tpl.items.map((x,i)=>({id:uuid(),title:x.title,assigneeUserId:null,assigneeEmail:null,dueOn:null,checkedAt:null,checkedBy:null,evidenceMediaId:null,evidenceName:null,position:i}));
   }else{
    items=(Array.isArray(input.items)?input.items:[]).map((x,i)=>({id:uuid(),title:String((x?.title ?? x) || '').trim(),assigneeUserId:null,assigneeEmail:null,dueOn:null,checkedAt:null,checkedBy:null,evidenceMediaId:null,evidenceName:null,position:i})).filter(x=>x.title.length>=2);
   }
   const c={id:uuid(),templateId:input.templateId||null,templateTitle:t.checklistTemplates.find(x=>x.id===input.templateId)?.title||null,
    title,status:'open',createdAt:now(),updatedAt:now(),items};
   t.checklists.unshift(c);return send({checklist:c});
  }
  dm=p1a('tasks');
  if(dm){
   const t=tenantBySlug(dm[1]),id=dm[2];allowed(t,'T004');
   const live=x=>!x.archivedAt;
   const today=new Date().toISOString().slice(0,10);
   const view=x=>({...x,overdue:!!x.dueOn&&x.status!=='done'&&x.dueOn<today,
    dueBucket:!x.dueOn?'no-date':x.dueOn<today?'overdue':x.dueOn===today?'today':'later'});
   if(method==='GET'){
    let list=t.tasks.filter(live);
    if(url.searchParams.get('assignee'))list=list.filter(x=>x.assigneeUserId===url.searchParams.get('assignee'));
    if(url.searchParams.get('status'))list=list.filter(x=>x.status===url.searchParams.get('status'));
    if(url.searchParams.get('overdue')==='1')list=list.filter(x=>x.dueOn&&x.status!=='done'&&x.dueOn<today);
    if(url.searchParams.get('dueFrom'))list=list.filter(x=>x.dueOn&&x.dueOn>=url.searchParams.get('dueFrom'));
    if(url.searchParams.get('dueTo'))list=list.filter(x=>x.dueOn&&x.dueOn<=url.searchParams.get('dueTo'));
    return emit({tasks:list.map(view),members:t.members.filter(m=>m.status==='active').map(m=>({userId:m.id,email:m.email,role:m.role})),
     notifications:{attempted:0,created:0,pending:list.filter(x=>x.dueOn&&x.status!=='done'&&x.dueOn<today).length},
     overdueCount:list.filter(x=>x.dueOn&&x.status!=='done'&&x.dueOn<today).length});
   }
   if(method==='POST'){
    const title=String(input.title||'').trim();
    if(title.length<2||!['pending','in_progress','done'].includes(input.status||'pending')||!['low','normal','high'].includes(input.priority||'normal'))throw error('Invalid task');
    if(input.assigneeUserId&&!t.members.some(m=>m.id===input.assigneeUserId&&m.status==='active'))throw error('Assignee not found',404);
    const task={id:uuid(),title,notes:String(input.notes||'').trim(),assigneeUserId:input.assigneeUserId||null,
     assigneeEmail:t.members.find(m=>m.id===(input.assigneeUserId||null))?.email||null,
     dueOn:input.dueOn||null,status:input.status||'pending',priority:input.priority||'normal',
     sourceToolId:null,sourceRecordId:null,notifiedAt:null,createdAt:now(),updatedAt:now()};
    t.tasks.unshift(task);return send({task});
   }
   const task=getRecord(t.tasks.filter(live),id);
   if(method==='DELETE'){task.archivedAt=now();return send({archived:true});}
   if(Object.keys(input).length===1&&input.status){
    if(!['pending','in_progress','done'].includes(input.status))throw error('Invalid task');
    task.status=input.status;task.updatedAt=now();return send({ok:true});
   }
   const title=String(input.title||'').trim();
   if(title.length<2)throw error('Invalid task');
   if(input.assigneeUserId&&!t.members.some(m=>m.id===input.assigneeUserId&&m.status==='active'))throw error('Assignee not found',404);
   Object.assign(task,{title,notes:String(input.notes||'').trim(),assigneeUserId:input.assigneeUserId||null,
    assigneeEmail:t.members.find(m=>m.id===(input.assigneeUserId||null))?.email||null,
    dueOn:input.dueOn||null,status:input.status||'pending',priority:input.priority||'normal',updatedAt:now()});
   return send({ok:true});
  }
  dm=p1a('forms');
  if(dm){
   const t=tenantBySlug(dm[1]),id=dm[2],section=dm[3],exportAction=dm[4];allowed(t,'T007');
   const live=x=>!x.archivedAt;
   if(section==='submissions'&&exportAction==='export'&&method==='GET'){
    const form=getRecord(t.forms.filter(live),id);
    const subs=t.formSubmissions.filter(s=>s.formId===id);
    const cols=[['submittedAt','Fecha de respuesta'],...form.fields.map(f=>[f.key,f.label])];
    const csv=p1aCsv(cols,subs.map(s=>({submittedAt:s.createdAt,...s.answers})));
    return emit({filename:'hubie-formulario-'+id.slice(0,8)+'-respuestas.csv',csv});
   }
   if(section==='submissions'){
    const form=getRecord(t.forms.filter(live),id);
    if(method==='GET')return emit({form,submissions:t.formSubmissions.filter(s=>s.formId===id).map(s=>({...s,submittedByEmail:null}))});
    const answers={};
    for(const f of form.fields){
     const raw=input[f.key];
     if(raw===undefined||raw===null||raw===''){if(f.required)throw error('Invalid form submission');answers[f.key]=null;continue;}
     if(f.type==='number'){const n=Number(raw);if(!Number.isFinite(n))throw error('Invalid form submission');answers[f.key]=n;}
     else if(f.type==='select'){if(!f.options.includes(raw))throw error('Invalid form submission');answers[f.key]=raw;}
     else if(f.type==='checkbox'){if(typeof raw!=='boolean')throw error('Invalid form submission');answers[f.key]=raw;}
     else if(f.type==='date'){if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))throw error('Invalid form submission');answers[f.key]=raw;}
     else answers[f.key]=String(raw).trim();
    }
    const sub={id:uuid(),formId:id,answers,submittedBy:'demo',createdAt:now()};
    t.formSubmissions.unshift(sub);return send({submission:sub});
   }
   if(method==='GET')return emit({forms:t.forms.filter(live).map(f=>({...f,submissions:t.formSubmissions.filter(s=>s.formId===f.id).length}))});
   if(id&&method==='DELETE'){getRecord(t.forms.filter(live),id).archivedAt=now();return send({archived:true});}
   const title=String(input.title||'').trim();
   const fields=(Array.isArray(input.fields)?input.fields:[]).map((f,i)=>{
    const key=String(f.key||'').trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
    const label=String(f.label||'').trim();
    if(!key||!label||!['text','number','date','select','checkbox'].includes(f.type))throw error('Invalid form');
    return {key,label,type:f.type,required:f.required===true,options:f.type==='select'?(f.options||[]).filter(Boolean):[],position:i};
   });
   if(title.length<2||!fields.length||new Set(fields.map(f=>f.key)).size!==fields.length)throw error('Invalid form');
   if(id){
    const form=getRecord(t.forms.filter(live),id);
    Object.assign(form,{title,description:String(input.description||'').trim(),fields,updatedAt:now()});
    return send({ok:true});
   }
   const form={id:uuid(),title,description:String(input.description||'').trim(),fields,createdAt:now(),updatedAt:now()};
   t.forms.unshift(form);return send({form});
  }
  dm=p1a('dashboard');
  if(dm){
   const t=tenantBySlug(dm[1]),section=dm[2]==='goals'?'goals':dm[3];allowed(t,'C008');
   const month=url.searchParams.get('from')?.slice(0,7)||new Date().toISOString().slice(0,7);
   const from=url.searchParams.get('from')||month+'-01',to=url.searchParams.get('to')||month+'-31';
   const liveList=list=>list.filter(x=>!x.archivedAt);
   if(section==='goals'){
    if(method==='GET')return emit({goals:t.goals});
    const targetCents=input.targetCents??0;
    if(!/^\d{4}-\d{2}$/.test(input.month||'')||!Number.isSafeInteger(targetCents)||targetCents<0)throw error('Invalid dashboard goal');
    const existing=t.goals.find(g=>g.month===input.month);
    if(existing)existing.targetCents=targetCents;else t.goals.unshift({month:input.month,targetCents});
    return send({goal:{month:input.month,targetCents}});
   }
   const pays=liveList(t.payments).filter(x=>x.paidOn>=from&&x.paidOn<=to);
   const exps=liveList(t.expenses).filter(x=>x.occurredOn>=from&&x.occurredOn<=to);
   const today=new Date().toISOString().slice(0,10);
   const metrics={activeClients:t.clients.filter(c=>c.status==='active').length,
    openQuotes:liveList(t.quotes).filter(q=>['draft','sent'].includes(q.status)).length,
    openQuotesCents:liveList(t.quotes).filter(q=>['draft','sent'].includes(q.status)).reduce((s,q)=>s+q.totalCents,0),
    paymentsCount:pays.length,paymentsCents:pays.reduce((s,x)=>s+x.amountCents,0),
    expensesCount:exps.length,expensesCents:exps.reduce((s,x)=>s+x.amountCents,0),
    appointmentsToday:t.events.filter(e=>['scheduled','confirmed'].includes(e.status)&&(e.startsAt||'').slice(0,10)===today).length,
    lowStockItems:t.items.filter(i=>i.quantity<=i.lowStock).length+t.variants.filter(v=>v.quantity<=v.lowStock).length};
   const goal=t.goals.find(g=>g.month===month);
   const weeks=[];const d=new Date();d.setUTCDate(1);
   const monday=new Date(Date.parse(today+'T00:00:00Z')-((new Date(today+'T00:00:00Z').getUTCDay()+6)%7)*86400000);
   for(let i=11;i>=0;i--){
    const s=new Date(monday.getTime()-i*7*86400000),e=new Date(s.getTime()+6*86400000);
    const ss=s.toISOString().slice(0,10),ee=e.toISOString().slice(0,10);
    weeks.push({weekStart:ss,weekEnd:ee,
     quotesCreated:liveList(t.quotes).filter(q=>(q.createdAt||'').slice(0,10)>=ss&&(q.createdAt||'').slice(0,10)<=ee).length,
     paymentsCents:liveList(t.payments).filter(x=>x.paidOn>=ss&&x.paidOn<=ee).reduce((s2,x)=>s2+x.amountCents,0)});
   }
   return emit({dashboard:true,from,to,month,module:url.searchParams.get('module')||null,metrics,
    goal:goal?{month:goal.month,targetCents:goal.targetCents,actualCents:metrics.paymentsCents,
     percent:goal.targetCents>0?Math.min(100,Math.round(metrics.paymentsCents*100/goal.targetCents)):0,
     remainingCents:Math.max(0,goal.targetCents-metrics.paymentsCents)}:null,
    series:weeks,chartSvg:''});
  }
  // Commerce tools reales (T013/C006/C007/T014/T015/T020) en memoria para la demo.
  const quoteTotals=(lines,vat)=>{const sub=lines.reduce((s,l)=>s+l.lineTotalCents,0);const vatC=Math.round(sub*vat/100);return{subtotalCents:sub,vatCents:vatC,totalCents:sub+vatC};};
  const csvCell=v=>{const t=v==null?'':String(v);return /[",\n\r]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;};
  const toCsv=(cols,rows)=>cols.map(c=>csvCell(c[1])).join(',')+(rows.length?'\r\n'+rows.map(r=>cols.map(c=>csvCell(r[c[0]])).join(',')).join('\r\n'):'')+'\r\n';
  const moneyText=c=>(Number(c||0)/100).toFixed(2);
  const quoteTransitions={draft:['sent','accepted','rejected'],sent:['accepted','rejected','draft'],accepted:[],rejected:['draft']};
  const expenseCats=['insumos','renta','servicios','transporte','marketing','personal','impuestos','otros'];
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/(quotes|catalog|expenses|payments|invoices|reports)(?:\/([a-z0-9-]+))?(?:\/(send|accept|reject|draft|issued|cancelled|export))?$/);
  if(m){
   const t=tenantBySlug(m[1]),module=m[2],id=m[3],action=m[4];
   const tool={quotes:'T013',catalog:'C006',expenses:'C007',payments:'T014',invoices:'T015',reports:'T020'}[module];
   allowed(t,tool);
   const live=list=>list.filter(x=>!x.archivedAt);
   const paidFor=qid=>live(t.payments).filter(x=>x.quoteId===qid).reduce((s,x)=>s+x.amountCents,0);
   const quoteView=q=>({...q,paidCents:paidFor(q.id),balanceCents:Math.max(0,q.totalCents-paidFor(q.id))});
   if(module==='reports'&&(action==='export'||id==='export')&&method==='GET'){
    const kind=url.searchParams.get('kind');
    if(kind==='clients')return emit({filename:'hubie-clientes.csv',csv:toCsv([['name','Nombre'],['company','Empresa'],['email','Correo'],['phone','Teléfono'],['status','Estatus']],live(t.clients))});
    if(kind==='quotes')return emit({filename:'hubie-cotizaciones.csv',csv:toCsv([['title','Cotización'],['clientName','Cliente'],['status','Estatus'],['subtotal','Subtotal MXN'],['vat','IVA MXN'],['total','Total MXN']],live(t.quotes).map(q=>({...q,subtotal:moneyText(q.subtotalCents),vat:moneyText(q.vatCents),total:moneyText(q.totalCents)})))});
    if(kind==='payments')return emit({filename:'hubie-cobros.csv',csv:toCsv([['clientName','Cliente'],['quoteTitle','Cotización'],['amount','Monto MXN'],['method','Método'],['reference','Referencia'],['paidOn','Fecha']],live(t.payments).map(x=>({...x,quoteTitle:t.quotes.find(q=>q.id===x.quoteId)?.title||'',amount:moneyText(x.amountCents)})))});
    if(kind==='expenses')return emit({filename:'hubie-gastos.csv',csv:toCsv([['description','Concepto'],['category','Categoría'],['vendor','Proveedor'],['amount','Monto MXN'],['occurredOn','Fecha']],live(t.expenses).map(x=>({...x,amount:moneyText(x.amountCents)})))});
    throw error('Not found',404);
   }
   if(module==='reports'&&method==='GET'){
    const month=url.searchParams.get('month')||new Date().toISOString().slice(0,7);
    const accepted=live(t.quotes).filter(q=>q.status==='accepted'&&(q.createdAt||'').slice(0,7)===month);
    const pays=live(t.payments).filter(x=>x.paidOn.slice(0,7)===month);
    const exps=live(t.expenses).filter(x=>x.occurredOn.slice(0,7)===month);
    const byCategory={};for(const e of exps)byCategory[e.category]=(byCategory[e.category]||0)+e.amountCents;
    const months=[];const d=new Date();d.setUTCDate(1);
    for(let i=0;i<6;i++){months.unshift(d.toISOString().slice(0,7));d.setUTCMonth(d.getUTCMonth()-1);}
    return emit({month,totals:{acceptedQuotes:accepted.length,acceptedQuotesCents:accepted.reduce((s,q)=>s+q.totalCents,0),
     payments:pays.length,paymentsCents:pays.reduce((s,x)=>s+x.amountCents,0),
     expensesCents:exps.reduce((s,x)=>s+x.amountCents,0),expensesCount:exps.length,
     newClients:0,balanceCents:pays.reduce((s,x)=>s+x.amountCents,0)-exps.reduce((s,x)=>s+x.amountCents,0)},
     expensesByCategory:byCategory,
     byMonth:months.map(mo=>({month:mo,
      paymentsCents:live(t.payments).filter(x=>x.paidOn.slice(0,7)===mo).reduce((s,x)=>s+x.amountCents,0),
      expensesCents:live(t.expenses).filter(x=>x.occurredOn.slice(0,7)===mo).reduce((s,x)=>s+x.amountCents,0)}))});
   }
   if(module==='quotes'){
    const normLines=raw=>{
     if(!Array.isArray(raw)||!raw.length||raw.length>50)throw error('Invalid quote');
     return raw.map((l,i)=>{
      const description=String(l.description||'').trim(),quantity=l.quantity,unitPriceCents=l.unitPriceCents;
      if(!description||!Number.isSafeInteger(quantity)||quantity<=0||quantity>100000||!Number.isSafeInteger(unitPriceCents)||unitPriceCents<0)throw error('Invalid quote');
      return {id:uuid(),description,quantity,unitPriceCents,lineTotalCents:quantity*unitPriceCents,position:i};
     });
    };
    if(method==='GET'&&!id)return emit({quotes:live(t.quotes).map(quoteView),
     clients:t.clients.map(c=>({id:c.id,name:c.name,company:c.company})),statuses:['draft','sent','accepted','rejected'],
     statusLabels:{draft:'Borrador',sent:'Enviada',accepted:'Aceptada',rejected:'Rechazada'},vatRates:[0,8,16]});
    if(method==='GET'&&id){const q=getRecord(live(t.quotes),id);return emit({quote:quoteView({...q,lines:q.lines})});}
    if(method==='POST'&&!id){
     const title=String(input.title||'').trim(),clientName=String(input.clientName||'').trim();
     const vatRate=input.vatRate??16,validUntil=input.validUntil||null;
     if(title.length<2||!clientName||![0,8,16].includes(vatRate)||validUntil&&!validExpiry(validUntil))throw error('Invalid quote');
     if(input.clientId&&!t.clients.some(c=>c.id===input.clientId))throw error('Client not found',404);
     const lines=normLines(input.lines),totals=quoteTotals(lines,vatRate);
     const q={id:uuid(),clientId:input.clientId||null,clientName,title,notes:String(input.notes||'').trim(),
      vatRate,status:'draft',validUntil,...totals,dealId:null,
      publicToken:Array.from({length:32},()=>'0123456789abcdef'[Math.floor(Math.random()*16)]).join(''),
      acceptedAt:null,createdAt:now(),updatedAt:now(),lines};
     t.quotes.unshift(q);return send({quote:quoteView(q)});
    }
    if(id&&action&&method==='POST'){
     const q=getRecord(live(t.quotes),id);
     const next=action==='send'?'sent':action==='accept'?'accepted':action==='reject'?'rejected':'draft';
     if(!quoteTransitions[q.status].includes(next))throw error('Invalid quote status');
     q.status=next;q.acceptedAt=next==='accepted'?now():null;q.updatedAt=now();
     return send({ok:true,status:next});
    }
    if(id&&method==='PATCH'){
     const q=getRecord(live(t.quotes),id);
     if(!['draft','rejected'].includes(q.status))throw error('Invalid quote status');
     const title=String(input.title||'').trim(),clientName=String(input.clientName||'').trim();
     const vatRate=input.vatRate??16;
     if(title.length<2||!clientName||![0,8,16].includes(vatRate))throw error('Invalid quote');
     const lines=normLines(input.lines),totals=quoteTotals(lines,vatRate);
     Object.assign(q,{clientId:input.clientId||null,clientName,title,notes:String(input.notes||'').trim(),vatRate,validUntil:input.validUntil||null,...totals,lines,updatedAt:now()});
     return send({ok:true});
    }
    if(id&&method==='DELETE'){getRecord(live(t.quotes),id).archivedAt=now();return send({archived:true});}
    throw error('Not found',404);
   }
   if(module==='catalog'){
    if(method==='GET')return emit({items:live(t.catalogItems).map(i=>({...i,photoUrl:null})),categories:[...new Set(live(t.catalogItems).map(i=>i.category))]});
    const norm=()=>{
     const sku=String(input.sku||'').trim().toUpperCase(),name=String(input.name||'').trim();
     const priceCents=input.priceCents??0,category=String(input.category||'General').trim()||'General';
     if(name.length<2||!Number.isSafeInteger(priceCents)||priceCents<0||typeof input.active!=='undefined'&&typeof input.active!=='boolean')throw error('Invalid catalog item');
     if(sku&&!/^[A-Z0-9][A-Z0-9._-]{0,47}$/.test(sku))throw error('Invalid catalog item');
     return {sku,name,description:String(input.description||'').trim(),priceCents,category,active:input.active??true};
    };
    if(method==='POST'){
     const item=norm();
     if(item.sku&&live(t.catalogItems).some(x=>x.sku===item.sku))throw error('Duplicate SKU',409);
     const created={id:uuid(),...item,createdAt:now(),updatedAt:now()};t.catalogItems.unshift(created);return send({item:created});
    }
    if(id&&method==='PATCH'){
     const item=norm(),current=getRecord(live(t.catalogItems),id);
     if(item.sku&&live(t.catalogItems).some(x=>x.id!==id&&x.sku===item.sku))throw error('Duplicate SKU',409);
     Object.assign(current,item,{updatedAt:now()});return send({ok:true});
    }
    if(id&&method==='DELETE'){getRecord(live(t.catalogItems),id).archivedAt=now();return send({archived:true});}
    throw error('Not found',404);
   }
   if(module==='expenses'){
    if(method==='GET'){
     const from=url.searchParams.get('from'),to=url.searchParams.get('to'),cat=url.searchParams.get('category');
     const list=live(t.expenses).filter(e=>(!from||e.occurredOn>=from)&&(!to||e.occurredOn<=to)&&(!cat||e.category===cat));
     const byCategory={},byMonth={};let total=0;
     for(const e of list){total+=e.amountCents;byCategory[e.category]=(byCategory[e.category]||0)+e.amountCents;byMonth[e.occurredOn.slice(0,7)]=(byMonth[e.occurredOn.slice(0,7)]||0)+e.amountCents;}
     return emit({expenses:list.map(e=>({...e,receiptCount:0})),summary:{totalCents:total,count:list.length,byCategory,byMonth},
      categories:expenseCats,categoryLabels:{insumos:'Insumos',renta:'Renta',servicios:'Servicios',transporte:'Transporte',marketing:'Marketing',personal:'Personal',impuestos:'Impuestos',otros:'Otros'}});
    }
    const norm=()=>{
     const description=String(input.description||'').trim(),amountCents=input.amountCents,occurredOn=input.occurredOn,category=input.category||'otros';
     if(description.length<2||!Number.isSafeInteger(amountCents)||amountCents<=0||!validExpiry(occurredOn)||!expenseCats.includes(category))throw error('Invalid expense');
     return {description,amountCents,occurredOn,category,vendor:String(input.vendor||'').trim()};
    };
    if(method==='POST'){const e={id:uuid(),...norm(),createdAt:now(),updatedAt:now()};t.expenses.unshift(e);return send({expense:{...e,receiptCount:0}});}
    if(id&&method==='PATCH'){Object.assign(getRecord(live(t.expenses),id),norm(),{updatedAt:now()});return send({ok:true});}
    if(id&&method==='DELETE'){getRecord(live(t.expenses),id).archivedAt=now();return send({archived:true});}
    throw error('Not found',404);
   }
   if(module==='payments'){
    if(method==='GET')return emit({payments:live(t.payments).map(p=>{
     const q=t.quotes.find(x=>x.id===p.quoteId);
     return {...p,quoteTitle:q?.title||null,quoteTotalCents:q?.totalCents??null,quotePaidCents:q?paidFor(q.id):null,
      quoteBalanceCents:q?Math.max(0,q.totalCents-paidFor(q.id)):null};
    }),
    quotes:live(t.quotes).filter(q=>['sent','accepted'].includes(q.status)).map(q=>({id:q.id,title:q.title,clientName:q.clientName,totalCents:q.totalCents,paidCents:paidFor(q.id),balanceCents:Math.max(0,q.totalCents-paidFor(q.id))})),
    clients:t.clients.map(c=>({id:c.id,name:c.name,company:c.company})),methods:['efectivo','transferencia','tarjeta'],
    methodLabels:{efectivo:'Efectivo',transferencia:'Transferencia',tarjeta:'Tarjeta'},canReadQuotes:true});
    if(method==='POST'){
     const amountCents=input.amountCents,paidOn=input.paidOn,method=input.method||'efectivo';
     const clientName=String(input.clientName||'').trim();
     if(!Number.isSafeInteger(amountCents)||amountCents<=0||!validExpiry(paidOn)||!['efectivo','transferencia','tarjeta'].includes(method)||!clientName&&!input.quoteId&&!input.clientId)throw error('Invalid payment');
     if(input.quoteId){
      const q=t.quotes.find(x=>x.id===input.quoteId&&!x.archivedAt);
      if(!q)throw error('Not found',404);
      if(amountCents>Math.max(0,q.totalCents-paidFor(q.id)))throw error('Invalid payment');
     }
     if(input.clientId&&!t.clients.some(c=>c.id===input.clientId))throw error('Client not found',404);
     const pay={id:uuid(),quoteId:input.quoteId||null,clientId:input.clientId||null,clientName,amountCents,paidOn,method,
      reference:String(input.reference||'').trim(),notes:String(input.notes||'').trim(),createdAt:now(),updatedAt:now()};
     t.payments.unshift(pay);return send({payment:pay});
    }
    if(id&&method==='PATCH'){
     const pay=getRecord(live(t.payments),id);
     if(Object.keys(input).some(k=>!['paidOn','method','reference','notes'].includes(k)))throw error('Invalid payment');
     if(!validExpiry(input.paidOn)||!['efectivo','transferencia','tarjeta'].includes(input.method??'efectivo'))throw error('Invalid payment');
     Object.assign(pay,{paidOn:input.paidOn,method:input.method??'efectivo',reference:String(input.reference||'').trim(),notes:String(input.notes||'').trim(),updatedAt:now()});
     return send({ok:true});
    }
    if(id&&method==='DELETE'){getRecord(live(t.payments),id).archivedAt=now();return send({archived:true});}
    throw error('Not found',404);
   }
   if(module==='invoices'){
    if(method==='GET')return emit({invoices:live(t.invoices),acceptedQuotes:live(t.quotes).filter(q=>q.status==='accepted').map(q=>({id:q.id,title:q.title,clientName:q.clientName,totalCents:q.totalCents})),
     statuses:['draft','issued','cancelled'],statusLabels:{draft:'Borrador',issued:'Emitida',cancelled:'Cancelada'},vatRates:[0,8,16]});
    if(method==='POST'&&!id){
     let data;
     if(input.quoteId){
      const q=t.quotes.find(x=>x.id===input.quoteId&&!x.archivedAt);
      if(!q)throw error('Not found',404);
      if(q.status!=='accepted')throw error('Invalid invoice');
      data={clientName:q.clientName,rfc:String(input.rfc||'').trim().toUpperCase(),notes:String(input.notes||'').trim(),vatRate:q.vatRate,quoteId:q.id,lines:q.lines.map(l=>({description:l.description,quantity:l.quantity,unitPriceCents:l.unitPriceCents}))};
     }else{
      const lines=Array.isArray(input.lines)?input.lines:[];
      if(!lines.length)throw error('Invalid invoice');
      data={clientName:String(input.clientName||'').trim(),rfc:String(input.rfc||'').trim().toUpperCase(),notes:String(input.notes||'').trim(),vatRate:input.vatRate??16,quoteId:null,lines};
     }
     if(!data.clientName||data.rfc&&!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(data.rfc))throw error('Invalid invoice');
     const lines=data.lines.map((l,i)=>{
      const description=String(l.description||'').trim();
      if(!description||!Number.isSafeInteger(l.quantity)||l.quantity<=0||!Number.isSafeInteger(l.unitPriceCents)||l.unitPriceCents<0)throw error('Invalid invoice');
      return {id:uuid(),description,quantity:l.quantity,unitPriceCents:l.unitPriceCents,lineTotalCents:l.quantity*l.unitPriceCents,position:i};
     });
     const totals=quoteTotals(lines,data.vatRate);
     const folio=Math.max(0,...live(t.invoices).map(x=>x.folio))+1;
     const inv={id:uuid(),folio,folioLabel:'F-'+String(folio).padStart(4,'0'),quoteId:data.quoteId,clientName:data.clientName,rfc:data.rfc,
      items:lines,...totals,vatRate:data.vatRate,status:'draft',notes:data.notes,createdAt:now(),updatedAt:now(),cfdi:false,cfdiNote:'Sin CFDI (pendiente PAC)'};
     t.invoices.unshift(inv);return send({invoice:inv});
    }
    if(id&&action&&method==='POST'){
     const inv=getRecord(live(t.invoices),id);
     const allowedNext={draft:['issued','cancelled'],issued:['cancelled'],cancelled:[]};
     if(!allowedNext[inv.status].includes(action))throw error('Invalid invoice');
     inv.status=action;inv.updatedAt=now();return send({ok:true,status:action});
    }
    if(id&&method==='DELETE'){getRecord(live(t.invoices),id).archivedAt=now();return send({archived:true});}
    throw error('Not found',404);
   }
   throw error('Not found',404);
  }
  // Búsqueda global + notificaciones (frente BÚSQUEDA + NOTIFICACIONES).
  // Demo en memoria: mismo contrato que /api real (grupos con límite 10,
  // centro con contador, marcar leída / todas). Sin Turso ni correo.
  const demoNotify=(tenant,type,title,body,link)=>{
   if(tenant.notifications.some(n=>n.type===type&&n.link===link&&!n.readAt))return false;
   tenant.notifications.unshift({id:uuid(),userId:null,type,title,body,link,readAt:null,createdAt:now()});
   return true;
  };
  const demoGenerate=tenant=>{
   let created=0;
   const today=new Date().toISOString().slice(0,10);
   const in3=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
   for(const q of tenant.quotes.filter(x=>!x.archivedAt&&x.status==='sent'&&x.validUntil&&x.validUntil<=in3)){
    if(demoNotify(tenant,'quote_expiring',(q.validUntil<today?'Cotización vencida: ':'Cotización por vencer: ')+q.title,
     (q.clientName?'Cliente: '+q.clientName+'. ':'')+'Vigencia: '+q.validUntil+'.',
     '/app/?tenant='+tenant.slug+'&tool=T013&record='+q.id))created++;
   }
   const in24=new Date(Date.now()+24*3600000).toISOString();
   for(const e of tenant.events.filter(x=>x.status==='scheduled'&&x.startsAt>=now()&&x.startsAt<=in24)){
    if(demoNotify(tenant,'appointment_soon','Cita en las próximas 24 h: '+e.title,
     (e.customer?'Cliente: '+e.customer+'. ':'')+'Inicia: '+new Date(e.startsAt).toLocaleString('es-MX')+'.',
     '/app/?tenant='+tenant.slug+'&tool=C004&record='+e.id))created++;
   }
   for(const pay of tenant.payments.filter(x=>x.status==='pending'&&x.dueAt&&x.dueAt<now())){
    if(demoNotify(tenant,'payment_overdue','Cobro vencido: $'+(Number(pay.amountCents)/100).toLocaleString('es-MX')+' MXN',
     'Vencimiento: '+pay.dueAt+'.','/app/?tenant='+tenant.slug+'&view=billing'))created++;
   }
   return created;
  };
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/search$/);
  if(m&&method==='GET'){
   const tenant=tenantBySlug(m[1]);
   const q=(url.searchParams.get('q')||'').trim().replace(/\s+/g,' ');
   if(q.length<2||q.length>100)throw error('Invalid search query');
   const needle=q.toLowerCase();
   const enabled=id=>tenant.tools.some(x=>x.id===id&&x.enabled);
   const match=(...values)=>values.some(v=>String(v??'').toLowerCase().includes(needle));
   const groups=[];
   const push=(module,toolId,label,items)=>{if(enabled(toolId)&&items.length)groups.push({module,toolId,label,items:items.slice(0,10)});};
   push('clients','C001','Clientes',tenant.clients.filter(c=>!c.archivedAt&&match(c.name,c.company,c.email)).map(c=>({id:c.id,title:c.name,detail:[c.company,c.email].filter(Boolean).join(' · '),toolId:'C001',module:'clients',link:'/app/?tenant='+tenant.slug+'&tool=C001&record='+c.id})));
   push('quotes','T013','Cotizaciones',tenant.quotes.filter(x=>!x.archivedAt&&match(x.title,x.clientName)).map(x=>({id:x.id,title:x.title,detail:[x.clientName,x.status].filter(Boolean).join(' · '),toolId:'T013',module:'quotes',link:'/app/?tenant='+tenant.slug+'&tool=T013&record='+x.id})));
   push('catalog','C006','Catálogo',tenant.catalogItems.filter(x=>!x.archivedAt&&match(x.name,x.sku)).map(x=>({id:x.id,title:x.name,detail:x.sku||'',toolId:'C006',module:'catalog',link:'/app/?tenant='+tenant.slug+'&tool=C006&record='+x.id})));
   push('expenses','C007','Gastos',tenant.expenses.filter(x=>!x.archivedAt&&match(x.description,x.vendor)).map(x=>({id:x.id,title:x.description,detail:x.vendor||'',toolId:'C007',module:'expenses',link:'/app/?tenant='+tenant.slug+'&tool=C007&record='+x.id})));
   push('cases','C003','Expedientes',tenant.cases.filter(x=>!x.archivedAt&&match(x.title,x.clientName)).map(x=>({id:x.id,title:x.title,detail:x.clientName||'',toolId:'C003',module:'cases',link:'/app/?tenant='+tenant.slug+'&tool=C003&record='+x.id})));
   push('agenda','C004','Agenda',tenant.events.filter(x=>match(x.title,x.customer)).map(x=>({id:x.id,title:x.title,detail:x.customer||'',toolId:'C004',module:'agenda',link:'/app/?tenant='+tenant.slug+'&tool=C004&record='+x.id})));
   push('crm','C002','CRM',tenant.deals.filter(x=>!x.archivedAt&&match(x.title,x.customer)).map(x=>({id:x.id,title:x.title,detail:[x.customer,x.stage].filter(Boolean).join(' · '),toolId:'C002',module:'crm',link:'/app/?tenant='+tenant.slug+'&tool=C002&record='+x.id})));
   push('inventory','C005','Inventario',tenant.items.filter(x=>!x.archivedAt&&match(x.title,x.sku)).map(x=>({id:x.id,title:x.title,detail:(x.sku||'')+' · Existencias: '+x.quantity,toolId:'C005',module:'inventory',link:'/app/?tenant='+tenant.slug+'&tool=C005&record='+x.id})));
   return emit({query:q,total:groups.reduce((n,g)=>n+g.items.length,0),groups});
  }
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/notifications(?:\/([a-z0-9-]+)(?:\/(read))?)?$/);
  if(m){
   const tenant=tenantBySlug(m[1]),target=m[2],action=m[3];
   if(method==='GET'&&!target){
    demoGenerate(tenant);
    const list=[...tenant.notifications].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    return emit({notifications:list,unread:list.filter(n=>!n.readAt).length});
   }
   if(method==='POST'&&target==='read-all'){
    let n=0;for(const item of tenant.notifications)if(!item.readAt){item.readAt=now();n++;}
    return send({read:n});
   }
   if(method==='POST'&&target&&action==='read'){
    const item=tenant.notifications.find(n=>n.id===target);
    if(!item)throw error('Not found',404);
    if(!item.readAt)item.readAt=now();
    return send({read:true});
   }
   throw error('Not found',404);
  }
  if(p==='/api/admin/tenants/search'&&method==='GET'){
   const q=(url.searchParams.get('q')||'').trim().replace(/\s+/g,' ');
   if(q.length<2||q.length>100)throw error('Invalid search query');
   const needle=q.toLowerCase();
   const found=state.tenants.filter(t=>{
    const owner=t.members.find(x=>x.role==='owner')?.email||'';
    return t.name.toLowerCase().includes(needle)||t.slug.toLowerCase().includes(needle)||owner.toLowerCase().includes(needle);
   }).slice(0,20);
   return emit({query:q,tenants:found.map(t=>({id:t.id,slug:t.slug,name:t.name,
    ownerEmail:t.members.find(x=>x.role==='owner')?.email||null,
    billingStatus:'none',billingStatusLabel:'Sin suscripción',pastDueSince:null}))});
  }
  if(p==='/api/admin/notifications'&&method==='GET'){
   const all=state.tenants.flatMap(t=>t.notifications.map(n=>({...n,organizationId:t.id,tenantName:t.name,tenantSlug:t.slug,typeLabel:n.type})));
   all.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
   return emit({notifications:all.slice(0,100),unread:all.filter(n=>!n.readAt).length});
  }
  if(p==='/api/admin/notifications/generate'&&method==='POST'){
   let created=0;for(const t of state.tenants)created+=demoGenerate(t);
   return send({tenants:state.tenants.length,created});
  }
  if(p==='/api/admin/billing/sweep'&&method==='POST'){
   // La demo no tiene suscripciones past_due: nada que suspender.
   return send({checked:0,suspended:[],suspendedCount:0});
  }
  // Capacitaciones (T022): espejo en memoria del contrato real
  // /api/app/<slug>/training/... (platform/training-store.mjs,
  // training-domain.mjs, migración 026). Los datos viven solo en
  // sessionStorage de esta pestaña (demo).
  const trRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/training(?:\/(.*))?$/);
  if(trRoute){
   const tenant=tenantBySlug(trRoute[1]);
   if(catalog.tools.some(t=>t.id==='T022'))allowed(tenant,'T022');
   const tr=tenant.training;
   const seg=(trRoute[2]||'').split('/').filter(Boolean);
   const escCsv=v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
   const csvRow=vals=>vals.map(escCsv).join(',');
   const FOLIO_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
   const genFolio=()=>{let s='';for(let i=0;i<6;i++)s+=FOLIO_ALPHABET[Math.floor(Math.random()*FOLIO_ALPHABET.length)];return 'CAP-'+new Date().getFullYear()+'-'+s;};
   const courseOf=id=>getRecord(tr.courses,id);
   const employeeOf=id=>getRecord(tr.employees,id);
   const sessionOf=id=>getRecord(tr.sessions,id);
   const enrollmentOf=id=>getRecord(tr.enrollments,id);
   const moduleOf=(cid,mid)=>getRecord(tr.modules.filter(m=>m.courseId===cid),mid);
   const activeModules=cid=>tr.modules.filter(m=>m.courseId===cid&&m.status!=='archivado');
   const moduleView=m=>({...m,quizConfig:m.quizConfig||null,
    quiz:m.quizConfig?{hasQuiz:true,passingScore:m.quizConfig.passingScore,maxAttempts:m.quizConfig.maxAttempts,questionCount:m.quizConfig.questions.length}:{hasQuiz:false,passingScore:null,maxAttempts:null,questionCount:0}});
   const courseView=c=>({...c,sessions:tr.sessions.filter(s=>s.courseId===c.id).length,
    enrollments:tr.enrollments.filter(x=>x.courseId===c.id&&x.status!=='cancelado').length,
    modules:tr.modules.filter(m=>m.courseId===c.id&&m.status!=='archivado').length});
   const progressRow=enrId=>{
    const enr=enrollmentOf(enrId),mods=activeModules(enr.courseId);
    const done=new Set(tr.completions.filter(x=>x.enrollmentId===enrId&&mods.some(m=>m.id===x.moduleId)).map(x=>x.moduleId));
    const total=mods.length,completed=done.size,percent=total?Math.round(100*completed/total):0;
    let row=tr.progress.find(p=>p.enrollmentId===enrId);
    if(!row){row={enrollmentId:enrId,completedModules:completed,totalModules:total,percent,updatedAt:now()};tr.progress.push(row);}
    else{row.completedModules=completed;row.totalModules=total;row.percent=percent;row.updatedAt=now();}
    return row;
   };
   const progressDetail=enrId=>{
    const enr=enrollmentOf(enrId),row=progressRow(enrId),mods=activeModules(enr.courseId);
    return {enrollmentId:enr.id,employeeId:enr.employeeId,courseId:enr.courseId,status:enr.status,
     completedModules:row.completedModules,totalModules:row.totalModules,percent:row.percent,updatedAt:row.updatedAt,
     modules:mods.map(m=>({id:m.id,title:m.title,type:m.type,position:m.position,
      completed:tr.completions.some(x=>x.enrollmentId===enrId&&x.moduleId===m.id),
      bestScore:m.type==='certification'?(()=>{const s=tr.attempts.filter(a=>a.enrollmentId===enrId&&a.moduleId===m.id).map(a=>a.score);return s.length?Math.max(...s):null;})():null}))};
   };
   const enrollmentView=x=>{const p=tr.progress.find(p=>p.enrollmentId===x.id);
    return {...x,employeeName:tr.employees.find(e=>e.id===x.employeeId)?.name||'',courseName:tr.courses.find(c=>c.id===x.courseId)?.name||'',progressPercent:p?p.percent:0};};
   const evaluationOf=enrId=>tr.evaluations.find(v=>v.enrollmentId===enrId)||null;
   const bestAttempt=(enrId,mid)=>{const s=tr.attempts.filter(a=>a.enrollmentId===enrId&&a.moduleId===mid).map(a=>a.score);return s.length?Math.max(...s):null;};
   const hasPassed=(enrId,mid)=>tr.attempts.some(a=>a.enrollmentId===enrId&&a.moduleId===mid&&a.passed);
   const validCourse=(input,base={})=>{
    if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid course');
    const merged={...base,...input};
    const name=String(merged.name||'').trim();
    if(name.length<4||name.length>140)throw error('Invalid course');
    if(merged.durationHours!==undefined&&merged.durationHours!==null&&(typeof merged.durationHours!=='number'||!Number.isFinite(merged.durationHours)||merged.durationHours<0||merged.durationHours>10000))throw error('Invalid course');
    if(merged.minScore!==undefined&&merged.minScore!==null&&(!Number.isInteger(merged.minScore)||merged.minScore<0||merged.minScore>100))throw error('Invalid course');
    if(merged.validUntil!==undefined&&merged.validUntil!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(merged.validUntil))throw error('Invalid course');
    return {name,description:String(merged.description||'').slice(0,2000),durationHours:merged.durationHours??0,
     modality:['presencial','en línea','mixta'].includes(merged.modality)?merged.modality:'en línea',
     instructor:String(merged.instructor||'').slice(0,160),materials:String(merged.materials||'').slice(0,4000),
     validUntil:merged.validUntil||null,
     status:['borrador','activo','archivado'].includes(merged.status)?merged.status:'borrador',
     minScore:merged.minScore??70,category:String(merged.category||'').slice(0,80)};
   };
   const validModule=(input,base={})=>{
    if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid module');
    const merged={...base,...input};
    const title=String(merged.title||'').trim();
    if(title.length<2||title.length>160)throw error('Invalid module');
    if(merged.position!==undefined&&(!Number.isInteger(merged.position)||merged.position<0||merged.position>10000))throw error('Invalid module');
    return {type:['learning','certification'].includes(merged.type)?merged.type:'learning',title,
     description:String(merged.description||'').slice(0,2000),content:String(merged.content||'').slice(0,8000),
     position:merged.position??0,status:['borrador','activo','archivado'].includes(merged.status)?merged.status:'borrador'};
   };
   const validQuiz=q=>{
    if(!q||typeof q!=='object'||Array.isArray(q)||!Array.isArray(q.questions)||!q.questions.length||q.questions.length>50)throw error('Invalid quiz');
    if(q.passingScore!==undefined&&q.passingScore!==null&&(!Number.isInteger(q.passingScore)||q.passingScore<0||q.passingScore>100))throw error('Invalid quiz');
    if(q.maxAttempts!==undefined&&q.maxAttempts!==null&&(!Number.isInteger(q.maxAttempts)||q.maxAttempts<1||q.maxAttempts>20))throw error('Invalid quiz');
    const used=new Set(),questions=q.questions.map((qq,i)=>{
     if(!qq||typeof qq!=='object'||Array.isArray(qq))throw error('Invalid quiz');
     const id=qq.id===undefined||qq.id===null?'q'+(i+1):qq.id;
     if(typeof id!=='string'||!/^[a-z][a-z0-9_]{1,24}$/.test(id)||used.has(id))throw error('Invalid quiz');
     used.add(id);
     const text=String(qq.text||'').trim();
     if(text.length<2||text.length>500)throw error('Invalid quiz');
     if(!Array.isArray(qq.options)||qq.options.length<2||qq.options.length>6)throw error('Invalid quiz');
     const options=qq.options.map(o=>String(o||'').trim());
     if(options.some(o=>!o||o.length>300))throw error('Invalid quiz');
     if(!Number.isInteger(qq.correctIndex)||qq.correctIndex<0||qq.correctIndex>=options.length)throw error('Invalid quiz');
     return {id,text,options,correctIndex:qq.correctIndex,points:qq.points===undefined||qq.points===null?1:qq.points};
    });
    for(const qq of questions)if(!Number.isInteger(qq.points)||qq.points<1||qq.points>100)throw error('Invalid quiz');
    return {passingScore:q.passingScore??null,maxAttempts:q.maxAttempts??null,questions};
   };
   const scoreQuiz=(quiz,answers,minScore)=>{
    const totalPoints=quiz.questions.reduce((a,q)=>a+q.points,0);
    let earnedPoints=0,correctCount=0;
    for(const qq of quiz.questions){if(answers[qq.id]===qq.correctIndex){earnedPoints+=qq.points;correctCount++;}}
    const score=totalPoints?Math.round(100*earnedPoints/totalPoints):0;
    return {score,passed:score>=(quiz.passingScore??minScore),earnedPoints,totalPoints,correctCount,totalQuestions:quiz.questions.length,answeredCount:Object.keys(answers).length};
   };
   // ---- Tablero ----
   if((seg.length===0||seg[0]==='dashboard')&&seg.length<=1&&method==='GET'){
    const inTraining=new Set(tr.enrollments.filter(x=>['inscrito','en curso'].includes(x.status)).map(x=>x.employeeId));
    const activeEnrs=tr.enrollments.filter(x=>['inscrito','en curso','completado'].includes(x.status));
    const percents=activeEnrs.map(x=>progressRow(x.id).percent);
    const global=percents.length?Math.round(percents.reduce((a,b)=>a+b,0)/percents.length):null;
    const in30=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
    const expiring=tr.courses.filter(c=>c.status==='activo'&&c.validUntil&&c.validUntil<=in30).map(c=>({id:c.id,name:c.name,validUntil:c.validUntil}));
    const pending=tr.enrollments.filter(x=>x.status!=='cancelado'&&!evaluationOf(x.id)&&(x.status==='completado'||progressRow(x.id).percent===100))
     .map(x=>({enrollmentId:x.id,employeeId:x.employeeId,courseId:x.courseId,employeeName:tr.employees.find(e=>e.id===x.employeeId)?.name||'',courseName:tr.courses.find(c=>c.id===x.courseId)?.name||''}));
    const upcoming=tr.sessions.filter(s=>Date.parse(s.startsAt)>=Date.now()).length;
    return emit({kpis:{employeesInTraining:inTraining.size,globalProgress:global,activeCourses:tr.courses.filter(c=>c.status==='activo').length,
     totalEmployees:tr.employees.length,activeEnrollments:tr.enrollments.filter(x=>x.status!=='cancelado').length,
     certificatesIssued:tr.certificates.length,upcomingSessions:upcoming},
     coursesExpiring:expiring,pendingEvaluations:pending,reminders:{created:0}});
   }
   // ---- Exportar CSV ----
   if(seg[0]==='export'&&method==='GET'){
    const kind=url.searchParams.get('kind');
    if(kind==='progress'){
     const lines=[csvRow(['Empleado','Curso','Estatus inscripción','Módulos completados','Módulos totales','Avance %','Calificación','Aprobado'])];
     for(const x of tr.enrollments){
      const p=progressRow(x.id),v=evaluationOf(x.id);
      lines.push(csvRow([tr.employees.find(e=>e.id===x.employeeId)?.name||'',tr.courses.find(c=>c.id===x.courseId)?.name||'',x.status,p.completedModules,p.totalModules,p.percent,v?v.score:'',v?(v.passed?'Sí':'No'):'']));
     }
     return emit({csv:lines.join('\n'),filename:'hubie-capacitacion-avance.csv'});
    }
    if(kind==='attendance'){
     const lines=[csvRow(['Sesión','Curso','Empleado','Asistencia'])];
     for(const a of tr.attendance){
      const s=tr.sessions.find(s=>s.id===a.sessionId);
      lines.push(csvRow([s?.startsAt||'',s?tr.courses.find(c=>c.id===s.courseId)?.name||'':'',tr.employees.find(e=>e.id===a.employeeId)?.name||'',a.status]));
     }
     return emit({csv:lines.join('\n'),filename:'hubie-capacitacion-asistencia.csv'});
    }
    throw error('Invalid export',400);
   }
   // ---- Cursos ----
   if(seg[0]==='courses'&&seg.length===1){
    if(method==='GET'){
     const status=url.searchParams.get('status');
     return emit({courses:tr.courses.filter(c=>!status||c.status===status).map(courseView)});
    }
    if(method==='POST'){const c={id:uuid(),...validCourse(input),createdAt:now(),updatedAt:now()};tr.courses.unshift(c);demoAudit(tenant,'training.course_created',c.id);return send({course:c});}
    throw error('Not found',404);
   }
   if(seg[0]==='courses'&&seg.length===2&&method==='PATCH'){
    const c=courseOf(seg[1]);
    if(input&&Object.keys(input).length===1&&'status' in input){
     if(!['borrador','activo','archivado'].includes(input.status))throw error('Invalid course');
     c.status=input.status;c.updatedAt=now();return send({ok:true,status:input.status});
    }
    Object.assign(c,validCourse(input,c),{updatedAt:now()});return send({course:c});
   }
   if(seg[0]==='courses'&&seg.length===3&&seg[2]==='history'&&method==='GET'){
    const c=courseOf(seg[1]);
    const sessions=tr.sessions.filter(s=>s.courseId===c.id).map(s=>({...s,attendance:tr.attendance.filter(a=>a.sessionId===s.id).length,present:tr.attendance.filter(a=>a.sessionId===s.id&&a.status==='presente').length}));
    const enrollments=tr.enrollments.filter(x=>x.courseId===c.id).map(x=>{const p=progressRow(x.id),v=evaluationOf(x.id);
     return {id:x.id,employeeId:x.employeeId,status:x.status,createdAt:x.createdAt,employeeName:tr.employees.find(e=>e.id===x.employeeId)?.name||'',
      progress:{completedModules:p.completedModules,totalModules:p.totalModules,percent:p.percent},
      evaluation:v?{score:v.score,passed:v.passed}:null,certificates:tr.certificates.filter(t=>t.enrollmentId===x.id).length};});
    return emit({course:courseView(c),sessions,enrollments,modules:tr.modules.filter(m=>m.courseId===c.id).map(moduleView),certificatesIssued:tr.certificates.filter(t=>t.courseId===c.id).length});
   }
   // ---- Módulos y quizzes ----
   if(seg[0]==='courses'&&seg.length===3&&seg[2]==='modules'){
    const c=courseOf(seg[1]);
    if(method==='GET')return emit({modules:tr.modules.filter(m=>m.courseId===c.id).sort((a,b)=>(a.position||0)-(b.position||0)).map(moduleView)});
    if(method==='POST'){
     const m={id:uuid(),courseId:c.id,...validModule(input),quizConfig:null,createdAt:now(),updatedAt:now()};
     tr.modules.push(m);return send({module:moduleView(m)});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='courses'&&seg.length===4&&seg[2]==='modules'){
    const m=moduleOf(seg[1],seg[3]);
    if(method==='PATCH'){Object.assign(m,validModule(input,m),{updatedAt:now()});return send({module:moduleView(m)});}
    if(method==='DELETE'){
     if(tr.attempts.some(a=>a.moduleId===m.id))throw error('Invalid module');
     tr.modules.splice(tr.modules.indexOf(m),1);
     for(const x of tr.enrollments.filter(x=>x.courseId===seg[1]))progressRow(x.id);
     return send({ok:true});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='courses'&&seg.length===5&&seg[2]==='modules'&&seg[4]==='quiz'){
    const m=moduleOf(seg[1],seg[3]),course=courseOf(seg[1]);
    if(method==='GET'){
     if(m.type!=='certification'||!m.quizConfig)throw error('Not found',404);
     return emit({module:{id:m.id,courseId:m.courseId,title:m.title,passingScore:m.quizConfig.passingScore??course.minScore,maxAttempts:m.quizConfig.maxAttempts,
      questions:m.quizConfig.questions.map(q=>({id:q.id,text:q.text,options:q.options,points:q.points}))}});
    }
    if(method==='PUT'){
     if(m.type!=='certification')throw error('Invalid quiz');
     if(tr.attempts.some(a=>a.moduleId===m.id))throw error('Invalid quiz');
     m.quizConfig=validQuiz(input);m.updatedAt=now();return send({module:moduleView(m)});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='courses'&&seg.length===5&&seg[2]==='modules'&&seg[4]==='attempts'){
    const m=moduleOf(seg[1],seg[3]),course=courseOf(seg[1]);
    if(method==='GET'){
     const q=url.searchParams;
     return emit({attempts:tr.attempts.filter(a=>a.moduleId===m.id&&(!q.get('employeeId')||a.employeeId===q.get('employeeId'))&&(!q.get('enrollmentId')||a.enrollmentId===q.get('enrollmentId')))});
    }
    if(method==='POST'){
     if(m.type!=='certification'||!m.quizConfig)throw error('Invalid attempt');
     const enr=enrollmentOf(input?.enrollmentId);
     if(enr.courseId!==seg[1]||enr.status==='cancelado')throw error('Invalid attempt');
     if(!input?.answers||typeof input.answers!=='object'||Array.isArray(input.answers))throw error('Invalid attempt');
     const ids=new Set(m.quizConfig.questions.map(q=>q.id));
     if(Object.keys(input.answers).some(k=>!ids.has(k)))throw error('Invalid attempt');
     const answers={};
     for(const qq of m.quizConfig.questions){
      const v=input.answers[qq.id];
      if(v===undefined||v===null)continue;
      if(!Number.isInteger(v)||v<0||v>=qq.options.length)throw error('Invalid attempt');
      answers[qq.id]=v;
     }
     const count=tr.attempts.filter(a=>a.moduleId===m.id&&a.enrollmentId===enr.id).length;
     if(m.quizConfig.maxAttempts!==null&&count>=m.quizConfig.maxAttempts)throw error('Invalid attempt');
     const result=scoreQuiz(m.quizConfig,answers,course.minScore);
     const attempt={id:uuid(),moduleId:m.id,enrollmentId:enr.id,employeeId:enr.employeeId,answers,score:result.score,passed:result.passed,attemptNumber:count+1,correctCount:result.correctCount,totalQuestions:result.totalQuestions,moduleTitle:m.title,employeeName:tr.employees.find(e=>e.id===enr.employeeId)?.name||'',createdAt:now()};
     tr.attempts.push(attempt);
     demoAudit(tenant,'training.attempt_recorded',attempt.id);
     if(result.passed&&!tr.completions.some(x=>x.enrollmentId===enr.id&&x.moduleId===m.id))tr.completions.push({enrollmentId:enr.id,moduleId:m.id,createdAt:now()});
     if(enr.status==='inscrito')enr.status='en curso';
     const progress=progressRow(enr.id);
     return send({attempt:{id:attempt.id,moduleId:m.id,enrollmentId:enr.id,employeeId:enr.employeeId,score:result.score,passed:result.passed,attemptNumber:count+1,correctCount:result.correctCount,totalQuestions:result.totalQuestions},progress});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='courses'&&seg.length===5&&seg[2]==='modules'&&seg[4]==='complete'&&method==='POST'){
    const m=moduleOf(seg[1],seg[3]);
    if(m.type!=='learning'||m.status==='archivado')throw error('Invalid module');
    const enr=enrollmentOf(input?.enrollmentId);
    if(enr.courseId!==seg[1]||enr.status==='cancelado')throw error('Invalid module');
    if(!tr.completions.some(x=>x.enrollmentId===enr.id&&x.moduleId===m.id))tr.completions.push({enrollmentId:enr.id,moduleId:m.id,createdAt:now()});
    if(enr.status==='inscrito')enr.status='en curso';
    return send({completed:true,moduleId:m.id,enrollmentId:enr.id,progress:progressRow(enr.id)});
   }
   // ---- Sesiones ----
   if(seg[0]==='sessions'&&seg.length===1){
    if(method==='GET'){
     const courseId=url.searchParams.get('courseId');
     if(courseId)courseOf(courseId);
     return emit({sessions:tr.sessions.filter(s=>!courseId||s.courseId===courseId).map(s=>({...s,courseName:tr.courses.find(c=>c.id===s.courseId)?.name||'',attendance:tr.attendance.filter(a=>a.sessionId===s.id).length}))});
    }
    if(method==='POST'){
     if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid session');
     const c=courseOf(input.courseId);
     if(typeof input.startsAt!=='string'||isNaN(Date.parse(input.startsAt))||typeof input.endsAt!=='string'||isNaN(Date.parse(input.endsAt))||Date.parse(input.endsAt)<=Date.parse(input.startsAt))throw error('Invalid session');
     if(!Number.isInteger(input.capacity)||input.capacity<1||input.capacity>10000)throw error('Invalid session');
     const s={id:uuid(),courseId:c.id,startsAt:new Date(input.startsAt).toISOString(),endsAt:new Date(input.endsAt).toISOString(),placeOrLink:String(input.placeOrLink||'').slice(0,300),capacity:input.capacity,instructor:String(input.instructor||'').slice(0,160),createdAt:now(),updatedAt:now()};
     tr.sessions.unshift(s);return send({session:s});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='sessions'&&seg.length===2&&method==='PATCH'){
    const s=sessionOf(seg[1]);
    const base={courseId:s.courseId,startsAt:s.startsAt,endsAt:s.endsAt,placeOrLink:s.placeOrLink,capacity:s.capacity,instructor:s.instructor};
    const next={...base,...input};
    if(typeof next.startsAt!=='string'||isNaN(Date.parse(next.startsAt))||typeof next.endsAt!=='string'||isNaN(Date.parse(next.endsAt))||Date.parse(next.endsAt)<=Date.parse(next.startsAt))throw error('Invalid session');
    if(!Number.isInteger(next.capacity)||next.capacity<1||next.capacity>10000)throw error('Invalid session');
    Object.assign(s,{startsAt:new Date(next.startsAt).toISOString(),endsAt:new Date(next.endsAt).toISOString(),placeOrLink:String(next.placeOrLink||'').slice(0,300),capacity:next.capacity,instructor:String(next.instructor||'').slice(0,160),updatedAt:now()});
    return send({session:s});
   }
   // ---- Empleados ----
   if(seg[0]==='employees'&&seg.length===1){
    if(method==='GET')return emit({employees:tr.employees.map(e=>({...e,enrollments:tr.enrollments.filter(x=>x.employeeId===e.id&&x.status!=='cancelado').length}))});
    if(method==='POST'){
     const name=String(input?.name||'').trim(),email=String(input?.email||'').trim().toLowerCase();
     if(name.length<2||name.length>160||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)||email.length>200)throw error('Invalid employee');
     if(tr.employees.some(e=>e.email===email))throw error('Duplicate employee email',409);
     const e={id:uuid(),name,email,position:String(input.position||'').slice(0,120),area:String(input.area||'').slice(0,120),
      fechaIngreso:input.fechaIngreso||null,tipoContrato:input.tipoContrato||null,
      salarioMensualCents:Number.isInteger(input.salarioMensualCents)?input.salarioMensualCents:null,
      estado:['activo','inactivo'].includes(input.estado)?input.estado:'activo',createdAt:now(),updatedAt:now()};
     tr.employees.push(e);return send({employee:e});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='employees'&&seg.length===2&&method==='PATCH'){
    const e=employeeOf(seg[1]);
    const base={name:e.name,email:e.email,position:e.position,area:e.area,fechaIngreso:e.fechaIngreso??null,tipoContrato:e.tipoContrato??null,salarioMensualCents:e.salarioMensualCents??null,estado:e.estado||'activo'};
    const next={...base,...input};
    const name=String(next.name||'').trim(),email=String(next.email||'').trim().toLowerCase();
    if(name.length<2||name.length>160||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)||email.length>200)throw error('Invalid employee');
    if(tr.employees.some(x=>x.id!==e.id&&x.email===email))throw error('Duplicate employee email',409);
    Object.assign(e,{name,email,position:String(next.position||'').slice(0,120),area:String(next.area||'').slice(0,120),
     fechaIngreso:next.fechaIngreso||null,tipoContrato:next.tipoContrato||null,
     salarioMensualCents:Number.isInteger(next.salarioMensualCents)?next.salarioMensualCents:null,
     estado:['activo','inactivo'].includes(next.estado)?next.estado:'activo',updatedAt:now()});
    return send({employee:e});
   }
   if(seg[0]==='employees'&&seg.length===3&&seg[2]==='history'&&method==='GET'){
    const e=employeeOf(seg[1]);
    const enrollments=tr.enrollments.filter(x=>x.employeeId===e.id).map(x=>{const p=progressRow(x.id),v=evaluationOf(x.id);
     return {id:x.id,courseId:x.courseId,sessionId:x.sessionId,status:x.status,createdAt:x.createdAt,courseName:tr.courses.find(c=>c.id===x.courseId)?.name||'',
      progress:{completedModules:p.completedModules,totalModules:p.totalModules,percent:p.percent},
      evaluation:v?{score:v.score,passed:v.passed}:null,certificates:tr.certificates.filter(t=>t.enrollmentId===x.id).length,
      sessionsAttended:tr.attendance.filter(a=>a.employeeId===e.id&&a.status==='presente'&&tr.sessions.some(s=>s.id===a.sessionId&&s.courseId===x.courseId)).length};});
    return emit({employee:e,enrollments});
   }
   // ---- Inscripciones ----
   if(seg[0]==='enrollments'&&seg.length===1){
    if(method==='GET'){
     const q=url.searchParams;
     return emit({enrollments:tr.enrollments.filter(x=>(!q.get('courseId')||x.courseId===q.get('courseId'))&&(!q.get('employeeId')||x.employeeId===q.get('employeeId'))&&(!q.get('status')||x.status===q.get('status'))).map(enrollmentView)});
    }
    if(method==='POST'){
     const emp=employeeOf(input?.employeeId),c=courseOf(input?.courseId);
     if(input.sessionId){const s=sessionOf(input.sessionId);if(s.courseId!==c.id)throw error('Invalid enrollment');}
     if(tr.enrollments.some(x=>x.employeeId===emp.id&&x.courseId===c.id&&['inscrito','en curso','completado'].includes(x.status)))throw error('Duplicate enrollment',409);
     const x={id:uuid(),employeeId:emp.id,courseId:c.id,sessionId:input.sessionId||null,status:'inscrito',createdAt:now(),updatedAt:now()};
     tr.enrollments.push(x);
     tr.progress.push({enrollmentId:x.id,completedModules:0,totalModules:0,percent:0,updatedAt:now()});
     demoAudit(tenant,'training.enrollment_created',x.id);
     return send({enrollment:{id:x.id,employeeId:emp.id,courseId:c.id,sessionId:x.sessionId,status:'inscrito'}});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='enrollments'&&seg.length===2){
    const x=enrollmentOf(seg[1]);
    if(method==='PATCH'){
     if(!input||Object.keys(input).length!==1||!['inscrito','en curso','completado','cancelado'].includes(input.status))throw error('Invalid enrollment');
     x.status=input.status;x.updatedAt=now();return send({ok:true,status:input.status});
    }
    if(method==='DELETE'){
     if(x.status==='cancelado')throw error('Not found',404);
     x.status='cancelado';x.updatedAt=now();return send({ok:true,status:'cancelado'});
    }
    throw error('Not found',404);
   }
   // ---- Asistencia ----
   if(seg[0]==='attendance'&&seg.length===1){
    if(method==='GET'){
     const q=url.searchParams;
     return emit({attendance:tr.attendance.filter(a=>(!q.get('sessionId')||a.sessionId===q.get('sessionId'))&&(!q.get('employeeId')||a.employeeId===q.get('employeeId'))).map(a=>{const s=tr.sessions.find(s=>s.id===a.sessionId);
      return {...a,employeeName:tr.employees.find(e=>e.id===a.employeeId)?.name||'',sessionStartsAt:s?.startsAt||null,courseName:s?tr.courses.find(c=>c.id===s.courseId)?.name||'':''};})});
    }
    if(method==='POST'){
     if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid attendance');
     const s=sessionOf(input.sessionId),emp=employeeOf(input.employeeId);
     if(!['presente','ausente','justificado'].includes(input.status))throw error('Invalid attendance');
     if(!tr.enrollments.some(x=>x.employeeId===emp.id&&x.courseId===s.courseId&&x.status!=='cancelado'))throw error('Invalid attendance');
     const existing=tr.attendance.find(a=>a.sessionId===s.id&&a.employeeId===emp.id);
     if(existing){existing.status=input.status;return send({attendance:existing});}
     const a={id:uuid(),sessionId:s.id,employeeId:emp.id,status:input.status,createdAt:now()};
     tr.attendance.push(a);return send({attendance:a});
    }
    throw error('Not found',404);
   }
   // ---- Avance ----
   if(seg[0]==='progress'&&seg.length===1){
    if(method==='GET'){
     const enrId=url.searchParams.get('enrollmentId');
     if(!enrId)throw error('Invalid progress');
     return emit(progressDetail(enrId));
    }
    if(method==='POST'){
     if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid progress');
     const enr=enrollmentOf(input.enrollmentId);
     if(activeModules(enr.courseId).length>0)throw error('Invalid progress');
     if(!Number.isInteger(input.completedModules)||input.completedModules<0||!Number.isInteger(input.totalModules)||input.totalModules<0||input.completedModules>input.totalModules)throw error('Invalid progress');
     const percent=input.totalModules?Math.round(100*input.completedModules/input.totalModules):0;
     let row=tr.progress.find(p=>p.enrollmentId===enr.id);
     if(!row){row={enrollmentId:enr.id,completedModules:input.completedModules,totalModules:input.totalModules,percent,updatedAt:now()};tr.progress.push(row);}
     else{row.completedModules=input.completedModules;row.totalModules=input.totalModules;row.percent=percent;row.updatedAt=now();}
     return send({progress:{enrollmentId:enr.id,completedModules:row.completedModules,totalModules:row.totalModules,percent:row.percent}});
    }
    throw error('Not found',404);
   }
   // ---- Evaluaciones ----
   if(seg[0]==='evaluations'&&seg.length===1){
    if(method==='GET'){
     const q=url.searchParams;
     return emit({evaluations:tr.evaluations.filter(v=>(!q.get('courseId')||v.courseId===q.get('courseId'))&&(!q.get('employeeId')||v.employeeId===q.get('employeeId'))).map(v=>({...v,employeeName:tr.employees.find(e=>e.id===v.employeeId)?.name||'',courseName:tr.courses.find(c=>c.id===v.courseId)?.name||''}))});
    }
    if(method==='POST'){
     if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid evaluation');
     const enr=enrollmentOf(input.enrollmentId),course=courseOf(enr.courseId);
     const certModules=activeModules(enr.courseId).filter(m=>m.type==='certification'&&m.quizConfig);
     let score=input.score??null,derived=false;
     if(certModules.length>0){
      const bests=[];
      for(const m of certModules){const best=bestAttempt(enr.id,m.id);if(best===null)throw error('Invalid evaluation');bests.push(best);}
      score=Math.round(bests.reduce((a,b)=>a+b,0)/bests.length);derived=true;
     }else if(score===null||!Number.isInteger(score)||score<0||score>100){
      throw error('Invalid evaluation');
     }
     const passed=score>=course.minScore;
     const existing=evaluationOf(enr.id);
     if(existing){existing.score=score;existing.passed=passed;existing.evaluatedAt=now();}
     else tr.evaluations.push({id:uuid(),enrollmentId:enr.id,employeeId:enr.employeeId,courseId:enr.courseId,score,passed,evaluatedAt:now()});
     return send({evaluation:{enrollmentId:enr.id,employeeId:enr.employeeId,courseId:enr.courseId,score,passed,derived}});
    }
    throw error('Not found',404);
   }
   // ---- Constancias ----
   if(seg[0]==='certificates'&&seg.length===1){
    if(method==='GET'){
     const q=url.searchParams;
     return emit({certificates:tr.certificates.filter(x=>(!q.get('courseId')||x.courseId===q.get('courseId'))&&(!q.get('employeeId')||x.employeeId===q.get('employeeId'))).map(x=>({...x,employeeName:tr.employees.find(e=>e.id===x.employeeId)?.name||'',courseName:tr.courses.find(c=>c.id===x.courseId)?.name||''}))});
    }
    if(method==='POST'){
     if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid certificate');
     const enr=enrollmentOf(input.enrollmentId);
     const certModules=activeModules(enr.courseId).filter(m=>m.type==='certification');
     for(const m of certModules){if(!m.quizConfig||!hasPassed(enr.id,m.id))throw error('Invalid certificate');}
     const ev=evaluationOf(enr.id);
     if(!ev||!ev.passed)throw error('Invalid certificate');
     const existing=tr.certificates.find(x=>x.enrollmentId===enr.id);
     if(existing)return send({certificate:existing});
     const cert={id:uuid(),employeeId:enr.employeeId,courseId:enr.courseId,enrollmentId:enr.id,folio:genFolio(),issuedAt:now()};
     tr.certificates.push(cert);demoAudit(tenant,'training.certificate_issued',cert.id);
     return send({certificate:cert});
    }
    throw error('Not found',404);
   }
   throw error('Not found',404);
  }
  // Proyectos (T025): espejo en memoria del contrato real
  // /api/app/<slug>/projects/... (platform/projects-store.mjs,
  // projects-domain.mjs, migración 030). Las tareas viven en
  // tenant.tasks con sourceToolId='T025' (tareas reales T004).
  // El tablero Kanban se espeja aparte (ver kanbanRoute): aquí solo se
  // guarda kanbanBoardId en el proyecto.
  const pjRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/projects(?:\/(.*))?$/);
  if(pjRoute){
   const tenant=tenantBySlug(pjRoute[1]);
   if(catalog.tools.some(t=>t.id==='T025'))allowed(tenant,'T025');
   const pj=tenant.projects;
   const seg=(pjRoute[2]||'').split('/').filter(Boolean);
   const projectOf=id=>getRecord(pj.projects,id);
   const milestoneOf=(pid,mid)=>getRecord(pj.milestones.filter(m=>m.projectId===pid),mid);
   const projectTasks=pid=>tenant.tasks.filter(t=>t.sourceToolId==='T025'&&t.sourceRecordId===pid&&!t.archivedAt);
   const progressOf=p=>{
    const ms=pj.milestones.filter(m=>m.projectId===p.id&&m.status!=='cancelado');
    const done=ms.filter(m=>m.status==='completado').length;
    const tasks=projectTasks(p.id),tasksDone=tasks.filter(t=>t.status==='done').length;
    const pct=(a,b)=>b?Math.round(100*a/b):0;
    return {milestones:{done,total:ms.length,percent:pct(done,ms.length)},
     tasks:{done:tasksDone,total:tasks.length,percent:pct(tasksDone,tasks.length)},
     percent:pct(done+tasksDone,ms.length+tasks.length)};
   };
   const projectView=p=>({...p,progress:progressOf(p),
    clientName:tenant.clients.find(c=>c.id===p.clientId)?.name||null,
    ownerEmail:tenant.members.find(m=>m.id===p.ownerUserId)?.email||null,
    kanbanBoardName:tenant.kanbanBoards.find(b=>b.id===p.kanbanBoardId)?.name||null});
   const validProject=(input,base={})=>{
    if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid project');
    const merged={...base,...input};
    const name=String(merged.name||'').trim();
    if(name.length<3||name.length>160)throw error('Invalid project');
    if(merged.startsOn&&merged.endsOn&&merged.endsOn<merged.startsOn)throw error('Invalid project');
    if(merged.startsOn!==undefined&&merged.startsOn!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(merged.startsOn))throw error('Invalid project');
    if(merged.endsOn!==undefined&&merged.endsOn!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(merged.endsOn))throw error('Invalid project');
    if(merged.clientId&&!tenant.clients.some(c=>c.id===merged.clientId&&!c.archivedAt))throw error('Client not found',404);
    if(merged.ownerUserId&&!tenant.members.some(m=>m.id===merged.ownerUserId&&m.status==='active'))throw error('Assignee not found',404);
    if(merged.kanbanBoardId&&!tenant.kanbanBoards.some(b=>b.id===merged.kanbanBoardId))throw error('Not found',404);
    return {name,description:String(merged.description||'').slice(0,4000),clientId:merged.clientId||null,
     startsOn:merged.startsOn||null,endsOn:merged.endsOn||null,
     status:['planificado','en curso','en pausa','completado','cancelado'].includes(merged.status)?merged.status:'planificado',
     ownerUserId:merged.ownerUserId||null,kanbanBoardId:merged.kanbanBoardId||null};
   };
   const validMilestone=(input,base={})=>{
    if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid milestone');
    const merged={...base,...input};
    const title=String(merged.title||'').trim();
    if(title.length<2||title.length>160)throw error('Invalid milestone');
    if(merged.dueOn!==undefined&&merged.dueOn!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(merged.dueOn))throw error('Invalid milestone');
    return {title,dueOn:merged.dueOn||null,
     status:['pendiente','completado','cancelado'].includes(merged.status)?merged.status:'pendiente'};
   };
   // ---- Tablero ----
   if(seg.length===1&&seg[0]==='dashboard'&&method==='GET'){
    const all=pj.projects;
    const tasks=tenant.tasks.filter(t=>t.sourceToolId==='T025'&&!t.archivedAt);
    const byStatus=s=>tasks.filter(t=>t.status===s).length;
    return emit({kpis:{activeProjects:all.filter(p=>p.status==='en curso').length,totalProjects:all.length,
      completedProjects:all.filter(p=>p.status==='completado').length,
      tasksCompleted:byStatus('done'),tasksPending:byStatus('pending'),tasksInProgress:byStatus('in_progress'),tasksTotal:tasks.length,
      teamMembers:tenant.members.filter(m=>m.status==='active').length},
     projectProgress:[...all].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,8).map(p=>({id:p.id,name:p.name,status:p.status,
      percent:progressOf(p).percent,milestonesDone:progressOf(p).milestones.done,milestonesTotal:progressOf(p).milestones.total,
      tasksDone:progressOf(p).tasks.done,tasksTotal:progressOf(p).tasks.total})),
     tasksByStatus:{done:byStatus('done'),pending:byStatus('pending'),inProgress:byStatus('in_progress')},
     team:tenant.members.filter(m=>m.status==='active').map(m=>({userId:m.id,email:m.email,role:m.role,
      activeTasks:tasks.filter(t=>t.assigneeUserId===m.id&&t.status!=='done').length}))});
   }
   // ---- Proyectos ----
   if(seg.length===0){
    if(method==='GET'){
     const status=url.searchParams.get('status');
     return emit({projects:pj.projects.filter(p=>!status||p.status===status).map(projectView)});
    }
    if(method==='POST'){
     const p={id:uuid(),...validProject(input),createdAt:now(),updatedAt:now()};
     pj.projects.unshift(p);demoAudit(tenant,'projects.project_created',p.id);return send({project:projectView(p)});
    }
    throw error('Not found',404);
   }
   if(seg.length===1&&seg[0]!=='dashboard'){
    const p=projectOf(seg[0]);
    if(method==='GET')return emit({project:projectView(p),
     milestones:pj.milestones.filter(m=>m.projectId===p.id),
     tasks:projectTasks(p.id).map(t=>({...t,assigneeEmail:tenant.members.find(m=>m.id===t.assigneeUserId)?.email||null}))});
    if(method==='PATCH'){
     if(input&&Object.keys(input).length===1&&'status' in input){
      if(!['planificado','en curso','en pausa','completado','cancelado'].includes(input.status))throw error('Invalid project');
      p.status=input.status;p.updatedAt=now();return send({ok:true,status:input.status});
     }
     Object.assign(p,validProject(input,p),{updatedAt:now()});return send({project:projectView(p)});
    }
    throw error('Not found',404);
   }
   // ---- Hitos ----
   if(seg.length===2&&seg[1]==='milestones'){
    const p=projectOf(seg[0]);
    if(method==='GET')return emit({milestones:[...pj.milestones.filter(m=>m.projectId===p.id)]
     .sort((a,b)=>(a.dueOn===null)-(b.dueOn===null)||(a.dueOn||'').localeCompare(b.dueOn||''))});
    if(method==='POST'){
     const m={id:uuid(),projectId:p.id,...validMilestone(input),createdAt:now(),updatedAt:now()};
     pj.milestones.push(m);return send({milestone:m});
    }
    throw error('Not found',404);
   }
   if(seg.length===3&&seg[1]==='milestones'){
    const m=milestoneOf(seg[0],seg[2]);
    if(method==='PATCH'){
     if(input&&Object.keys(input).length===1&&'status' in input){
      if(!['pendiente','completado','cancelado'].includes(input.status))throw error('Invalid milestone');
      m.status=input.status;m.updatedAt=now();
      if(input.status==='completado')demoAudit(tenant,'projects.milestone_completed',m.id);
      return send({ok:true,status:input.status});
     }
     Object.assign(m,validMilestone(input,m),{updatedAt:now()});return send({milestone:m});
    }
    throw error('Not found',404);
   }
   // ---- Tareas del proyecto (T004 reales) ----
   if(seg.length===2&&seg[1]==='tasks'){
    const p=projectOf(seg[0]);
    if(method==='GET')return emit({tasks:projectTasks(p.id).map(t=>({...t,assigneeEmail:tenant.members.find(m=>m.id===t.assigneeUserId)?.email||null}))});
    if(method==='POST'){
     const title=String(input.title||'').trim();
     if(title.length<2||!['pending','in_progress','done'].includes(input.status||'pending')||!['low','normal','high'].includes(input.priority||'normal'))throw error('Invalid task');
     if(input.assigneeUserId&&!tenant.members.some(m=>m.id===input.assigneeUserId&&m.status==='active'))throw error('Assignee not found',404);
     const task={id:uuid(),title,notes:String(input.notes||'').trim(),assigneeUserId:input.assigneeUserId||null,
      assigneeEmail:tenant.members.find(m=>m.id===(input.assigneeUserId||null))?.email||null,
      dueOn:input.dueOn||null,status:input.status||'pending',priority:input.priority||'normal',
      sourceToolId:'T025',sourceRecordId:p.id,notifiedAt:null,createdAt:now(),updatedAt:now()};
     tenant.tasks.unshift(task);return send({task});
    }
    throw error('Not found',404);
   }
   if(seg.length===3&&seg[1]==='tasks'){
    const p=projectOf(seg[0]);
    const task=getRecord(projectTasks(p.id),seg[2]);
    if(method==='PATCH'){
     if(!input||Object.keys(input).length!==1||!['pending','in_progress','done'].includes(input.status))throw error('Invalid task');
     task.status=input.status;task.updatedAt=now();return send({ok:true});
    }
    throw error('Not found',404);
   }
   // ---- Tablero Kanban del proyecto ----
   if(seg.length===2&&seg[1]==='board'){
    const p=projectOf(seg[0]);
    if(method==='POST'&&input?.boardId){
     const board=tenant.kanbanBoards.find(b=>b.id===input.boardId);
     if(!board)throw error('Not found',404);
     p.kanbanBoardId=board.id;p.updatedAt=now();return send({ok:true,boardId:board.id,boardName:board.name});
    }
    if(method==='POST'){
     if(p.kanbanBoardId){
      const existing=tenant.kanbanBoards.find(b=>b.id===p.kanbanBoardId);
      if(existing)return send({ok:true,boardId:existing.id,boardName:existing.name,alreadyLinked:true});
     }
     const board={id:uuid(),name:'Tablero: '+p.name,sourceToolId:'generic',
      phases:[{id:uuid(),title:'Por hacer',position:0},{id:uuid(),title:'En curso',position:1},{id:uuid(),title:'Hecho',position:2}],createdAt:now()};
     tenant.kanbanBoards.push(board);p.kanbanBoardId=board.id;p.updatedAt=now();
     demoAudit(tenant,'projects.board_created',board.id);
     return send({ok:true,boardId:board.id,boardName:board.name});
    }
    if(method==='PATCH'){
     const board=tenant.kanbanBoards.find(b=>b.id===input?.boardId);
     if(!board)throw error('Not found',404);
     p.kanbanBoardId=board.id;p.updatedAt=now();return send({ok:true,boardId:board.id,boardName:board.name});
    }
    throw error('Not found',404);
   }
   throw error('Not found',404);
  }
  // Mesa de ayuda (T028): espejo en memoria del contrato real
  // /api/app/<slug>/helpdesk/... (platform/helpdesk-store.mjs,
  // helpdesk-domain.mjs, migración 033). Al asignar se avisa en la app
  // con demoNotify (sin correo real, como el motor canónico).
  const hdRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/helpdesk(?:\/(.*))?$/);
  if(hdRoute){
   const tenant=tenantBySlug(hdRoute[1]);
   if(catalog.tools.some(t=>t.id==='T028'))allowed(tenant,'T028');
   const hd=tenant.helpdesk;
   const seg=(hdRoute[2]||'').split('/').filter(Boolean);
   const ticketOf=id=>getRecord(hd.tickets,id);
   const ticketView=t=>({...t,replies:hd.replies.filter(r=>r.ticketId===t.id).length,
    clientName:tenant.clients.find(c=>c.id===t.clientId)?.name||null,
    assigneeEmail:tenant.members.find(m=>m.id===t.assigneeUserId)?.email||null});
   const notifyAssignee=t=>{
    if(!t.assigneeUserId)return false;
    return demoNotify(tenant,'info','Ticket asignado: '+t.subject,
     'Prioridad: '+t.priority+'. Estado: '+t.status+'.',
     '/app/?tenant='+tenant.slug+'&tool=T028&record='+t.id);
   };
   const validTicket=(input,base={})=>{
    if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid ticket');
    const merged={...base,...input};
    const subject=String(merged.subject||'').trim();
    if(subject.length<3||subject.length>200)throw error('Invalid ticket');
    if(merged.clientId&&!tenant.clients.some(c=>c.id===merged.clientId&&!c.archivedAt))throw error('Client not found',404);
    if(merged.assigneeUserId&&!tenant.members.some(m=>m.id===merged.assigneeUserId&&m.status==='active'))throw error('Assignee not found',404);
    return {subject,description:String(merged.description||'').slice(0,4000),clientId:merged.clientId||null,
     status:['abierto','en curso','en espera','resuelto','cerrado'].includes(merged.status)?merged.status:'abierto',
     priority:['baja','media','alta','urgente'].includes(merged.priority)?merged.priority:'media',
     assigneeUserId:merged.assigneeUserId||null};
   };
   // ---- Tablero ----
   if(seg.length===1&&seg[0]==='dashboard'&&method==='GET'){
    const all=hd.tickets;
    const byStatus=s=>all.filter(t=>t.status===s).length;
    const open=all.filter(t=>t.status==='abierto');
    return emit({kpis:{open:byStatus('abierto'),inProgress:byStatus('en curso'),waiting:byStatus('en espera'),
     resolved:byStatus('resuelto'),closed:byStatus('cerrado'),
     urgentOpen:all.filter(t=>t.priority==='urgente'&&!['resuelto','cerrado'].includes(t.status)).length,
     unassignedOpen:all.filter(t=>!t.assigneeUserId&&!['resuelto','cerrado'].includes(t.status)).length,
     total:all.length},
     recentOpen:[...open].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,5).map(ticketView)});
   }
   // ---- Tickets ----
   if(seg.length===0){
    if(method==='GET'){
     const q=url.searchParams;
     return emit({tickets:hd.tickets.filter(t=>(!q.get('status')||t.status===q.get('status'))&&
      (!q.get('priority')||t.priority===q.get('priority'))&&(!q.get('assignee')||t.assigneeUserId===q.get('assignee'))).map(ticketView)});
    }
    if(method==='POST'){
     const t={id:uuid(),...validTicket(input),createdAt:now(),updatedAt:now()};
     hd.tickets.unshift(t);demoAudit(tenant,'helpdesk.ticket_created',t.id);notifyAssignee(t);
     return send({ticket:ticketView(t)});
    }
    throw error('Not found',404);
   }
   if(seg.length===1&&seg[0]!=='dashboard'){
    const t=ticketOf(seg[0]);
    if(method==='GET')return emit({ticket:ticketView(t),
     replies:hd.replies.filter(r=>r.ticketId===t.id).map(r=>({...r,authorEmail:tenant.members.find(m=>m.id===r.authorUserId)?.email||null}))});
    if(method==='PATCH'){
     if(input&&Object.keys(input).length===1&&'status' in input){
      if(!['abierto','en curso','en espera','resuelto','cerrado'].includes(input.status))throw error('Invalid ticket');
      t.status=input.status;t.updatedAt=now();return send({ok:true,status:input.status});
     }
     const prevAssignee=t.assigneeUserId;
     Object.assign(t,validTicket(input,t),{updatedAt:now()});
     if(t.assigneeUserId&&t.assigneeUserId!==prevAssignee)notifyAssignee(t);
     return send({ticket:ticketView(t)});
    }
    throw error('Not found',404);
   }
   if(seg.length===2&&seg[1]==='assign'&&method==='POST'){
    const t=ticketOf(seg[0]);
    const assigneeUserId=input?.assigneeUserId??null;
    if(assigneeUserId!==null&&!tenant.members.some(m=>m.id===assigneeUserId&&m.status==='active'))throw error('Assignee not found',404);
    t.assigneeUserId=assigneeUserId;t.updatedAt=now();
    const notified=notifyAssignee(t);
    demoAudit(tenant,'helpdesk.ticket_assigned',t.id);
    return send({ticket:ticketView(t),notified});
   }
   if(seg.length===2&&seg[1]==='replies'){
    const t=ticketOf(seg[0]);
    if(method==='GET')return emit({replies:hd.replies.filter(r=>r.ticketId===t.id)
     .map(r=>({...r,authorEmail:tenant.members.find(m=>m.id===r.authorUserId)?.email||null}))});
    if(method==='POST'){
     const body=String(input?.body||'').trim();
     if(!body||body.length>4000)throw error('Invalid reply');
     const r={id:uuid(),ticketId:t.id,authorUserId:'33333333-3333-4333-8333-333333333333',
      authorEmail:'superadmin@ejemplo.invalid',body,createdAt:now()};
     hd.replies.push(r);demoAudit(tenant,'helpdesk.reply_added',r.id);
     return send({reply:r});
    }
    throw error('Not found',404);
   }
   throw error('Not found',404);
  }
  // Kanban (T005) mínimo en demo: listar, crear y abrir tablero con sus
  // fases. Las tarjetas no se espejan (crear/mover tarjetas en demo no
  // está cubierto); el tablero de un proyecto se crea desde T025.
  const kbRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/kanban(?:\/([a-z0-9-]+))?$/);
  if(kbRoute){
   const tenant=tenantBySlug(kbRoute[1]);
   allowed(tenant,'T005');
   const boardId=kbRoute[2];
   if(!boardId){
    if(method==='GET')return emit({boards:tenant.kanbanBoards.map(b=>({id:b.id,name:b.name,sourceToolId:b.sourceToolId,createdAt:b.createdAt}))});
    if(method==='POST'){
     const name=String(input?.name||'').trim();
     if(name.length<2||!['C002','C003','generic'].includes(input?.sourceToolId??'generic'))throw error('Invalid kanban board');
     const board={id:uuid(),name,sourceToolId:input.sourceToolId??'generic',
      phases:[{id:uuid(),title:'Por hacer',position:0},{id:uuid(),title:'En curso',position:1},{id:uuid(),title:'Hecho',position:2}],createdAt:now()};
     tenant.kanbanBoards.push(board);demoAudit(tenant,'kanban.board_created',board.id);
     return send({board:{id:board.id,name:board.name,sourceToolId:board.sourceToolId,phases:board.phases.map(p=>({title:p.title,position:p.position}))}});
    }
    throw error('Not found',404);
   }
   if(method==='GET'){
    const board=getRecord(tenant.kanbanBoards,boardId);
    return emit({board:{id:board.id,sourceToolId:board.sourceToolId,phases:board.phases},cards:[]});
   }
   throw error('Not found',404);
  }
  // Empleados (T026): espejo en memoria del contrato real
  // /api/app/<slug>/employees/... (platform/employees-store.mjs,
  // employees-domain.mjs, migración 031). Los empleados SON los de T022
  // (tenant.training.employees); los documentos viven en tenant.hr.
  const empRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/employees(?:\/(.*))?$/);
  if(empRoute){
   const tenant=tenantBySlug(empRoute[1]);
   if(catalog.tools.some(t=>t.id==='T026'))allowed(tenant,'T026');
   const tr=tenant.training,hr=tenant.hr;
   const seg=(empRoute[2]||'').split('/').filter(Boolean);
   const employeeOf=id=>getRecord(tr.employees,id);
   const validEmployee=(input,base={})=>{
    if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid employee');
    const merged={...base,...input};
    const name=String(merged.name||'').trim(),email=String(merged.email||'').trim().toLowerCase();
    if(name.length<2||name.length>160||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)||email.length>200)throw error('Invalid employee');
    if(merged.fechaIngreso!==undefined&&merged.fechaIngreso!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(merged.fechaIngreso))throw error('Invalid employee');
    if(merged.tipoContrato!==undefined&&merged.tipoContrato!==null&&!['indefinido','temporal','por obra','prácticas'].includes(merged.tipoContrato))throw error('Invalid employee');
    if(merged.salarioMensualCents!==undefined&&merged.salarioMensualCents!==null&&(!Number.isInteger(merged.salarioMensualCents)||merged.salarioMensualCents<0))throw error('Invalid employee');
    return {name,email,position:String(merged.position||'').slice(0,120),area:String(merged.area||'').slice(0,120),
     fechaIngreso:merged.fechaIngreso||null,tipoContrato:merged.tipoContrato||null,
     salarioMensualCents:Number.isInteger(merged.salarioMensualCents)?merged.salarioMensualCents:null,
     estado:['activo','inactivo'].includes(merged.estado)?merged.estado:'activo'};
   };
   const employeeView=e=>({...e,
    documents:hr.documents.filter(d=>d.employeeId===e.id).length,
    enrollments:tr.enrollments.filter(x=>x.employeeId===e.id&&x.status!=='cancelado').length});
   const hrDashboard=()=>{
    const today=new Date().toISOString().slice(0,10),month=today.slice(0,7);
    const daysElapsed=new Date().getUTCDate();
    const hires=new Map();
    for(const e of tr.employees){
     if(!e.fechaIngreso)continue;
     const m=e.fechaIngreso.slice(0,7);
     const since=new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth()-5,1)).toISOString().slice(0,7);
     if(m<since)continue;
     hires.set(m,(hires.get(m)||0)+1);
    }
    const activity=tr.employees.filter(e=>(e.estado||'activo')==='activo')
     .sort((a,b)=>a.name.localeCompare(b.name,'es')).slice(0,12).map(e=>{
      const percents=tr.enrollments.filter(n=>n.employeeId===e.id&&['inscrito','en curso','completado'].includes(n.status))
       .map(n=>tr.progress.find(p=>p.enrollmentId===n.id)).filter(Boolean).map(p=>p.percent);
      const workdays=hr.workdays.filter(w=>w.employeeId===e.id&&w.fecha.slice(0,7)===month).length;
      return {employeeId:e.id,name:e.name,position:e.position,area:e.area,estado:e.estado||'activo',
       trainingProgress:percents.length?Math.round(percents.reduce((a,b)=>a+b,0)/percents.length):null,
       workdaysThisMonth:workdays,attendanceMonthPct:Math.min(100,Math.round(100*workdays/Math.max(1,daysElapsed)))};
     });
    return {kpis:{total:tr.employees.length,activos:tr.employees.filter(e=>(e.estado||'activo')==='activo').length,
     inactivos:tr.employees.filter(e=>(e.estado||'activo')==='inactivo').length,
     conSalario:tr.employees.filter(e=>e.salarioMensualCents>0).length,documentos:hr.documents.length,
     asistenciaHoy:hr.workdays.filter(w=>w.fecha===today).length,
     vacacionesPendientes:hr.requests.filter(x=>x.estado==='pendiente').length},
     hiresByMonth:[...hires.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([month,count])=>({month,count})),
     activity,team:activity.map(a=>({employeeId:a.employeeId,name:a.name,position:a.position,area:a.area,estado:a.estado}))};
   };
   if((seg.length===0||seg[0]==='dashboard')&&seg.length<=1&&method==='GET')return emit(hrDashboard());
   if(seg[0]==='employees'&&seg.length===1){
    if(method==='GET'){
     const q=url.searchParams;
     let list=[...tr.employees].sort((a,b)=>a.name.localeCompare(b.name,'es'));
     if(q.get('estado'))list=list.filter(e=>(e.estado||'activo')===q.get('estado'));
     if(q.get('search')){const needle=q.get('search').toLowerCase();list=list.filter(e=>[e.name,e.email,e.position,e.area].join(' ').toLowerCase().includes(needle));}
     return emit({employees:list.map(employeeView)});
    }
    if(method==='POST'){
     const data=validEmployee(input);
     if(tr.employees.some(e=>e.email===data.email))throw error('Duplicate employee email',409);
     const e={id:uuid(),...data,createdAt:now(),updatedAt:now()};
     tr.employees.push(e);return send({employee:e});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='employees'&&seg.length===2){
    const e=employeeOf(seg[1]);
    if(method==='GET')return emit({employee:employeeView(e),documents:hr.documents.filter(d=>d.employeeId===e.id)});
    if(method==='PATCH'){
     const data=validEmployee(input,{name:e.name,email:e.email,position:e.position,area:e.area,
      fechaIngreso:e.fechaIngreso??null,tipoContrato:e.tipoContrato??null,
      salarioMensualCents:e.salarioMensualCents??null,estado:e.estado||'activo'});
     if(tr.employees.some(x=>x.id!==e.id&&x.email===data.email))throw error('Duplicate employee email',409);
     Object.assign(e,{...data,updatedAt:now()});return send({employee:e});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='employees'&&seg.length===3&&seg[2]==='status'&&method==='PATCH'){
    const e=employeeOf(seg[1]);
    if(!input||Object.keys(input).length!==1||!['activo','inactivo'].includes(input.estado))throw error('Invalid employee');
    e.estado=input.estado;e.updatedAt=now();return send({ok:true,estado:input.estado});
   }
   if(seg[0]==='employees'&&seg.length===3&&seg[2]==='documents'){
    const e=employeeOf(seg[1]);
    if(method==='GET')return emit({documents:hr.documents.filter(d=>d.employeeId===e.id).map(d=>({...d,employeeName:e.name}))});
    if(method==='POST'){
     if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid document');
     if(!['contrato','identificación','comprobante','certificado','otro'].includes(input.tipo))throw error('Invalid document');
     const nombre=String(input.nombre||'').trim();
     if(nombre.length<2||nombre.length>160)throw error('Invalid document');
     if(input.fecha!==undefined&&input.fecha!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha))throw error('Invalid document');
     const d={id:uuid(),employeeId:e.id,tipo:input.tipo,nombre,fecha:input.fecha||null,notas:String(input.notas||'').slice(0,2000),employeeName:e.name,createdAt:now()};
     hr.documents.push(d);return send({document:d});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='documents'&&seg.length===1&&method==='GET')
    return emit({documents:hr.documents.map(d=>({...d,employeeName:tr.employees.find(e=>e.id===d.employeeId)?.name||''}))});
   if(seg[0]==='documents'&&seg.length===2&&method==='DELETE'){
    const d=getRecord(hr.documents,seg[1]);
    hr.documents.splice(hr.documents.indexOf(d),1);return send({ok:true});
   }
   throw error('Not found',404);
  }
  // Asistencia y vacaciones (T027): espejo en memoria del contrato real
  // /api/app/<slug>/attendance/... (platform/attendance-store.mjs,
  // attendance-domain.mjs, migración 032). Solo registro y aprobación.
  const attRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/attendance(?:\/(.*))?$/);
  if(attRoute){
   const tenant=tenantBySlug(attRoute[1]);
   if(catalog.tools.some(t=>t.id==='T027'))allowed(tenant,'T027');
   const tr=tenant.training,hr=tenant.hr;
   const seg=(attRoute[2]||'').split('/').filter(Boolean);
   const employeeOf=id=>getRecord(tr.employees,id);
   const minutesOf=(a,b)=>{
    if(!a||!b)return null;
    const d=(Number(b.slice(0,2))*60+Number(b.slice(3)))-(Number(a.slice(0,2))*60+Number(a.slice(3)));
    return d>0?d:null;
   };
   const reqDays=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000)+1;
   const workdayView=w=>({...w,employeeName:tr.employees.find(e=>e.id===w.employeeId)?.name||'',minutes:minutesOf(w.entrada,w.salida)});
   const requestView=x=>({...x,employeeName:tr.employees.find(e=>e.id===x.employeeId)?.name||'',days:reqDays(x.fechaInicio,x.fechaFin)});
   const attDashboard=()=>{
    const month=new Date().toISOString().slice(0,7),year=new Date().getFullYear();
    const start=year+'-01-01',end=year+'-12-31';
    let approved=0;
    for(const x of hr.requests){
     if(x.tipo!=='vacaciones'||x.estado!=='aprobada')continue;
     const from=x.fechaInicio<start?start:x.fechaInicio,to=x.fechaFin>end?end:x.fechaFin;
     if(to>=from)approved+=reqDays(from,to);
    }
    return {kpis:{pendingRequests:hr.requests.filter(x=>x.estado==='pendiente').length,
     workdaysThisMonth:hr.workdays.filter(w=>w.fecha.slice(0,7)===month).length,
     activeEmployees:tr.employees.filter(e=>(e.estado||'activo')==='activo').length,approvedVacationDays:approved},
     vacationSummary:{year,employees:[]}};
   };
   if((seg.length===0||seg[0]==='dashboard')&&seg.length<=1&&method==='GET')return emit(attDashboard());
   if(seg[0]==='workdays'&&seg.length===1){
    if(method==='GET'){
     const q=url.searchParams;
     let list=[...hr.workdays].sort((a,b)=>b.fecha.localeCompare(a.fecha));
     if(q.get('employeeId'))list=list.filter(w=>w.employeeId===q.get('employeeId'));
     if(q.get('from'))list=list.filter(w=>w.fecha>=q.get('from'));
     if(q.get('to'))list=list.filter(w=>w.fecha<=q.get('to'));
     return emit({workdays:list.map(workdayView)});
    }
    if(method==='POST'){
     if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid workday');
     const emp=employeeOf(input.employeeId);
     if(!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha||''))throw error('Invalid workday');
     for(const t of ['entrada','salida']){
      if(input[t]!==undefined&&input[t]!==null&&input[t]!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(input[t]))throw error('Invalid workday');
     }
     if(input.entrada&&input.salida&&minutesOf(input.entrada,input.salida)===null)throw error('Invalid workday');
     const existing=hr.workdays.find(w=>w.employeeId===emp.id&&w.fecha===input.fecha);
     if(existing){
      Object.assign(existing,{entrada:input.entrada||null,salida:input.salida||null,notas:String(input.notas||'').slice(0,2000)});
      return send({workday:workdayView(existing)});
     }
     const w={id:uuid(),employeeId:emp.id,fecha:input.fecha,entrada:input.entrada||null,salida:input.salida||null,
      notas:String(input.notas||'').slice(0,2000),employeeName:emp.name,createdAt:now()};
     hr.workdays.push(w);return send({workday:workdayView(w)});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='requests'&&seg.length===1){
    if(method==='GET'){
     const q=url.searchParams;
     let list=[...hr.requests].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
     if(q.get('employeeId'))list=list.filter(x=>x.employeeId===q.get('employeeId'));
     if(q.get('estado'))list=list.filter(x=>x.estado===q.get('estado'));
     if(q.get('tipo'))list=list.filter(x=>x.tipo===q.get('tipo'));
     return emit({requests:list.map(requestView)});
    }
    if(method==='POST'){
     if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid request');
     const emp=employeeOf(input.employeeId);
     if(!['vacaciones','permiso'].includes(input.tipo))throw error('Invalid request');
     if(!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaInicio||'')||!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaFin||'')||input.fechaFin<input.fechaInicio)throw error('Invalid request');
     const motivo=String(input.motivo||'').trim();
     if(motivo.length<2||motivo.length>500)throw error('Invalid request');
     const x={id:uuid(),employeeId:emp.id,tipo:input.tipo,fechaInicio:input.fechaInicio,fechaFin:input.fechaFin,
      motivo,estado:'pendiente',resueltaPor:null,resueltaAt:null,employeeName:emp.name,createdAt:now()};
     hr.requests.push(x);return send({request:requestView(x)});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='requests'&&seg.length===3&&seg[2]==='resolve'&&method==='PATCH'){
    const x=getRecord(hr.requests,seg[1]);
    if(!['aprobada','rechazada'].includes(input?.estado))throw error('Invalid request');
    if(x.estado!=='pendiente')throw error('Invalid request');
    x.estado=input.estado;x.resueltaPor='33333333-3333-4333-8333-333333333333';x.resueltaAt=now();
    return send({ok:true,estado:x.estado});
   }
   if(seg[0]==='summary'&&seg.length===1&&method==='GET'){
    const q=url.searchParams,y=Number(q.get('year'))||new Date().getFullYear();
    const start=y+'-01-01',end=y+'-12-31';
    const byEmployee=new Map();
    for(const x of hr.requests){
     if(x.tipo!=='vacaciones'||x.estado!=='aprobada')continue;
     if(q.get('employeeId')&&x.employeeId!==q.get('employeeId'))continue;
     const from=x.fechaInicio<start?start:x.fechaInicio,to=x.fechaFin>end?end:x.fechaFin;
     if(to<from)continue;
     const cur=byEmployee.get(x.employeeId)||{employeeId:x.employeeId,employeeName:tr.employees.find(e=>e.id===x.employeeId)?.name||'',days:0};
     cur.days+=reqDays(from,to);byEmployee.set(x.employeeId,cur);
    }
    return emit({year:y,employees:[...byEmployee.values()]});
   }
   throw error('Not found',404);
  }
  // Nómina (T031): espejo en memoria del contrato real
  // /api/app/<slug>/payroll/... (platform/payroll-store.mjs,
  // payroll-domain.mjs, migración 036). Cálculo básico, sin CFDI ni IMSS/ISR.
  const payRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/payroll(?:\/(.*))?$/);
  if(payRoute){
   const tenant=tenantBySlug(payRoute[1]);
   if(catalog.tools.some(t=>t.id==='T031'))allowed(tenant,'T031');
   const tr=tenant.training,hr=tenant.hr;
   const seg=(payRoute[2]||'').split('/').filter(Boolean);
   const periodOf=id=>getRecord(hr.periods,id);
   const conceptOf=id=>getRecord(hr.concepts,id);
   const periodView=pp=>({...pp,receipts:hr.receipts.filter(x=>x.periodId===pp.id).length,
    totalNetoCents:hr.receipts.filter(x=>x.periodId===pp.id).reduce((a,x)=>a+x.netoCents,0)});
   const receiptView=x=>({...x,employeeName:tr.employees.find(e=>e.id===x.employeeId)?.name||'',
    periodTipo:hr.periods.find(pp=>pp.id===x.periodId)?.tipo||'',
    periodInicio:hr.periods.find(pp=>pp.id===x.periodId)?.fechaInicio||'',
    periodFin:hr.periods.find(pp=>pp.id===x.periodId)?.fechaFin||'',
    items:hr.receiptItems.filter(i=>i.receiptId===x.id)});
   const validConcept=(input,base={})=>{
    if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid concept');
    const merged={...base,...input};
    const nombre=String(merged.nombre||'').trim();
    if(nombre.length<2||nombre.length>120)throw error('Invalid concept');
    if(!['percepcion','deduccion'].includes(merged.tipo)||!['fijo','porcentaje'].includes(merged.modo))throw error('Invalid concept');
    if(merged.modo==='fijo'&&(!Number.isInteger(merged.montoCents)||merged.montoCents<0))throw error('Invalid concept');
    if(merged.modo==='porcentaje'&&(typeof merged.porcentaje!=='number'||merged.porcentaje<0||merged.porcentaje>100))throw error('Invalid concept');
    return {nombre,tipo:merged.tipo,modo:merged.modo,
     montoCents:merged.modo==='fijo'?merged.montoCents:null,
     porcentaje:merged.modo==='porcentaje'?merged.porcentaje:null,activo:merged.activo!==false};
   };
   const payDashboard=()=>{
    const last=[...hr.periods].sort((a,b)=>b.fechaInicio.localeCompare(a.fechaInicio))[0]||null;
    const total=last?hr.receipts.filter(x=>x.periodId===last.id).reduce((a,x)=>a+x.netoCents,0):0;
    return {kpis:{periods:hr.periods.length,activeConcepts:hr.concepts.filter(c=>c.activo).length,
     employeesWithSalary:tr.employees.filter(e=>(e.estado||'activo')==='activo'&&e.salarioMensualCents>0).length,
     lastPeriodNetoCents:total},
     lastPeriod:last?{id:last.id,tipo:last.tipo,fechaInicio:last.fechaInicio,fechaFin:last.fechaFin,estado:last.estado,totalNetoCents:total}:null};
   };
   if((seg.length===0||seg[0]==='dashboard')&&seg.length<=1&&method==='GET')return emit(payDashboard());
   if(seg[0]==='periods'&&seg.length===1){
    if(method==='GET')return emit({periods:[...hr.periods].sort((a,b)=>b.fechaInicio.localeCompare(a.fechaInicio)).map(periodView)});
    if(method==='POST'){
     if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid period');
     if(!['quincenal','mensual'].includes(input.tipo))throw error('Invalid period');
     if(!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaInicio||'')||!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaFin||'')||input.fechaFin<input.fechaInicio)throw error('Invalid period');
     if(hr.periods.some(pp=>pp.tipo===input.tipo&&pp.fechaInicio===input.fechaInicio))throw error('Duplicate period',409);
     const pp={id:uuid(),tipo:input.tipo,fechaInicio:input.fechaInicio,fechaFin:input.fechaFin,estado:'borrador',createdAt:now(),updatedAt:now()};
     hr.periods.push(pp);return send({period:pp});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='periods'&&seg.length===3&&seg[2]==='calculate'&&method==='POST'){
    const pp=periodOf(seg[1]);
    if(pp.estado!=='borrador')throw error('Invalid period');
    hr.receipts=hr.receipts.filter(x=>x.periodId!==pp.id);
    hr.receiptItems=hr.receiptItems.filter(i=>hr.receipts.some(x=>x.id===i.receiptId));
    const concepts=hr.concepts.filter(c=>c.activo);
    const receipts=[],skipped=[];
    for(const e of tr.employees.filter(x=>(x.estado||'activo')==='activo')){
     if(!e.salarioMensualCents||e.salarioMensualCents<=0){skipped.push({employeeId:e.id,employeeName:e.name,reason:'sin salario'});continue;}
     const base=pp.tipo==='quincenal'?Math.round(e.salarioMensualCents/2):e.salarioMensualCents;
     let percepciones=0,deducciones=0;
     const items=concepts.map(c=>{
      const monto=c.modo==='porcentaje'?Math.round(base*c.porcentaje/100):c.montoCents;
      if(c.tipo==='percepcion')percepciones+=monto;else deducciones+=monto;
      return {conceptId:c.id,nombre:c.nombre,tipo:c.tipo,montoCents:monto};
     });
     const r={id:uuid(),periodId:pp.id,employeeId:e.id,salarioBaseCents:base,
      percepcionesCents:percepciones,deduccionesCents:deducciones,
      netoCents:Math.max(0,base+percepciones-deducciones),estado:'calculado',createdAt:now()};
     hr.receipts.push(r);
     for(const item of items)hr.receiptItems.push({id:uuid(),receiptId:r.id,...item,createdAt:now()});
     receipts.push({...r,employeeName:e.name});
    }
    pp.estado='calculado';pp.updatedAt=now();
    return send({period:pp,receipts,skipped});
   }
   if(seg[0]==='periods'&&seg.length===3&&seg[2]==='pay'&&method==='POST'){
    const pp=periodOf(seg[1]);
    if(pp.estado!=='calculado')throw error('Invalid period');
    for(const x of hr.receipts.filter(r=>r.periodId===pp.id))x.estado='pagado';
    pp.estado='pagado';pp.updatedAt=now();
    return send({ok:true,estado:'pagado',receipts:hr.receipts.filter(r=>r.periodId===pp.id).length});
   }
   if(seg[0]==='concepts'&&seg.length===1){
    if(method==='GET'){
     const q=url.searchParams;
     let list=[...hr.concepts].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
     if(q.get('activo')!==null)list=list.filter(c=>c.activo===(q.get('activo')==='1'));
     return emit({concepts:list});
    }
    if(method==='POST'){
     const data=validConcept(input);
     const c={id:uuid(),...data,createdAt:now(),updatedAt:now()};
     hr.concepts.push(c);return send({concept:c});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='concepts'&&seg.length===2){
    const c=conceptOf(seg[1]);
    if(method==='PATCH'){
     const data=validConcept(input,{nombre:c.nombre,tipo:c.tipo,modo:c.modo,montoCents:c.montoCents,porcentaje:c.porcentaje,activo:c.activo});
     Object.assign(c,{...data,updatedAt:now()});return send({concept:c});
    }
    if(method==='DELETE'){
     if(hr.receiptItems.some(i=>i.conceptId===c.id))throw error('Invalid concept');
     hr.concepts.splice(hr.concepts.indexOf(c),1);return send({ok:true});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='receipts'&&seg.length===1&&method==='GET'){
    const q=url.searchParams;
    let list=[...hr.receipts].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    if(q.get('periodId'))list=list.filter(x=>x.periodId===q.get('periodId'));
    if(q.get('employeeId'))list=list.filter(x=>x.employeeId===q.get('employeeId'));
    return emit({receipts:list.map(receiptView)});
   }
   if(seg[0]==='receipts'&&seg.length===2&&method==='GET'){
    const x=getRecord(hr.receipts,seg[1]);
    return emit({receipt:receiptView(x)});
   }
   throw error('Not found',404);
  }
  // Marketing (T029): espejo en memoria del contrato real
  // /api/app/<slug>/marketing/... (platform/marketing-store.mjs,
  // marketing-domain.mjs, migración 034). Los datos viven solo en
  // sessionStorage de esta pestaña (demo). Sin clave Resend en la demo,
  // el envío siempre degrada con gracia: se registra como 'sin_envio' y
  // la campaña NO se marca como enviada (igual que el servidor real).
  const mkRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/marketing(?:\/(.*))?$/);
  if(mkRoute){
   const tenant=tenantBySlug(mkRoute[1]);
   if(catalog.tools.some(t=>t.id==='T029'))allowed(tenant,'T029');
   const mk=tenant.marketing;
   const seg=(mkRoute[2]||'').split('/').filter(Boolean);
   const live=list=>list.filter(x=>!x.archivedAt);
   const segmentOf=id=>getRecord(mk.segments,id);
   const campaignOf=id=>getRecord(mk.campaigns,id);
   const matchesSegment=(s,c)=>{
    if(s.status&&c.status!==s.status)return false;
    if(s.companyContains&&!String(c.company||'').toLowerCase().includes(s.companyContains.toLowerCase()))return false;
    return true;
   };
   const recipientsOf=campaign=>{
    const segment=campaign.segmentId?segmentOf(campaign.segmentId):null;
    return live(tenant.clients)
     .filter(c=>c.email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)&&(!segment||matchesSegment(segment,c)))
     .map(c=>({clientId:c.id,name:c.name,email:c.email.toLowerCase(),company:c.company||'',status:c.status||''}));
   };
   const segmentView=s=>({...s,recipients:live(tenant.clients).filter(c=>matchesSegment(s,c)).length});
   const campaignView=c=>({...c,segmentName:mk.segments.find(s=>s.id===c.segmentId)?.name||null,
    sends:mk.sends.filter(d=>d.campaignId===c.id).length,
    sent:mk.sends.filter(d=>d.campaignId===c.id&&d.status==='enviado').length});
   const validSegment=(body,base={})=>{
    if(!body||typeof body!=='object'||Array.isArray(body))throw error('Invalid segment');
    const merged={...base,...body};
    const name=String(merged.name||'').trim();
    if(name.length<2||name.length>120)throw error('Invalid segment');
    if(merged.status!==undefined&&merged.status!==null&&merged.status!==''&&!['prospect','active','inactive'].includes(merged.status))throw error('Invalid segment');
    return {name,description:String(merged.description||'').slice(0,2000),
     status:merged.status||'',companyContains:String(merged.companyContains||'').trim().slice(0,160)};
   };
   const validCampaign=(body,base={})=>{
    if(!body||typeof body!=='object'||Array.isArray(body))throw error('Invalid campaign');
    const merged={...base,...body};
    const name=String(merged.name||'').trim(),subject=String(merged.subject||'').trim();
    if(name.length<2||name.length>140||subject.length<2||subject.length>200)throw error('Invalid campaign');
    if(merged.segmentId!==undefined&&merged.segmentId!==null&&merged.segmentId!=='')segmentOf(merged.segmentId);
    if(merged.scheduledAt!==undefined&&merged.scheduledAt!==null&&merged.scheduledAt!==''&&isNaN(Date.parse(merged.scheduledAt)))throw error('Invalid campaign');
    if(merged.status!==undefined&&!['borrador','programada','enviada'].includes(merged.status))throw error('Invalid campaign');
    return {name,subject,content:String(merged.content||'').slice(0,20000),
     segmentId:merged.segmentId||null,scheduledAt:merged.scheduledAt||null,
     status:merged.status||'borrador'};
   };
   // ---- Tablero ----
   if((seg.length===0||seg[0]==='dashboard')&&seg.length<=1&&method==='GET'){
    return emit({kpis:{draftCampaigns:mk.campaigns.filter(c=>c.status==='borrador').length,
     scheduledCampaigns:mk.campaigns.filter(c=>c.status==='programada').length,
     sentCampaigns:mk.campaigns.filter(c=>c.status==='enviada').length,
     segments:mk.segments.length,totalSends:mk.sends.length,
     deliveredSends:mk.sends.filter(d=>d.status==='enviado').length,
     unsentSends:mk.sends.filter(d=>d.status==='sin_envio').length},
     recentCampaigns:[...mk.campaigns].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,5).map(campaignView)});
   }
   // ---- Segmentos ----
   if(seg[0]==='segments'&&seg.length===1){
    if(method==='GET')return emit({segments:[...mk.segments].sort((a,b)=>a.name.localeCompare(b.name)).map(segmentView)});
    if(method==='POST'){const s={id:uuid(),...validSegment(input),createdAt:now(),updatedAt:now()};mk.segments.push(s);return send({segment:segmentView(s)});}
    throw error('Not found',404);
   }
   if(seg[0]==='segments'&&seg.length===2){
    const s=segmentOf(seg[1]);
    if(method==='PATCH'){Object.assign(s,validSegment(input,s),{updatedAt:now()});return send({segment:segmentView(s)});}
    if(method==='DELETE'){
     for(const c of mk.campaigns.filter(c=>c.segmentId===s.id)){c.segmentId=null;c.updatedAt=now();}
     mk.segments.splice(mk.segments.indexOf(s),1);return send({ok:true});
    }
    throw error('Not found',404);
   }
   // ---- Campañas ----
   if(seg[0]==='campaigns'&&seg.length===1){
    if(method==='GET'){
     const status=url.searchParams.get('status');
     return emit({campaigns:[...mk.campaigns].filter(c=>!status||c.status===status)
      .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(campaignView)});
    }
    if(method==='POST'){
     const c={id:uuid(),...validCampaign(input),sentAt:null,createdAt:now(),updatedAt:now()};
     mk.campaigns.unshift(c);demoAudit(tenant,'marketing.campaign_created',c.id);return send({campaign:c});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='campaigns'&&seg.length===2){
    const c=campaignOf(seg[1]);
    if(method==='GET')return emit({campaign:campaignView(c),
     segment:c.segmentId?segmentOf(c.segmentId):null,
     recipients:recipientsOf(c),sends:mk.sends.filter(d=>d.campaignId===c.id)});
    if(method==='PATCH'){
     if(c.status==='enviada')throw error('Invalid campaign');
     if(input&&Object.keys(input).length===1&&'status' in input){
      if(!['borrador','programada'].includes(input.status))throw error('Invalid campaign');
      c.status=input.status;c.updatedAt=now();return send({ok:true,status:input.status});
     }
     const next=validCampaign(input,c);
     if(next.status==='enviada')throw error('Invalid campaign');
     Object.assign(c,next,{updatedAt:now()});return send({campaign:campaignView(c)});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='campaigns'&&seg.length===3&&seg[2]==='preview'&&method==='GET'){
    const c=campaignOf(seg[1]);
    const recipients=recipientsOf(c);
    return emit({recipients,count:recipients.length,campaignId:c.id,
     segmentId:c.segmentId,segmentName:mk.segments.find(s=>s.id===c.segmentId)?.name||null});
   }
   if(seg[0]==='campaigns'&&seg.length===3&&seg[2]==='sends'&&method==='GET'){
    const c=campaignOf(seg[1]);
    return emit({sends:mk.sends.filter(d=>d.campaignId===c.id)});
   }
   if(seg[0]==='campaigns'&&seg.length===3&&seg[2]==='send'&&method==='POST'){
    const c=campaignOf(seg[1]);
    if(c.status==='enviada')throw error('Invalid campaign');
    const recipients=recipientsOf(c);
    if(!recipients.length)throw error('Invalid campaign');
    // Sin clave Resend en la demo: nunca se envía nada real.
    for(const r of recipients){
     mk.sends.push({id:uuid(),campaignId:c.id,clientId:r.clientId,recipientName:r.name,
      recipientEmail:r.email,status:'sin_envio',
      error:'Sin envío real (falta clave Resend). Configura la clave Resend para enviar.',
      sentAt:null,createdAt:now()});
    }
    return send({sent:false,reason:'email-not-configured',campaignId:c.id,recipients:recipients.length,
     sendsCreated:recipients.length,sentCount:0,failedCount:0,
     message:'Sin envío real (falta clave Resend). Configura la clave Resend para enviar.'});
   }
   throw error('Not found',404);
  }
  // Punto de venta (T030): espejo en memoria del contrato real
  // /api/app/<slug>/pos/... (platform/pos-store.mjs, pos-domain.mjs,
  // migración 035). Los datos viven solo en sessionStorage de esta
  // pestaña (demo). Precios base SIN IVA del catálogo; IVA 16% al cobrar.
  // El cobro va a tenant.payments (tabla de T014) y el efectivo con caja
  // abierta a tenant.cashboxMovements (T016).
  const posRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/pos(?:\/(.*))?$/);
  if(posRoute){
   const tenant=tenantBySlug(posRoute[1]);
   if(catalog.tools.some(t=>t.id==='T030'))allowed(tenant,'T030');
   const pos=tenant.pos;
   const seg=(posRoute[2]||'').split('/').filter(Boolean);
   const live=list=>list.filter(x=>!x.archivedAt);
   const saleOf=id=>getRecord(pos.sales,id);
   const stockBySku=sku=>{
    const item=tenant.items.find(i=>i.sku===sku&&!i.archivedAt);
    if(!item)return {item:null,quantity:null,variants:[]};
    return {item,quantity:item.quantity,variants:tenant.variants.filter(v=>v.itemId===item.id&&!v.archivedAt)};
   };
   const saleView=s=>({...s,folioText:'POS-'+String(s.folio).padStart(4,'0'),
    lines:pos.saleLines.filter(l=>l.saleId===s.id).length});
   const saleDetail=s=>({...s,folioText:'POS-'+String(s.folio).padStart(4,'0'),
    lines:pos.saleLines.filter(l=>l.saleId===s.id)});
   // ---- Catálogo para vender ----
   if(seg[0]==='catalog'&&seg.length===1&&method==='GET'){
    const items=live(tenant.catalogItems).filter(i=>i.active!==false)
     .map(i=>{const stock=stockBySku(i.sku);
      return {...i,priceCents:i.priceCents,photoUrl:null,stock:stock.quantity,variants:stock.variants};})
     .sort((a,b)=>a.name.localeCompare(b.name));
    return emit({items,categories:[...new Set(items.map(i=>i.category))].sort()});
   }
   // ---- Tablero ----
   if((seg.length===0||seg[0]==='dashboard')&&seg.length<=1&&method==='GET'){
    const day=now().slice(0,10);
    const todaySales=pos.sales.filter(s=>s.createdAt.slice(0,10)===day&&s.status==='completada');
    const all=pos.sales.filter(s=>s.status==='completada');
    const byMethod={};
    for(const s of all){byMethod[s.method]=byMethod[s.method]||{count:0,totalCents:0};byMethod[s.method].count++;byMethod[s.method].totalCents+=s.totalCents;}
    return emit({today:{count:todaySales.length,totalCents:todaySales.reduce((a,s)=>a+s.totalCents,0)},
     totals:{count:all.length,totalCents:all.reduce((a,s)=>a+s.totalCents,0)},byMethod,
     recent:[...pos.sales].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,10).map(saleView)});
   }
   // ---- Ventas ----
   if(seg[0]==='sales'&&seg.length===1){
    if(method==='GET')return emit({sales:[...pos.sales].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(saleView)});
    if(method==='POST'){
     if(!input||typeof input!=='object'||Array.isArray(input)||!Array.isArray(input.lines)||!input.lines.length||input.lines.length>50)throw error('Invalid sale');
     const method=input.method||'efectivo',mode=input.mode||'para_llevar';
     if(!['efectivo','tarjeta','transferencia'].includes(method))throw error('Invalid sale');
     if(!['para_llevar','en_local','a_domicilio'].includes(mode))throw error('Invalid sale');
     const priced=[];
     for(const l of input.lines){
      const item=getRecord(live(tenant.catalogItems).filter(i=>i.active!==false),l.catalogItemId);
      if(!Number.isInteger(l.quantity)||l.quantity<1||l.quantity>10000)throw error('Invalid sale');
      let variant=null;
      if(l.variantId){
       variant=getRecord(tenant.variants,l.variantId);
       const parent=tenant.items.find(i=>i.id===variant.itemId);
       if(!parent||parent.sku!==item.sku)throw error('Invalid sale');
      }
      priced.push({item,variant,quantity:l.quantity,lineTotalCents:l.quantity*item.priceCents});
     }
     const subtotal=priced.reduce((a,l)=>a+l.lineTotalCents,0);
     const vat=Math.round(subtotal*16/100),total=subtotal+vat;
     const folio=(pos.sales.reduce((m,s)=>Math.max(m,s.folio),0))+1;
     const folioText='POS-'+String(folio).padStart(4,'0');
     const saleId=uuid();
     const sale={id:saleId,folio,clientId:input.clientId||null,clientName:String(input.clientName||'').slice(0,160),
      method,mode,subtotalCents:subtotal,vatCents:vat,totalCents:total,paymentId:null,cashboxId:null,
      cashboxMovementId:null,status:'completada',notes:String(input.notes||'').slice(0,1000),createdAt:now(),updatedAt:now()};
     pos.sales.unshift(sale);
     const warnings=[],stockDeducted=[];
     for(const l of priced){
      const lineId=uuid();
      pos.saleLines.push({id:lineId,saleId,catalogItemId:l.item.id,variantId:l.variant?.id||null,
       sku:l.item.sku,name:l.item.name,quantity:l.quantity,unitPriceCents:l.item.priceCents,
       lineTotalCents:l.lineTotalCents,stockDeducted:false,createdAt:now()});
      const line=pos.saleLines.find(x=>x.id===lineId);
      let variant=l.variant;
      if(!variant){
       const stock=stockBySku(l.item.sku);
       variant=stock.variants.find(v=>v.sku===l.item.sku)||null;
      }
      if(!variant){warnings.push('Sin inventario para '+l.item.sku+' ('+l.item.name+'): se vendió sin descontar existencias.');continue;}
      if(variant.quantity<l.quantity){warnings.push('Existencias insuficientes para '+variant.sku+' ('+l.item.name+'): hay '+variant.quantity+' y se vendieron '+l.quantity+'. Se vendió sin descontar.');continue;}
      variant.quantity-=l.quantity;
      const parent=tenant.items.find(i=>i.id===variant.itemId);
      if(parent)parent.quantity=Math.max(0,parent.quantity-l.quantity);
      tenant.variantMovements=tenant.variantMovements||[];
      line.stockDeducted=true;line.variantId=variant.id;
      stockDeducted.push({sku:variant.sku,quantity:l.quantity,variantId:variant.id});
     }
     const payment={id:uuid(),clientId:sale.clientId,clientName:sale.clientName,amountCents:total,
      paidOn:now().slice(0,10),method,reference:folioText,notes:'Venta punto de venta '+folioText,createdAt:now()};
     tenant.payments.unshift(payment);
     sale.paymentId=payment.id;
     let cashboxNote=null;
     if(method==='efectivo'){
      const box=tenant.cashboxes.find(b=>b.status==='open');
      if(box){
       const move={id:uuid(),cashboxId:box.id,direction:'in',kind:'venta',amountCents:total,
        sourceType:'collection',sourceId:payment.id,notes:'Venta '+folioText,createdAt:now()};
       tenant.cashboxMovements.push(move);
       sale.cashboxId=box.id;sale.cashboxMovementId=move.id;
      }else{
       warnings.push('Sin caja abierta: la venta se registró sin movimiento de caja. Abre la caja (T016) para registrar el efectivo.');
      }
     }else{
      cashboxNote='Cobro con '+method+': no genera movimiento de caja (solo el efectivo pasa por caja).';
     }
     demoAudit(tenant,'pos.sale_created',sale.id);
     return send({sale:saleDetail(sale),payment:{id:payment.id,amountCents:total,method,reference:folioText},
      warnings,stockDeducted,cashboxNote});
    }
    throw error('Not found',404);
   }
   if(seg[0]==='sales'&&seg.length===2&&method==='GET'){
    return emit({sale:saleDetail(saleOf(seg[1]))});
   }
   throw error('Not found',404);
  }
 // Contabilidad (T023): espejo en memoria del contrato real
 // /api/app/<slug>/accounting/... (platform/accounting-store.mjs,
 // accounting-domain.mjs, migración 028). Los datos viven solo en
 // sessionStorage de esta pestaña (demo).
 const acRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/accounting(?:\/(.*))?$/);
 if(acRoute){
  const tenant=tenantBySlug(acRoute[1]);
  if(catalog.tools.some(t=>t.id==='T023'))allowed(tenant,'T023');
  const ac=tenant.accounting;
  const seg=(acRoute[2]||'').split('/').filter(Boolean);
  const acEsc=v=>{const x=String(v??'');return /[",\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x;};
  const acCsvRow=vals=>vals.map(acEsc).join(',');
  const acMoney=c=>(Number(c||0)/100).toFixed(2);
  const acAccountOf=id=>getRecord(ac.accounts,id);
  const acEntryOf=id=>getRecord(ac.entries,id);
  const acEntryLines=id=>ac.lines.filter(l=>l.entryId===id);
  const acNature=type=>type==='activo'||type==='gasto'?'deudora':'acreedora';
  const acMovements=(from,to)=>{
   const map={};
   for(const l of ac.lines){
    const e=ac.entries.find(x=>x.id===l.entryId);
    if(!e||e.status!=='registrada'||e.entryDate<(from||'0000-01-01')||e.entryDate>(to||'9999-12-31'))continue;
    const m=map[l.accountId]||{debitCents:0,creditCents:0};
    m.debitCents+=l.debitCents;m.creditCents+=l.creditCents;map[l.accountId]=m;
   }
   return map;
  };
  const acBalance=(a,m)=>{const d=m[a.id]||{debitCents:0,creditCents:0};return a.nature==='deudora'?d.debitCents-d.creditCents:d.creditCents-d.debitCents;};
  const acTrial=(from,to)=>{
   const m=acMovements(from,to);
   const rows=ac.accounts.map(a=>{const d=m[a.id]||{debitCents:0,creditCents:0};
    return {accountId:a.id,code:a.code,name:a.name,type:a.type,nature:a.nature,debitCents:d.debitCents,creditCents:d.creditCents,balanceCents:acBalance(a,m)};});
   const totalDebitCents=rows.reduce((s,r)=>s+r.debitCents,0),totalCreditCents=rows.reduce((s,r)=>s+r.creditCents,0);
   return {rows,totalDebitCents,totalCreditCents,balanced:totalDebitCents===totalCreditCents};
  };
  const acIncome=(from,to)=>{
   const m=acMovements(from,to);let incomeCents=0,expenseCents=0;
   for(const a of ac.accounts){if(a.type==='ingreso')incomeCents+=acBalance(a,m);if(a.type==='gasto')expenseCents+=acBalance(a,m);}
   return {incomeCents,expenseCents,profitCents:incomeCents-expenseCents};
  };
  const acSheet=asOf=>{
   const m=acMovements(null,asOf);let assetsCents=0,liabilitiesCents=0,equityCents=0;
   for(const a of ac.accounts){const b=acBalance(a,m);
    if(a.type==='activo')assetsCents+=b;else if(a.type==='pasivo')liabilitiesCents+=b;else if(a.type==='capital')equityCents+=b;}
   const {profitCents}=acIncome(null,asOf);
   return {assetsCents,liabilitiesCents,equityCents,profitCents,
    totalLiabilitiesEquityCents:liabilitiesCents+equityCents+profitCents,
    balanced:assetsCents===liabilitiesCents+equityCents+profitCents};
  };
  const acEntryView=e=>{const lines=acEntryLines(e.id);
   return {...e,folioLabel:'P-'+String(e.folio).padStart(4,'0'),lines:lines.map(l=>({...l,
    accountCode:ac.accounts.find(a=>a.id===l.accountId)?.code||'',
    accountName:ac.accounts.find(a=>a.id===l.accountId)?.name||''})),
    totalDebitCents:lines.reduce((a,l)=>a+l.debitCents,0),totalCreditCents:lines.reduce((a,l)=>a+l.creditCents,0)};};
  const acMonthStart=()=>new Date().toISOString().slice(0,8)+'01';
  const acToday=()=>new Date().toISOString().slice(0,10);
  const acPrevMonth=()=>{const d=new Date();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);
   const from=d.toISOString().slice(0,8)+'01';
   const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0));
   return {from,to:end.toISOString().slice(0,10)};};
  // ---- Tablero ----
  if((seg.length===0||seg[0]==='dashboard')&&seg.length<=1&&method==='GET'){
   const from=acMonthStart(),to=acToday(),prev=acPrevMonth();
   const income=acIncome(from,to),prevIncome=acIncome(prev.from,prev.to),balance=acTrial(from,to);
   const delta=(n,p)=>p>0?Math.round(100*(n-p)/p):null;
   const incomeDailyMap={};
   for(const l of ac.lines){
    const e=ac.entries.find(x=>x.id===l.entryId),a=ac.accounts.find(x=>x.id===l.accountId);
    if(!e||e.status!=='registrada'||a?.type!=='ingreso'||e.entryDate<from||e.entryDate>to)continue;
    incomeDailyMap[e.entryDate]=(incomeDailyMap[e.entryDate]||0)+(l.creditCents-l.debitCents);
   }
   const incomeDaily=Object.entries(incomeDailyMap).sort((a,b)=>a[0].localeCompare(b[0])).map(([day,cents])=>({day,cents}));
   const paidForQuote=qid=>tenant.payments.filter(x=>x.quoteId===qid&&!x.archivedAt).reduce((s,x)=>s+x.amountCents,0);
   const recs=(tenant.receivables||[]).filter(r=>!r.archivedAt).map(r=>({...r,paidCents:paidForQuote(r.quote_id),balanceCents:Math.max(0,r.total_cents-paidForQuote(r.quote_id))}));
   const overdue=recs.filter(r=>r.balanceCents>0&&r.due_on&&r.due_on<to);
   const topMap={};
   for(const o of tenant.salesOrders.orders.filter(o=>o.status!=='cancelado')){
    const m=topMap[o.clientName]||{clientName:o.clientName,totalCents:0,orders:0};
    m.totalCents+=o.totalCents;m.orders++;topMap[o.clientName]=m;
   }
   const topClients=Object.values(topMap).sort((a,b)=>b.totalCents-a.totalCents).slice(0,5);
   return emit({kpis:{activeAccounts:ac.accounts.filter(a=>a.active).length,totalEntries:ac.entries.length,
    registeredEntries:ac.entries.filter(e=>e.status==='registrada').length,
    monthIncomeCents:income.incomeCents,monthIncomeDelta:delta(income.incomeCents,prevIncome.incomeCents),
    monthExpenseCents:income.expenseCents,monthExpenseDelta:delta(income.expenseCents,prevIncome.expenseCents),
    monthProfitCents:income.profitCents,monthProfitDelta:delta(income.profitCents,prevIncome.profitCents),
    receivablesCents:recs.reduce((s,r)=>s+r.balanceCents,0),receivablesCount:recs.filter(r=>r.balanceCents>0).length,
    monthDebitCents:balance.totalDebitCents,monthCreditCents:balance.totalCreditCents},
    month:{from,to},prevMonth:prev,prevMonthIncomeCents:prevIncome.incomeCents,prevMonthExpenseCents:prevIncome.expenseCents,
    incomeDaily,alerts:{overdueReceivables:overdue,draftEntries:ac.entries.filter(e=>e.status==='borrador').length},topClients});
  }
  // ---- Exportar CSV ----
  if(seg[0]==='export'&&method==='GET'){
   const kind=url.searchParams.get('kind');
   if(kind==='trial-balance'){
    const report=acTrial(url.searchParams.get('from'),url.searchParams.get('to'));
    const lines=[acCsvRow(['Código','Cuenta','Tipo','Debe MXN','Haber MXN','Saldo MXN'])];
    for(const r of report.rows)lines.push(acCsvRow([r.code,r.name,r.type,acMoney(r.debitCents),acMoney(r.creditCents),acMoney(r.balanceCents)]));
    return emit({csv:lines.join('\n'),filename:'hubie-contabilidad-balanza.csv'});
   }
   throw error('Invalid export',400);
  }
  // ---- Plan de cuentas ----
  if(seg[0]==='accounts'&&seg.length===1){
   if(method==='GET'){
    const type=url.searchParams.get('type'),activeOnly=url.searchParams.get('activeOnly')==='1';
    return emit({accounts:[...ac.accounts].sort((a,b)=>a.code.localeCompare(b.code))
     .filter(a=>(!type||a.type===type)&&(!activeOnly||a.active))});
   }
   if(method==='POST'){
    if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid account');
    const code=String(input.code||'').trim(),name=String(input.name||'').trim(),type=input.type||'activo';
    if(code.length<1||code.length>20||name.length<2||name.length>160||!['activo','pasivo','capital','ingreso','gasto'].includes(type))throw error('Invalid account');
    const nature=input.nature||acNature(type);
    if(nature!==acNature(type))throw error('Invalid account');
    if(ac.accounts.some(a=>a.code===code))throw error('Duplicate account code',409);
    if(input.parentId&&!ac.accounts.some(a=>a.id===input.parentId))throw error('Not found',404);
    const a={id:uuid(),code,name,type,nature,parentId:input.parentId||null,active:input.active??true,createdAt:now(),updatedAt:now()};
    ac.accounts.push(a);demoAudit(tenant,'accounting.account_created',a.id);return send({account:a});
   }
   throw error('Not found',404);
  }
  if(seg[0]==='accounts'&&seg[1]==='seed'&&seg.length===2&&method==='POST'){
   const chart=[['1000','Caja','activo'],['1010','Bancos','activo'],['1100','Clientes','activo'],['1200','Inventario','activo'],
    ['2000','Proveedores','pasivo'],['2100','IVA por pagar','pasivo'],['3000','Capital social','capital'],
    ['3200','Resultados de ejercicios anteriores','capital'],['4000','Ventas','ingreso'],['5000','Costo de ventas','gasto'],['5100','Gastos de operación','gasto']];
   for(const [code,name,type] of chart){
    if(ac.accounts.some(a=>a.code===code))continue;
    ac.accounts.push({id:uuid(),code,name,type,nature:acNature(type),parentId:null,active:true,createdAt:now(),updatedAt:now()});
   }
   return send({accounts:[...ac.accounts].sort((a,b)=>a.code.localeCompare(b.code))});
  }
  if(seg[0]==='accounts'&&seg.length===3&&seg[2]==='active'&&method==='PATCH'){
   const a=acAccountOf(seg[1]);
   if(!input||Object.keys(input).length!==1||typeof input.active!=='boolean')throw error('Invalid account');
   a.active=input.active;a.updatedAt=now();return send({ok:true,active:a.active});
  }
  if(seg[0]==='accounts'&&seg.length===2&&method==='PATCH'){
   const a=acAccountOf(seg[1]);
   if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid account');
   if(input.code&&input.code!==a.code)throw error('Invalid account');
   if(input.parentId===a.id)throw error('Invalid account');
   const merged={...a,...input};
   const name=String(merged.name||'').trim();
   if(name.length<2||name.length>160||!['activo','pasivo','capital','ingreso','gasto'].includes(merged.type))throw error('Invalid account');
   if(merged.nature!==acNature(merged.type))throw error('Invalid account');
   if(ac.lines.some(l=>l.accountId===a.id)&&(merged.type!==a.type||merged.nature!==a.nature))throw error('Invalid account');
   Object.assign(a,{name,type:merged.type,nature:merged.nature,parentId:merged.parentId??null,active:merged.active??true,updatedAt:now()});
   return send({account:a});
  }
  // ---- Pólizas ----
  if(seg[0]==='entries'&&seg.length===1){
   if(method==='GET'){
    const status=url.searchParams.get('status'),from=url.searchParams.get('from'),to=url.searchParams.get('to');
    const list=ac.entries.filter(e=>(!status||e.status===status)&&(!from||e.entryDate>=from)&&(!to||e.entryDate<=to))
     .sort((a,b)=>b.entryDate.localeCompare(a.entryDate)||b.folio-a.folio);
    return emit({entries:list.map(e=>{const v=acEntryView(e);return {...v,lines:v.lines.length};})});
   }
   if(method==='POST'){
    if(!input||typeof input!=='object'||Array.isArray(input)||!Array.isArray(input.lines)||input.lines.length<2||input.lines.length>100)throw error('Invalid entry');
    const concept=String(input.concept||'').trim();
    const entryDate=input.entryDate||acToday();
    if(concept.length<2||concept.length>300||!validExpiry(entryDate))throw error('Invalid entry');
    const lines=input.lines.map(l=>{
     const accountId=l.accountId,debitCents=l.debitCents??0,creditCents=l.creditCents??0;
     const account=ac.accounts.find(a=>a.id===accountId);
     if(!account||!account.active)throw error('Invalid entry');
     if(!Number.isSafeInteger(debitCents)||!Number.isSafeInteger(creditCents)||debitCents<0||creditCents<0)throw error('Invalid entry');
     if(!((debitCents>0&&creditCents===0)||(creditCents>0&&debitCents===0)))throw error('Invalid entry');
     return {accountId,debitCents,creditCents,memo:String(l.memo||'').slice(0,300)};
    });
    const totalDebit=lines.reduce((s,l)=>s+l.debitCents,0),totalCredit=lines.reduce((s,l)=>s+l.creditCents,0);
    if(totalDebit!==totalCredit||totalDebit<=0)throw error('Invalid entry');
    const folio=Math.max(0,...ac.entries.map(e=>e.folio))+1;
    const e={id:uuid(),folio,entryDate,concept,sourceType:input.sourceType||'manual',sourceId:input.sourceId||null,status:'borrador',createdAt:now(),updatedAt:now()};
    ac.entries.push(e);
    for(const l of lines)ac.lines.push({id:uuid(),entryId:e.id,...l,createdAt:now()});
    demoAudit(tenant,'accounting.entry_created',e.id);
    return send({entry:{...acEntryView(e),lines:lines.length}});
   }
   throw error('Not found',404);
  }
  if(seg[0]==='entries'&&seg.length===2&&method==='GET')return emit({entry:acEntryView(acEntryOf(seg[1]))});
  if(seg[0]==='entries'&&seg.length===3&&seg[2]==='status'&&method==='PATCH'){
   const e=acEntryOf(seg[1]);
   const allowedNext={borrador:['registrada','cancelada'],registrada:['cancelada'],cancelada:[]};
   if(!input||Object.keys(input).length!==1||!['borrador','registrada','cancelada'].includes(input.status)||!allowedNext[e.status].includes(input.status))throw error('Invalid entry status');
   e.status=input.status;e.updatedAt=now();
   if(input.status==='registrada')demoAudit(tenant,'accounting.entry_registered',e.id);
   return send({ok:true,status:e.status});
  }
  // ---- Reportes ----
  if(seg[0]==='trial-balance'&&seg.length===1&&method==='GET'){
   const from=url.searchParams.get('from'),to=url.searchParams.get('to');
   return emit({from:from||null,to:to||null,...acTrial(from,to)});
  }
  if(seg[0]==='income-statement'&&seg.length===1&&method==='GET'){
   const from=url.searchParams.get('from'),to=url.searchParams.get('to');
   return emit({from:from||null,to:to||null,...acIncome(from,to)});
  }
  if(seg[0]==='balance-sheet'&&seg.length===1&&method==='GET'){
   const asOf=url.searchParams.get('asOf')||acToday();
   return emit({asOf,...acSheet(asOf)});
  }
  throw error('Not found',404);
 }
 // Pedidos de venta (T024): espejo en memoria del contrato real
 // /api/app/<slug>/sales-orders/... (platform/sales-orders-store.mjs,
 // sales-orders-domain.mjs, migración 029). Los datos viven solo en
 // sessionStorage de esta pestaña (demo). Orquesta las colecciones demo de
 // T013/T014/T015/T017 (tenant.quotes/payments/invoices/receivables).
 const soRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/sales-orders(?:\/(.*))?$/);
 if(soRoute){
  const tenant=tenantBySlug(soRoute[1]);
  if(catalog.tools.some(t=>t.id==='T024'))allowed(tenant,'T024');
  const so=tenant.salesOrders;
  const seg=(soRoute[2]||'').split('/').filter(Boolean);
  const soPaidFor=qid=>tenant.payments.filter(x=>x.quoteId===qid&&!x.archivedAt).reduce((s,x)=>s+x.amountCents,0);
  const soOrderOf=id=>getRecord(so.orders,id);
  const soOrderLines=id=>so.lines.filter(l=>l.orderId===id).sort((a,b)=>a.position-b.position);
  const soOrderView=o=>({...o,folioLabel:'PV-'+String(o.folio).padStart(4,'0'),
   paidCents:soPaidFor(o.quoteId),balanceCents:Math.max(0,o.totalCents-soPaidFor(o.quoteId))});
  const soOrderDetail=o=>{
   const invoice=o.invoiceId?tenant.invoices.find(x=>x.id===o.invoiceId&&!x.archivedAt)||null:null;
   const receivable=o.receivableId?tenant.receivables.find(x=>x.id===o.receivableId&&!x.archivedAt)||null:null;
   return {...soOrderView(o),lines:soOrderLines(o.id),
    invoice:invoice?{...invoice,items:JSON.parse(invoice.items_json||'[]')}:null,
    receivable:receivable?{id:receivable.id,quoteId:receivable.quote_id,clientId:receivable.client_id||null,
    clientName:receivable.client_name,totalCents:receivable.total_cents,dueOn:receivable.due_on||null,
    notes:receivable.notes,createdAt:receivable.created_at,paidCents:soPaidFor(receivable.quote_id),
    balanceCents:Math.max(0,receivable.total_cents-soPaidFor(receivable.quote_id))}:null};
  };
  const soTransitions={borrador:['confirmado','cancelado'],confirmado:['en preparación','cancelado'],
   'en preparación':['enviado','cancelado'],enviado:['entregado','cancelado'],entregado:[],cancelado:[]};
  const soToday=()=>new Date().toISOString().slice(0,10);
  const soMonthStart=()=>new Date().toISOString().slice(0,8)+'01';
  // ---- Tablero ----
  if((seg.length===0||seg[0]==='dashboard')&&seg.length<=1&&method==='GET'){
   const from=soMonthStart(),to=soToday();
   const monthOrders=so.orders.filter(o=>(o.createdAt||'').slice(0,10)>=from&&(o.createdAt||'').slice(0,10)<=to);
   const byStatus={};
   for(const o of so.orders)byStatus[o.status]=(byStatus[o.status]||0)+1;
   const dailyMap={};
   for(const o of monthOrders){const day=(o.createdAt||'').slice(0,10);dailyMap[day]=(dailyMap[day]||0)+1;}
   const daily=[];
   const cursor=new Date(from+'T00:00:00Z');
   while(cursor.toISOString().slice(0,10)<=to){const day=cursor.toISOString().slice(0,10);daily.push({day,count:dailyMap[day]||0});cursor.setUTCDate(cursor.getUTCDate()+1);}
   const openOrders=so.orders.filter(o=>!['entregado','cancelado'].includes(o.status));
   return emit({kpis:{monthOrders:monthOrders.length,preparing:byStatus['en preparación']||0,shipped:byStatus['enviado']||0,
    delivered:byStatus['entregado']||0,total:so.orders.length,
    openCents:openOrders.reduce((s,o)=>s+o.totalCents,0),
    openBalanceCents:openOrders.reduce((s,o)=>s+soOrderView(o).balanceCents,0)},
    byStatus,daily,month:{from,to}});
  }
  // ---- Pedidos ----
  if(seg[0]==='orders'&&seg.length===1){
   if(method==='GET'){
    const status=url.searchParams.get('status');
    const orders=[...so.orders].sort((a,b)=>b.folio-a.folio)
     .filter(o=>!status||o.status===status).map(soOrderView);
    const availableQuotes=tenant.quotes.filter(q=>!q.archivedAt&&q.status==='accepted'&&
     !so.orders.some(o=>o.quoteId===q.id&&o.status!=='cancelado'))
     .map(q=>({id:q.id,title:q.title,clientName:q.clientName,totalCents:q.totalCents}));
    return emit({orders,availableQuotes});
   }
   if(method==='POST'){
    if(!input||typeof input!=='object'||Array.isArray(input)||!input.quoteId)throw error('Invalid order');
    const quote=tenant.quotes.find(q=>q.id===input.quoteId&&!q.archivedAt);
    if(!quote)throw error('Not found',404);
    if(quote.status!=='accepted')throw error('Invalid order');
    if(!Array.isArray(quote.lines)||!quote.lines.length)throw error('Invalid order');
    if(so.orders.some(o=>o.quoteId===quote.id&&o.status!=='cancelado'))throw error('Duplicate order',409);
    const lines=quote.lines.map((l,i)=>({description:l.description,quantity:l.quantity,unitPriceCents:l.unitPriceCents,
     lineTotalCents:l.quantity*l.unitPriceCents,position:i}));
    const subtotal=lines.reduce((s,l)=>s+l.lineTotalCents,0),vat=Math.round(subtotal*quote.vatRate/100);
    if(subtotal+vat!==quote.totalCents)throw error('Invalid order');
    const folio=Math.max(0,...so.orders.map(o=>o.folio))+1;
    const o={id:uuid(),folio,quoteId:quote.id,clientId:quote.clientId||null,clientName:quote.clientName,title:quote.title,
     subtotalCents:subtotal,vatCents:vat,totalCents:subtotal+vat,vatRate:quote.vatRate,status:'borrador',
     deliveryDate:null,carrier:'',trackingCode:'',notes:'',invoiceId:null,receivableId:null,createdAt:now(),updatedAt:now()};
    so.orders.push(o);
    for(const l of lines)so.lines.push({id:uuid(),orderId:o.id,...l});
    demoAudit(tenant,'sales_orders.order_created',o.id);
    return send({order:soOrderDetail(o)});
   }
   throw error('Not found',404);
  }
  if(seg[0]==='orders'&&seg.length===2&&method==='GET')return emit({order:soOrderDetail(soOrderOf(seg[1]))});
  if(seg[0]==='orders'&&seg.length===3&&seg[2]==='notes'&&method==='PATCH'){
   const o=soOrderOf(seg[1]);
   if(o.status==='cancelado')throw error('Invalid order');
   if(!input||Object.keys(input).length!==1||typeof input.notes!=='string'||input.notes.length>2000)throw error('Invalid order');
   o.notes=input.notes.trim();o.updatedAt=now();return send({ok:true});
  }
  if(seg[0]==='orders'&&seg.length===3&&seg[2]==='status'&&method==='PATCH'){
   const o=soOrderOf(seg[1]);
   if(!input||Object.keys(input).length!==1||!soTransitions[o.status].includes(input.status))throw error('Invalid order status');
   o.status=input.status;o.updatedAt=now();return send({ok:true,status:o.status});
  }
  if(seg[0]==='orders'&&seg.length===3&&seg[2]==='delivery'&&method==='PATCH'){
   const o=soOrderOf(seg[1]);
   if(!['confirmado','en preparación','enviado'].includes(o.status))throw error('Invalid order');
   if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid order');
   if(input.deliveryDate&&!validExpiry(input.deliveryDate))throw error('Invalid order');
   if(String(input.carrier||'').length>80||String(input.trackingCode||'').length>80)throw error('Invalid order');
   o.deliveryDate=input.deliveryDate||null;o.carrier=String(input.carrier||'').trim();o.trackingCode=String(input.trackingCode||'').trim();
   o.updatedAt=now();return send({ok:true,deliveryDate:o.deliveryDate,carrier:o.carrier,trackingCode:o.trackingCode});
  }
  if(seg[0]==='orders'&&seg.length===3&&seg[2]==='payment'&&method==='POST'){
   const o=soOrderOf(seg[1]);
   if(!['confirmado','en preparación','enviado','entregado'].includes(o.status))throw error('Invalid order');
   const amountCents=input.amountCents,paidOn=input.paidOn,methodPay=input.method||'efectivo';
   const clientName=String(input.clientName||o.clientName||'').trim();
   if(!Number.isSafeInteger(amountCents)||amountCents<=0||!validExpiry(paidOn)||!['efectivo','transferencia','tarjeta'].includes(methodPay))throw error('Invalid payment');
   if(amountCents>Math.max(0,o.totalCents-soPaidFor(o.quoteId)))throw error('Invalid payment');
   const pay={id:uuid(),quoteId:o.quoteId,clientId:o.clientId||null,clientName,amountCents,paidOn,method:methodPay,
    reference:String(input.reference||'').trim(),notes:String(input.notes||'').trim(),createdAt:now(),updatedAt:now()};
   tenant.payments.unshift(pay);demoAudit(tenant,'sales_orders.payment_created',pay.id);
   return send({payment:pay,balanceCents:o.totalCents-soPaidFor(o.quoteId)});
  }
  if(seg[0]==='orders'&&seg.length===3&&seg[2]==='invoice'&&method==='POST'){
   const o=soOrderOf(seg[1]);
   if(!['confirmado','en preparación','enviado','entregado'].includes(o.status))throw error('Invalid order');
   if(o.invoiceId){
    const existing=tenant.invoices.find(x=>x.id===o.invoiceId&&!x.archivedAt);
    if(existing)return send({invoice:{...existing,items:JSON.parse(existing.items_json||'[]')},existing:true});
   }
   const rfc=String(input?.rfc||'').trim().toUpperCase();
   if(rfc&&!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc))throw error('Invalid invoice');
   const lines=soOrderLines(o.id).map((l,i)=>({id:uuid(),description:l.description,quantity:l.quantity,unitPriceCents:l.unitPriceCents,lineTotalCents:l.lineTotalCents,position:i}));
   const subtotal=lines.reduce((s,l)=>s+l.lineTotalCents,0),vat=Math.round(subtotal*o.vatRate/100);
   if(subtotal+vat!==o.totalCents)throw error('Invalid invoice');
   const folio=Math.max(0,...tenant.invoices.filter(x=>!x.archivedAt).map(x=>x.folio))+1;
   const inv={id:uuid(),folio,folioLabel:'F-'+String(folio).padStart(4,'0'),quoteId:o.quoteId,clientName:o.clientName,rfc,
    items_json:JSON.stringify(lines),subtotalCents:subtotal,vatCents:vat,totalCents:subtotal+vat,vatRate:o.vatRate,
    status:'draft',notes:String(input?.notes||'').trim(),createdAt:now(),updatedAt:now(),cfdi:false,cfdiNote:'Sin CFDI (pendiente PAC)'};
   tenant.invoices.unshift(inv);o.invoiceId=inv.id;o.updatedAt=now();
   demoAudit(tenant,'sales_orders.invoice_created',inv.id);
   return send({invoice:{...inv,items:lines},existing:false});
  }
  if(seg[0]==='orders'&&seg.length===3&&seg[2]==='receivable'&&method==='POST'){
   const o=soOrderOf(seg[1]);
   if(!['confirmado','en preparación','enviado','entregado'].includes(o.status))throw error('Invalid order');
   if(o.receivableId){
    const existing=tenant.receivables.find(x=>x.id===o.receivableId&&!x.archivedAt);
    if(existing)return send({receivable:{...existing,paidCents:soPaidFor(existing.quote_id),balanceCents:Math.max(0,existing.total_cents-soPaidFor(existing.quote_id)),bucket:'corriente'},existing:true});
   }
   if(input?.dueOn&&!validExpiry(input.dueOn))throw error('Invalid receivable');
   if(tenant.receivables.some(r=>r.quote_id===o.quoteId&&!r.archivedAt))throw error('Receivable already exists',409);
   const rec={id:uuid(),quote_id:o.quoteId,client_id:o.clientId||null,client_name:o.clientName,total_cents:o.totalCents,
    due_on:input?.dueOn||null,notes:String(input?.notes||'').trim(),created_at:now(),updated_at:now()};
   tenant.receivables.unshift(rec);o.receivableId=rec.id;o.updatedAt=now();
   demoAudit(tenant,'sales_orders.receivable_created',rec.id);
   const paidNow=soPaidFor(o.quoteId);
   return send({receivable:{id:rec.id,quoteId:rec.quote_id,clientId:rec.client_id,clientName:rec.client_name,totalCents:rec.total_cents,dueOn:rec.due_on,paidCents:paidNow,balanceCents:Math.max(0,rec.total_cents-paidNow),bucket:'corriente'},existing:false});
  }
  throw error('Not found',404);
 }
  throw error('Not found',404);
 }
 return {request};
}
let active=null;
export async function demoRequest(path,options={}){
 if(!active){
  const response=await fetch('/assets/catalog.json',{cache:'no-store'});
  if(!response.ok)throw error('No fue posible consultar el catálogo',503);
  const catalog=await response.json();
  const key='hubie-demo-browser-v1';
  let storage=null;
  try{storage=sessionStorage;}catch{}
  const load=()=>{try{return JSON.parse(storage?.getItem(key)||'null');}catch{return null;}};
  const save=state=>{try{storage?.setItem(key,JSON.stringify(state));}catch{}};
  active=createDemoStore(catalog,{load,save});
 }
 return active.request(path,options);
}
