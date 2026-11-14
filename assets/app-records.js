import {openOperationalModule,closeOperationalModule} from './app-workflows.js';
import {fieldsFor,hintFor} from './tool-forms.js';
import {setupAttachments} from './attachments-ui.js';
const $=id=>document.getElementById(id);
let ctx=null,records=[],editing=null,initialized=false;
function notify(msg,error=false){ctx.notice(msg,error);}
const root=()=>'/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/tools/'+ctx.tool.id+'/records';
const writable=()=>ctx.config.tenant.role!=='viewer'&&!['C008','C009'].includes(ctx.tool.id);
// Etiqueta del CTA principal según la tool: que diga qué se crea, no solo
// "Nuevo registro". Solo presentación; no cambia qué guarda el formulario.
const newLabelFor=id=>({'T013':'＋ Nueva cotización','T014':'＋ Nuevo cobro','T015':'＋ Nueva factura','C006':'＋ Agregar al catálogo','C007':'＋ Nuevo gasto','T008':'＋ Nueva orden de compra','T009':'＋ Nuevo proveedor','T010':'＋ Nuevo almacén','T016':'＋ Abrir caja','T017':'＋ Nueva cuenta por cobrar','T018':'＋ Nueva cuenta por pagar'}[id]||'＋ Nuevo registro');
// Estado vacío útil por tool: qué es, qué hacer y con qué botón. Sin el
// botón, una lista vacía es un callejón sin salida.
const emptyCopyFor=id=>({
 T013:{title:'Aún no hay cotizaciones',hint:'Crea la primera cotización con cliente, importe y vigencia, y envíala a tu cliente.',cta:'＋ Nueva cotización'},
 T014:{title:'Aún no hay cobros',hint:'Registra el primer cobro para llevar el control de pagos de esta empresa.',cta:'＋ Nuevo cobro'},
 T015:{title:'Aún no hay facturas',hint:'Registra la primera factura con RFC, cliente e importe.',cta:'＋ Nueva factura'},
 C006:{title:'Tu catálogo está vacío',hint:'Agrega el primer producto o servicio para cotizar más rápido.',cta:'＋ Agregar al catálogo'},
 C007:{title:'Aún no hay gastos',hint:'Registra el primer gasto para llevar el control de esta empresa.',cta:'＋ Nuevo gasto'},
 T008:{title:'Aún no hay órdenes de compra',hint:'Crea la primera orden con proveedor y partidas; al recibirla sube el inventario.',cta:'＋ Nueva orden de compra'},
 T009:{title:'Aún no hay proveedores',hint:'Registra el primer proveedor con contacto y condiciones de pago.',cta:'＋ Nuevo proveedor'},
 T010:{title:'Aún no hay almacenes',hint:'Crea el primer almacén para llevar existencias por ubicación.',cta:'＋ Nuevo almacén'},
 T016:{title:'Aún no hay cajas',hint:'Abre la primera caja con monto inicial y responsable.',cta:'＋ Abrir caja'},
 T017:{title:'Aún no hay cuentas por cobrar',hint:'Abre la primera desde una cotización aceptada.',cta:'＋ Nueva cuenta por cobrar'},
 T018:{title:'Aún no hay cuentas por pagar',hint:'Registra la primera con proveedor, total y vencimiento.',cta:'＋ Nueva cuenta por pagar'},
}[id]||{title:'Aún no hay registros en '+ctx.tool.name,hint:'Crea el primero para empezar.',cta:'＋ Nuevo registro'});
function render(){
 if(!ctx||['C001','C002','C003','C004','C005','C006','C007','T001','T002','T005','T006','T008','T009','T010','T011','T012','T013','T014','T015','T016','T017','T018','T019','T020','T021'].includes(ctx.tool.id))return;
 const host=$('record-list');host.replaceChildren();
 const q=$('record-search').value.toLowerCase().trim();
 const shown=records.filter(r=>(r.title+' '+Object.values(r.fields).join(' ')).toLowerCase().includes(q));
 $('record-count').textContent=shown.length+' registros';
 if(!shown.length){
  // Búsqueda sin resultados: no es una lista vacía, es un filtro sin coincidencias.
  if(records.length){
   const wrap=ctx.elt('div',undefined,'empty empty-state');
   wrap.append(ctx.elt('strong','Sin resultados para tu búsqueda'),ctx.elt('p','Ningún registro coincide con ese texto. Prueba con otro término o limpia la búsqueda.','help'));
   const clear=ctx.elt('button','Limpiar búsqueda','btn');clear.type='button';
   clear.addEventListener('click',()=>{$('record-search').value='';render();});
   wrap.append(clear);host.append(wrap);return;
  }
  const copy=emptyCopyFor(ctx.tool.id);
  const wrap=ctx.elt('div',undefined,'empty empty-state');
  wrap.append(ctx.elt('strong',copy.title),ctx.elt('p',copy.hint,'help'));
  if(writable()){
   const cta=ctx.elt('button',copy.cta,'btn btn-primary');cta.type='button';
   cta.addEventListener('click',()=>openDialog());
   wrap.append(cta);
  }
  host.append(wrap);return;
 }
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
 ctx.attachmentsPanel?.update(['C008','C009'].includes(tool.id)?[]:records);
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
 ctx={...context,attachmentsPanel:context.tool.id==='T021'?null:setupAttachments(context)};
 if($('record-dialog').open)$('record-dialog').close();
 if(['C001','C002','C003','C004','C005','C006','C007','C008','T001','T002','T003','T004','T005','T006','T007','T008','T009','T010','T011','T012','T013','T014','T015','T016','T017','T018','T019','T020','T021'].includes(ctx.tool.id))return openOperationalModule(ctx);
 wire();editing=null;records=[];
 $('record-search').value='';
 $('add-record').textContent=newLabelFor(ctx.tool.id);
 $('add-record').hidden=!writable();
 $('module-message').textContent=hintFor(ctx.tool.id);
 $('record-list').replaceChildren(ctx.elt('div','Cargando…','empty'));
 try{await refresh();}catch(e){
  notify('No fue posible cargar el módulo: '+e.message,true);
  const host=$('record-list');host.replaceChildren();
  const wrap=ctx.elt('div',undefined,'empty empty-state');
  wrap.append(ctx.elt('strong','No se pudo consultar este módulo'),ctx.elt('p','Revisa tu conexión e inténtalo de nuevo. Tus datos no se vieron afectados.','help'));
  const retry=ctx.elt('button','Reintentar','btn btn-primary');retry.type='button';
  retry.addEventListener('click',()=>openRecords(ctx));
  wrap.append(retry);host.append(wrap);
 }
}
