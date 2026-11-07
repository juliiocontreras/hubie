import {getTool} from './catalog.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const types=['related','depends_on','supports'];
export function validEntityId(value){return typeof value==='string'&&uuid.test(value);}
export function normalizeEntityLink(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['targetToolId','targetRecordId','relationType'].includes(k)))throw Error('Invalid relation');
 const targetToolId=input.targetToolId,targetRecordId=input.targetRecordId,relationType=input.relationType||'related';
 if(!getTool(targetToolId)||['C008','C009'].includes(targetToolId)||!validEntityId(targetRecordId)||!types.includes(relationType))throw Error('Invalid relation');
 return {targetToolId,targetRecordId,relationType};
}
export function canonicalPair(aTool,aId,bTool,bId){
 if(!getTool(aTool)||!getTool(bTool)||!validEntityId(aId)||!validEntityId(bId)||aTool===bTool&&aId===bId)throw Error('Invalid relation');
 const first=aTool+':'+aId,second=bTool+':'+bId;
 return first<second?{leftToolId:aTool,leftRecordId:aId,rightToolId:bTool,rightRecordId:bId}:
 {leftToolId:bTool,leftRecordId:bId,rightToolId:aTool,rightRecordId:aId};
}
