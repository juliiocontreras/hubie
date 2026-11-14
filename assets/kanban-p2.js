// T005 Kanban. Tablero real con fases configurables y tarjetas ligadas a
// registros reales (tratos C002, expedientes C003 o registros genéricos).
// Arrastrar y soltar con HTML5 drag-and-drop; soltar persiste la fase en el
// servidor. Viewer solo mira; owner/admin/member mueven tarjetas.
import {field,line,button,container} from './app-workflows.js';
export async function renderKanban(ctx){
 const base='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/kanban';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const host=document.getElementById('record-list'),boardsCard=container('card-soft'),boardHost=container('stack');
 const form=document.createElement('form');form.className='stack';
 const fields={name:field('kanban-name','Nombre del tablero'),sourceToolId:field('kanban-source','Registros del tablero','select',[['C002','Tratos (CRM)'],['C003','Expedientes'],['generic','Registros genéricos']])};
 const grid=container('field-grid');for(const entry of Object.values(fields))grid.append(entry.holder);
 form.append(grid);
 const save=button('Crear tablero','btn btn-primary');save.type='submit';
 form.append(save);
 boardsCard.append(line('Tableros Kanban','group-label'),form);
 host.replaceChildren(boardsCard);host.append(boardHost);
 let boards=[],current=null;
 async function reloadBoards(){
  boards=(await ctx.api(base)).boards||[];
  drawBoards();
  if(current)await loadBoard(current);
 }
 function drawBoards(){
  boardHost.replaceChildren();
  for(const b of boards){
   const card=container('card-soft');
   card.append(line(b.name,'group-label'),line('Fuente: '+b.sourceToolId,'stat-label'));
   const open=button('Abrir tablero');open.addEventListener('click',()=>loadBoard(b.id),{signal:ctx.signal});
   card.append(open);boardHost.append(card);
  }
 }
 async function loadBoard(boardId){
  current=boardId;
  const data=await ctx.api(base+'/'+boardId);if(ctx.signal.aborted)return;
  const wrap=container('stack');
  const title=line('Tablero','group-label');
  const columns=document.createElement('div');columns.className='kanban-columns';
  for(const phase of data.board.phases){
   const column=document.createElement('section');column.className='kanban-column';column.dataset.phaseId=phase.id;
   const heading=document.createElement('h3');heading.textContent=phase.title;column.append(heading);
   const cards=data.cards.filter(c=>c.phaseId===phase.id);
   for(const card of cards){
    const el=document.createElement('article');el.className='kanban-card';el.textContent=card.title;el.draggable=canWrite;el.dataset.cardId=card.id;
    if(canWrite)el.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain',card.id);event.dataTransfer.effectAllowed='move';},{signal:ctx.signal});
    column.append(el);
   }
   if(canWrite){
    column.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='move';},{signal:ctx.signal});
    column.addEventListener('drop',async event=>{
     event.preventDefault();
     const cardId=event.dataTransfer.getData('text/plain');
     if(!cardId)return;
     await ctx.api(base+'/'+boardId+'/cards/'+encodeURIComponent(cardId)+'/move',{method:'PATCH',body:JSON.stringify({phaseId:phase.id})});
     await loadBoard(boardId);
    },{signal:ctx.signal});
   }
   columns.append(column);
  }
  const phaseForm=document.createElement('form');phaseForm.className='stack';
  const phaseField=field('kanban-phase','Nueva fase');
  phaseForm.append(phaseField.holder);
  const addPhase=button('Agregar fase');addPhase.type='submit';phaseForm.append(addPhase);
  phaseForm.addEventListener('submit',async event=>{event.preventDefault();await ctx.api(base+'/'+boardId+'/phases',{method:'POST',body:JSON.stringify({title:phaseField.input.value})});await loadBoard(boardId);},{signal:ctx.signal});
  wrap.append(title,columns);
  if(canWrite)wrap.append(phaseForm);
  boardHost.replaceChildren(wrap);
 }
 form.addEventListener('submit',async event=>{event.preventDefault();const created=await ctx.api(base,{method:'POST',body:JSON.stringify({name:fields.name.input.value,sourceToolId:fields.sourceToolId.input.value})});await reloadBoards();await loadBoard(created.board.id);},{signal:ctx.signal});
 await reloadBoards();
}
