const $=id=>document.getElementById(id);
const token=new URLSearchParams(location.search).get('token')||'';
const api='/api/public/surveys/'+encodeURIComponent(token);
const text=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
let questions=[];
function questionField(question){
 const group=document.createElement('fieldset');group.className='question';group.dataset.question=question.id;
 const legend=text('legend',question.label+(question.required?' *':''),'question-label');group.append(legend);
 if(['csat','nps','yesno'].includes(question.type)){
  const choices=question.type==='csat'?[1,2,3,4,5]:
   question.type==='nps'?[0,1,2,3,4,5,6,7,8,9,10]:[true,false];
  const box=document.createElement('div');box.className='survey-choices'+(question.type==='nps'?' survey-nps':'');
  for(const n of choices){
   const label=document.createElement('label'),input=document.createElement('input');
   input.type='radio';input.name=question.id;input.value=String(n);input.required=Boolean(question.required);
   const icon=text('span',question.type==='yesno'?(n?'Sí':'No'):String(n));
   label.append(input,icon);box.append(label);
  }
  group.append(box);
  if(question.type==='csat')group.append(text('div','1 = Muy insatisfecho · 5 = Muy satisfecho','scale-hint'));
  if(question.type==='nps')group.append(text('div','0 = Nada probable · 10 = Muy probable','scale-hint'));
 }else{
  const area=document.createElement('textarea');area.name=question.id;area.maxLength=1500;area.rows=4;
  area.required=Boolean(question.required);area.placeholder='Escribe aquí tu opinión…';
  group.append(area);
 }
 return group;
}
function message(value,success=false){
 const node=$('survey-message');node.textContent=value;node.hidden=false;node.className=success?'success-message':'error-message';
}
async function init(){
 if(!/^[A-Za-z0-9_-]{32}$/.test(token)){message('Este enlace de encuesta no es válido. Solicita uno nuevo a la empresa.');return;}
 try{
  const response=await fetch(api,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'La encuesta no está disponible.');
  questions=data.survey.questions;
  $('survey-title').textContent=data.survey.title;
  $('survey-company').textContent='Una invitación de '+data.survey.company;
  const host=$('survey-questions');host.replaceChildren(...questions.map(questionField));
  $('survey-message').hidden=true;$('survey-public-form').hidden=false;
 }catch(e){message(e.message);}
}
$('survey-public-form').addEventListener('submit',async e=>{
 e.preventDefault();
 const button=$('send-survey');button.disabled=true;
 try{
  const data=new FormData(e.currentTarget),answers={};
  for(const q of questions){
   const raw=data.get(q.id);
   if(raw===null||raw==='')continue;
   answers[q.id]=q.type==='csat'||q.type==='nps'?Number(raw):q.type==='yesno'?raw==='true':String(raw).trim();
  }
  const response=await fetch(api,{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',
   headers:{'content-type':'application/json'},body:JSON.stringify({answers})});
  const output=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(output.error||'No fue posible enviar tu opinión.');
  $('survey-public-form').hidden=true;message(output.message||'¡Gracias por participar!',true);
  history.replaceState(null,'',location.pathname);
 }catch(err){message(err.message);button.disabled=false;}
});
void init();
