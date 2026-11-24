// Hubie background editor; no remote links or CSS text from users.
// Images are served through authenticated tenant routes (or browser-only demo data).
import {encodeSelectedFile} from './media-ui.js';
export const appearanceDefaults=Object.freeze({
 dashboardPreset:'hubie',sidebarPreset:'midnight',dashboardColor:'#f6f7fb',sidebarColor:'#16123a'
});
const dashboardPresets=[['hubie','Morado Hubie'],['pearl','Marfil claro'],['silver','Plata suave'],['sand','Arena minimalista'],['custom','Color personalizado']];
const sidebarPresets=[['midnight','Noche Hubie'],['steel','Acero azulado'],['platinum','Platino claro'],['graphite','Grafito'],['custom','Color personalizado']];
const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const validColor=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
const validPhoto=url=>typeof url==='string'&&url.length<1500000&&(
 /^\/api\/(?:admin|app)\/[a-zA-Z0-9/-]+\/media\/(?:dashboard|sidebar)(?:\?v=[0-9a-f-]{1,50})?$/.test(url)||
 /^\/api\/admin\/media\/(?:dashboard|sidebar)(?:\?v=[0-9a-f-]{1,50})?$/.test(url)||
 /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url)
);
export function cleanAppearance(theme={}){
 return {dashboardPreset:dashboardPresets.some(x=>x[0]===theme?.dashboardPreset)?theme.dashboardPreset:'hubie',
 sidebarPreset:sidebarPresets.some(x=>x[0]===theme?.sidebarPreset)?theme.sidebarPreset:'midnight',
 dashboardColor:validColor(theme?.dashboardColor)?theme.dashboardColor.toLowerCase():'#f6f7fb',
 sidebarColor:validColor(theme?.sidebarColor)?theme.sidebarColor.toLowerCase():'#16123a'};
}
const isLight=hex=>{
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.42;
};
export function applyAppearance(theme,element=document.documentElement,backgrounds={}){
 const t=cleanAppearance(theme);
 element.dataset.dashboardPreset=t.dashboardPreset;
 element.dataset.sidebarPreset=t.sidebarPreset;
 element.style.setProperty('--custom-dashboard',t.dashboardColor);
 element.style.setProperty('--custom-sidebar',t.sidebarColor);
 const bg=validPhoto(backgrounds?.dashboard)?backgrounds.dashboard:null;
 const side=validPhoto(backgrounds?.sidebar)?backgrounds.sidebar:null;
 element.classList.toggle('has-dashboard-image',!!bg);
 element.classList.toggle('has-sidebar-image',!!side);
 element.style.setProperty('--dashboard-photo',bg?'url("'+bg+'")':'none');
 element.style.setProperty('--sidebar-photo',side?'url("'+side+'")':'none');
 element.classList.toggle('dashboard-dark',t.dashboardPreset==='custom'&&!isLight(t.dashboardColor)&&!bg);
 element.classList.toggle('sidebar-light',(t.sidebarPreset==='platinum'||t.sidebarPreset==='custom'&&isLight(t.sidebarColor))&&!side);
 return t;
}
function presetField(label,values,current){
 const wrap=make('div',undefined,'field theme-field'),tag=make('label',label),input=make('select');
 for(const [value,title]of values)input.add(new Option(title,value));
 input.value=current;wrap.append(tag,input);return {wrap,input};
}
export function createAppearanceEditor(host,{initial={},backgrounds={},title='Personalizar interfaz',description='Personaliza cada superficie de manera independiente.',onSave,live=false,onImageUpload,onImageRemove}={}){
 let photos={dashboard:backgrounds?.dashboard||null,sidebar:backgrounds?.sidebar||null};
 const form=make('form',undefined,'theme-editor stack');
 const header=make('div',undefined,'theme-heading');header.append(make('h3',title),make('p',description,'help'));
 const fields=make('div',undefined,'field-grid');
 const dp=presetField('Fondo del dashboard',dashboardPresets,cleanAppearance(initial).dashboardPreset);
 const sp=presetField('Fondo del panel lateral',sidebarPresets,cleanAppearance(initial).sidebarPreset);
 const dc=make('input');dc.type='color';dc.value=cleanAppearance(initial).dashboardColor;
 const sc=make('input');sc.type='color';sc.value=cleanAppearance(initial).sidebarColor;
 const colorWrap=(name,input)=>{const wrap=make('div',undefined,'field');wrap.append(make('label',name),input);return wrap;};
 fields.append(dp.wrap,sp.wrap,colorWrap('Color del dashboard',dc),colorWrap('Color del panel lateral',sc));
 const photosPanel=make('div',undefined,'theme-upload-grid');
 const message=make('p',undefined,'message');message.setAttribute('role','status');
 const photoInputs={};
 for(const [kind,label] of [['dashboard','Imagen del dashboard'],['sidebar','Imagen del panel lateral']]){
  const box=make('div',undefined,'theme-upload-card'),titleLine=make('strong',label),hint=make('p','PNG, JPG o WEBP · hasta 900 KB','help');
  const input=make('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.setAttribute('aria-label','Subir '+label);
  const remove=make('button','Quitar imagen','btn');remove.type='button';remove.hidden=!photos[kind];
  const state=make('p',photos[kind]?'Imagen personalizada activa':'Sin imagen: se utiliza el fondo configurado','help');
  box.append(titleLine,hint,input,remove,state);photosPanel.append(box);
  photoInputs[kind]={remove,state,input};
  input.addEventListener('change',async()=>{
   const file=input.files?.[0];if(!file)return;
   input.disabled=true;message.textContent='Guardando imagen de '+label.toLowerCase()+'…';message.classList.remove('error');
   try{
    if(typeof onImageUpload!=='function')throw Error('La carga de imágenes no está habilitada.');
    const upload=await encodeSelectedFile(file);
    const result=await onImageUpload(kind,upload);
    photos={...photos,...(result?.backgrounds||{})};
    remove.hidden=!photos[kind];state.textContent=photos[kind]?'Imagen personalizada activa':'Sin imagen';
    sync();message.textContent='Imagen guardada para este espacio.';
   }catch(error){message.textContent='No se pudo cargar: '+error.message;message.classList.add('error');}
   finally{input.value='';input.disabled=false;}
  });
  remove.addEventListener('click',async()=>{
   if(!onImageRemove)return;
   remove.disabled=true;
   try{
    const result=await onImageRemove(kind);
    photos={...photos,...(result?.backgrounds||{}),[kind]:null};
    remove.hidden=true;state.textContent='Sin imagen: se utiliza el fondo configurado';
    sync();message.textContent='Imagen eliminada; se muestra el color o estilo elegido.';
   }catch(error){message.textContent=error.message;message.classList.add('error');}
   finally{remove.disabled=false;}
  });
 }
 const preview=make('div',undefined,'theme-preview');
 const side=make('div',undefined,'theme-preview-sidebar');
 side.append(make('span','HUBIE','theme-mini-brand'),make('span','⌂ Inicio','theme-mini-active'),make('span','▦ Empresas','theme-mini-row'),make('span','◫ Herramientas','theme-mini-row'));
 const main=make('div',undefined,'theme-preview-main');
 main.append(make('span','VISTA PREVIA','theme-mini-caption'),make('strong','Tu espacio'),make('div',undefined,'theme-preview-metrics'),make('div',undefined,'theme-preview-meter'));
 for(const width of ['40%','30%','22%']){const bar=make('span');bar.style.width=width;main.querySelector('.theme-preview-metrics').append(bar);}
 preview.append(side,main);
 const controls=make('div',undefined,'toolbar');
 const save=make('button','Guardar colores y estilos','btn btn-primary');save.type='submit';
 const reset=make('button','Restaurar colores Hubie','btn');reset.type='button';controls.append(save,reset);
 form.append(header,fields,photosPanel,preview,controls,message);host.replaceChildren(form);
 function values(){return cleanAppearance({dashboardPreset:dp.input.value,sidebarPreset:sp.input.value,dashboardColor:dc.value,sidebarColor:sc.value});}
 function sync(){
  const theme=values();applyAppearance(theme,preview,photos);if(live)applyAppearance(theme,document.documentElement,photos);
  dc.disabled=theme.dashboardPreset!=='custom';sc.disabled=theme.sidebarPreset!=='custom';
 }
 function restore(t){
  const theme=cleanAppearance(t);dp.input.value=theme.dashboardPreset;sp.input.value=theme.sidebarPreset;dc.value=theme.dashboardColor;sc.value=theme.sidebarColor;sync();
 }
 reset.addEventListener('click',()=>{restore(appearanceDefaults);message.textContent='Colores originales preparados. Guarda para conservarlos. Las imágenes pueden quitarse por separado.';});
 form.addEventListener('submit',async e=>{
  e.preventDefault();save.disabled=true;message.textContent='Guardando configuración…';message.classList.remove('error');
  try{const result=await onSave(values());restore(result?.appearance||result||values());message.textContent='Configuración guardada.';}
  catch(error){message.textContent='No se pudo guardar: '+error.message;message.classList.add('error');}
  finally{save.disabled=false;}
 });
 restore(initial);
 return {form,restore,getValue:values,getBackgrounds:()=>({...photos})};
}
