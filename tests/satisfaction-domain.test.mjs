import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeSurvey,normalizeAnswers,surveyStatistics,hashSurveyToken} from '../platform/satisfaction-domain.mjs';
test('survey questions are configurable and reject unsafe or duplicate input',()=>{
 const survey=normalizeSurvey({title:'Servicio posventa',questions:[
  {id:'satisfaccion',type:'csat',label:'¿Qué tan satisfecho estás?',required:true},
  {id:'recomendacion',type:'nps',label:'¿Nos recomendarías?',required:true},
  {id:'comentarios',type:'text',label:'¿Qué podemos mejorar?',required:false}
 ]});
 assert.equal(survey.questions.length,3);
 assert.equal(survey.title,'Servicio posventa');
 for(const bad of [
  {title:'x'}, {title:'Correcto',questions:[]},
  {title:'Correcto',questions:[{id:'bad id',type:'text',label:'¿Algo?'}]},
  {title:'Correcto',questions:[{id:'x',type:'csat',label:'Pregunta'},{id:'x',type:'nps',label:'Otra pregunta'}]},
  {title:'Correcto',questions:[{id:'rating',type:'file',label:'Sube información'}]}
 ])assert.throws(()=>normalizeSurvey(bad),/Invalid survey/);
});
test('validate answers exactly against questionnaire, no extra fields, bounded ratings and text',()=>{
 const questions=normalizeSurvey({title:'Calidad del servicio'}).questions;
 const answers={csat:5,nps:9,comentario:'Muy buen servicio'};
 assert.deepEqual(normalizeAnswers(questions,answers),answers);
 for(const values of [{csat:6,nps:9},{csat:5,nps:-1},{csat:5,nps:9,extra:'secret'},
  {csat:3,nps:5,comentario:'x'.repeat(1501)},{csat:3}])
 assert.throws(()=>normalizeAnswers(questions,values),/Invalid answers/);
});
test('CSAT and NPS aggregate from actual responses and handle missing data',()=>{
 const questions=normalizeSurvey({title:'Encuesta'}).questions;
 const stats=surveyStatistics([{csat:5,nps:10},{csat:3,nps:6},{csat:4,nps:8}],questions);
 assert.equal(stats.responses,3);assert.equal(stats.csatAverage,4);assert.equal(stats.csatPositivePercent,67);
 assert.equal(stats.npsScore,0);
 assert.equal(surveyStatistics([],questions).npsScore,null);
});
test('public bearer tokens stored only as hashes',()=>{
 const token='abcdefghijklmnopqrstuvwxyz012345';
 assert.match(hashSurveyToken(token),/^[a-f0-9]{64}$/);
 assert.notEqual(hashSurveyToken(token),token);
 assert.throws(()=>hashSurveyToken('short'),/Invalid survey token/);
});