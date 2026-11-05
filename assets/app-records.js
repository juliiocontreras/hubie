import {openOperationalModule,closeOperationalModule} from './app-workflows.js';
import {fieldsFor,hintFor} from './tool-forms.js';
const $=id=>document.getElementById(id);
let ctx=null,records=[],editing=null,initialized=false;
function notify(msg,error=false){ctx.notice(msg,error);}
const root=()=>'/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/tools/'+ctx.tool.id+'/records';
const writable=()=>ctx.config.tenant.role!=='viewer'&&!['C008','C009'].includes(ctx.tool.id);
function render(){
 if(!ctx||['C001','C002','C004','C005'].includes(ctx.tool.id))return;
 const host=$('record-list');host.replaceChildren();
 const q=$('record-search').value.toLowerCase().trim();
 const shown=records.filter(r=>(r.title+' '+Object.values(r.fields).join(' ')).toLowerCase().includes(q));
 $('record-count').textContent=shown.length+' registros';
 if(!shown.length){host.append(ctx.elt('div','No hay registros por mostrar.','empty'));return;}
 for(const record of shown){
  const article=ctx.elt('article',undefined,'record');
  const main=ctx.elt('div');main.append(ctx.elt('strong',record.title),ctx.elt('small','Estado: '+record.status));
  const details=Object.entries(record.fields).filter(([,v])=>v!==''&&v!==null).slice(0,5).map(([key,v])=>key+': '+v).join(' · ');
  main.append(ctx.elt('p',details||'Sin detalles adicionales','help'));article.append(main);
  if(writable()){
   const actions=ctx.elt('div',undefined,'record-actions');
   const edit=ctx.elt('button','Editar','btn');edit.type='button';edit.onclick=()=>openDialog(record);
   const archive=ctx.elt('button','Archivar','btn btn-danger');archive.type='button';
   archive.onclick=async()=>{if(!confirm('¿Archivar este registro? Se conservará en el historial de la base de datos.'))return;try{await ctx.api(root()+'/'+record.id,{method:'DELETE'});notify('Registro archivado.');await refresh();}catch(e){notify(e.message,true);}};
   actions.append(edit,archive);article.append(actions);
  }
  host.append(article);
 }
}
async function refresh(){
 if(!ctx)return;
 const {tool,config}=ctx;
 if(tool.id==='C009'){
  records=config.members.map((m,i)=>({id:String(i),title:m.email,status:m.role,fields:{permisos:m.role}}));
 }else{
  const data=await ctx.api(root());
  records=tool.id==='C008'?Object.entries(data.counts||{}).map(([id,count])=>({id,title:config.tools.find(t=>t.id===id)?.name||id,status:'active',fields:{registros:count}})):data.records||[];
 }
 render();
}
function openDialog(record=null){
 if(!writable())return;
 editing=record?.id||null;
 const form=$('record-form');form.reset();
 $('dialog-heading').textContent=record?'Editar registro':'Nuevo registro';
 form.elements.title.value=record?.title||'';
 form.elements.status.value=record?.status||'active';
 $('record-hint').textContent=hintFor(ctx.tool.id);
 const host=$('record-fields');host.replaceChildren();
 for(const field of fieldsFor(ctx.tool.id)){
  const wrap=ctx.elt('div',undefined,'field'+(field.type==='textarea'?' field-wide':''));
  const label=ctx.elt('label',field.label);
  const input=document.createElement(field.type==='textarea'?'textarea':'input');
  input.name=field.key;input.id='field-'+field.key;label.htmlFor=input.id;
  if(field.type!=='textarea')input.type=field.type;
  input.value=record?.fields?.[field.key]??'';
  wrap.append(label,input);host.append(wrap);
 }
 $('record-dialog').showModal();
}
async function save(event){
 event.preventDefault();if(!ctx||!writable())return;
 const form=event.currentTarget,btn=form.querySelector('button[type=submit]');btn.disabled=true;
 const values=new FormData(form),fields={};
 for(const f of fieldsFor(ctx.tool.id)){const value=String(values.get(f.key)||'').trim();if(value)fields[f.key]=value;}
 const record={title:String(values.get('title')||'').trim(),status:String(values.get('status')||'active'),fields};
 try{
  await ctx.write(root()+(editing?'/'+editing:''),editing?'PATCH':'POST',record);
  $('record-dialog').close();notify('Registro guardado en '+ctx.config.tenant.displayName+'.');await refresh();
 }catch(e){notify('No se pudo guardar: '+e.message,true);}
 finally{btn.disabled=false;}
}
function wire(){
 if(initialized)return;initialized=true;
 $('record-search').addEventListener('input',render);
 $('add-record').addEventListener('click',()=>openDialog());
 $('close-dialog').addEventListener('click',()=>$('record-dialog').close());
 $('record-form').addEventListener('submit',save);
}
export async function openRecords(context){
 closeOperationalModule();
 ctx=context;
 if($('record-dialog').open)$('record-dialog').close();
 if(['C001','C002','C004','C005'].includes(ctx.tool.id))return openOperationalModule(ctx);
 wire();editing=null;records=[];
 $('record-search').value='';
 $('add-record').hidden=!writable();
 $('module-message').textContent=hintFor(ctx.tool.id);
 $('record-list').replaceChildren(ctx.elt('div','Cargando…','empty'));
 try{await refresh();}catch(e){notify('No fue posible cargar el módulo: '+e.message,true);$('record-list').replaceChildren(ctx.elt('div','No se pudo consultar este módulo.','empty'));}
}
