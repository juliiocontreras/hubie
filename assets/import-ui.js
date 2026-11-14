// Paneles de importación CSV / migración JSON (P0, E004).
// Marca Hubie: Nunito, tinta #16123a, morado #7c5cfc, rosa #ec4899.
// Sin emojis como iconografía, sin letras como iconos, sin barras visibles.
// El panel solo lee el archivo en el navegador y lo envía al servidor, que
// valida, deduplica e importa; el resumen y los errores por fila vienen del
// servidor. En modo demo el mismo panel llama a demo-backend, que valida e
// importa en local (sessionStorage).
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function el(tag,text,cls){const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;}
function saveBlob(blob,filename){
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderResult(host,result){
 host.replaceChildren();
 if(!result||!result.summary)return;
 const s=result.summary;
 const head=el('p',`Importados: ${s.imported} de ${s.total} · Omitidos: ${s.skipped} · Errores: ${s.errors}`,'help');
 host.append(head);
 if(s.bySection){
  const parts=Object.entries(s.bySection).map(([k,v])=>`${k}: ${v.imported}/${v.total}`).join(' · ');
  host.append(el('p',parts,'help'));
 }
 const errors=(result.errors||[]).slice(0,50);
 if(errors.length){
  host.append(el('p','Filas con error (se muestran las primeras 50):','group-label'));
  const table=document.createElement('table');
  table.innerHTML='<tr><th>Fila</th><th>Sección</th><th>Campo</th><th>Motivo</th></tr>';
  for(const e of errors){
   const tr=document.createElement('tr');
   for(const text of [String(e.row),e.section||'—',e.field||'—',e.reason||'']){
    const td=document.createElement('td');td.textContent=text;tr.append(td);
   }
   table.append(tr);
  }
  host.append(table);
 }else if(s.imported>0){
  host.append(el('p','Sin errores: todas las filas se importaron.','help'));
 }
}
export const CLIENT_CSV_TEMPLATE='Nombre,Empresa,Correo,Teléfono,Estado,Notas\r\n'+
 'Ana López,Taller López,ana@ejemplo.mx,8112345678,active,Clienta desde 2024\r\n';
export const CATALOG_CSV_TEMPLATE='SKU,Nombre,Descripción,Precio,Categoría\r\n'+
 'SKU-001,Impresora térmica,Impresora de etiquetas 203 dpi,6181.00,Impresoras\r\n';
export function createImportPanel({title,description,templateName,templateText,accept,onSubmit,notice}){
 const wrap=el('div',undefined,'card-soft');
 wrap.append(el('p',title,'group-label'));
 if(description)wrap.append(el('p',description,'help'));
 const toolbar=el('div',undefined,'toolbar');
 const file=document.createElement('input');
 file.type='file';file.accept=accept;file.className='search';file.setAttribute('aria-label',title);
 const templateBtn=el('button','Descargar plantilla','btn');templateBtn.type='button';
 templateBtn.addEventListener('click',()=>{
  saveBlob(new Blob(['\uFEFF'+templateText],{type:'text/csv;charset=utf-8'}),templateName);
 });
 const send=el('button','Importar archivo','btn btn-primary');send.type='button';send.disabled=true;
 const result=el('div',undefined,'stack');
 file.addEventListener('change',()=>{send.disabled=!file.files.length;result.replaceChildren();});
 send.addEventListener('click',async()=>{
  const f=file.files[0];if(!f)return;
  send.disabled=true;
  try{
   const text=await f.text();
   const data=await onSubmit(text);
   renderResult(result,data);
   notice(`Importación: ${data.summary?.imported||0} de ${data.summary?.total||0} filas importadas.`);
  }catch(e){notice('No se importó: '+e.message,true);}
  finally{send.disabled=false;}
 });
 toolbar.append(file,templateBtn,send);
 wrap.append(toolbar,result);
 return wrap;
}
export function createMigrationPanel({onSubmit,notice}){
 const wrap=el('div',undefined,'card-soft');
 wrap.append(el('p','Migración de datos (E004)','group-label'));
 wrap.append(el('p','Importa clientes, catálogo, cotizaciones y gastos desde un archivo JSON con la estructura {clients, catalogItems, quotes, expenses}. Las filas válidas se importan aunque otras fallen; el resumen indica qué entró y qué no.','help'));
 const toolbar=el('div',undefined,'toolbar');
 const file=document.createElement('input');
 file.type='file';file.accept='.json,application/json';file.className='search';file.setAttribute('aria-label','Archivo JSON de migración');
 const templateBtn=el('button','Descargar ejemplo JSON','btn');templateBtn.type='button';
 const sample=JSON.stringify({clients:[{name:'Ana López',company:'Taller López',email:'ana@ejemplo.mx',phone:'8112345678',status:'active',notes:''}],catalogItems:[{sku:'SKU-001',name:'Impresora térmica',description:'Impresora de etiquetas',price:6181.00,category:'Impresoras'}],quotes:[{title:'Cotización taller',clientName:'Ana López',vatRate:16,lines:[{description:'Instalación',quantity:1,unitPrice:1500.00}]}],expenses:[{description:'Renta local',category:'renta',amount:8500.00,occurredOn:'2026-11-01',vendor:'Inmobiliaria'}]},null,2);
 templateBtn.addEventListener('click',()=>saveBlob(new Blob([sample],{type:'application/json;charset=utf-8'}),'hubie-migracion.json'));
 const send=el('button','Importar JSON','btn btn-primary');send.type='button';send.disabled=true;
 const result=el('div',undefined,'stack');
 file.addEventListener('change',()=>{send.disabled=!file.files.length;result.replaceChildren();});
 send.addEventListener('click',async()=>{
  const f=file.files[0];if(!f)return;
  send.disabled=true;
  try{
   const text=await f.text();
   let payload;
   try{payload=JSON.parse(text);}catch{throw Error('El archivo no es un JSON válido.');}
   const data=await onSubmit(payload);
   renderResult(result,data);
   notice(`Migración: ${data.summary?.imported||0} de ${data.summary?.total||0} registros importados.`);
  }catch(e){notice('No se migró: '+e.message,true);}
  finally{send.disabled=false;}
 });
 toolbar.append(file,templateBtn,send);
 wrap.append(toolbar,result);
 return wrap;
}
