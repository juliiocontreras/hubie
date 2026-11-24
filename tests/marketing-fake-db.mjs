// Base falsa en memoria para los tests de T029 Marketing. Implementa solo
// las sentencias de platform/marketing-store.mjs con la misma forma de
// resultado que database.mjs ({rows: [[{value}...]], affected_row_count}).
// Dos tenants ('demo' y 'demo-b') para verificar el scope por tenant.
// Los clientes (C001) se siembran en fake.tables.clients desde los tests.
const cells=values=>values.map(value=>({value:value??null}));
const ok=(rows=[],affected=0)=>({rows:rows.map(cells),affected_row_count:affected,rowsAffected:affected});

export function createMarketingFakeDb(seed={}){
 const orgA=seed.orgA||'11111111-1111-4111-8111-111111111111';
 const orgB=seed.orgB||'22222222-2222-4222-8222-222222222222';
 const ownerId=seed.ownerId||'33333333-3333-4333-8333-333333333333';
 let tick=0;
 const now=()=>new Date(Date.parse('2026-11-16T00:00:00.000Z')+(++tick)*1000).toISOString();
 const tables={segments:[],campaigns:[],sends:[],clients:[]};
 const segmentById=(org,id)=>tables.segments.find(s=>s.organization_id===org&&s.id===id);
 const campaignById=(org,id)=>tables.campaigns.find(c=>c.organization_id===org&&c.id===id);
 const segmentView=s=>[s.id,s.name,s.description,s.status,s.company_contains,s.created_at,s.updated_at];
 const campaignView=c=>[c.id,c.name,c.subject,c.content,c.segment_id,c.status,c.scheduled_at,c.sent_at,c.created_at,c.updated_at];
 const matchesSegment=(s,client)=>{
  if(s.status&&client.status!==s.status)return false;
  if(s.company_contains&&!String(client.company||'').toLowerCase().includes(s.company_contains.toLowerCase()))return false;
  return true;
 };
 const byCreatedDesc=(a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id);

 async function executeSql(sql,args=[]){
  const s=sql.replace(/\s+/g,' ');
  // --- segmento por id ---
  if(s.startsWith('SELECT id,name,description,status,company_contains,created_at,updated_at FROM tenant_marketing_segments WHERE')){
   const x=segmentById(args[0],args[1]);return ok(x?[segmentView(x)]:[]);
  }
  // --- clientes (C001) ---
  if(s.startsWith('SELECT id,name,company,email,status FROM tenant_client_profiles WHERE')){
   const list=[...tables.clients.filter(c=>c.organization_id===args[0]&&!c.archived_at)].sort((a,b)=>a.name.localeCompare(b.name));
   return ok(list.map(c=>[c.id,c.name,c.company,c.email,c.status]));
  }
  // --- listar segmentos (con conteo de destinatarios por regla) ---
  if(s.startsWith('SELECT s.id,s.name,s.description,s.status,s.company_contains,s.created_at,s.updated_at,')){
   const list=[...tables.segments.filter(x=>x.organization_id===args[0])].sort((a,b)=>a.name.localeCompare(b.name));
   return ok(list.map(x=>[...segmentView(x),
    tables.clients.filter(c=>c.organization_id===args[0]&&!c.archived_at&&matchesSegment(x,c)).length]));
  }
  if(s.startsWith('INSERT INTO tenant_marketing_segments(')){
   tables.segments.push({organization_id:args[0],id:args[1],name:args[2],description:args[3],status:args[4],
    company_contains:args[5],created_by:args[6],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_marketing_segments SET name=')){
   const x=segmentById(args[4],args[5]);
   if(x)Object.assign(x,{name:args[0],description:args[1],status:args[2],company_contains:args[3],updated_at:now()});
   return ok([],x?1:0);
  }
  if(s.startsWith('UPDATE tenant_marketing_campaigns SET segment_id=NULL')){
   let n=0;
   for(const c of tables.campaigns.filter(c=>c.organization_id===args[0]&&c.segment_id===args[1])){c.segment_id=null;c.updated_at=now();n++;}
   return ok([],n);
  }
  if(s.startsWith('DELETE FROM tenant_marketing_segments WHERE')){
   const idx=tables.segments.findIndex(x=>x.organization_id===args[0]&&x.id===args[1]);
   if(idx>=0)tables.segments.splice(idx,1);
   return ok([],idx>=0?1:0);
  }
  // --- campaña por id ---
  if(s.startsWith('SELECT id,name,subject,content,segment_id,status,scheduled_at,sent_at,created_at,updated_at FROM tenant_marketing_campaigns WHERE')){
   const c=campaignById(args[0],args[1]);return ok(c?[campaignView(c)]:[]);
  }
  // --- listar campañas ---
  if(s.startsWith('SELECT c.id,c.name,c.subject,c.content,c.segment_id,c.status,c.scheduled_at,c.sent_at,c.created_at,c.updated_at,s.name,')){
   let list=tables.campaigns.filter(c=>c.organization_id===args[0]);
   if(args[1]!==undefined)list=list.filter(c=>c.status===args[1]);
   list=[...list].sort(byCreatedDesc);
   return ok(list.map(c=>[...campaignView(c),segmentById(args[0],c.segment_id)?.name||null,
    tables.sends.filter(d=>d.organization_id===c.organization_id&&d.campaign_id===c.id).length,
    tables.sends.filter(d=>d.organization_id===c.organization_id&&d.campaign_id===c.id&&d.status==='enviado').length]));
  }
  if(s.startsWith('INSERT INTO tenant_marketing_campaigns(')){
   tables.campaigns.push({organization_id:args[0],id:args[1],name:args[2],subject:args[3],content:args[4],
    segment_id:args[5],status:args[6],scheduled_at:args[7],sent_at:null,created_by:args[8],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_marketing_campaigns SET name=')){
   const c=campaignById(args[6],args[7]);
   if(c)Object.assign(c,{name:args[0],subject:args[1],content:args[2],segment_id:args[3],scheduled_at:args[4],status:args[5],updated_at:now()});
   return ok([],c?1:0);
  }
  if(s.startsWith("UPDATE tenant_marketing_campaigns SET status='enviada'")){
   const c=campaignById(args[0],args[1]);
   if(c){c.status='enviada';c.sent_at=now();c.updated_at=now();}
   return ok([],c?1:0);
  }
  if(s.startsWith('UPDATE tenant_marketing_campaigns SET status=?')){
   const c=campaignById(args[1],args[2]);
   if(c){c.status=args[0];c.updated_at=now();}
   return ok([],c?1:0);
  }
  // --- envíos ---
  if(s.startsWith('SELECT id,campaign_id,client_id,recipient_name,recipient_email,status,error,sent_at,created_at FROM tenant_marketing_sends WHERE')){
   const list=[...tables.sends.filter(d=>d.organization_id===args[0]&&d.campaign_id===args[1])].sort(byCreatedDesc);
   return ok(list.map(d=>[d.id,d.campaign_id,d.client_id,d.recipient_name,d.recipient_email,d.status,d.error,d.sent_at,d.created_at]));
  }
  if(s.startsWith('INSERT INTO tenant_marketing_sends(organization_id,id,campaign_id,client_id,recipient_name,recipient_email,status,error,sent_at)')){
   tables.sends.push({organization_id:args[0],id:args[1],campaign_id:args[2],client_id:args[3],recipient_name:args[4],
    recipient_email:args[5],status:args[6],error:args[7],sent_at:args[8],created_at:now()});
   return ok([],1);
  }
  if(s.startsWith('INSERT INTO tenant_marketing_sends(organization_id,id,campaign_id,client_id,recipient_name,recipient_email,status,error)')){
   tables.sends.push({organization_id:args[0],id:args[1],campaign_id:args[2],client_id:args[3],recipient_name:args[4],
    recipient_email:args[5],status:args[6],error:args[7],sent_at:null,created_at:now()});
   return ok([],1);
  }
  // --- tablero ---
  if(s.startsWith("SELECT (SELECT COUNT(*) FROM tenant_marketing_campaigns WHERE organization_id=? AND status='borrador')")){
   const org=args[0];
   return ok([[
    tables.campaigns.filter(c=>c.organization_id===org&&c.status==='borrador').length,
    tables.campaigns.filter(c=>c.organization_id===org&&c.status==='programada').length,
    tables.campaigns.filter(c=>c.organization_id===org&&c.status==='enviada').length,
    tables.segments.filter(x=>x.organization_id===org).length,
    tables.sends.filter(d=>d.organization_id===org).length,
    tables.sends.filter(d=>d.organization_id===org&&d.status==='enviado').length,
    tables.sends.filter(d=>d.organization_id===org&&d.status==='sin_envio').length
   ]]);
  }
  throw Error('Fake DB: sentencia no implementada: '+s.slice(0,140));
 }
 async function executeBatch(commands){
  const results=[];
  for(const command of commands)results.push(await executeSql(command.sql,command.args||[]));
  return results;
 }
 return {tables,orgA,orgB,ownerId,executeSql,executeBatch};
}
export function marketingDeps(fake,{emailConfigured=false,sendEmail=null,session={userId:fake.ownerId,role:'owner'}}={}){
 return {executeSql:fake.executeSql,executeBatch:fake.executeBatch,
  emailConfigured:()=>emailConfigured,
  sendEmail:sendEmail||(async()=>({sent:true})),
  authorize:async(token,slug,toolId)=>{
   if(token==='bad-token')throw Error('Unauthorized');
   if(toolId!=='T029')throw Error('Tool disabled');
   const orgId=slug==='demo'?fake.orgA:slug==='demo-b'?fake.orgB:null;
   if(!orgId)throw Error('Not found');
   return {tenant:{id:orgId},session};
  }};
}
