// C003 document validation. Metadata is always scoped server-side to a case and tenant.
export const documentTypes=Object.freeze([
 ['other','Otro documento'],['contract','Contrato'],['identification','Identificación'],
 ['invoice','Comprobante'],['consent','Consentimiento'],['certificate','Constancia']
]);
const ids=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validDate=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [year,month,day]=value.split('-').map(Number);
 if(year<1900||year>2200)return false;
 const d=new Date(Date.UTC(year,month-1,day));
 return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day;
};
export function normalizeCaseDocumentMetadata(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['documentType','expiresOn','replaceDocumentId'].includes(k)))throw Error('Invalid document');
 const documentType=input.documentType??'other';
 const expiresOn=input.expiresOn||null;
 const replaceDocumentId=input.replaceDocumentId||null;
 if(!documentTypes.some(x=>x[0]===documentType)||expiresOn!==null&&!validDate(expiresOn)||replaceDocumentId!==null&&!ids.test(replaceDocumentId))throw Error('Invalid document');
 return {documentType,expiresOn,replaceDocumentId};
}
export function documentExpiryStatus(expiresOn,today=new Date().toISOString().slice(0,10)){
 if(!expiresOn)return 'none';
 if(!validDate(expiresOn)||!validDate(today))return 'invalid';
 const delta=(Date.parse(expiresOn+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000;
 return delta<0?'expired':delta<=30?'soon':'valid';
}
