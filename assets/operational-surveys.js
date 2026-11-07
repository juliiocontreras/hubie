import {field,line,button,container} from './app-workflows.js';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const typeNames=[['csat','Satisfacción 1–5 (CSAT)'],['nps','Recomendación 0–10 (NPS)'],['text','Respuesta abierta'],['yesno','Sí / No']];
const defaults=[
 {type:'csat',label:'¿Qué tan satisfecho estás con nuestra atención?',required:true},
 {type:'nps',label:'Del 0 al 10, ¿nos recomendarías?',required:true},
 {type:'text',label:'¿Qué podemos mejorar?',required:false}
];
export async function renderSurveys(ctx){
 const slug=encodeURIComponent(ctx.config.tenant.slug),url='/api/app/'+slug+'/surveys';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const host=$('record-list'),overview=container('survey-overview'),createPanel=container('card-soft survey-create'),surveysList=container('stack'),sendPanel=container('card-soft survey-share'),reportPanel=container('card-soft survey-report');
 host.replaceChildren(overview);
 let campaigns=[],clients=[],deals=[],chosen=null,linkVisible=null;
 const title=field('survey-title','Nombre de la encuesta');
 title.input.placeholder='Ej. Calidad de atención posventa';title.input.required=true;
 const form=el('form');form.className='stack';
 const questionnaire=container('survey-questionnaire');
 const addQuestion=button('Añadir pregunta','btn');let questionSequence=0;
 function addRow(q={type:'csat',label:'',required:true}){
  if(questionnaire.children.length>=8){ctx.notice('Máximo ocho preguntas por encuesta.',true);return;}
  const row=container('survey-question-row');
  const kind=el('select');kind.className='search';kind.setAttribute('aria-label','Tipo de pregunta');
  for(const [value,label] of typeNames)kind.add(new Option(label,value));
  kind.value=q.type;
  const text=el('input');text.type='text';text.className='search';text.maxLength=180;text.required=true;
  text.value=q.label;text.placeholder='Escribe tu pregunta';text.setAttribute('aria-label','Pregunta');
  const required=el('label','Obligatoria','survey-required'),check=el('input');check.type='checkbox';check.checked=q.required;required.prepend(check);
  const remove=button('Quitar','btn');remove.addEventListener('click',()=>row.remove(),{signal:ctx.signal});
  row.append(kind,text,required,remove);questionnaire.append(row);questionSequence++;
  return {kind,text,check};
 }
 for(const q of defaults)addRow(q);
 addQuestion.addEventListener('click',()=>addRow(),{signal:ctx.signal});
 const create=button('Crear encuesta','btn btn-primary');create.type='submit';
 form.append(line('Diseña tu cuestionario','group-label'),title.holder,questionnaire,addQuestion,create);
 form.addEventListener('submit',async ev=>{
  ev.preventDefault();create.disabled=true;
  try{
   const questions=[...questionnaire.children].map((row,index)=>({
    id:'q'+(index+1),type:row.children[0].value,label:row.children[1].value.trim(),required:row.children[2].querySelector('input').checked
   }));
   const out=await ctx.write(url,'POST',{title:title.input.value.trim(),questions});
   ctx.notice('Encuesta creada. Ahora puedes generar un enlace para el cliente.');
   title.input.value='';questionnaire.replaceChildren();for(const q of defaults)addRow(q);
   await reload();selectCampaign(out.survey.id);
  }catch(e){ctx.notice('Error al crear encuesta: '+e.message,true);}
  finally{create.disabled=false;}
 },{signal:ctx.signal});
 createPanel.append(form);
 const target=el('select');target.className='search';target.setAttribute('aria-label','Encuesta para compartir');
 const client=el('select');client.className='search';client.setAttribute('aria-label','Cliente asociado');
 const deal=el('select');deal.className='search';deal.setAttribute('aria-label','Oportunidad CRM asociada');
 const linkButton=button('Generar enlace privado','btn btn-primary');
 const linkBox=container('survey-generated-link');linkBox.hidden=true;
 const shareIntro=line('Cada enlace se puede responder una vez y caduca en 30 días. Solo se muestra al generarlo.','help');
 function picker(label,select){const wrap=el('label',label,'survey-picker');wrap.append(select);return wrap;}
 const inviteControls=container('survey-invite-fields');
 inviteControls.append(picker('Encuesta',target),picker('Cliente (opcional)',client),picker('Oportunidad (opcional)',deal),linkButton);
 sendPanel.append(line('Compartir encuesta','group-label'),shareIntro,inviteControls,linkBox);
 target.addEventListener('change',()=>{chosen=target.value;linkBox.hidden=true;},{signal:ctx.signal});
 linkButton.addEventListener('click',async()=>{
  if(!target.value)return ctx.notice('Selecciona una encuesta.',true);
  linkButton.disabled=true;
  try{
   const data=await ctx.write(url+'/'+target.value+'/invitations','POST',{clientId:client.value||null,dealId:deal.value||null});
   const link=new URL(data.invitation.path,location.origin).href;
   linkVisible=link;linkBox.replaceChildren();
   const hint=line('Enlace individual listo para enviar por WhatsApp, correo o mensaje:','help');
   const anchor=el('a',link,'survey-link');anchor.href=link;anchor.target='_blank';anchor.rel='noopener noreferrer';
   const copy=button('Copiar enlace','btn btn-primary');copy.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(linkVisible);ctx.notice('Enlace copiado.');}
    catch{ctx.notice('Selecciona y copia el enlace mostrado.',true);}
   },{signal:ctx.signal});
   linkBox.append(hint,anchor,copy);linkBox.hidden=false;
   ctx.notice('Enlace creado; cópialo ahora, no se podrá recuperar por seguridad.');
   await reload({preserveLink:true});
  }catch(e){ctx.notice('No se pudo generar el enlace: '+e.message,true);}
  finally{linkButton.disabled=false;}
 },{signal:ctx.signal});
 function selectCampaign(id){chosen=id;target.value=id;linkBox.hidden=true;void showReport(id);}
 async function showReport(id){
  reportPanel.replaceChildren(line('Cargando indicadores…','help'));
  try{
   const data=await ctx.api(url+'/'+id+'/report');
   if(ctx.signal.aborted||chosen!==id)return;
   reportPanel.replaceChildren(line('Resultados · '+data.survey.title,'group-label'));
   const stats=container('survey-kpis');
   const m=data.statistics;
   for(const [label,value] of [['Respuestas',String(m.responses)],['Satisfacción',m.csatAverage===null?'—':m.csatAverage+'/5'],
    ['Satisfechos',m.csatPositivePercent===null?'—':m.csatPositivePercent+'%'],
    ['NPS',m.npsScore===null?'—':String(m.npsScore)],['Invitaciones',String(m.invitations)]]){
    const card=container('survey-kpi');card.append(line(label,'help'),el('strong',value));stats.append(card);
   }
   reportPanel.append(stats,line('NPS: porcentaje de promotores menos detractores. CSAT: respuestas de 4 o 5 estrellas.','help'));
   const entries=container('survey-response-list');
   for(const item of data.responses){
    const card=container('survey-response');
    card.append(el('strong',item.clientName||'Respuesta de cliente'),line(new Date(item.createdAt).toLocaleString('es-MX'),'help'));
    for(const q of data.survey.questions){
     const val=item.answers[q.id];if(val===undefined)continue;
     card.append(line(q.label,'survey-question-label'),line(typeof val==='boolean'?(val?'Sí':'No'):String(val),'survey-answer'));
    }
    entries.append(card);
   }
   if(!data.responses.length)entries.append(line('Todavía no hay respuestas. Genera un enlace y envíalo a un cliente.','help'));
   reportPanel.append(entries);
  }catch(e){reportPanel.replaceChildren(line('No se pudieron consultar resultados: '+e.message,'error'));}
 }
 async function reload({preserveLink=false}={}){
  const data=await ctx.api(url);if(ctx.signal.aborted)return;
  campaigns=data.surveys||[];clients=data.clients||[];deals=data.deals||[];
  const current=chosen||target.value;
  target.replaceChildren(new Option('Selecciona una encuesta',''));
  for(const item of campaigns)target.add(new Option(item.title,item.id));
  target.value=campaigns.some(x=>x.id===current)?current:'';
  chosen=target.value||null;
  client.replaceChildren(new Option('Sin cliente específico',''));
  for(const c of clients)client.add(new Option(c.name+(c.company?' · '+c.company:''),c.id));
  deal.replaceChildren(new Option('Sin oportunidad comercial',''));
  for(const d of deals)deal.add(new Option(d.title,d.id));
  if(!preserveLink)linkBox.hidden=true;
  render();
 }
 function render(){
  overview.replaceChildren();surveysList.replaceChildren();
  for(const [label,value] of [['Encuestas creadas',campaigns.length],['Invitaciones enviadas',campaigns.reduce((s,x)=>s+x.invitations,0)],
    ['Respuestas registradas',campaigns.reduce((s,x)=>s+x.responses,0)]]){
   const node=container('survey-kpi');node.append(line(label,'help'),el('strong',String(value)));overview.append(node);
  }
  const q=ctx.search.value.trim().toLowerCase(),visible=campaigns.filter(x=>x.title.toLowerCase().includes(q));
  $('record-count').textContent=visible.length+' encuestas';
  if(!visible.length)surveysList.append(line('Aún no existen encuestas con ese nombre.','empty'));
  for(const s of visible){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',s.title),line(s.questions.length+' preguntas · '+s.responses+' respuestas / '+s.invitations+' enlaces · '+(s.status==='active'?'Disponible':'Cerrada'),'help'));
   const actions=container('record-actions');
   const report=button('Ver resultados','btn');report.addEventListener('click',()=>selectCampaign(s.id),{signal:ctx.signal});actions.append(report);
   if(canWrite){
    if(s.status==='active'){
     const share=button('Compartir','btn btn-primary');share.addEventListener('click',()=>{target.value=s.id;chosen=s.id;sendPanel.scrollIntoView({block:'center',behavior:'smooth'});},{signal:ctx.signal});actions.append(share);
    }
    const toggle=button(s.status==='active'?'Cerrar encuesta':'Reabrir','btn');
    toggle.addEventListener('click',async()=>{
     try{await ctx.write(url+'/'+s.id,'PATCH',{status:s.status==='active'?'closed':'active'});await reload();ctx.notice('Estado de la encuesta actualizado.');}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});actions.append(toggle);
   }
   row.append(info,actions);surveysList.append(row);
  }
  if(chosen)void showReport(chosen);
 }
 if(canWrite)host.append(createPanel);
 host.append(line('Tus encuestas','group-label'),surveysList);
 if(canWrite)host.append(sendPanel);
 host.append(reportPanel);
 ctx.search.addEventListener('input',render,{signal:ctx.signal});
 $('module-message').textContent='Encuestas para medir CSAT y NPS con enlaces individuales y respuestas privadas por empresa.';
 try{await reload();}catch(e){ctx.notice('Error al abrir Encuestas: '+e.message,true);}
}
