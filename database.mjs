import {createClient} from '@libsql/client';
// Server-only libSQL HTTP pipeline client; no browser exposure or npm build step.
/** Hrana v2 bind types: preserve NULL, INTEGER and FLOAT (do not coerce null to ''). */
export function encodeSqlArg(value){
 if(value===null||value===undefined)return {type:'null'};
 if(typeof value==='string')return {type:'text',value};
 if(typeof value==='boolean')return {type:'integer',value:value?'1':'0'};
 if(typeof value==='bigint')return {type:'integer',value:String(value)};
 if(typeof value==='number'&&Number.isFinite(value))return Number.isSafeInteger(value)?
  {type:'integer',value:String(value)}:{type:'float',value};
 throw Error('Unsupported SQL value');
}

export function databaseConfigured(){return Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);}
function endpoint(){
 const raw=process.env.TURSO_DATABASE_URL?.trim().replace(/^[\"']|[\"']$/g,'').trim();
 if(!raw) throw new Error('Turso URL not configured');
 const u=new URL(raw.replace(/^libsql:/i,'https:').replace(/^wss:/i,'https:'));
 if(u.protocol!=='https:') throw new Error('Turso requires HTTPS');
 return u.origin+'/v2/pipeline';
}
export async function executeSql(sql,args=[]){
 if(!databaseConfigured()) throw new Error('Turso credentials not configured');
 const response=await fetch(endpoint(),{method:'POST',headers:{'Authorization':'Bearer '+process.env.TURSO_AUTH_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({requests:[{type:'execute',stmt:{sql,args:args.map(encodeSqlArg)}},{type:'close'}]}),signal:AbortSignal.timeout(8000)});
 if(!response.ok) { const error=new Error('Turso request failed'); error.code='HTTP_'+response.status; throw error; }
 const body=await response.json();
 const item=body.results?.[0];
 if(item?.type==='error') {const error=new Error('Turso SQL error');error.code='SQL_ERROR';throw error;}
 if(item?.type!=='ok') throw new Error('Unexpected Turso response');
 return item.response?.result;
}
export async function databaseHealth(){
 if(!databaseConfigured())return {status:'not-configured'};
 try{await executeSql('SELECT 1 AS ok');return {status:'connected'};}
 catch(error){const code=error?.code || (error?.name==='TimeoutError'?'TIMEOUT':error instanceof TypeError?'NETWORK_ERROR':'UNKNOWN');return {status:'unavailable',reason:code};}
}


// Atomic provisioning of organizations, settings, ownership and tool entitlements.
export async function executeBatch(statements){
 if(!databaseConfigured())throw Error('Turso credentials not configured');
 const url=process.env.TURSO_DATABASE_URL.trim().replace(/^libsql:/i,'https:');
 const client=createClient({url,authToken:process.env.TURSO_AUTH_TOKEN});
 try{return await client.batch(statements.map(({sql,args=[]})=>({sql,args})), 'write');}
 finally{client.close();}
}
