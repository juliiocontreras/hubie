// T006 Firmas digitales. Captura real con canvas (dibujar con mouse o dedo),
// guardada con hash SHA-256 + consentimiento + fecha + firmante, y evento en
// auditoría. Etiqueta clara en la UI: firma simple con evidencia, no equivale
// a firma electrónica avanzada ni e.firma. Nunca se afirma validez jurídica.
import {field,line,button,container} from './app-workflows.js';
export const SIGNATURE_DISCLAIMER='Firma simple con evidencia, no equivale a firma electrónica avanzada ni e.firma.';
export const SIGNATURE_CONSENT_TEXT='Firmo este documento de forma voluntaria y acepto que mi firma dibujada, junto con la fecha, mi nombre y el hash de evidencia, quede registrada como constancia de aceptación.';
export async function renderSignatures(ctx){
 const base='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/signatures';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const host=document.getElementById('record-list'),editor=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const fields={
  targetType:field('signature-target-type','Documento a firmar','select',[['case','Expediente'],['quote','Cotización'],['generic','Registro genérico']]),
  targetId:field('signature-target','ID del expediente, cotización o registro'),
  signerName:field('signature-name','Nombre del firmante'),
  signerEmail:field('signature-email','Correo del firmante','email')
 };
 const grid=container('field-grid');for(const entry of Object.values(fields))grid.append(entry.holder);
 form.append(grid);
 const canvas=document.createElement('canvas');canvas.width=520;canvas.height=180;canvas.className='signature-canvas';
 canvas.setAttribute('aria-label','Área para dibujar la firma');
 const pad=canvas.getContext('2d');pad.lineWidth=2;pad.strokeStyle='#16123a';pad.lineCap='round';
 let drawing=false,hasInk=false;
 const point=event=>{const r=canvas.getBoundingClientRect();const t=event.touches?.[0]||event;return {x:(t.clientX-r.left)*(canvas.width/r.width),y:(t.clientY-r.top)*(canvas.height/r.height)};};
 const start=event=>{event.preventDefault();drawing=true;const p=point(event);pad.beginPath();pad.moveTo(p.x,p.y);};
 const move=event=>{if(!drawing)return;event.preventDefault();const p=point(event);pad.lineTo(p.x,p.y);pad.stroke();hasInk=true;};
 const stop=()=>{drawing=false;};
 canvas.addEventListener('mousedown',start);canvas.addEventListener('mousemove',move);window.addEventListener('mouseup',stop);
 canvas.addEventListener('touchstart',start,{passive:false});canvas.addEventListener('touchmove',move,{passive:false});canvas.addEventListener('touchend',stop);
 const clear=button('Limpiar firma');clear.type='button';
 clear.addEventListener('click',()=>{pad.clearRect(0,0,canvas.width,canvas.height);hasInk=false;},{signal:ctx.signal});
 const consent=document.createElement('label');consent.className='signature-consent';
 const consentBox=document.createElement('input');consentBox.type='checkbox';
 const consentText=document.createElement('span');consentText.textContent=SIGNATURE_CONSENT_TEXT;
 consent.append(consentBox,consentText);
 const save=button('Guardar firma','btn btn-primary');save.type='submit';
 const disclaimer=line(SIGNATURE_DISCLAIMER,'group-label');
 const actions=container('toolbar');actions.append(clear,save);
 form.append(canvas,consent,disclaimer,actions);
 editor.append(line('Firmas digitales','group-label'),form);
 host.replaceChildren(editor);host.append(list);
 async function reload(){
  const data=await ctx.api(base);if(ctx.signal.aborted)return;
  list.replaceChildren();
  for(const s of data.signatures||[]){
   const card=container('card-soft');
   card.append(line(s.signerName+' · '+s.targetType+' '+s.targetId,'group-label'),line('Firmada: '+s.signedAt,'stat-label'),line('Hash SHA-256: '+s.signatureHash,'stat-label'),line(SIGNATURE_DISCLAIMER,'stat-label'));
   list.append(card);
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!hasInk){alert('Dibuja tu firma en el recuadro antes de guardar.');return;}
  if(!consentBox.checked){alert('Marca el consentimiento para firmar.');return;}
  const created=await ctx.api(base,{method:'POST',body:JSON.stringify({targetType:fields.targetType.input.value,targetId:fields.targetId.input.value,signerName:fields.signerName.input.value,signerEmail:fields.signerEmail.input.value||undefined,consentAccepted:true,signatureData:canvas.toDataURL('image/png')})});
  alert('Firma guardada. Hash SHA-256: '+created.signature.signatureHash);
  pad.clearRect(0,0,canvas.width,canvas.height);hasInk=false;form.reset();await reload();
 },{signal:ctx.signal});
 await reload();
}
