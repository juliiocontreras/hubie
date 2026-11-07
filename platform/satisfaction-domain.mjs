import {createHash} from 'node:crypto';
export const defaultQuestions=Object.freeze([
 {id:'csat',type:'csat',label:'¿Qué tan satisfecho estás con nuestra atención?',required:true},
 {id:'nps',type:'nps',label:'Del 0 al 10, ¿qué tan probable es que nos recomiendes?',required:true},
 {id:'comentario',type:'text',label:'¿Qué podemos mejorar?',required:false}
]);
const allowedTypes=new Set(['csat','nps','text','yesno']);
const safeLabel=v=>typeof v==='string'&&v.trim().length>=4&&v.trim().length<=180;
export function normalizeSurvey(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['title','questions'].includes(k)))throw Error('Invalid survey');
 const title=typeof input.title==='string'?input.title.trim():'';
 const raw=input.questions===undefined?defaultQuestions:input.questions;
 if(title.length<4||title.length>140||!Array.isArray(raw)||raw.length<1||raw.length>8)throw Error('Invalid survey');
 const used=new Set(),questions=[];
 for(const q of raw){
  if(!q||typeof q!=='object'||Array.isArray(q)||Object.keys(q).some(k=>!['id','type','label','required'].includes(k))||
   typeof q.id!=='string'||! /^[a-z][a-z0-9_]{1,24}$/.test(q.id)||used.has(q.id)||
   !allowedTypes.has(q.type)||!safeLabel(q.label)||
   q.required!==undefined&&typeof q.required!=='boolean')throw Error('Invalid survey');
  used.add(q.id);questions.push({id:q.id,type:q.type,label:q.label.trim(),required:q.required!==false});
 }
 return {title,questions};
}
export function normalizeAnswers(questions,input){
 if(!Array.isArray(questions)||!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!questions.some(q=>q.id===k)))throw Error('Invalid answers');
 const result={};
 for(const q of questions){
  const value=input[q.id];
  if(value===undefined||value===null||value===''){
   if(q.required)throw Error('Invalid answers');
   continue;
  }
  if(q.type==='csat'&&(!Number.isInteger(value)||value<1||value>5)||
   q.type==='nps'&&(!Number.isInteger(value)||value<0||value>10)||
   q.type==='yesno'&&typeof value!=='boolean'||
   q.type==='text'&&(typeof value!=='string'||value.trim().length>1500))throw Error('Invalid answers');
  result[q.id]=q.type==='text'?value.trim():value;
 }
 return result;
}
export function surveyStatistics(responses,questions){
 const get=type=>questions.find(q=>q.type===type)?.id;
 const csat=get('csat'),nps=get('nps');
 const csats=csat?responses.map(x=>x?.[csat]).filter(x=>Number.isInteger(x)&&x>=1&&x<=5):[];
 const npss=nps?responses.map(x=>x?.[nps]).filter(x=>Number.isInteger(x)&&x>=0&&x<=10):[];
 return {
  responses:responses.length,
  csatAverage:csats.length?Math.round(10*csats.reduce((a,b)=>a+b,0)/csats.length)/10:null,
  csatPositivePercent:csats.length?Math.round(100*csats.filter(x=>x>=4).length/csats.length):null,
  npsScore:npss.length?Math.round(100*(npss.filter(x=>x>=9).length-npss.filter(x=>x<=6).length)/npss.length):null
 };
}
export function hashSurveyToken(token){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(token))throw Error('Invalid survey token');
 return createHash('sha256').update(token).digest('hex');
}
