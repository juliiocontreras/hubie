// Shared record relationships UI. Works for Core and generic T Tools.
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
export function setupRelationships(ctx){
 const {tool,config}=ctx;
 const canWrite=config.tenant.role!=='viewer';
 const enabled=config.tools.filter(x=>!['C008','C009'].includes(x.id));
 const root=make('section',undefined,'card relations-card');
 const head=make('div',undefined,'card-title');
 head.append(make('h2','Registros relacionados'),make('span','Vínculos entre Tools','pill'));
 const info=make('p','Relaciona registros reales, sin duplicar información entre herramientas de esta empresa.','help');
 const controls=make('div',undefined,'relations-controls');
 const origin=make('select');origin.className='search';origin.setAttribute('aria-label','Registro de origen');
 const kind=make('select');kind.className='search';kind.setAttribute('aria-label','Herramienta relacionada');
 const target=make('select');target.className='search';target.setAttribute('aria-label','Registro relacionado');
 const type=make('select');type.className='search';type.setAttribute('aria-label','Tipo de relación');
 for(const [value,label] of [['related','Relacionado'],['depends_on','Depende de'],['supports','Apoya a']])type.add(new Option(label,value));
 for(const toolInfo of enabled)kind.add(new Option(toolInfo.name,toolInfo.id));
 const add=make('button','Vincular registro','btn btn-primary');add.type='button';
 controls.append(origin);
 if(canWrite){controls.append(kind,target,type,add);}
 const result=make('div',undefined,'relation-list');
 const msg=make('p','','help');msg.setAttribute('role','status');
 root.append(head,info,controls,result,msg);
 const signal=new AbortController();
 let existing=[],lookupCounter=0,fetchCounter=0,preferred=ctx.initialRecordId||null;
 const base='/api/app/'+encodeURIComponent(config.tenant.slug);
 const path=()=>base+'/tools/'+tool.id+'/records/'+origin.value+'/links';
 const valid=()=>existing.some(x=>x.id===origin.value);
 async function loadRelated(){
  const id=++fetchCounter;result.replaceChildren();
  if(!valid()){result.append(make('p','Selecciona un registro para ver sus relaciones.','help'));return;}
  try{
   const data=await ctx.api(path());
   if(signal.signal.aborted||id!==fetchCounter)return;
   const links=data.links||[];
   if(!links.length)result.append(make('p','Todavía no hay vínculos para este registro.','help'));
   for(const link of links){
    const row=make('div',undefined,'relation-row'),details=make('div',undefined,'relation-info');
    details.append(make('strong',link.title),make('small',link.toolName+' · '+({related:'Relacionado',depends_on:'Depende de',supports:'Apoya a'}[link.relationType]||'Vinculado')));
    const go=make('button','Abrir','btn');go.type='button';
    go.addEventListener('click',()=>ctx.navigateToTool?.(link.targetToolId,{recordId:link.targetRecordId}),{signal:signal.signal});
    row.append(details,go);
    if(canWrite){
     const remove=make('button','Desvincular','btn');remove.type='button';
     remove.addEventListener('click',async()=>{
      remove.disabled=true;
      try{await ctx.api(base+'/relations/'+link.id,{method:'DELETE'});msg.textContent='Relación eliminada sin borrar ningún registro.';await loadRelated();}
      catch(e){msg.textContent=e.message;}finally{remove.disabled=false;}
     },{signal:signal.signal});row.append(remove);
    }
    result.append(row);
   }
  }catch(e){msg.textContent='No se pudieron consultar las relaciones: '+e.message;}
 }
 async function loadOptions(){
  const id=++lookupCounter;target.replaceChildren(new Option('Seleccionar registro…',''));
  add.disabled=true;
  if(!kind.value)return;
  try{
   const response=await ctx.api(base+'/relations/options/'+kind.value);
   if(signal.signal.aborted||id!==lookupCounter)return;
   for(const record of response.records||[]){
    if(kind.value===tool.id&&record.id===origin.value)continue;
    target.add(new Option(record.title,record.id));
   }
   add.disabled=target.options.length<=1;
  }catch(e){msg.textContent='No fue posible consultar registros: '+e.message;}
 }
 origin.addEventListener('change',()=>{msg.textContent='';void loadRelated();void loadOptions();},{signal:signal.signal});
 kind.addEventListener('change',()=>void loadOptions(),{signal:signal.signal});
 add.addEventListener('click',async()=>{
  if(!valid()||!target.value)return;
  add.disabled=true;msg.textContent='Vinculando…';
  try{
   await ctx.write(path(),'POST',{targetToolId:kind.value,targetRecordId:target.value,relationType:type.value});
   msg.textContent='Registros vinculados correctamente.';await loadRelated();
  }catch(e){msg.textContent='No se pudo vincular: '+e.message;}
  finally{add.disabled=false;}
 },{signal:signal.signal});
 const component={
  element:root,
  close:()=>signal.abort(),
  select(recordId){
   if(!existing.some(x=>x.id===recordId))return;
   origin.value=recordId;msg.textContent='';
   void loadRelated();void loadOptions();
  },
  update(items){
   if(signal.signal.aborted)return;
   existing=Array.isArray(items)?items.filter(x=>x?.id&&x?.title):[];
   const before=origin.value;
   origin.replaceChildren(new Option('Seleccionar registro…',''));
   for(const item of existing)origin.add(new Option(item.title,item.id));
   origin.value=existing.some(x=>x.id===preferred)?preferred:existing.some(x=>x.id===before)?before:existing[0]?.id||'';
   preferred=null;
   root.hidden=!existing.length;
   if(origin.value){void loadRelated();void loadOptions();}
  }
 };
 return component;
}
