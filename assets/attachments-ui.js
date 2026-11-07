// Record-level attachments. C003 adds document classification, expiry and immutable revisions.
// Every server operation validates tenant, case, active Tool and role independently.
import {encodeSelectedFile,downloadBlob,displayBytes} from './media-ui.js';
import {setupRelationships} from './relationships-ui.js';
const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const docMime=['image/png','image/jpeg','image/webp','application/pdf','text/plain','text/csv',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const types=[['other','Otro documento'],['contract','Contrato'],['identification','Identificación'],
 ['invoice','Comprobante'],['consent','Consentimiento'],['certificate','Constancia']];
const labels=Object.fromEntries(types);
const expiryStatus=expiresOn=>{
 if(!expiresOn)return '';
 const today=new Date().toISOString().slice(0,10);
 const days=(Date.parse(expiresOn+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000;
 return days<0?'Vencido':days<=30?'Vence pronto':'Vigente';
};
let current=null;
export function closeAttachments(){
 if(current){current.controller.abort();current.relations?.close();current=null;}
 const host=document.getElementById('module-attachments');host?.replaceChildren();
}
export function setupAttachments(ctx){
 closeAttachments();
 const {tool,config}=ctx;
 const host=document.getElementById('module-attachments');
 if(!host||['C008','C009'].includes(tool.id))return {update:()=>{}};
 const caseMode=tool.id==='C003',canWrite=config.tenant.role!=='viewer';
 const controller=new AbortController(),signal=controller.signal;
 const card=el('section',undefined,'card attachment-card');
 const head=el('div',undefined,'card-title'),title=el('h2',caseMode?'Biblioteca de documentos':'Archivos adjuntos');
 const counter=el('span','Documentos por registro','pill');head.append(title,counter);
 const help=el('p',caseMode?'Selecciona un expediente para consultar los documentos, sus versiones y fechas de vencimiento.':'Adjunta comprobantes, contratos, fotos o documentos al registro seleccionado de esta empresa.','help');
 const fields=el('div',undefined,'attachment-controls');
 const chooser=el('select');chooser.setAttribute('aria-label','Selecciona el registro para sus archivos');chooser.className='search';
 const input=el('input');input.type='file';input.accept=docMime.join(',');input.setAttribute('aria-label','Archivo a adjuntar');input.className='search';
 const upload=el('button','Adjuntar archivo','btn btn-primary');upload.type='button';
 const list=el('div',undefined,'attachment-list'),message=el('p','','help');
 const filter=el('input');filter.type='search';filter.className='search';filter.placeholder='Buscar documento por nombre…';filter.setAttribute('aria-label','Buscar documentos');
 const hint=el('p',demoMode?'Modo demo: máximo 650 KB por archivo, datos locales temporales.':'Hasta 2 MB por archivo, máximo 12 archivos por registro. Descargas privadas.','help');
 fields.append(chooser);if(canWrite)fields.append(input,upload);
 const meta=el('div',undefined,'document-meta-controls');
 const docType=el('select');docType.className='search';docType.setAttribute('aria-label','Clasificación del documento');
 for(const [key,name] of types)docType.add(new Option(name,key));
 const expiry=el('input');expiry.type='date';expiry.className='search';expiry.setAttribute('aria-label','Vencimiento del documento');
 const versionOf=el('select');versionOf.className='search';versionOf.setAttribute('aria-label','Documento al que agregar una versión');
 versionOf.add(new Option('Nuevo documento',''));
 const saveMeta=el('button','Guardar clasificación','btn');saveMeta.type='button';saveMeta.hidden=true;
 if(caseMode&&canWrite){
  const inputs=[[docType,'Tipo de documento'],[expiry,'Fecha de vencimiento'],[versionOf,'Nueva versión de']];
  for(const [field,label]of inputs){
   const wrap=el('label',label,'document-meta-field');wrap.append(field);meta.append(wrap);
  }
  meta.append(saveMeta);
 }
 card.append(head,help,fields);
 if(caseMode&&canWrite)card.append(meta);
 card.append(hint,filter,list,message);
 const relations=setupRelationships(ctx);
 host.replaceChildren(card,relations.element);
 let records=[],attachments=[],generation=0;
 const path=()=>'/api/app/'+encodeURIComponent(config.tenant.slug)+'/tools/'+tool.id+'/records/'+encodeURIComponent(chooser.value)+'/attachments';
 const metaRoute=id=>'/api/app/'+encodeURIComponent(config.tenant.slug)+'/case-documents/'+encodeURIComponent(id);
 const groups=()=>new Map(attachments.reduce((pairs,f)=>{
  const key=caseMode?(f.documentId||f.id):f.id;
  if(!pairs.some(p=>p[0]===key))pairs.push([key,[]]);
  pairs.find(p=>p[0]===key)[1].push(f);return pairs;
 },[]));
 function refreshVersionPicker(){
  if(!caseMode||!canWrite)return;
  const selected=versionOf.value;
  versionOf.replaceChildren(new Option('Nuevo documento',''));
  for(const [id,files] of groups()){
   const latest=[...files].sort((a,b)=>(b.version||1)-(a.version||1))[0];
   versionOf.add(new Option(latest.filename+' · v'+latest.version,id));
  }
  versionOf.value=[...groups().keys()].includes(selected)?selected:'';
  synchronizeMetadata();
 }
 function synchronizeMetadata(){
  if(!caseMode||!canWrite)return;
  const files=groups().get(versionOf.value);
  const doc=files?.[0];saveMeta.hidden=!doc||!doc.managed;
  docType.value=doc?.documentType||'other';
  expiry.value=doc?.expiresOn||'';
 }
 async function fetchDownload(file){
  if(demoMode){
   const result=await ctx.api(file.downloadUrl);
   const decoded=atob(result.file.data),bytes=new Uint8Array(decoded.length);
   for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
   return new Blob([bytes],{type:result.file.mime});
  }
  const response=await fetch(file.downloadUrl,{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw Error('El archivo ya no está disponible.');
  return response.blob();
 }
 function appendFileActions(row,file){
  const download=el('button','Descargar','btn');download.type='button';
  download.addEventListener('click',async()=>{
   download.disabled=true;
   try{downloadBlob(await fetchDownload(file),file.filename);message.textContent='Descarga preparada.';}
   catch(error){message.textContent='Error de descarga: '+error.message;}
   finally{download.disabled=false;}
  },{signal});row.append(download);
  if(canWrite){
   const remove=el('button','Eliminar','btn btn-danger');remove.type='button';
   remove.addEventListener('click',async()=>{
    if(!confirm('¿Eliminar esta versión del archivo? Las otras versiones se conservarán.'))return;
    remove.disabled=true;
    try{await ctx.api(file.downloadUrl,{method:'DELETE'});message.textContent='Archivo eliminado.';await reload();await current?.onChange?.();}
    catch(error){message.textContent=error.message;}finally{remove.disabled=false;}
   },{signal});row.append(remove);
  }
 }
 function fileRow(file){
  const row=el('div',undefined,'attachment-row'),meta=el('div',undefined,'attachment-info');
  const n=caseMode?file.filename+' · v'+(file.version||1):file.filename;
  meta.append(el('strong',n),el('small',displayBytes(file.bytes)));
  if(caseMode){
   const text=(labels[file.documentType]||'Otro documento')+(file.expiresOn?' · Vence '+file.expiresOn+' ('+expiryStatus(file.expiresOn)+')':'');
   meta.append(el('small',text));
  }
  row.append(meta);appendFileActions(row,file);
  return row;
 }
 function renderList(){
  if(signal.aborted)return;
  list.replaceChildren();
  const term=filter.value.trim().toLowerCase();
  const grouped=groups(),visible=[...grouped.values()].filter(files=>files.some(f=>f.filename.toLowerCase().includes(term)));
  counter.textContent=(caseMode?grouped.size:attachments.length)+' documento(s)';
  if(!grouped.size){list.append(el('p','Este registro todavía no tiene documentos.','help'));return;}
  if(!visible.length){list.append(el('p','No se encontraron documentos con ese nombre.','help'));return;}
  for(const files of visible){
   const sorted=[...files].sort((a,b)=>(b.version||1)-(a.version||1));
   const latest=sorted[0];
   const wrap=el('div',undefined,'attachment-group');
   wrap.append(fileRow(latest));
   if(caseMode&&canWrite){
    const action=el('div',undefined,'toolbar');
    const revise=el('button','Subir nueva versión','btn');revise.type='button';
    revise.addEventListener('click',()=>{
     versionOf.value=latest.documentId||latest.id;
     synchronizeMetadata();input.focus();meta.scrollIntoView({block:'nearest',behavior:'smooth'});
    },{signal});action.append(revise);
    if(latest.managed){
     const edit=el('button','Editar vencimiento o tipo','btn');edit.type='button';
     edit.addEventListener('click',()=>{
      versionOf.value=latest.documentId; synchronizeMetadata();docType.focus();meta.scrollIntoView({block:'nearest',behavior:'smooth'});
     },{signal});action.append(edit);
    }
    wrap.append(action);
   }
   if(sorted.length>1){
    const history=el('details',undefined,'document-versions');
    history.append(el('summary','Versiones anteriores ('+(sorted.length-1)+')'));
    for(const old of sorted.slice(1))history.append(fileRow(old));
    wrap.append(history);
   }
   list.append(wrap);
  }
 }
 async function reload(){
  const n=++generation;
  if(!chooser.value){attachments=[];renderList();return;}
  try{
   const response=await ctx.api(path());
   if(signal.aborted||n!==generation)return;
   attachments=response.attachments||[];
   refreshVersionPicker();renderList();
  }catch(error){if(!signal.aborted)message.textContent='No se pudo consultar: '+error.message;}
 }
 chooser.addEventListener('change',()=>{message.textContent='';void reload();},{signal});
 filter.addEventListener('input',renderList,{signal});
 versionOf.addEventListener('change',synchronizeMetadata,{signal});
 saveMeta.addEventListener('click',async()=>{
  if(!versionOf.value)return;
  saveMeta.disabled=true;message.textContent='Guardando metadatos…';
  try{
   await ctx.write(metaRoute(versionOf.value),'PATCH',{documentType:docType.value,expiresOn:expiry.value||null});
   message.textContent='Clasificación y vencimiento actualizados.';await reload();await current?.onChange?.();
  }catch(error){message.textContent='No se pudo guardar: '+error.message;}
  finally{saveMeta.disabled=false;}
 },{signal});
 upload.addEventListener('click',async()=>{
  const file=input.files?.[0];
  if(!file||!chooser.value){message.textContent='Selecciona un registro y un archivo.';return;}
  upload.disabled=true;message.textContent='Subiendo archivo…';
  try{
   const data=await encodeSelectedFile(file,{maxBytes:demoMode?650000:2000000,types:docMime});
   if(caseMode)Object.assign(data,{
    documentType:docType.value,expiresOn:expiry.value||null,
    ...(versionOf.value?{replaceDocumentId:versionOf.value}:{})
   });
   await ctx.write(path(),'POST',data);
   input.value='';message.textContent='Documento guardado correctamente.';
   await reload();await current?.onChange?.();
  }catch(error){message.textContent='No se pudo adjuntar: '+error.message;}
  finally{upload.disabled=false;}
 },{signal});
 const component={
  controller,relations,onChange:null,
  select(recordId){
   if(signal.aborted||!records.some(x=>x.id===recordId))return;
   chooser.value=recordId;message.textContent='';filter.value='';versionOf.value='';void reload();relations.select(recordId);
  },
  update(items){
   if(signal.aborted)return;
   records=Array.isArray(items)?items.filter(x=>x?.id&&x.title):[];
   relations.update(records);
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
