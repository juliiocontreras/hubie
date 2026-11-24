// T012 Escáner QR/Barras. Escaneo real por cámara con getUserMedia +
// BarcodeDetector cuando el navegador lo soporta; si no, la UI lo indica y
// ofrece entrada manual del código. El código se resuelve al SKU del
// catálogo (o al stock C005) en el servidor. Sin cámara en el entorno de
// pruebas, el flujo manual es el probado con tests; el de cámara, con
// detección de soporte.
import {field,line,button,container} from './app-workflows.js';
// Detección de soporte local (misma lógica que scannerSupport en
// tools-p2-domain.mjs, sin importar node:crypto al navegador).
const scannerSupport=({hasBarcodeDetector=false,hasGetUserMedia=false}={})=>{
 if(hasBarcodeDetector&&hasGetUserMedia)return {mode:'camera',supported:true};
 if(hasGetUserMedia)return {mode:'manual',supported:false,reason:'no_barcode_detector'};
 return {mode:'manual',supported:false,reason:'no_camera'};
};
export async function renderScanner(ctx){
 const base='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/scanner';
 const host=document.getElementById('record-list'),card=container('card-soft'),result=container('stack');
 const support=scannerSupport({hasBarcodeDetector:typeof window!=='undefined'&&'BarcodeDetector' in window,hasGetUserMedia:typeof navigator!=='undefined'&&!!navigator.mediaDevices?.getUserMedia});
 const statusLine=line(support.supported?'Escaneo por cámara disponible en este navegador.':'Escaneo por cámara no disponible en este navegador ('+(support.reason==='no_camera'?'sin cámara o sin permiso':'sin BarcodeDetector')+'). Usa la entrada manual.','group-label');
 const video=document.createElement('video');video.playsInline=true;video.muted=true;video.hidden=true;video.className='scanner-video';
 const startBtn=button('Iniciar cámara','btn btn-primary');
 const stopBtn=button('Detener cámara');stopBtn.hidden=true;
 const codeField=field('scanner-code','Código QR o de barras');
 const resolveBtn=button('Buscar código','btn btn-primary');resolveBtn.type='button';
 const form=document.createElement('form');form.className='stack';
 form.append(statusLine,video);
 const toolbar=container('toolbar');toolbar.append(startBtn,stopBtn);form.append(toolbar);
 form.append(codeField.holder,resolveBtn);
 card.append(line('Escáner QR / Barras','group-label'),form);
 host.replaceChildren(card);host.append(result);
 let stream=null,rafId=0,detector=null;
 function show(item,code,matchedBy){
  result.replaceChildren();
  const found=container('card-soft');
  found.append(line(item.name,'group-label'),line('SKU: '+item.sku+' · Fuente: '+(item.source==='catalog'?'catálogo':'inventario')+' · Coincidencia por '+matchedBy,'stat-label'));
  if(item.priceCents!==undefined)found.append(line('Precio: $'+(item.priceCents/100).toFixed(2),'stat-label'));
  if(item.quantity!==undefined)found.append(line('Stock: '+item.quantity,'stat-label'));
  result.append(found);
 }
 async function resolve(code){
  const data=await ctx.api(base+'/resolve',{method:'POST',body:JSON.stringify({code})});
  if(!data.found){result.replaceChildren();const none=container('card-soft');none.append(line('Código no encontrado','group-label'),line('El código '+data.code+' no coincide con ningún SKU del catálogo ni del inventario.','stat-label'));result.append(none);return;}
  show(data.item,data.code,data.matchedBy);
 }
 resolveBtn.addEventListener('click',async()=>{if(!codeField.input.value.trim())return;await resolve(codeField.input.value);},{signal:ctx.signal});
 form.addEventListener('submit',async event=>{event.preventDefault();if(codeField.input.value.trim())await resolve(codeField.input.value);},{signal:ctx.signal});
 if(!support.supported)startBtn.disabled=true;
 startBtn.addEventListener('click',async()=>{
  try{
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
   video.srcObject=stream;video.hidden=false;await video.play();
   detector=new window.BarcodeDetector({formats:['qr_code','ean_13','ean_8','code_128','code_39','upc_a','upc_e']});
   startBtn.hidden=true;stopBtn.hidden=false;
   const tick=async()=>{
    if(!stream)return;
    try{
     const codes=await detector.detect(video);
     if(codes.length){stopCamera();codeField.input.value=codes[0].rawValue;await resolve(codes[0].rawValue);return;}
    }catch{/* sigue intentando mientras la cámara esté abierta */}
    rafId=requestAnimationFrame(tick);
   };
   tick();
  }catch{statusLine.textContent='No se pudo abrir la cámara. Usa la entrada manual.';}
 },{signal:ctx.signal});
 function stopCamera(){
  cancelAnimationFrame(rafId);
  if(stream){for(const track of stream.getTracks())track.stop();stream=null;}
  video.hidden=true;startBtn.hidden=false;stopBtn.hidden=true;
 }
 stopBtn.addEventListener('click',stopCamera,{signal:ctx.signal});
}
