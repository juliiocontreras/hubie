import { createClient } from '@libsql/client';
let client;
export function databaseConfigured(){return Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);}
export function getDatabase(){
  if(!databaseConfigured()) throw new Error('Turso database credentials are not configured');
  if(!client) client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
  return client;
}
export async function databaseHealth(){
  if(!databaseConfigured()) return {status:'not-configured'};
  try {await getDatabase().execute('SELECT 1 AS ok');return {status:'connected'};}
  catch {return {status:'unavailable'};}
}
