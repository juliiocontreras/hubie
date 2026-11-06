// One shared theme editor for Hubie Madre and every customer Suite.
// Only allow whitelisted presets or #RRGGBB values: no CSS injection or remote imagery.
export const appearanceDefaults=Object.freeze({
 dashboardPreset:'hubie',sidebarPreset:'midnight',
 dashboardColor:'#eaf1ff',sidebarColor:'#10294b'
});
const dashboardPresets=[
 ['hubie','Azul Hubie'],['pearl','Marfil claro'],['silver','Plata suave'],
 ['sand','Arena minimalista'],['custom','Color personalizado']
];
const sidebarPresets=[
 ['midnight','Azul noche Hubie'],['steel','Acero azulado'],
 ['platinum','Platino claro'],['graphite','Grafito'],['custom','Color personalizado']
];
const make=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
const colorValid=v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v);
export function cleanAppearance(theme={}){
 if(!theme||typeof theme!=='object')return {...appearanceDefaults};
 return {
  dashboardPreset:dashboardPresets.some(x=>x[0]===theme.dashboardPreset)?theme.dashboardPreset:appearanceDefaults.dashboardPreset,
  sidebarPreset:sidebarPresets.some(x=>x[0]===theme.sidebarPreset)?theme.sidebarPreset:appearanceDefaults.sidebarPreset,
  dashboardColor:colorValid(theme.dashboardColor)?theme.dashboardColor.toLowerCase():appearanceDefaults.dashboardColor,
  sidebarColor:colorValid(theme.sidebarColor)?theme.sidebarColor.toLowerCase():appearanceDefaults.sidebarColor
 };
}
function isLight(hex){
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 const linear=rgb.map(c=>c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4));
 return linear[0]*0.2126+linear[1]*0.7152+linear[2]*0.0722>0.42;
}
export function applyAppearance(theme,element=document.documentElement){
 const t=cleanAppearance(theme);
 element.dataset.dashboardPreset=t.dashboardPreset;
 element.dataset.sidebarPreset=t.sidebarPreset;
 element.style.setProperty('--custom-dashboard',t.dashboardColor);
 element.style.setProperty('--custom-sidebar',t.sidebarColor);
 const mainLight=t.dashboardPreset!=='custom'||isLight(t.dashboardColor);
 const sideLight=t.sidebarPreset==='platinum'||t.sidebarPreset==='custom'&&isLight(t.sidebarColor);
 element.classList.toggle('dashboard-dark',!mainLight);
 element.classList.toggle('sidebar-light',sideLight);
 return t;
}
function buildField(labelText,options,value,formName){
 const cell=make('div',undefined,'field theme-field');
 const label=make('label',labelText);const id='theme-'+formName+'-'+Math.random().toString(36).slice(2,6);
 const select=make('select');select.name=formName;select.id=id;
 for(const [val,title] of options)select.add(new Option(title,val));
 select.value=value;label.htmlFor=id;cell.append(label,select);return {cell,select};
}
export function createAppearanceEditor(host,{initial={},title='Personalizar interfaz',description='Selecciona los fondos de cada superficie de forma independiente.',onSave,live=false}={}){
 const saved=cleanAppearance(initial),form=make('form',undefined,'theme-editor stack');
 const heading=make('div',undefined,'theme-heading');
 heading.append(make('h3',title),make('p',description,'help'));
 const fields=make('div',undefined,'field-grid');
 const dp=buildField('Fondo del dashboard',dashboardPresets,saved.dashboardPreset,'dashboardPreset');
 const sp=buildField('Fondo del panel lateral',sidebarPresets,saved.sidebarPreset,'sidebarPreset');
 const dc=make('input');dc.type='color';dc.name='dashboardColor';dc.value=saved.dashboardColor;
 const sc=make('input');sc.type='color';sc.name='sidebarColor';sc.value=saved.sidebarColor;
 const dashboardColor=make('div',undefined,'field');
 dashboardColor.append(make('label','Color del dashboard'),dc);
 const sidebarColor=make('div',undefined,'field');
 sidebarColor.append(make('label','Color del panel lateral'),sc);
 fields.append(dp.cell,sp.cell,dashboardColor,sidebarColor);
 const preview=make('div',undefined,'theme-preview');
 const side=make('div',undefined,'theme-preview-sidebar');
 side.append(make('span','HUBIE','theme-mini-brand'),make('span','◈ Inicio','theme-mini-active'),make('span','▦ Empresas','theme-mini-row'),make('span','◫ Tools','theme-mini-row'));
 const main=make('div',undefined,'theme-preview-main');
 main.append(make('span','Vista previa','theme-mini-caption'),make('strong','Tu dashboard'),make('div',undefined,'theme-preview-metrics'),make('div',undefined,'theme-preview-meter'));
 const metrics=main.querySelector('.theme-preview-metrics');
 for(const width of ['42%','31%','21%']){const metric=make('span');metric.style.width=width;metrics.append(metric);}
 preview.append(side,main);
 const actions=make('div',undefined,'toolbar');
 const save=make('button','Guardar apariencia','btn btn-primary');save.type='submit';
 const reset=make('button','Restaurar estilo Hubie','btn');reset.type='button';
 const message=make('p',undefined,'message');message.setAttribute('role','status');
 actions.append(save,reset);form.append(heading,fields,preview,actions,message);
 host.replaceChildren(form);
 function values(){return cleanAppearance({
  dashboardPreset:dp.select.value,sidebarPreset:sp.select.value,
  dashboardColor:dc.value,sidebarColor:sc.value
 });}
 function sync(){
  const t=values();
  applyAppearance(t,preview);
  if(live)applyAppearance(t);
  dc.disabled=t.dashboardPreset!=='custom';sc.disabled=t.sidebarPreset!=='custom';
 }
 dp.select.addEventListener('change',sync);sp.select.addEventListener('change',sync);
 dc.addEventListener('input',sync);sc.addEventListener('input',sync);
 function restore(theme){
  const t=cleanAppearance(theme);dp.select.value=t.dashboardPreset;
  sp.select.value=t.sidebarPreset;dc.value=t.dashboardColor;sc.value=t.sidebarColor;sync();
 }
 reset.addEventListener('click',()=>{restore(appearanceDefaults);message.textContent='Valores de marca preparados. Pulsa Guardar apariencia para conservarlos.';});
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;message.textContent='Guardando…';message.classList.remove('error');
  try{
   const result=await onSave(values());
   const savedTheme=cleanAppearance(result?.appearance||result||values());
   restore(savedTheme);message.textContent='Apariencia guardada para este espacio.';
  }catch(error){
   message.classList.add('error');message.textContent='No se pudo guardar: '+error.message;
  }finally{save.disabled=false;}
 });
 restore(saved);
 return {form,restore,getValue:values};
}
