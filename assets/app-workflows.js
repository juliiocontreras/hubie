import {renderClients} from './operational-clients.js';
import {renderCrm} from './operational-crm.js';
import {renderAgenda} from './operational-agenda.js';
import {renderStock} from './operational-stock.js';

let activeController=null;
export function closeOperationalModule(){
 if(activeController){activeController.abort();activeController=null;}
}
export function field(name,label,type='text',options=[]){
 const holder=document.createElement('div');holder.className='field';
 const tag=document.createElement('label');tag.textContent=label;
 const input=document.createElement(type==='textarea'?'textarea':type==='select'?'select':'input');
 input.name=name;input.id='op-'+name;tag.htmlFor=input.id;
 if(type==='select')for(const [value,text] of options)input.add(new Option(text,value));
 else if(type!=='textarea')input.type=type;
 holder.append(tag,input);return {holder,input};
}
export function line(text,kind='help'){const el=document.createElement('p');el.className=kind;el.textContent=text;return el;}
export function money(cents){return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(cents||0)/100);}
export function date(iso){return iso?new Date(iso).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}):'Sin fecha';}
export function localInput(iso){
 if(!iso)return '';
 const d=new Date(iso),offset=d.getTimezoneOffset()*60000;
 return new Date(d.getTime()-offset).toISOString().slice(0,16);
}
export function toUTC(value){
 const date=new Date(value);
 if(!value||!Number.isFinite(date.getTime()))throw Error('La fecha y hora son obligatorias');
 return date.toISOString();
}
export function button(label,kind='btn'){
 const btn=document.createElement('button');btn.type='button';btn.className=kind;btn.textContent=label;return btn;
}
export function container(className){const el=document.createElement('div');el.className=className;return el;}
export async function openOperationalModule(ctx){
 closeOperationalModule();
 activeController=new AbortController();
 const signal=activeController.signal;
 const search=document.getElementById('record-search');
 search.value='';
 document.getElementById('add-record').hidden=true;
 const key=ctx.tool.id;
 const runner=key==='C001'?renderClients:key==='C002'?renderCrm:key==='C004'?renderAgenda:renderStock;
 await runner({...ctx,signal,search});
}
