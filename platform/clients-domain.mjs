// C001: cliente/perfil de contacto; validated separately from other module records.
export const clientStatuses=Object.freeze(['prospect','active','inactive']);
const clean=(value,max)=>typeof value==='string'&&value.trim().length<=max?value.trim():null;
export function normalizeClient(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid client');
 const name=clean(input.name,160);
 const company=clean(input.company??'',160);
 const email=clean(input.email??'',254)?.toLowerCase();
 const phone=clean(input.phone??'',40);
 const status=input.status??'prospect';
 const notes=clean(input.notes??'',2000);
 if(!name||name.length<2||company===null||email===null||phone===null||notes===null||!clientStatuses.includes(status))throw Error('Invalid client');
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Invalid client');
 if(phone){
  if(!/^[+0-9()\s.-]+$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>16)throw Error('Invalid client');
 }
 return {name,company,email,phone,status,notes};
}
