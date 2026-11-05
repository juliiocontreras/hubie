// Deployment URL is configured per Render service; never silently redirect OAuth to another environment.
export function publicOrigin(value){
 if(typeof value!=='string'||!value.trim())throw Error('Invalid public origin');
 let u;
 try{u=new URL(value.trim());}catch{throw Error('Invalid public origin');}
 const isLocal=u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname);
 if(!((u.protocol==='https:'||isLocal)&&u.hostname&&u.pathname==='/'&&!u.search&&!u.hash&&!u.username&&!u.password))throw Error('Invalid public origin');
 return u.origin;
}
export function isSameOrigin(source,configuredOrigin){
 if(typeof source!=='string')return false;
 try{
  const target=publicOrigin(configuredOrigin);
  const incoming=new URL(source);
  return incoming.origin===target&&incoming.pathname==='/'&&!incoming.search&&!incoming.hash&&!incoming.username&&!incoming.password;
 }catch{return false;}
}
