// T006 Firmas digitales. Captura real de firma (canvas en signatures-p2.js)
// guardada con hash SHA-256 + texto de consentimiento + fecha + firmante, y
// evento en audit_events. La UI etiqueta claro: firma simple con evidencia,
// NO equivale a firma electrónica avanzada ni e.firma. Nunca se afirma
// validez jurídica.
import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeSignature,SIGNATURE_DISCLAIMER,SIGNATURE_CONSENT_TEXT} from './tools-p2-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const audit=(org,user,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,'signature',id]});

async function ensureTarget(org,targetType,targetId){
 if(targetType==='case'){
  const found=rows(await executeSql('SELECT id FROM tenant_client_cases WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,targetId]));
  if(!found.length)throw Error('Not found');
 }else if(targetType==='quote'){
  const found=rows(await executeSql('SELECT id FROM tenant_quotes WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,targetId]));
  if(!found.length)throw Error('Not found');
 }else{
  const found=rows(await executeSql('SELECT id FROM tenant_tool_records WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,targetId]));
  if(!found.length)throw Error('Not found');
 }
}
const toSignature=r=>({id:r[0],targetType:r[1],targetId:r[2],signerName:r[3],signerEmail:r[4],consentText:r[5],signatureHash:r[6],signedAt:r[7],createdAt:r[8]});

export async function listSignatures(token,slug,targetType=null,targetId=null){
 const {tenant}=await authorizeTool(token,slug,'T006');
 const select='SELECT id,target_type,target_id,signer_name,signer_email,consent_text,signature_hash,signed_at,created_at FROM tenant_signatures WHERE organization_id=?';
 const args=[tenant.id];
 let sql=select;
 if(targetType&&targetId){sql+=' AND target_type=? AND target_id=?';args.push(targetType,targetId);}
 sql+=' ORDER BY signed_at DESC LIMIT 250';
 const result=await executeSql(sql,args);
 return {signatures:rows(result).map(toSignature),disclaimer:SIGNATURE_DISCLAIMER,consentText:SIGNATURE_CONSENT_TEXT};
}
export async function createSignature(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T006',true);
 const data=normalizeSignature(input);
 await ensureTarget(tenant.id,data.targetType,data.targetId);
 const id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO tenant_signatures(organization_id,id,target_type,target_id,signer_name,signer_email,consent_text,signature_data,signature_hash,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,data.targetType,data.targetId,data.signerName,data.signerEmail||'',data.consentText,data.signatureData,data.signatureHash,session.userId]},
  audit(tenant.id,session.userId,'signatures.created',id)
 ]);
 return {signature:{id,targetType:data.targetType,targetId:data.targetId,signerName:data.signerName,signerEmail:data.signerEmail,consentText:data.consentText,signatureHash:data.signatureHash},disclaimer:SIGNATURE_DISCLAIMER};
}
export async function getSignature(token,slug,id){
 const {tenant}=await authorizeTool(token,slug,'T006');
 const result=await executeSql('SELECT id,target_type,target_id,signer_name,signer_email,consent_text,signature_hash,signed_at,created_at,signature_data FROM tenant_signatures WHERE organization_id=? AND id=?',[tenant.id,id]);
 const row=rows(result)[0];
 if(!row)throw Error('Not found');
 const sig=toSignature(row);
 return {...sig,signatureData:row[9],disclaimer:SIGNATURE_DISCLAIMER};
}
