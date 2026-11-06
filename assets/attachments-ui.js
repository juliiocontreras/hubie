// Record-level attachments shared by all writable Hubie Suites modules.
// Files belong to a single tenant, tool and record; no cross-workspace downloads.
import {encodeSelectedFile,downloadBlob,displayBytes} from './media-ui.js';
const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const docMime=['image/png','image/jpeg','image/webp','application/pdf','text/plain','text/csv',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
let current=null;
export function closeAttachments(){
 if(current){current.controller.abort();current=null;}
 const host=document.getElementById('module-attachments');if(host)host.replaceChildren();
}
export function setupAttachments(ctx){
 closeAttachments();
 const {tool,config}=ctx;
 const host=document.getElementById('module-attachments');
 if(!host||['C008','C009'].includes(tool.id))return {update:()=>{}};
 const controller=new AbortController(),signal=controller.signal;
 const card=el('section',undefined,'card attachment-card');
 const head=el('div',undefined,'card-title'),title=el('h2','Archivos adjuntos');
 const counter=el('span','Documentos vinculados al registro','pill');
 head.append(title,counter);
 const help=el('p','Adjunta comprobantes, contratos, fotos o documentos al registro seleccionado. Cada archivo queda asociado a esta empresa y herramienta.','help');
 const fields=el('div',undefined,'attachment-controls');
 const chooser=el('select');chooser.setAttribute('aria-label','Selecciona el registro para sus archivos');chooser.className='search';
 const input=el('input');input.type='file';input.accept=docMime.join(',');input.setAttribute('aria-label','Archivo a adjuntar');input.className='search';
 const upload=el('button','Adjuntar archivo','btn btn-primary');upload.type='button';
 const list=el('div',undefined,'attachment-list');const message=el('p','','help');
 const canWrite=config.tenant.role!=='viewer';
 const hint=el('p',demoMode?'Demo: máximo 650 KB por archivo, almacenamiento local temporal.':'Hasta 2 MB por archivo, máximo 12 por registro. Archivos privados.','help');
 fields.append(chooser);
 if(canWrite)fields.append(input,upload);
 card.append(head,help,fields,hint,list,message);host.replaceChildren(card);
 let records=[],generation=0;
 const path=()=>'/api/app/'+encodeURIComponent(config.tenant.slug)+'/tools/'+tool.id+'/records/'+encodeURIComponent(chooser.value)+'/attachments';
 async function reload(){
  const n=++generation;
  if(!chooser.value){list.replaceChildren(el('p','Selecciona un registro para ver los archivos.','help'));return;}
  try{
   const response=await ctx.api(path());
   if(signal.aborted||n!==generation)return;
   const items=response.attachments||[];
   list.replaceChildren();counter.textContent=items.length+' archivos';
   if(!items.length)list.append(el('p','Este registro todavía no tiene archivos.','help'));
   for(const file of items){
    const item=el('div',undefined,'attachment-row'),meta=el('div',undefined,'attachment-info');
    const name=el('strong',file.filename),size=el('small',displayBytes(file.bytes));meta.append(name,size);
    const download=el('button','Descargar','btn');download.type='button';
    download.addEventListener('click',async()=>{
     download.disabled=true;
     try{
      let data;
      if(demoMode){
       const result=await ctx.api(file.downloadUrl);
       const decoded=atob(result.file.data),bytes=new Uint8Array(decoded.length);
       for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
       data=new Blob([bytes],{type:result.file.mime});
      }else{
       const r=await fetch(file.downloadUrl,{credentials:'same-origin',cache:'no-store'});
       if(!r.ok)throw Error('El archivo ya no está disponible.');
       data=await r.blob();
      }
      downloadBlob(data,file.filename);message.textContent='Descarga preparada.';
     }catch(e){message.textContent='Error al descargar: '+e.message;}
     finally{download.disabled=false;}
    },{signal});
    item.append(meta,download);
    if(canWrite){
     const remove=el('button','Eliminar','btn btn-danger');remove.type='button';
     remove.addEventListener('click',async()=>{
      if(!confirm('¿Eliminar este archivo adjunto?'))return;
      remove.disabled=true;
      try{await ctx.api(file.downloadUrl,{method:'DELETE'});message.textContent='Archivo eliminado.';await reload();}
      catch(e){message.textContent=e.message;}finally{remove.disabled=false;}
     },{signal});
     item.append(remove);
    }
    list.append(item);
   }
  }catch(e){if(!signal.aborted)message.textContent='No fue posible consultar archivos: '+e.message;}
 }
 chooser.addEventListener('change',()=>{message.textContent='';void reload();},{signal});
 upload.addEventListener('click',async()=>{
  const file=input.files?.[0];
  if(!file||!chooser.value){message.textContent='Selecciona un registro y un archivo.';return;}
  upload.disabled=true;message.textContent='Subiendo archivo…';
  try{
   const data=await encodeSelectedFile(file,{maxBytes:demoMode?650000:2000000,types:docMime});
   await ctx.write(path(),'POST',data);
   input.value='';message.textContent='Archivo adjuntado correctamente.';await reload();
  }catch(e){message.textContent='No se pudo adjuntar: '+e.message;}
  finally{upload.disabled=false;}
 },{signal});
 const component={
  controller,
  update(items){
   if(signal.aborted)return;
   records=Array.isArray(items)?items.filter(x=>x?.id&&x.title):[];
   const previous=chooser.value;
   chooser.replaceChildren(new Option('Seleccionar registro…',''));
   for(const item of records)chooser.add(new Option(item.title,item.id));
   chooser.value=records.some(x=>x.id===previous)?previous:records[0]?.id||'';
   card.hidden=!records.length;
   if(records.length)void reload();
  }
 };
 current=component;
 return component;
}
