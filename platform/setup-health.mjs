import {publicOrigin} from './public-origin.mjs';
const filled=value=>typeof value==='string'&&value.trim().length>0;
/**
 * Configuration only: this never returns secret values and does not imply
 * that Turso is reachable or that Google OAuth login has been verified.
 */
export function configurationStatus(env=process.env){
 let originConfigured=false;
 try{originConfigured=Boolean(publicOrigin(env.HUBIE_PUBLIC_ORIGIN));}catch{}
 const databaseConfigured=filled(env.TURSO_DATABASE_URL)&&filled(env.TURSO_AUTH_TOKEN);
 const googleConfigured=filled(env.GOOGLE_CLIENT_ID)&&filled(env.GOOGLE_CLIENT_SECRET)&&originConfigured;
 const adminConfigured=filled(env.HUBIE_INITIAL_ADMIN_EMAIL)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.HUBIE_INITIAL_ADMIN_EMAIL.trim());
 const authEnabled=env.HUBIE_AUTH_ENABLED==='true';
 return {databaseConfigured,googleConfigured,adminConfigured,authEnabled,
  readyForLive:databaseConfigured&&googleConfigured&&adminConfigured&&authEnabled};
}
